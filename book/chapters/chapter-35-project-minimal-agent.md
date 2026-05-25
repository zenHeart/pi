# 35. 从零实现一个极简 Pi-like Agent

## 35.1 本章解决的问题

阅读了前 34 章，你已经理解 Pi 的全部架构。本章把这些知识变成可执行的代码：用不超过 150 行的 TypeScript，从零构建一个具备完整工具循环能力的最小化 Agent。

这个练习的价值不在于"造一个 Pi"，而在于验证你对 Agent Loop 状态机的真正理解：模型响应有哪几种形态？工具调用如何变成 `tool_result` 重新送入模型？流式响应如何在终端实时渲染？

## 35.2 设计目标

- **依赖**：只使用 `@earendil-works/pi-ai`（Pi 的统一模型客户端），不使用 `pi-agent-core`
- **工具**：实现一个 `readFile` 工具，读取本地文件内容
- **循环**：支持多轮 `tool_use` → `tool_result` 循环，直到模型返回纯文本消息
- **输出**：流式打印模型的文本增量
- **规模**：不超过 150 行

## 35.3 实现

```typescript
// minimal-agent.ts
import { streamSimple, type Message, type ContentBlock } from "@earendil-works/pi-ai";
import { readFileSync } from "fs";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

// 工具定义（TypeBox 格式）
const tools = [
  {
    name: "readFile",
    description: "Read a local file by path",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file" },
      },
      required: ["path"],
    },
  },
];

// 执行工具调用
function executeTool(name: string, args: Record<string, unknown>): string {
  if (name === "readFile") {
    try {
      return readFileSync(args.path as string, "utf-8");
    } catch (err) {
      return `Error: ${(err as Error).message}`;
    }
  }
  return `Unknown tool: ${name}`;
}

// 从响应内容块中提取文本
function extractText(content: ContentBlock[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
}

// Agent 主循环
async function runAgent(userPrompt: string): Promise<void> {
  const model = {
    provider: "anthropic",
    id: "claude-opus-4-5",
    baseUrl: "https://api.anthropic.com",
    api: "anthropic" as const,
    // ... 其他 Model 字段
  };

  const messages: Message[] = [
    { role: "user", content: [{ type: "text", text: userPrompt }] },
  ];

  // Agent Loop：循环直到模型停止请求工具
  while (true) {
    const assistantContent: ContentBlock[] = [];
    let stopReason: string | undefined;

    // 流式调用模型
    const stream = await streamSimple(model as any, { messages, tools } as any, {
      apiKey: ANTHROPIC_API_KEY,
    });

    for await (const event of stream) {
      if (event.type === "text") {
        process.stdout.write(event.text); // 实时渲染文本增量
        assistantContent.push({ type: "text", text: event.text });
      } else if (event.type === "tool_use") {
        assistantContent.push(event);
      } else if (event.type === "stop") {
        stopReason = event.stopReason;
      }
    }

    // 把本轮助手消息加入对话历史
    messages.push({ role: "assistant", content: assistantContent });

    // 如果停止原因是 "tool_use"，执行工具并继续循环
    if (stopReason === "tool_use") {
      const toolResults = assistantContent
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const toolUse = b as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
          const result = executeTool(toolUse.name, toolUse.input);
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: [{ type: "text" as const, text: result }],
          };
        });

      // 把工具结果作为用户消息送回模型
      messages.push({ role: "user", content: toolResults });
      process.stdout.write("\n[tool executed, continuing...]\n");
      continue;
    }

    // 模型返回 "end_turn" 或其他非工具停止原因，结束循环
    break;
  }

  process.stdout.write("\n");
}

// 入口
const prompt = process.argv[2] ?? "Read the file README.md and summarize it.";
runAgent(prompt).catch(console.error);
```

运行：
```bash
ANTHROPIC_API_KEY=sk-ant-xxx node --strip-types minimal-agent.ts "读取 src/index.ts 并解释它的作用"
```

## 35.4 与 Pi 核心架构的对应关系

| 极简 Agent 代码 | Pi 核心对应模块 |
|---|---|
| `streamSimple()` 调用 | `packages/ai/src/stream.ts` + `Agent.streamFn` |
| `while(true)` + `stopReason` 检查 | `packages/agent/src/agent-loop.ts` 的 `queryLoop()` |
| `executeTool()` | `packages/coding-agent/src/core/tools/` 各工具 |
| `messages.push({ role: "user", content: toolResults })` | `AgentSession` 的 `tool_result` entry 写入 JSONL |
| `process.stdout.write(event.text)` | `packages/tui` 的 `AssistantMessageComponent` 增量渲染 |

极简实现缺少的 Pi 功能：持久化 JSONL 会话（SessionManager）、多 provider 抽象（ModelRegistry）、资源系统（ResourceLoader）、分支/compaction、扩展系统、TUI 渲染。这些都是 Pi 在同一骨架上叠加的能力层，而不是骨架本身的一部分。

## 35.5 关键设计理解点

#### 为什么 tool_use 的返回是用户消息而不是系统消息

LLM 对话协议（Anthropic / OpenAI 均如此）规定：模型产生 `tool_use` 内容后，客户端需要把执行结果作为 `role: "user"` 的 `tool_result` 内容返回。这不是 Pi 的设计选择，而是模型 API 的合约。Pi 的 `convertToLlm()` 函数（[`messages.ts`](/source-code/packages/coding-agent/src/core/messages.ts#L1)）负责把 Pi 内部的 `AgentMessage` 格式转换为符合各 provider API 要求的消息格式。

#### 流式响应的事件类型

`streamSimple()` 返回的异步迭代器产生多种事件类型：`text`（文本增量）、`thinking`（思考内容）、`tool_use`（工具调用）、`stop`（停止信号，含 `stopReason`）。只有 `stop` 事件的 `stopReason === "end_turn"` 才表示模型真正完成，其他停止原因（如 `"tool_use"` 或 `"max_tokens"`）需要相应处理。

## 35.6 本章训练

#### 使用级训练

在本地运行极简 Agent，给它一个需要两步工具调用的任务（如"读取 A 文件，再读取 B 文件，比较它们的不同"），观察 `tool_use` → `tool_result` 循环如何多次发生，记录每次循环时 `messages` 数组的长度变化。

#### 原理级训练

给极简 Agent 增加一个 `writeFile` 工具，让它能修改文件内容；在 `executeTool()` 中实现写入逻辑；提交一个需要先读后写的任务（如"修改 README.md 的第一行为当前日期"），跟踪完整的消息历史，画出每一轮的 `user → assistant → user` 循环图。

#### 扩展级训练

为极简 Agent 添加会话持久化：每次 `messages.push()` 后，把完整消息历史以 JSON 写入 `session.json`；在启动时如果文件存在则恢复历史；验证中断后重启 Agent 能从上次对话继续，理解这和 Pi 的 JSONL append-only 会话格式设计有何本质区别。

专家级验收标准：能独立实现一个具备工具循环能力的 Agent，能准确说明每个 API 调用的必要性，并能将极简实现与 Pi 各层的对应关系逐一映射，理解 Pi 在这个骨架上增加了哪些能力。
