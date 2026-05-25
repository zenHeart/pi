# 第10章 扩展系统：pi 产品能力的增长接口

## 10.1 扩展解决什么问题

pi 把通用 runtime 留在核心，把工作流差异留给 TypeScript extensions。扩展可以注册工具、命令、快捷键、provider、message renderer、custom UI，也可以监听 agent、session、model、tool、input、bash、resources 事件。

扩展加载由 loader 完成，runner 从 [runner.ts#L224](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L224) 开始管理事件、上下文、错误和注册能力。API 类型从 [types.ts#L1084](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1084) 开始。

## 10.2 生命周期

官方 extensions 文档给出的生命周期可以分成六段：

1. 启动/加载：extension factory 执行，注册工具、命令、provider。
2. 资源发现：`resources_discover` 贡献 skills/prompts/themes 等资源路径。
3. session 生命周期：`session_start`、`session_before_switch`、`session_before_fork`、`session_before_compact`、`session_before_tree`、`session_shutdown`。
4. agent 生命周期：`before_agent_start`、`agent_start`、`turn_start`、`context`、`before_provider_request`、`after_provider_response`、`message_*`、`tool_execution_*`、`turn_end`、`agent_end`。
5. 用户输入：`input`、slash command、shortcut、user bash。
6. UI 与渲染：dialogs、widgets、status、footer、custom components、custom editor、message renderer。

`ExtensionRunner.emit()` 的通用事件分发从 [runner.ts#L680](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L680) 开始。特殊事件有专门方法，例如 `emitToolCall()` 从 [runner.ts#L806](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L806) 开始，`emitContext()` 从 [runner.ts#L858](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L858) 开始。

## 10.3 ExtensionContext

`ExtensionContext` 从 [types.ts#L298](/source-code/packages/coding-agent/src/core/extensions/types.ts#L298) 开始定义。它让扩展访问 cwd、session manager、model registry、current model、signal、UI、context usage、compact、system prompt 等运行时能力。

要注意 stale context 问题。session replacement、fork、switch、reload 后，旧 ctx 可能失效。runner 中有明确错误提示，见 [runner.ts#L467](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L467)。复刻时如果允许扩展长期持有上下文，必须定义失效策略，否则扩展会对旧 session 写入数据。

## 10.4 注册能力

`ExtensionAPI` 支持多类注册：

- `registerTool()`：注册 LLM 可调用工具，类型位置见 [types.ts#L1133](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1133)。
- `registerCommand()`：注册 slash command，见 [types.ts#L1142](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1142)。
- `registerShortcut()`：注册键盘快捷键，见 [types.ts#L1145](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1145)。
- `registerMessageRenderer()`：注册 custom message renderer，见 [types.ts#L1171](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1171)。
- `sendMessage()` / `sendUserMessage()`：注入消息，见 [types.ts#L1178](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1178)。
- `registerProvider()` / `unregisterProvider()`：动态注册 provider/model，见 [types.ts#L1292](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1292)。

这不是“插件 API 越多越好”。每个 API 都对应一个核心边界：工具、命令、UI、消息、provider、资源。扩展不能直接改 loop 内部状态，而是通过这些边界表达意图。

## 10.5 Mutation 语义

扩展事件有不同合并语义：

- observation：只观察，不修改。
- transform：链式修改，例如 context 或 provider payload。
- first meaningful result wins：例如 user bash handler。
- cancellation：例如 session_before_compact 可以 cancel。
- registry：工具、命令、provider 不是 hook，而是注册表。

hooks 设计文档强调错误策略、source metadata、registry vs hook 的区别。复刻时必须为每种事件定义返回值如何合并、错误是否阻断、是否继续调用后续 handler。

## 10.6 失败语义

扩展异常不能随意打崩核心 loop。`ExtensionRunner.emitError()` 从 [runner.ts#L486](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L486) 开始记录 extension error。不同事件的失败策略不同：有些只是通知用户，有些必须阻断操作，有些可以保留原 payload 继续。

生产级扩展系统需要：

- 错误归属到 extension source。
- 错误进入 UI/RPC 事件。
- 可 reload。
- handler settlement 顺序可预测。
- session replacement 后旧 ctx 失效。
- 注册冲突有 diagnostics。

## 10.7 复刻原则

MVP 扩展系统：加载本地 TS/JS 模块；支持 `on(event)`、`registerTool()`、`registerCommand()`；工具前后 hook；错误隔离。

生产级：完整 lifecycle、resource discovery、custom UI、message renderer、provider registration、shortcut、state management、stale ctx 防护、reload、package source metadata、RPC extension UI protocol。
