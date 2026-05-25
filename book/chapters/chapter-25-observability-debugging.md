# 25. Observability、事件追踪与调试

## 25. 本章解决的问题

agent 失败可能来自模型、provider、工具、session、资源、扩展、终端、JSONL controller 或用户环境。创造者视角下，可观测性要回答“哪一层做了什么决定”。读者视角下，调试不要先改 prompt，而要先确认输入、模型、事件、工具和 session 哪一环变了。

当前已实现的运行时事件类型在 `AgentSessionEvent`，见 [agent-session.ts#L123](/source-code/packages/coding-agent/src/core/agent-session.ts#L123)，低层 agent event 在 [types.ts#L403](/source-code/packages/agent/src/types.ts#L403)。观测性设计文档提出的是进一步设计：pi 应发稳定、结构化、脱敏的 lifecycle events，再由外部 listener 转成 OTel、Sentry、logs 或 metrics。

## 25. 事件流是已实现事实

pi 已经有事件流。`AgentSession` 订阅低层 `Agent` event 的位置在 [agent-session.ts#L336](/source-code/packages/coding-agent/src/core/agent-session.ts#L336)，用户侧 `subscribe()` 在 [agent-session.ts#L673](/source-code/packages/coding-agent/src/core/agent-session.ts#L673)。低层 loop 会发 `turn_start`、`message_update`、`tool_execution_start` 等事件，例子分别见 [agent-loop.ts#L110](/source-code/packages/agent/src/agent-loop.ts#L110)、[agent-loop.ts#L335](/source-code/packages/agent/src/agent-loop.ts#L335)、[agent-loop.ts#L408](/source-code/packages/agent/src/agent-loop.ts#L408)。

这条事件流支撑四类 host：

1. TUI：显示文本、thinking、工具进度、错误、queue。
2. JSON mode：把事件按 JSONL 输出。
3. RPC mode：同时输出 response、event 和 extension UI request。
4. SDK：让 host 自己订阅事件并渲染。

所以事件不是“日志附属品”，而是 runtime 和 UI 的边界。

## 25. Trace/span 是进一步设计，不要写成已完成

`packages/agent/docs/observability.md` 设计了 runtime-agnostic observability abstraction：`PiObservabilityContext`、`PiObservabilityEvent`、`traceOperation()`、`runWithPiContext()`、subscribe API。它建议一次用户 turn 是一个 trace，provider request、tool call、session append、compaction 是 span。`traceOperation()` 的伪代码说明要创建 trace/span id、emit start/end/error、错误后 rethrow。

这部分是进一步 docs，不是当前章节可以宣称已经全量实现的事实。正确写法是：pi 已有结构化 runtime events；observability docs 给出下一步稳定 trace contract 的设计方向。不要把设计文档里的 package story 写成已经发布的 `packages/observability`。

## 25. 默认脱敏边界

观测性不能变成泄密通道。设计文档把 safe/unsafe payload 分开：provider、model、API、session id、entry type、tool name、status code、stop reason、token counts、cost、duration 是默认安全元数据；prompt、completion、tool args、tool results、shell output、file contents、provider payload/response、API keys、headers 默认不安全。

这条边界对小白读者尤其重要：日志不是越多越好。你在调试时想看“发生了什么”，但不应该默认记录“用户让模型看了什么”和“工具读到了什么 secret”。

## 25. Debugging 顺序

排查时按层定位：

1. mode 是否收到输入：CLI args、stdin、RPC command、SDK `prompt()`。
2. ResourceLoader 是否加载了正确 context、skills、prompts、extensions。
3. ModelRegistry 是否解析到正确模型和 credential。
4. provider stream 是否产生合法 `AssistantMessageEvent`。
5. agent loop 是否生成 tool call/result。
6. tool 是否被 allowlist、extension hook 或 sandbox 改写/阻止。
7. session 是否在 save point 追加 entry。
8. extension 是否在 input、context、tool_call、message_end、compaction 等事件中修改行为。
9. host 是否正确显示事件：TUI、JSON、RPC、SDK UI。

`AgentSession.prompt()` 是用户输入进入 session 的关键入口，见 [agent-session.ts#L962](/source-code/packages/coding-agent/src/core/agent-session.ts#L962)。模型切换在 [agent-session.ts#L1417](/source-code/packages/coding-agent/src/core/agent-session.ts#L1417)，thinking 设置在 [agent-session.ts#L1510](/source-code/packages/coding-agent/src/core/agent-session.ts#L1510)，compaction 在 [agent-session.ts#L1611](/source-code/packages/coding-agent/src/core/agent-session.ts#L1611)，tree navigation 在 [agent-session.ts#L2657](/source-code/packages/coding-agent/src/core/agent-session.ts#L2657)。

## 25. Harness lifecycle 解释了很多“偶发 bug”

AgentHarness docs 把状态分成 harness config、turn snapshot、session、pending session writes。关键点是：运行中 setter 更新未来配置，不修改当前 provider request；每个 turn 创建 snapshot；save point 后刷新 context/model/thinking/stream/session state。turn snapshot 文档从 `packages/agent/docs/agent-harness.md` 的 “Turn snapshot” 开始，phase 类型列出 idle、turn、compaction、branch_summary、retry，save point 章节解释 assistant/tool result 完成后的刷新。

这对调试很重要。比如用户在 streaming 中切换模型，当前 provider request 不应该突然换模型；下一轮才应生效。再比如 extension 在忙碌期间写 session，顺序必须在 save point 或 settlement 被确定，而不是插到已完成 assistant message 前面。

## 25. Eval 与 regression

真实 provider eval 用来衡量模型能力，faux provider regression 用来保护 runtime 语义。不要用真实模型测试 queue、session replacement、extension settlement、tool event order 这类确定性行为。AgentHarness docs 明确建议 harness/provider 测试使用 faux provider，避免真实 provider API、网络和付费 token。

前端读者可以把这理解成两种测试：

1. “模型好不好”：需要真实 provider 和真实任务。
2. “我的 runtime 对不对”：用 fake/faux provider 固定输出，断言 event、message、tool result、session entry。

## 25. 已实现事实、进一步 docs、生态扩展

已实现事实：pi 已有 Agent/AgentSession event stream、RPC/JSON/SDK event 输出、tool lifecycle event、queue/compaction/retry event、session stats、provider hooks、extension error event。

进一步 docs：observability.md 提出了统一 trace/span contract、runtime adapters、safe payload、listener isolation 和 future package story。durable-harness.md 提出了恢复时如何从 session log reduce queues、pending writes、operations、turns、provider requests 和 tool calls。

生态扩展方式：你可以写 SDK/RPC listener，把 pi events 转成 OpenTelemetry spans、Sentry breadcrumbs、structured logs、metrics dashboard 或 eval dataset。但 listener 应是被动观察者。控制行为应该走 extension hooks 或 host policy，不要让 observability subscriber 改变 pi 执行。

## 25. 实操清单

调试前先保存这些事实：

1. pi 版本、cwd、mode、CLI args。
2. model provider/id、thinking level、active tools。
3. auth source，不包含明文 key。
4. loaded context files、skills、prompts、extensions、packages。
5. JSONL session file 或 export。
6. event stream，至少包含 agent/turn/message/tool/queue/compaction/retry。
7. provider status、stop reason、usage/cost、errorMessage。
8. extension errors 和 hook decisions。

没有这些事实，调试只是在猜。
