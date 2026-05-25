# 17. Extension 体系总览

## 17. 本章解决的问题

extension 是 pi 的能力扩展层。skill 和 prompt template 主要改变模型看到的文本；extension 则运行本机 TypeScript，可以注册工具、命令、快捷键、flags、providers、message renderer 和 UI，也可以监听生命周期事件。Extension API 从 [types.ts#L1084](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1084) 开始，运行器入口是 [runner.ts#L224](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L224)。

对前端小白来说，可以把 extension 想成浏览器插件或 Vite plugin：它不是页面文案，而是能挂进应用生命周期、注册新能力、影响运行时行为的代码。

## 17. Extension 不是 prompt

extension 拥有系统权限。它可以读写文件、执行命令、发网络请求、注册 provider、改变 active tools、发送 user message、替换 UI 组件。把 extension 当成普通配置文本会低估风险。

pi 在 package docs 中明确提示 package 会运行可执行代码；源码侧也把 extension runtime 和 actions 分开：runner 构造时持有 extensions、runtime、ui context、session manager 和 model registry，见 [runner.ts#L224](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L224)。`bindCore()` 再把 sendMessage、appendEntry、setModel、setActiveTools 等宿主动作注入 runtime，见 [runner.ts#L266](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L266)。

## 17. Factory 与 runtime binding

extension 默认导出一个 factory，接收 `ExtensionAPI`，可以同步或异步完成注册。类型定义是 `ExtensionFactory`，见 [types.ts#L1379](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1379)。factory 阶段适合注册工具、命令、hooks、flags 和 provider；真正依赖当前 session、UI、model 的逻辑应放到事件 handler 或 command handler。

provider 注册有一个细节：extension loading 期间注册的 provider 会先进入 pending queue，等 runner `bindCore()` 后 flush 到 model registry，见 [runner.ts#L301](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L301)。这让 async factory 可以在正常启动完成前把动态模型列表准备好。

## 17. Extension 能力地图

extension 的能力可以分为六类。

第一类是模型能力：`registerTool()` 给 LLM 新工具，`registerProvider()` 给 runtime 新模型 provider。工具定义包括 name、description、schema、execute、renderCall、renderResult 等，见 [types.ts#L426](/source-code/packages/coding-agent/src/core/extensions/types.ts#L426)。

第二类是用户入口：`registerCommand()` 注册 slash command，`registerShortcut()` 注册 TUI 快捷键，`registerFlag()` 注册 CLI flag，API 定义在 [types.ts#L1141](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1141)。

第三类是生命周期 hooks：从 `resources_discover`、`session_start` 到 `before_agent_start`、`tool_call`、`tool_result`、`session_shutdown`，完整 event subscription API 在 [types.ts#L1089](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1089)。

第四类是 UI：dialog、status、widget、footer、header、custom component、editor replacement、theme switch 都在 `ExtensionUIContext` 中，见 [types.ts#L124](/source-code/packages/coding-agent/src/core/extensions/types.ts#L124)。

第五类是 session persistence：`appendEntry()` 保存 extension 私有状态，不进入 LLM；`sendMessage()` 写 custom message，可选择进入上下文；相关 action 类型在 [types.ts#L1407](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1407)。

第六类是 renderer：message renderer、tool renderer 让历史消息和工具结果在 TUI 中有定制展示。

## 17. 生命周期总览

启动时，pi 发现 extension 文件，执行 factory，收集 registrations。interactive mode 会先启动 UI，再初始化 extensions，这样 `session_start` handler 可以使用交互式 dialog，相关注释在 [interactive-mode.ts#L673](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L673)。

session 创建、resume、fork、reload 时，runner 会发 session 事件；用户输入时，先处理 extension command，再走 input hook、prompt expansion、before_agent_start、agent_start、turn/message/tool 生命周期；退出或 reload 前发 `session_shutdown`。

## 17. Registry 与 hook 的区别

registry 是“注册一个长期可用的能力”，比如 tool、command、shortcut、flag、message renderer、provider。hook 是“在某个时刻观察或改变一次运行”。二者不要混用。

例如权限门适合 `tool_call` hook，因为它拦截每次工具调用；内部搜索 API 适合 `registerTool()`，因为模型需要反复调用；`/handoff` 适合 command，因为用户明确触发；主题切换 UI 适合 command 或 shortcut。

## 17. 最小 extension

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function register(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.notify(`Session ${ctx.sessionManager.getSessionId()} started`, "info");
	});
}
```

这段代码没有改模型上下文，也没有注册工具，只是在 session start 时通知用户。对新手来说，这是最安全的起点：先理解事件和 context，再逐步加入 command、tool 或 UI。

## 17. 设计边界

extension 可以扩展产品，但不能破坏核心不变量。不要绕过 tool result 回灌；不要在 streaming 中做结构性 tree mutation；不要把 secret 写进 transcript；不要让 UI widget 成为唯一事实源；不要假设 interactive UI 在 print、JSON 或 RPC mode 中可用。

runner 的 context getter 会检查 extension instance 是否 stale，避免 reload 后旧 extension 继续操作新 runtime，相关 `assertActive()` 保护体现在 context 创建处 [runner.ts#L577](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L577)。这提醒自研系统：extension reload 不是简单重新 import，还要让旧实例失效。
