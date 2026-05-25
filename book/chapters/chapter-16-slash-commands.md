# 第16章 Slash Commands：用户动作的命令路由

## 16.1 Slash Command 的职责

slash command 是用户显式触发产品能力的入口。它不同于普通 prompt：`/model` 是状态切换，`/compact` 是 session mutation，`/export` 是文件输出，`/skill:name` 才会展开成任务上下文。把所有 `/xxx` 都拼进 prompt 是错误设计。

内置命令列表在 [slash-commands.ts#L18](/source-code/packages/coding-agent/src/core/slash-commands.ts#L18)，包括 settings、model、scoped-models、export、import、share、copy、name、session、changelog、hotkeys、fork、clone、tree、login、logout、new、compact、resume、reload、quit。这个列表既是用户功能地图，也是产品状态入口清单。

## 16.2 三类命令来源

pi 的命令来源有三类：

- built-in command：产品内置状态和 session 操作。
- extension command：扩展注册的动作。
- resource command：skill 和 prompt template 暴露的命令。

`SlashCommandSource` 在 [slash-commands.ts#L4](/source-code/packages/coding-agent/src/core/slash-commands.ts#L4) 定义。`AgentSession.prompt()` 会优先判断命令，再决定是否进入 agent loop，入口见 [agent-session.ts#L962](/source-code/packages/coding-agent/src/core/agent-session.ts#L962)。

## 16.3 Streaming 中的命令语义

agent 正在运行时，命令不能随意执行。某些 extension command 即使 streaming 中也可以立即执行；某些命令必须等 idle；普通文本输入则进入 steering 或 follow-up 队列。`AgentSession` 在命令处理附近有明确错误信息，防止不能排队的 extension command 被 queued，相关逻辑见 [agent-session.ts#L1259](/source-code/packages/coding-agent/src/core/agent-session.ts#L1259)。

复刻时必须为每个命令标注：

- 是否进入模型。
- 是否要求 idle。
- 是否能排队。
- 是否修改 session。
- 是否有副作用文件输出。
- 是否能由 extension 注册。

## 16.4 Settings、Model 与 Auth 命令

`/settings` 改变 thinking level、theme、message delivery、transport 等产品设置。settings 持久化由 `SettingsManager` 管理，相关文件操作可从 [settings-manager.ts#L308](/source-code/packages/coding-agent/src/core/settings-manager.ts#L308) 附近阅读。

`/model` 和 `/login` 依赖 `ModelRegistry` 与 auth storage。模型注册表从 [model-registry.ts#L335](/source-code/packages/coding-agent/src/core/model-registry.ts#L335) 开始，认证和请求 headers 解析在 [model-registry.ts#L685](/source-code/packages/coding-agent/src/core/model-registry.ts#L685)。这说明命令系统不是 UI 菜单，而是产品状态入口。

## 16.5 用户命令完整语义

从用户视角，docs/usage.md 覆盖的命令可以按结果分类：

- 状态选择：`/settings`、`/model`、`/scoped-models`、`/login`、`/logout`。
- 会话管理：`/session`、`/resume`、`/new`、`/fork`、`/clone`、`/tree`、`/name`。
- 上下文治理：`/compact`，以及 settings 中的 auto compaction。
- 导入导出：`/export`、`/import`、`/share`、`/copy`。
- 信息面板：`/hotkeys`、`/changelog`。
- 运行时刷新与退出：`/reload`、`/quit`。

interactive mode 中这些命令大多不是在一个 switch 里结束，而是打开 overlay、调用 runtimeHost、读写 session、调用 clipboard 或导出 HTML。比如 `/export` 处理从 [interactive-mode.ts#L4948](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L4948) 开始；`/copy` 读取最后一条 agent 文本并写入剪贴板，见 [interactive-mode.ts#L5139](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L5139)；`/hotkeys` 生成快捷键说明，见 [interactive-mode.ts#L5276](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L5276)；`/tree` 打开会话树选择器，见 [interactive-mode.ts#L4253](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L4253)。

CLI 也有对应入口。参数解析在 [args.ts#L59](/source-code/packages/coding-agent/src/cli/args.ts#L59)，帮助文本从 [args.ts#L191](/source-code/packages/coding-agent/src/cli/args.ts#L191) 开始。重要参数包括：

- `--model`、`--provider`、`--thinking`、`--models`：模型与循环范围。
- `--resume`、`--continue`、`--session`、`--fork`：会话入口。
- `--print`、`--json`、`--rpc`：运行模式。
- `--extension`、`--skill`、`--prompt-template`、`--theme` 及对应 `--no-*`：资源加载。
- `--export`、`--list-models`：无需进入完整交互 UI 的操作。

这就是为什么 book 必须把 slash command、CLI args、SDK/RPC 分开讲：同一个产品能力可以有多个入口，但最终应落到同一套 session/runtime 方法。

## 16.6 环境变量和资源开关

usage docs 里的环境变量不是附录细节。`PI_SKIP_VERSION_CHECK`、`PI_TELEMETRY`、`PI_CACHE_RETENTION`、`PI_SHARE_VIEWER_URL`、`VISUAL`、`EDITOR`、provider API keys 都会改变运行时行为。复刻时至少要把环境变量分成四类：

- provider credential：影响模型可用性。
- product behavior：影响更新检查、telemetry、share viewer。
- editor/terminal integration：影响外部编辑器和 shell 行为。
- cache/session retention：影响磁盘清理和恢复能力。

资源开关也同样重要。`--no-skills`、`--no-prompt-templates`、`--no-themes`、`--no-extensions` 让用户能在排错或安全模式下逐层关闭能力。这是 agent 产品可维护性的关键，不是高级功能。

## 16.7 复刻原则

MVP：实现 `/model`、`/session`、`/compact`、`/export`、`/resume`、`/reload`、`/help`。

生产级：内置/extension/resource 命令统一补全；命令可声明 idle/streaming 语义；命令错误进入 UI/RPC；命令可打开 TUI overlay；命令可由 SDK/RPC 触发；命令列表可查询。
