# 22. SDK：把 pi 嵌入自己的 TypeScript 程序

## 22. 本章解决的问题

从创造者视角看，SDK 证明 pi 不是一个只能跑在终端里的 prompt wrapper，而是一套可以被不同 host 复用的 agent runtime。CLI、TUI、print mode、JSON mode、RPC mode 都应该只是 host；真正不可破坏的边界是 session、model registry、auth、resource loader、tools、events 和 runtime replacement。

从前端小白读者视角看，SDK 就是“我想做一个自己的界面，不想自己重写 agent loop”。你不需要先懂终端渲染，也不需要先写 provider；你只要能创建 session、订阅事件、发送 prompt，就能把 pi 接进 Web 后端、Electron、IDE 插件或 eval runner。

`createAgentSession()` 的选项类型定义在 [sdk.ts#L34](/source-code/packages/coding-agent/src/core/sdk.ts#L34)，返回值定义在 [sdk.ts#L84](/source-code/packages/coding-agent/src/core/sdk.ts#L84)，工厂实现从 [sdk.ts#L202](/source-code/packages/coding-agent/src/core/sdk.ts#L202) 开始。会替换当前 session 的 runtime 层不是 `AgentSession` 本身，而是 `AgentSessionRuntime`，入口在 [agent-session-runtime.ts#L68](/source-code/packages/coding-agent/src/core/agent-session-runtime.ts#L68)。

## 22. SDK 与 CLI 的真实关系

SDK 不是绕过 pi，而是复用同一套产品 runtime。`createAgentSession()` 会解析 cwd、agentDir、auth storage、model registry、settings manager、session manager 和 resource loader；没有传 `ResourceLoader` 时会创建 `DefaultResourceLoader` 并执行 reload，见 [sdk.ts#L202](/source-code/packages/coding-agent/src/core/sdk.ts#L202)。默认内置工具是 `read`、`bash`、`edit`、`write`，对应初始化在 [sdk.ts#L280](/source-code/packages/coding-agent/src/core/sdk.ts#L280)。

这意味着 SDK host 要承担三件事：

1. 选择运行目录和配置目录。
2. 选择模型、工具、资源和 session 持久化策略。
3. 订阅事件并把事件翻译成你的 UI。

前端读者可以把它类比成 React 里的“状态层”和“组件层”：SDK 是状态层，TUI/网页只是把状态画出来。不要把按钮点击、终端快捷键、HTML 渲染写进 agent loop。

## 22. 最小可用 SDK session

下面是符合当前 SDK 的最小形态。注意：`createAgentSession()` 返回的是对象；事件订阅用 `session.subscribe()`；模型必须是 `Model` 对象，不是 `"provider/model"` 字符串。

```ts
import { getModel } from "@earendil-works/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const model = getModel("anthropic", "claude-sonnet-4-5");

if (!model) {
  throw new Error("Model not found");
}

const { session } = await createAgentSession({
  cwd: process.cwd(),
  authStorage,
  modelRegistry,
  model,
  sessionManager: SessionManager.inMemory(),
});

const unsubscribe = session.subscribe((event) => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("Read package.json and summarize scripts.");
unsubscribe();
session.dispose();
```

这个例子只做了四件事：准备 auth/model，创建 session，订阅 streaming event，发送 prompt。`AgentSessionEvent` 的联合类型从 [agent-session.ts#L123](/source-code/packages/coding-agent/src/core/agent-session.ts#L123) 开始，`subscribe()` 在 [agent-session.ts#L673](/source-code/packages/coding-agent/src/core/agent-session.ts#L673)，`prompt()` 在 [agent-session.ts#L962](/source-code/packages/coding-agent/src/core/agent-session.ts#L962)。

## 22. ResourceLoader：前端 host 最容易漏掉的一层

如果你在做 Web UI，最容易犯的错是只包一层 HTTP endpoint，然后惊讶于 skills、prompts、extensions、AGENTS.md 没有按预期加载。pi 的资源不是魔法全局变量；它们由 `ResourceLoader` 提供。SDK 文档明确说明默认 loader 会发现 extensions、skills、prompt templates、themes 和 context files；如果你传了自定义 loader，cwd 和 agentDir 不再决定资源发现，只继续影响 session 命名和工具路径解析。

从创造者视角看，ResourceLoader 是“产品策略”边界，不是 agent loop 边界。它决定本轮可见的系统提示、技能、命令和扩展，但 provider stream 仍然只看最终上下文。`createAgentSession()` 在构造 `AgentSession` 时把 loader、custom tools、model registry、active tools 和 extension runner reference 一起交给 session，见 [sdk.ts#L401](/source-code/packages/coding-agent/src/core/sdk.ts#L401)。

## 22. Runtime replacement：为什么 new/resume/fork 不只是清空 messages

`AgentSession` 管单个 session 的 prompt、queue、model、thinking、compaction、tree navigation。`newSession()`、`switchSession()`、`fork()`、`importFromJsonl()` 这类会替换当前 session 的动作属于 `AgentSessionRuntime`，因为它们要重建 cwd-bound services、extension runtime、session manager 和 diagnostics。

源码里 `CreateAgentSessionRuntimeFactory` 要求 host 根据 cwd、agentDir、sessionManager 和 sessionStartEvent 创建完整 runtime，见 [agent-session-runtime.ts#L30](/source-code/packages/coding-agent/src/core/agent-session-runtime.ts#L30)。`switchSession()`、`newSession()`、`fork()`、`importFromJsonl()` 分别在 [agent-session-runtime.ts#L187](/source-code/packages/coding-agent/src/core/agent-session-runtime.ts#L187)、[agent-session-runtime.ts#L212](/source-code/packages/coding-agent/src/core/agent-session-runtime.ts#L212)、[agent-session-runtime.ts#L246](/source-code/packages/coding-agent/src/core/agent-session-runtime.ts#L246)、[agent-session-runtime.ts#L340](/source-code/packages/coding-agent/src/core/agent-session-runtime.ts#L340)。

对前端 host 来说，这有一个直接后果：session replacement 后，旧的 `session.subscribe()` 订阅绑定的是旧 session。SDK 文档也提醒需要重新订阅、重新 bind extensions。不要在 UI store 里假设 `session` 对象永远不变。

## 22. 已实现事实、进一步 docs、生态扩展

已实现事实：SDK 导出 `createAgentSession()`、`createAgentSessionRuntime()`、`AgentSessionRuntime`、`AuthStorage`、`ModelRegistry`、`DefaultResourceLoader`、`SessionManager`、`SettingsManager`、工具工厂和扩展相关类型；导出区在 [sdk.ts#L95](/source-code/packages/coding-agent/src/core/sdk.ts#L95)。`streamFn` 会通过 `ModelRegistry.getApiKeyAndHeaders()` 解析 credential，再调用 `streamSimple()`，见 [sdk.ts#L337](/source-code/packages/coding-agent/src/core/sdk.ts#L337)。

进一步 docs：SDK 文档详细列出 custom tools、extensions、skills、context files、prompt templates、settings、sessions 和 run modes。它们是使用指南，不等于所有能力都应该写入你的最小 host。

生态扩展方式：Web UI、IDE adapter、eval runner、HTTP service、sub-agent orchestrator 都可以建在 SDK 上。但一旦服务化，就要额外设计 workspace isolation、credential broker、quota、audit log 和 sandbox。SDK 给的是 runtime 控制权，不给默认多租户安全模型。

## 22. 复刻原则

如果你的 agent 只能在 CLI 里工作，说明 UI 和 runtime 耦合过深。先把 prompt、events、tools、session、auth、model registry 做成库，再接 TUI、HTTP、RPC 或 eval。前端读者只要记住一句话：界面负责展示事件和收集输入，agent runtime 负责状态和副作用。
