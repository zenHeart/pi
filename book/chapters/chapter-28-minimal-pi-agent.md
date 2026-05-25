# 28. 从零复刻最小 pi agent

## 28. 本章解决的问题

复刻 pi 不是复制 TUI，也不是把一个 chat completion API 包成 while loop。创造者视角下，最小 pi agent 要复刻正确责任边界：message protocol、provider stream、tool call/result、event stream、session durability、abort、resource loading 和 host/UI 分离。读者视角下，你可以先做一个很小的版本，但从第一天就要把“模型说了什么”和“runtime 做了什么”分开。

低层 loop 入口在 [agent-loop.ts#L95](/source-code/packages/agent/src/agent-loop.ts#L95)，Agent 封装在 [agent.ts#L166](/source-code/packages/agent/src/agent.ts#L166)，产品层 `AgentSession` 在 [agent-session.ts#L252](/source-code/packages/coding-agent/src/core/agent-session.ts#L252)。

## 28. 最小消息协议

MVP 必须区分三类消息：user、assistant、toolResult。assistant 里又要区分 text、thinking、toolCall。pi 的基础类型已经体现这件事：`UserMessage`、`AssistantMessage`、`ToolResultMessage` 在 [types.ts#L269](/source-code/packages/ai/src/types.ts#L269)、[types.ts#L277](/source-code/packages/ai/src/types.ts#L277)、[types.ts#L293](/source-code/packages/ai/src/types.ts#L293)，`ToolCall` 在 [types.ts#L246](/source-code/packages/ai/src/types.ts#L246)。

```ts
type TextBlock = { type: "text"; text: string };
type ToolCallBlock = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: Array<TextBlock | ToolCallBlock>; stopReason: "stop" | "toolUse" | "error" | "aborted" }
  | { role: "toolResult"; toolCallId: string; toolName: string; content: string; isError: boolean };
```

不要把 tool call 写成 assistant 文本里的 JSON 字符串。那会让工具执行、错误恢复、审计和 UI 全部变脆弱。

## 28. 最小 provider stream

生产级 provider 应该发 event stream，而不是一次性返回字符串。pi 的 provider stream contract 是 `AssistantMessageEvent`：start、text/thinking/toolcall delta、done、error，见 [types.ts#L347](/source-code/packages/ai/src/types.ts#L347)。MVP 可以先简化成“一次返回 assistant message”，但你要知道这是暂缓能力，不是正确终点。

最小阶段：

```ts
type Provider = (
  messages: Message[],
  tools: Array<{ name: string; description: string }>,
  signal: AbortSignal,
) => Promise<Extract<Message, { role: "assistant" }>>;
```

生产阶段再升级为：

1. streaming text delta。
2. streaming thinking delta。
3. streaming tool call argument delta。
4. usage/cost。
5. stopReason/errorMessage。
6. abort signal。
7. provider request/response hooks。

## 28. 最小 loop

```ts
type Tool = {
  name: string;
  description: string;
  execute(input: Record<string, unknown>, signal: AbortSignal): Promise<string>;
};

async function runAgent(
  messages: Message[],
  tools: Map<string, Tool>,
  provider: Provider,
  signal: AbortSignal,
) {
  while (!signal.aborted) {
    const assistant = await provider(messages, [...tools.values()], signal);
    messages.push(assistant);

    const calls = assistant.content.filter(
      (block): block is ToolCallBlock => block.type === "toolCall",
    );
    if (calls.length === 0) break;

    for (const call of calls) {
      const tool = tools.get(call.name);
      if (!tool) {
        messages.push({
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content: `Unknown tool: ${call.name}`,
          isError: true,
        });
        continue;
      }

      try {
        const content = await tool.execute(call.arguments, signal);
        messages.push({
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content,
          isError: false,
        });
      } catch (error) {
        messages.push({
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content: error instanceof Error ? error.message : String(error),
          isError: true,
        });
      }
    }
  }
}
```

这段代码仍不是生产级，但边界是对的：模型请求工具，runtime 查找和执行工具，tool result 回到 transcript，下一轮 provider request 看见结果。

## 28. 最小 event stream

即使 MVP 没有 TUI，也应该发事件。事件让 UI、测试、日志、RPC 和 SDK 共享同一事实流。最低限度：

1. `agent_start` / `agent_end`
2. `turn_start` / `turn_end`
3. `message_start` / `message_update` / `message_end`
4. `tool_execution_start` / `tool_execution_end`

pi 的低层事件类型在 [types.ts#L403](/source-code/packages/agent/src/types.ts#L403)。RPC/JSON/SDK 都依赖这些事件，而不是各自解析 provider 字符串。

## 28. JSONL session

MVP 可以先 append JSONL：

```ts
import { appendFile } from "node:fs/promises";

async function appendEntry(path: string, entry: unknown) {
  await appendFile(path, `${JSON.stringify(entry)}\n`, "utf-8");
}
```

生产级要补 header、id、parentId、timestamp、leaf entry、model change、thinking change、custom entry、label、compaction、branch summary 和 branched session。pi 的 session entry 类型从 [session-manager.ts#L138](/source-code/packages/coding-agent/src/core/session-manager.ts#L138) 开始，append 底层入口在 [session-manager.ts#L863](/source-code/packages/coding-agent/src/core/session-manager.ts#L863)。model/thinking/custom/label/branch summary 分别有专门 entry 方法，见 [session-manager.ts#L889](/source-code/packages/coding-agent/src/core/session-manager.ts#L889)、[session-manager.ts#L902](/source-code/packages/coding-agent/src/core/session-manager.ts#L902)、[session-manager.ts#L939](/source-code/packages/coding-agent/src/core/session-manager.ts#L939)、[session-manager.ts#L1048](/source-code/packages/coding-agent/src/core/session-manager.ts#L1048)、[session-manager.ts#L1188](/source-code/packages/coding-agent/src/core/session-manager.ts#L1188)。

## 28. 从 MVP 到生产级

分阶段落地：

1. MVP：message protocol、one-shot provider、tool call/result、abort、event stream、in-memory session。
2. 可用 CLI：read-only tools、bash、JSONL append、model/auth config、basic errors。
3. 可用产品：ResourceLoader、system prompt、AGENTS.md、skills、prompt templates、settings、session resume。
4. 可扩展产品：extensions、custom tools、commands、custom entries、RPC、SDK。
5. 生产级能力：compaction、tree/fork/clone、provider compatibility、observability、security policy、package ecosystem、faux provider regression。

durable-harness.md 提醒一个关键现实：fully durable harness 不可能只靠序列化 JS 对象，因为工具、模型、auth provider、extensions、resource loader、hooks 都是 host 提供的运行时代码。session 应记录 durable state；host 负责在 resume 时重建兼容依赖。

## 28. 已实现事实、进一步 docs、生态扩展

已实现事实：pi 已有低层 agent loop、typed messages、assistant event stream、AgentSession product layer、JSONL session manager、SDK/RPC/JSON host、custom provider/model/auth、extension/package 生态。

进一步 docs：agent-harness.md 解释 turn snapshot、phase、save point、pending writes；durable-harness.md 解释 semi-durable recovery；observability.md 解释未来 trace contract。

生态扩展方式：MCP、sub-agent、plan/todo、permission gate、background jobs、remote sandbox 都可以在这个 MVP 之上扩展，但它们不是最小 agent 的必要条件。

## 28. 最终判断标准

一个复刻版是否走在正确路上，看它能否回答：

1. 每条状态属于 model、agent loop、session、host UI、extension 还是外部环境？
2. provider request 失败后 transcript 怎么记录？
3. tool 有副作用时谁负责允许、阻止、审计？
4. streaming 中用户追加消息会怎样排队？
5. session 如何 resume/fork/clone？
6. credential 从哪里来，是否会进日志？
7. UI 是否只消费事件，而不是窥探 provider 私有 payload？
