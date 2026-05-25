# 18. Extension Hooks 与事件生命周期

## 18. 本章解决的问题

hooks 让 extension 在正确阶段观察、转换、拦截或补充 agent 行为。它们不是“到处插代码”的后门，而是一组有明确 mutation contract 的生命周期事件。事件 union 定义在 [types.ts#L950](/source-code/packages/coding-agent/src/core/extensions/types.ts#L950)，event result 类型从 [types.ts#L978](/source-code/packages/coding-agent/src/core/extensions/types.ts#L978) 开始。

对前端读者来说，可以把 hook 想成 React/Vue 生命周期加 middleware：有些只能看，有些可以改 props，有些可以阻止动作，有些只能在提交前取消。

## 18. Hook 分类

第一类是观察型事件，如 `session_start`、`agent_start`、`turn_start`、`message_start`、`message_update`、`agent_end`。handler 可以记录日志、更新 UI，但返回值不参与控制流。

第二类是 transform 型事件，如 `context` 和 `before_provider_request`。它们按顺序执行，每个 handler 看到上一个 handler 的输出。`emitContext()` 会复制 messages 后逐个 handler 应用返回的 `messages`，见 [runner.ts#L858](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L858)。`emitBeforeProviderRequest()` 会链式替换 payload，见 [runner.ts#L890](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L890)。

第三类是 gate 型事件，如 `tool_call` 和 `session_before_*`。`tool_call` 可以 block 工具执行，result 类型在 [types.ts#L984](/source-code/packages/coding-agent/src/core/extensions/types.ts#L984)；session-before 事件可以 cancel 结构性操作，runner 识别这些事件的位置在 [runner.ts#L671](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L671)。

第四类是 patch 型事件，如 `tool_result` 和 `message_end`。它们不能随便改角色或伪造未发生的副作用，只能按约束补丁化结果。

## 18. Input 与 before_agent_start

`input` 发生在 skill/template expansion 之前，适合用户输入的拦截、转换或完全处理。`AgentSession.prompt()` 在 extension command 后触发 input hook，见 [agent-session.ts#L979](/source-code/packages/coding-agent/src/core/agent-session.ts#L979)。如果 input handler 返回 handled，后续不会进入模型。

`before_agent_start` 发生在 agent loop 前，适合注入 custom message 或修改本轮 system prompt。它的 result 类型允许返回一个 message 和一个新的 systemPrompt，见 [types.ts#L1009](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1009)。这比直接改全局 system prompt 更安全，因为它明确作用于当前 turn。

## 18. Tool call 与 tool result

`tool_call` 发生在工具执行前，适合权限门、参数规范化、审计和阻止副作用。runner 在 handler 返回 `block` 时提前返回，见 [runner.ts#L811](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L811)。如果要禁止 `rm -rf`、保护 `.env`、要求用户确认，必须在这里做。

`tool_result` 发生在工具执行后，适合截断、脱敏、格式化和错误修正。runner 会累计 `content`、`details`、`isError` patch，让后面的 handler 看到前面的修改，见 [runner.ts#L756](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L756)。不要在 `tool_result` 里假装工具没有执行过；如果副作用不能发生，阻止点必须提前到 `tool_call`。

## 18. Message end 的角色不变量

`message_end` 可以替换 finalized message，但 replacement 必须保持原 role。类型注释写在 [types.ts#L1004](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1004)，runner 也会检查 role，不匹配就记录 error 并跳过，见 [runner.ts#L714](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L714)。

这个约束非常重要：如果 extension 能把 assistant message 改成 user message，session tree 和后续 LLM context 都会失真。hook 可以修正内容，不能破坏协议身份。

## 18. Session-before 事件

`session_before_switch`、`session_before_fork`、`session_before_compact`、`session_before_tree` 都发生在结构性 session 操作之前。它们适合 dirty repo guard、确认 fork、定制 compaction、覆盖 branch summary 或取消导航。事件定义从 [types.ts#L521](/source-code/packages/coding-agent/src/core/extensions/types.ts#L521) 开始，`session_before_tree` 的 summary result 定义在 [types.ts#L1029](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1029)。

pi 在 tree navigation 中会先构造 preparation，再发 `session_before_tree`，extension 可以取消、提供 summary 或改写 instructions，见 [agent-session.ts#L2690](/source-code/packages/coding-agent/src/core/agent-session.ts#L2690) 到 [agent-session.ts#L2735](/source-code/packages/coding-agent/src/core/agent-session.ts#L2735)。

## 18. Resources discover

`resources_discover` 发生在 `session_start` 之后，允许 extension 动态提供 skill、prompt 和 theme paths。事件 result 定义在 [types.ts#L494](/source-code/packages/coding-agent/src/core/extensions/types.ts#L494)。runner 会收集每个 extension 返回的路径，并保留 extension source path，见 [runner.ts#L1004](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L1004)。

这让 extension 可以把外部项目、内部平台或本地生成资源接入 pi，但也意味着资源发现本身可能失败。失败时应该产生 diagnostic，而不是让整个 agent 启动崩掉。

## 18. Error 隔离

runner 对大多数 handler 异常采取 continue policy：捕获错误、记录 extensionPath、event、message 和 stack，然后继续其他 handler。普通 emit 的错误处理在 [runner.ts#L698](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L698)，context transform 的错误处理在 [runner.ts#L874](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L874)，provider request 的错误处理在 [runner.ts#L908](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L908)。

创造者视角下，extension error 不能让 session 处于半提交状态。能 fail-open 的观察和格式化 hook 应该 fail-open；安全 gate 则要谨慎，尤其 tool_call 的权限门如果自身异常，产品要明确是继续还是阻断。

## 18. 复刻路径

最小可用：实现 `on(event, handler)`、观察型事件、错误隔离和 source metadata。

第二阶段：实现 `context` transform、`before_agent_start` system prompt chaining、`tool_call` block、`tool_result` patch、`message_end` same-role replacement。

生产级：加入 session-before cancel/customize、resources_discover aggregation、per-run AbortSignal、reload cleanup、stale extension guard、RPC/interactive mode 差异和完整 diagnostics。
