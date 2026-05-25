# 第6章 从零构建最小 Agent

## 6.1 最小可用目标

最小 coding agent 不是一个调用模型的聊天脚本。它必须能完成一次真实代码任务：读文件、生成修改、执行工具、把工具结果回灌给模型、保存 transcript、能被中断、失败后能解释发生了什么。

本章给出复刻路线，不要求第一版就实现 pi 的全部能力。正确顺序是：先实现稳定 loop，再实现工具和 session，再做资源/扩展/TUI。

## 6.2 项目结构

一个最小 TypeScript 项目可以这样拆：

```text
mini-agent/
  src/
    index.ts
    model.ts
    messages.ts
    loop.ts
    stream.ts
    session.ts
    tools/
      read.ts
      write.ts
      edit.ts
      bash.ts
```

每个文件的责任要小：

- `messages.ts` 定义内部消息和 provider 消息转换。
- `stream.ts` 适配一个 provider，输出统一 assistant event。
- `loop.ts` 编排 provider、tool call、tool result 和 stop condition。
- `session.ts` 做 JSONL append。
- `tools/*` 只实现工具，不直接操作 loop。

## 6.3 消息类型

第一版只需要三种消息：

```ts
type UserMessage = {
  role: "user";
  content: string;
};

type AssistantMessage = {
  role: "assistant";
  content: Array<
    | { type: "text"; text: string }
    | { type: "toolCall"; id: string; name: string; arguments: unknown }
  >;
  stopReason?: "end_turn" | "tool_use" | "error" | "aborted";
};

type ToolResultMessage = {
  role: "toolResult";
  toolCallId: string;
  name: string;
  result: unknown;
  isError?: boolean;
};
```

后续再扩展 `bashExecution`、`custom`、`compactionSummary`、`branchSummary`。不要一开始就把 UI 消息、session entry 和 provider message 混成一个类型。

## 6.4 Loop 骨架

最小 loop 可以写成：

```ts
while (!signal.aborted) {
  const assistant = await streamAssistant(messages, tools, signal);
  messages.push(assistant);

  const calls = assistant.content.filter((block) => block.type === "toolCall");
  if (calls.length === 0) break;

  for (const call of calls) {
    const tool = tools.get(call.name);
    const result = tool
      ? await tool.execute(call.arguments, signal)
      : { isError: true, content: `Tool ${call.name} not found` };

    messages.push({
      role: "toolResult",
      toolCallId: call.id,
      name: call.name,
      result,
      isError: Boolean(result.isError),
    });
  }
}
```

pi 的真实 loop 在这个骨架上增加了事件流、steering/follow-up、parallel tools、before/after hooks、transformContext、prepareNextTurn、错误消息和 save point，核心入口见 [agent-loop.ts#L155](/source-code/packages/agent/src/agent-loop.ts#L155)。

## 6.5 Session 第一版

第一版 session 用 JSONL：

```json
{"type":"header","version":1,"id":"...","cwd":"/repo","createdAt":"..."}
{"type":"message","id":"1","parentId":null,"message":{"role":"user","content":"..."}}
{"type":"message","id":"2","parentId":"1","message":{"role":"assistant","content":[]}}
```

这比保存一个 `messages.json` 数组更好，因为追加式写入在崩溃后更容易恢复，也为 tree/fork/clone 留出结构。pi 的 `SessionEntry` 定义在 [session-manager.ts#L138](/source-code/packages/coding-agent/src/core/session-manager.ts#L138)，`SessionManager` 从 [session-manager.ts#L711](/source-code/packages/coding-agent/src/core/session-manager.ts#L711) 开始。

## 6.6 工具第一版

先做四个工具：`read`、`write`、`edit`、`bash`。每个工具都要有：

- `name`
- `description`
- `schema`
- `execute(args, signal)`
- 输出截断
- 错误转 result

不要让 `bash` 或 `write` 直接向模型返回无限输出。不要让工具抛出的异常逃出 loop。工具失败是模型应该能看到并修正的事实。

## 6.7 从 MVP 到 pi 级别

四阶段路线：

1. Loop 和消息：stream adapter、assistant reducer、tool call/result、abort、事件。
2. 工具和 session：四个默认工具、JSONL append、resume、stats。
3. 上下文和资源：context files、system prompt builder、prompt templates、skills、compaction。
4. 产品化和生态：TUI、slash commands、extensions、settings、packages、SDK/RPC/JSON、providers、themes。

这个顺序来自 pi 的设计：先有可测试 runtime，再有可扩展产品。反过来先做漂亮 TUI，通常会把核心逻辑锁死在界面里。
