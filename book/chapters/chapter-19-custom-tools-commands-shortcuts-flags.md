# 19. 自定义工具、命令、快捷键与 Flags

## 19. 本章解决的问题

extension 不是只有一种扩展点。pi 把“模型能调用什么”“用户能主动触发什么”“键盘能触发什么”“启动时能配置什么”拆成不同 registry：tool、command、shortcut、flag。API 定义从 [types.ts#L1084](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1084) 开始，四类注册方法集中在 [types.ts#L1132](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1132) 到 [types.ts#L1164](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1164)。

对前端小白来说，可以类比：tool 是给“模型这个后台逻辑”调用的函数；command 是用户在地址栏输入的命令；shortcut 是键盘事件；flag 是启动参数。

## 19. 何时用哪种扩展点

| 扩展点 | 触发者 | 适合场景 | 不适合场景 |
|---|---|---|---|
| tool | 模型 | 查询数据库、调用内部 API、读自定义资源、执行可审计动作 | 用户必须亲自确认的菜单动作 |
| command | 用户 | `/deploy`、`/handoff`、`/setup`、打开自定义 UI | 需要模型自动决策的能力 |
| shortcut | 用户键盘 | 切换模式、打开 overlay、快速执行 command | 长流程业务逻辑 |
| flag | CLI 启动 | 开启 extension 特定行为、传入配置 | 每轮对话的动态状态 |

创造者视角下，这个拆分是安全模型的一部分。模型能调用 tool，不代表它能随意触发 command；用户能按快捷键打开 UI，不代表模型能越过确认。

## 19. 自定义 tool

tool 定义包含 name、label、description、TypeBox 参数 schema、execute、可选 prompt snippet/guidelines、execution mode 和 renderers，见 [types.ts#L426](/source-code/packages/coding-agent/src/core/extensions/types.ts#L426)。`execute()` 会收到 toolCallId、已校验 params、AbortSignal、update callback 和 ExtensionContext，核心签名在 [types.ts#L454](/source-code/packages/coding-agent/src/core/extensions/types.ts#L454)。

工具应该把模型需要知道的结果放进 `content`，把 UI 或 extension 私有细节放进 `details`。如果工具有大量输出，优先提供 `renderResult()` 和紧凑内容，而不是把全部日志塞给模型。

## 19. Tool registry 与 active tools

registry 和 active tools 是两个概念。registry 表示“系统知道这些工具定义”；active tools 表示“下一轮模型能看到和调用哪些工具”。`AgentSession._refreshToolRegistry()` 会收集 extension tools、SDK custom tools 和 builtin tools，并应用 allowlist，入口在 [agent-session.ts#L2253](/source-code/packages/coding-agent/src/core/agent-session.ts#L2253)。定义 registry 构造在 [agent-session.ts#L2267](/source-code/packages/coding-agent/src/core/agent-session.ts#L2267)，最终 tool registry 包装在 [agent-session.ts#L2301](/source-code/packages/coding-agent/src/core/agent-session.ts#L2301)。

`--tools` 必须同时过滤 builtin、extension 和 SDK tools，否则安全边界不完整。pi 在刷新 registry 时用 `allowedToolNames` 统一过滤，见 [agent-session.ts#L2256](/source-code/packages/coding-agent/src/core/agent-session.ts#L2256)。

## 19. Tool 冲突与覆盖

runner 对 extension tools 是 first registration per name wins，见 [runner.ts#L373](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L373)。但 `AgentSession` 在组装最终 registry 时会把 extension/custom tools 放进 definition registry 和 tool registry，这意味着自定义工具可以和内置工具同名并覆盖最终暴露能力，相关 set 操作在 [agent-session.ts#L2278](/source-code/packages/coding-agent/src/core/agent-session.ts#L2278) 和 [agent-session.ts#L2313](/source-code/packages/coding-agent/src/core/agent-session.ts#L2313)。

这是高级能力，不是默认建议。覆盖 builtin `read` 或 `bash` 等工具时，必须在文档和 diagnostics 中说清楚来源，否则用户看到的工具名和实际行为会不一致。

## 19. 自定义 command

command 是用户主动触发的 slash command。`RegisteredCommand` 包含 description、handler 和 sourceInfo，定义在 [types.ts#L1061](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1061)。runner 会把注册命令汇总给 session，用于 `/` autocomplete 和执行，命令信息组装在 [agent-session.ts#L2141](/source-code/packages/coding-agent/src/core/agent-session.ts#L2141)。

command handler 使用 `ExtensionCommandContext`，比普通 event context 多了 `waitForIdle()`、`newSession()`、`fork()`、`navigateTree()`、`switchSession()`、`reload()` 等控制能力，创建逻辑在 [runner.ts#L636](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L636)。

## 19. 自定义 shortcut

shortcut 是用户键盘入口。pi 不鼓励 extension 直接检查原始 escape sequence，而是注册 keybinding id，让用户配置覆盖。extension shortcut 会和 builtin keybindings 做冲突检查，入口在 [runner.ts#L417](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L417)。如果冲突的是受保护内置键，runner 会跳过并产生 diagnostic，见 [runner.ts#L429](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L429)。

交互模式会在 reload 后重新 setup extension shortcuts，见 [interactive-mode.ts#L4928](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L4928)。所以 shortcut 的正确生命周期是“注册、解析、绑定、reload 重绑”，不是写死在某个组件里。

## 19. 自定义 flag

flag 是 extension 的 CLI 配置入口。`registerFlag()` 声明 name、description、type 和 default，见 [types.ts#L1153](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1153)。flag values 保存在 extension runtime state 的 `flagValues` 中，见 [types.ts#L1450](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1450)，runner 可读取和设置这些值，见 [runner.ts#L397](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L397)。

flag 适合“本次启动是否启用某模式”或“外部服务 endpoint 是什么”。不要把 per-turn 状态塞进 flag；那应该放 session custom entry、command state 或 extension 内存状态。

## 19. 一个最小工具例子

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function register(pi: ExtensionAPI) {
	pi.registerTool({
		name: "project_note",
		label: "Project Note",
		description: "Return a short project note by key",
		parameters: Type.Object({
			key: Type.String({ description: "Note key" }),
		}),
		async execute(_toolCallId, params) {
			return {
				content: [{ type: "text", text: `No note found for ${params.key}` }],
				details: { key: params.key },
			};
		},
	});
}
```

这个例子故意不做文件写入和网络请求。新手先掌握 schema、params、content/details 分层，再增加 AbortSignal、streaming updates 和 custom rendering。

## 19. 复刻路径

最小可用：实现 tool registry、command registry、TypeBox schema validation、command autocomplete。

第二阶段：加入 active tools、tool allowlist、tool renderers、extension shortcuts、flags、source diagnostics。

生产级：支持 dynamic tools、tool execution modes、provider tools、custom model providers、reload 重绑、冲突策略、per-mode UI fallback 和 session 持久化。
