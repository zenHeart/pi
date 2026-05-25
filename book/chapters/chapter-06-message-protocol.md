# 6. 消息协议与上下文转换

## 6. 本章解决的问题

agent 的事实源不是 UI 文本，而是一组可区分角色和 content block 的消息。provider 消息类型在 [types.ts#L271](/source-code/packages/ai/src/types.ts#L271)、[types.ts#L277](/source-code/packages/ai/src/types.ts#L277) 和 [types.ts#L292](/source-code/packages/ai/src/types.ts#L292)。低层 agent message 会扩展 provider message，定义在 [types.ts#L309](/source-code/packages/agent/src/types.ts#L309)。

对新手来说，这解释了为什么模型能“看到工具结果”：工具结果不是屏幕文本，而是被写回上下文的 `toolResult` 消息。对创造者来说，消息协议是 agent harness 的中心抽象；只要这里混乱，stream、tool、session、compaction、export、RPC 都会混乱。

## 6. 三种消息边界

| 边界 | 例子 | 是否一定给模型 |
|---|---|---|
| UI message | 通知、错误、extension UI、终端渲染状态 | 否 |
| session entry | header、message、model change、compaction、label、branch summary | 否 |
| provider message | user、assistant、toolResult | 是，经过转换后 |

这个分离是 pi 的核心设计。否则无法表达“extension UI 状态只展示不进模型”“session 可以保存分支信息”“bash execution 可以显示完整输出但只截断或整理后给模型”。

## 6. Content blocks

user message 可以是字符串，也可以是 text/image block；assistant message 可以包含 text、thinking、toolCall；tool result 可以包含 text/image block。content block 类型分别在 [types.ts#L224](/source-code/packages/ai/src/types.ts#L224)、[types.ts#L246](/source-code/packages/ai/src/types.ts#L246) 和 [types.ts#L292](/source-code/packages/ai/src/types.ts#L292) 附近。

复刻时不要把 assistant 当成单字符串。最小实现至少需要：

```ts
type MiniMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: Array<
        | { type: "text"; text: string }
        | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
      >;
    }
  | { role: "toolResult"; toolCallId: string; toolName: string; content: string; isError: boolean };
```

字段名也很重要。pi 的 tool call 参数字段叫 `arguments`，不是 `input`。正式类型见 [types.ts#L246](/source-code/packages/ai/src/types.ts#L246)。

## 6. Stream event 到 final message

provider stream 会先发 `start`，再发多个 block 级 delta，最后发 `done` 或 `error`。事件定义在 [types.ts#L347](/source-code/packages/ai/src/types.ts#L347)。agent loop 不能在半个 JSON 参数时就执行工具，必须等 final assistant message 中 tool call 完整。

tool execution 也有自己的事件：开始、更新、结束。低层 agent event 定义在 [types.ts#L403](/source-code/packages/agent/src/types.ts#L403)。这让 UI 可以实时显示工具进度，也让 JSON mode 和 extension 能观察执行生命周期。

## 6. transformContext 与 convertToLlm

内部消息到 provider 消息之间有转换边界。`AgentOptions` 暴露 `convertToLlm`，定义在 [agent.ts#L98](/source-code/packages/agent/src/agent.ts#L98)，`Agent` 会在创建时设置默认转换器，见 [agent.ts#L203](/source-code/packages/agent/src/agent.ts#L203)。agent loop 每轮请求 provider 前调用转换，位置在 [agent-loop.ts#L289](/source-code/packages/agent/src/agent-loop.ts#L289)。

两类转换不要混用：内部上下文变换适合做扩展、压缩、过滤和 session 特有消息处理；provider 转换适合做 schema 适配、image block 处理和 provider 兼容性。把 UI message 直接拼成 prompt 是最脆弱的做法。

## 6. JSON mode 中的协议观察

`pi --mode json` 会把 session header 和后续事件以 JSON lines 输出。文档中的事件来自 `AgentSessionEvent`，定义在 [agent-session.ts#L123](/source-code/packages/coding-agent/src/core/agent-session.ts#L123)。这让外部程序可以不解析终端 UI，直接观察 `message_start`、`message_update`、`tool_execution_end`、`compaction_start`、`auto_retry_start` 等事件。

这也是为什么 pi 不能只输出最终文本：真正的集成方需要生命周期事件，而不是一段不可结构化的聊天记录。

## 6. 常见误解

误解一：assistant response 是一个字符串。实际它可能包含 thinking、多个 text block 和多个 tool call。

误解二：tool result 是 UI 日志。实际它是 provider 上下文的一部分，必须带 toolCallId、toolName、content、isError 和 timestamp。

误解三：JSON mode 是“把最终回答包成 JSON”。实际它输出完整事件流，包括队列、compaction、retry 和工具执行事件。

## 6. 进一步阅读

读 `packages/coding-agent/docs/json.md`，再读 `packages/ai/src/types.ts` 的 message、content、event、model 类型。源码继续看 [types.ts#L271](/source-code/packages/ai/src/types.ts#L271)、[types.ts#L277](/source-code/packages/ai/src/types.ts#L277)、[types.ts#L347](/source-code/packages/ai/src/types.ts#L347)、[agent-loop.ts#L31](/source-code/packages/agent/src/agent-loop.ts#L31)。
