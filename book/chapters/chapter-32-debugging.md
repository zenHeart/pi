# 32. 系统调试与诊断体系

## 32.1 本章解决的问题

Pi 是多层系统：CLI 参数解析、ResourceLoader、SettingsManager、ExtensionRunner、Agent Loop、Provider 网络层。当 Agent 行为不符合预期时，问题可能发生在其中任何一层。没有系统性的调试方法，工程师往往只能重启 CLI 或清空配置，无法向社区反馈精确的故障信息。

本章整理 Pi 内置的所有诊断入口，说明每个入口能观测到什么层面的问题，并给出跨层排查的标准流程。

## 32.2 最小可运行路径

**交互模式下的快速诊断：**

```
/session     # 查看当前会话的消息数、Token 数、成本统计、会话文件路径
/hotkeys     # 查看所有快捷键（包括扩展注册的快捷键）
/changelog   # 查看最近的 Changelog 更新
```

**写入 TUI 调试快照：**

在交互模式中，使用内部调试命令（`Shift+Ctrl+D` 触发），Pi 会把当前渲染帧的完整行列数据和所有会话消息（JSONL 格式）写入调试日志文件：

```typescript
// interactive-mode.ts#L5383
const debugLogPath = getDebugLogPath();
// ~/.pi/agent/pi-debug.log
```

调试日志包含：渲染时间戳、终端尺寸、每行的可见宽度和 ANSI 转义序列（JSON 转义格式），以及所有 Agent 消息的原始 JSONL。

## 32.3 核心机制

#### 调试日志路径

调试日志路径由 [`config.ts#L521`](packages/coding-agent/src/config.ts#L521) 的 `getDebugLogPath()` 决定：

```typescript
export function getDebugLogPath(): string {
  return join(getAgentDir(), `${APP_NAME}-debug.log`);
}
```

默认位于 `~/.pi/agent/pi-debug.log`。若设置了 `PI_CODING_AGENT_DIR` 环境变量，调试日志会跟随 agent 目录一起重定向。

#### ResourceDiagnostic 诊断收集

资源加载过程中发现的问题（命名冲突、格式错误、路径不存在）由 [`diagnostics.ts`](packages/coding-agent/src/core/diagnostics.ts#L10) 中的 `ResourceDiagnostic` 类型表达：

```typescript
export interface ResourceDiagnostic {
  type: "warning" | "error" | "collision";
  message: string;
  path?: string;
  collision?: ResourceCollision;
}

export interface ResourceCollision {
  resourceType: "extension" | "skill" | "prompt" | "theme";
  name: string;
  winnerPath: string;
  loserPath: string;
  winnerSource?: string; // "npm:foo", "git:...", "local"
  loserSource?: string;
}
```

冲突（`collision`）是 Pi 中最常见的静默问题：当两个不同来源（全局扩展包 A 和项目级配置）注册了同名的 skill 或 extension 时，Pi 会记录冲突并以某一方为准，不会崩溃也不会提示。通过 `/reload` 后检查控制台，或在启动时观察扩展加载日志，可以发现这类冲突。

#### /session 命令的数据源

`/session` 命令调用 `this.session.getSessionStats()`，从 SessionManager 和 Agent 的内存状态聚合数据：

```typescript
// interactive-mode.ts#L5172
private handleSessionCommand(): void {
  const stats = this.session.getSessionStats();
  // 包含：sessionFile, sessionId, sessionName
  // userMessages, assistantMessages, toolCalls, toolResults
  // tokens.input, tokens.output, tokens.cacheRead, tokens.cacheWrite
  // cost
}
```

Token 计数来自 Agent Loop 对每次 LLM 响应的 `usage` 字段累加，成本估算基于模型的 `inputCostPer1M`/`outputCostPer1M` 字段。

#### PI_DEBUG_REDRAW 渲染调试

TUI 渲染层有一个专门的调试环境变量：`PI_DEBUG_REDRAW=1`。设置后，TUI 每次触发重绘时会把触发原因写入 `~/.pi/agent/pi-debug.log`：

```typescript
// tui.ts（packages/tui）
const debugRedraw = process.env.PI_DEBUG_REDRAW === "1";
const logRedraw = (reason: string): void => {
  if (!debugRedraw) return;
  const logPath = path.join(os.homedir(), ".pi", "agent", "pi-debug.log");
  fs.appendFileSync(logPath, msg);
};
logRedraw("first render");
logRedraw(`terminal width changed (${this.previousWidth} -> ${width})`);
```

此环境变量适用于排查 TUI 布局异常（如终端宽度切换后的布局错位）。

#### models.json 错误诊断

ModelRegistry 在解析 `models.json` 时遇到格式错误，会把错误存储在内部状态中，通过 `session.modelRegistry.getError()` 暴露。交互模式的 `reload` 处理器会在 reload 后检查：

```typescript
// interactive-mode.ts#L4936
const modelsJsonError = this.session.modelRegistry.getError();
if (modelsJsonError) {
  this.showError(`models.json error: ${modelsJsonError}`);
}
```

#### Provider 网络重试与超时

Provider 网络层的重试配置来自 SettingsManager 的 `getProviderRetrySettings()`，Agent 在构造时注入这些配置：

```typescript
// sdk.ts#L342
const providerRetrySettings = settingsManager.getProviderRetrySettings();
return streamSimple(model, context, {
  timeoutMs: options?.timeoutMs ?? providerRetrySettings.timeoutMs,
  maxRetries: options?.maxRetries ?? providerRetrySettings.maxRetries,
  maxRetryDelayMs: options?.maxRetryDelayMs ?? providerRetrySettings.maxRetryDelayMs,
});
```

Provider 网络超时和重试次数可以通过 `settings.json` 中的 `providerRetry` 配置调整，而不需要修改代码。

## 32.4 为什么这样设计

#### 诊断数据内置于会话事件流

Pi 把诊断信息（如 extension 加载错误）设计为会话事件（`type: "extension_error"`），而不是单独的日志文件。这意味着 SDK 和 RPC 消费者也能收到这些诊断信号，而不只是交互模式用户。

#### 调试快照而非实时日志

`Shift+Ctrl+D` 写入的是某一时刻的快照，而不是滚动的实时日志。这是因为 TUI 持续渲染时产生的日志量巨大，实时写磁盘会造成 I/O 影响；用户遇到异常时，按下快捷键截取那一刻的完整状态，足以支持问题复现和排查。

## 32.5 常见误解与排查

**误解：扩展加载失败时 Pi 会报错退出。** Pi 对大多数扩展错误采用容忍策略：加载失败的扩展被跳过，错误记录在 `ResourceDiagnostic` 中，Pi 继续运行。要发现这类问题，需要在 `/reload` 后主动检查扩展加载报告，或在 JSON 模式下过滤 `extension_error` 类型事件。

**排查路径（从外到内）：**

| 现象 | 首先检查 |
|---|---|
| 扩展工具未出现 | `/reload` 后看扩展加载日志，检查 `collision` 诊断 |
| 模型切换后 token 计数不准 | `/session` 核对 cacheRead 是否被正确计算 |
| TUI 布局异常 | `PI_DEBUG_REDRAW=1` 启动，分析重绘触发链 |
| Provider 请求超时 | 检查 `settings.json` 中 `providerRetry.timeoutMs` 配置 |
| auth.json 被多实例并发写坏 | 检查文件是否存在 `.lock` 文件遗留，手动删除后重试 |

## 32.6 本章训练

#### 使用级训练

启动 Pi 并运行 `/session`，记录 Token 计数；然后发出一条带 `@file` 附件的消息，再次运行 `/session`，对比 `tokens.input` 的增量，说明文件内容是如何计入 Token 的。

#### 原理级训练

阅读 [`interactive-mode.ts#L5378`](packages/coding-agent/src/modes/interactive/interactive-mode.ts#L5378) 的 `handleDebugCommand()`，说明调试快照中包含的数据结构，以及为什么把 Agent 消息以 JSONL 而不是 JSON 数组格式写入。

#### 扩展级训练

编写一个扩展，在 `extension_error` 事件发生时，通过 UI 上下文的 `notify()` 方法向用户发出实时警告通知，而不依赖用户主动查看加载日志。验证当另一个格式错误的扩展被加载时，你的扩展能捕获并提示该错误。

专家级验收标准：能在 3 分钟内准确定位扩展命名冲突、models.json 格式错误、Provider 超时、TUI 渲染异常这四类常见问题，并说明每类问题应该从哪个诊断入口开始排查。
