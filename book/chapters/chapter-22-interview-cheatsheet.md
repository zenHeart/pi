# 第22章 AgentHarness 专家速查

## 22.1 一句话解释 pi

pi 是一个 TypeScript terminal coding harness：`packages/ai` 统一 provider 流式事件，`packages/agent` 提供 agent loop 和可嵌入 harness，`packages/coding-agent` 把它产品化为 CLI/TUI/RPC，并通过 extensions、skills、prompt templates、themes、packages 扩展。

## 22.2 AgentSession 与 AgentHarness 的区别

`AgentSession` 是 pi 产品层。它知道 CLI/TUI/RPC、settings、resource loader、extensions、session manager、内置工具、auto retry、export 等产品能力。

`AgentHarness` 是更通用的 runtime 层。它负责创建 turn snapshot、执行 turn、刷新 save point、管理 pending session writes、处理 queue、支持 compaction/tree、暴露 hook/event。类从 [agent-harness.ts#L164](/source-code/packages/agent/src/harness/agent-harness.ts#L164) 开始。

自定义产品应优先理解两者边界：要复刻 pi CLI，用 `AgentSession` 思路；要做自己的 harness，用 `AgentHarness` 思路。

## 22.3 Turn snapshot

turn snapshot 是一次 LLM turn 使用的具体状态。`createTurnState()` 从 [agent-harness.ts#L313](/source-code/packages/agent/src/harness/agent-harness.ts#L313) 开始，包含 session messages、resources、model、thinking level、active tools、system prompt、stream options 等。

设计原则：运行中的 provider request 不应被外部 setter 直接修改。配置变化可以立即更新 live config，但只在下一次 snapshot 或 save point 生效。

## 22.4 Save point 与 pending writes

save point 发生在 assistant turn 和 tool result message 完成后。`flushPendingSessionWrites()` 从 [agent-harness.ts#L459](/source-code/packages/agent/src/harness/agent-harness.ts#L459) 开始；save point 相关逻辑在 [agent-harness.ts#L496](/source-code/packages/agent/src/harness/agent-harness.ts#L496) 附近。

pending writes 解决的是“listener/hook 在 active operation 中想写 session”的排序问题。它们不能丢，也不能插到 agent-emitted message 前面破坏 transcript。正确做法是在 save point、settlement、failure cleanup 中按顺序 flush。

## 22.5 Queue 与 abort

`steer()`、`followUp()`、`nextTurn()` 分别从 [agent-harness.ts#L652](/source-code/packages/agent/src/harness/agent-harness.ts#L652)、[agent-harness.ts#L658](/source-code/packages/agent/src/harness/agent-harness.ts#L658)、[agent-harness.ts#L664](/source-code/packages/agent/src/harness/agent-harness.ts#L664) 开始。`abort()` 从 [agent-harness.ts#L936](/source-code/packages/agent/src/harness/agent-harness.ts#L936) 开始。

steering 和 follow-up 是当前 run 的队列；nextTurn 是下一个用户 turn 前插入的消息；abort 应终止当前 run 并清理相关队列，但不能随意丢 pending session writes。

## 22.6 Structural operations

compaction 和 tree navigation 是结构性 session mutation，要求 harness idle。`compact()` 从 [agent-harness.ts#L681](/source-code/packages/agent/src/harness/agent-harness.ts#L681) 开始，`navigateTree()` 从 [agent-harness.ts#L737](/source-code/packages/agent/src/harness/agent-harness.ts#L737) 开始。

这个限制是为了避免一边 provider streaming，一边改变 session branch，导致上下文和持久化顺序不确定。

## 22.7 必答源码点

- Loop 入口：[agent-loop.ts#L31](/source-code/packages/agent/src/agent-loop.ts#L31)
- Agent 状态封装：[agent.ts#L166](/source-code/packages/agent/src/agent.ts#L166)
- Harness：[agent-harness.ts#L164](/source-code/packages/agent/src/harness/agent-harness.ts#L164)
- Product Session：[agent-session.ts#L252](/source-code/packages/coding-agent/src/core/agent-session.ts#L252)
- Tool factory：[tools/index.ts#L96](/source-code/packages/coding-agent/src/core/tools/index.ts#L96)
- SessionEntry：[session-manager.ts#L138](/source-code/packages/coding-agent/src/core/session-manager.ts#L138)
- Extension API：[types.ts#L1084](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1084)
- ModelRegistry：[model-registry.ts#L335](/source-code/packages/coding-agent/src/core/model-registry.ts#L335)

## 22.8 设计红线

不要把工具执行交给模型。不要让 provider payload 污染内部消息。不要丢弃 toolCall/toolResult 配对。不要把 session 做成线性数组。不要让 UI 拥有 loop。不要让 extension 直接改内部状态。不要在没有 faux provider 的情况下测试 loop。不要把安全策略写成 prompt。
