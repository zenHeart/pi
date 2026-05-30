# 19. 扩展事件与生命周期

## 19.1 事件系统解决什么问题

Extension 不能靠“随时改 AgentSession 内部变量”来扩展 Pi。那会让核心循环不可预测，也会让多个扩展互相踩状态。事件系统的作用是把可扩展点声明为有限的生命周期节点：启动、资源发现、输入、agent 开始、上下文构建、provider 请求、消息流、工具调用、session 切换、压缩、退出。

`packages/coding-agent/docs/extensions.md` 的 Lifecycle Overview 是理解本章的主地图：`session_start` 后是 `resources_discover`；用户发送 prompt 后先检查 extension commands，再发 `input`，再做 skill/template expansion，随后 `before_agent_start`、`agent_start`、turn、provider、tool、message、`agent_end`。源码类型把这些事件列成 discriminated union，见 [types.ts#L950](packages/coding-agent/src/core/extensions/types.ts#L950)。

本章的必要性在于：第 18 章告诉你 extension 能做什么，本章告诉你“什么时候能做、返回值如何被解释、失败如何处理”。没有生命周期模型，extension 很容易写成偶然可用的全局副作用。

## 19.2 事件的四种语义

Pi 的事件不是一个统一的 pub/sub。不同事件有不同返回语义。

第一类是观察事件，例如 `session_start`、`agent_start`、`turn_start`、`message_update`。普通 `emit()` 会顺序调用 handlers，返回值通常被忽略；session-before 事件例外，可以 cancel，见 [runner.ts#L680](packages/coding-agent/src/core/extensions/runner.ts#L680)。

第二类是转换事件。`input` 可以返回 `{ action: "transform", text, images }`，多个 handler 形成链式转换；返回 `{ action: "handled" }` 会短路，见 [runner.ts#L1038](packages/coding-agent/src/core/extensions/runner.ts#L1038)。`context`、`before_provider_request`、`tool_result`、`message_end` 也都是顺序变换，只是变换对象不同。

第三类是拦截事件。`tool_call` 可以返回 `{ block: true, reason }`，Runner 遇到 block 就提前返回，见 [runner.ts#L806](packages/coding-agent/src/core/extensions/runner.ts#L806)。这就是权限门、路径保护、危险命令确认的基础。

第四类是聚合事件。`resources_discover` 收集所有扩展返回的 `skillPaths`、`promptPaths`、`themePaths`，再交给 ResourceLoader，见 [runner.ts#L990](packages/coding-agent/src/core/extensions/runner.ts#L990)。它不是谁覆盖谁，而是多扩展贡献路径后统一合并。

## 19.3 从输入到模型请求

用户输入进入 `AgentSession.prompt()` 后，事件顺序有明确设计。扩展命令先执行，因为 command 是用户明确输入的控制命令；如果命中，就不会发给模型。然后是 `input`，让扩展有机会处理或改写原始输入。再之后才展开 `/skill:name` 和 prompt template，见 [agent-session.ts#L968](packages/coding-agent/src/core/agent-session.ts#L968)。

真正开始 agent loop 前，Pi 构造 user message，并发 `before_agent_start`。这个事件能注入 custom message，也能修改当前 turn 的 system prompt。Runner 会把多个扩展的 system prompt 修改串起来，后一个 handler 看到前一个 handler 的结果；同时 `ctx.getSystemPrompt()` 返回当前链式 prompt，见 [runner.ts#L924](packages/coding-agent/src/core/extensions/runner.ts#L924)。AgentSession 随后把返回的 custom messages 加入本轮消息，并应用修改后的 system prompt，见 [agent-session.ts#L1074](packages/coding-agent/src/core/agent-session.ts#L1074)。

这解释了一个重要边界：`input` 适合改用户文本；`before_agent_start` 适合加上下文或改 system prompt；`context` 适合在 provider 请求前改完整 message list。不要在一个事件里做所有事。


**生命周期图**

```mermaid
flowchart LR
    A["配置与包"] --> B["Skills"]
    B --> C["Prompt Templates"]
    C --> D["Extensions"]
    D --> E["扩展事件与生命周期 的可验证结果"]
```

**源码责任表**

| 环节 | 系统责任 | 源码证据 | 读源码时要确认什么 |
|---|---|---|---|
| 配置与包 | 声明资源来源和优先级 | [resource-loader.ts#L398](packages/coding-agent/src/core/resource-loader.ts#L398) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Skills | 模型行为说明书 | [resource-loader.ts#L510](packages/coding-agent/src/core/resource-loader.ts#L510) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Prompt Templates | 可复用任务入口 | [resource-loader.ts#L533](packages/coding-agent/src/core/resource-loader.ts#L533) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Extensions | 代码能力与 UI/provider 注册 | [types.ts#L1084](packages/coding-agent/src/core/extensions/types.ts#L1084) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |

**关键代码说明**

读源码时不要只顺着函数名跳转，而要检查四个边界：输入边界、状态边界、裁决边界、输出边界。输入边界回答“谁把数据交进来”；状态边界回答“哪些信息会跨 turn、跨 session 或跨进程保留”；裁决边界回答“谁有权继续、停止、执行或拒绝”；输出边界回答“结果给人看、给模型看，还是给外部系统看”。本章涉及的源码只有放进这四个边界中才有解释力。

## 19.4 工具、消息与 provider 生命周期

工具拦截不在 tool wrapper 里私下完成，而是 AgentSession 安装到 Agent 实例的 hook 调 Runner。`beforeToolCall` 发 `tool_call`，给扩展最后机会检查 tool name、toolCallId 和参数；`afterToolCall` 发 `tool_result`，允许扩展修改 content、details、isError，见 [agent-session.ts#L396](packages/coding-agent/src/core/agent-session.ts#L396) 和 [agent-session.ts#L418](packages/coding-agent/src/core/agent-session.ts#L418)。

消息事件分三段。`message_start` 和 `message_update` 偏观察；`message_end` 可以替换最终 message，但 replacement 必须保持相同 role，否则 Runner 记录错误并忽略，见 [runner.ts#L714](packages/coding-agent/src/core/extensions/runner.ts#L714)。这个限制防止扩展把 assistant message 偷换成 user message，破坏会话协议。

Provider 事件在更靠近模型请求的位置。`before_provider_request` 是 payload transform，多个扩展按顺序看到上一个输出，见 [runner.ts#L890](packages/coding-agent/src/core/extensions/runner.ts#L890)。`after_provider_response` 是观察响应状态和 headers 的点，适合诊断与 telemetry，不适合改已返回流。


**创建者视角的设计不变量**

资源系统是 Pi 小内核的主要出口。稳定行为进入核心，团队差异进入资源；资源必须保留 sourceInfo、加载顺序和冲突边界，否则用户无法解释为什么某个 skill、命令、主题或工具生效。

**如果省略本章会发生什么**

省略本章，读者会把 扩展事件与生命周期 当成单点功能，而不是 Pi 架构中的责任边界。直接后果是：使用时不知道该改配置、写资源、写扩展、接 provider 还是调用 SDK；排查时也会把 provider、工具、TUI、session 和资源加载混为一谈。专家级学习必须把每章能力放回系统生命周期中验证。

## 19.5 Session 生命周期与 reload

Session 相关事件处理“当前运行时会不会被替换”。`session_before_switch`、`session_before_fork`、`session_before_compact`、`session_before_tree` 都可以 cancel 或提供定制结果；真正切换、新建、fork 时，AgentSessionRuntime 会先发 `session_shutdown`，再创建新 runtime，并用 `session_start` 标明 reason，见 [agent-session-runtime.ts#L127](packages/coding-agent/src/core/agent-session-runtime.ts#L127) 和 [agent-session-runtime.ts#L161](packages/coding-agent/src/core/agent-session-runtime.ts#L161)。

Reload 是特殊的 session replacement-lite。AgentSession 发 `session_shutdown` with `reason: "reload"`，重读 settings，重建 ResourceLoader 和 ExtensionRunner，再发 `session_start` with `reason: "reload"`，随后重新跑 `resources_discover`，见 [agent-session.ts#L2398](packages/coding-agent/src/core/agent-session.ts#L2398)。Runner 会把旧实例标记 stale，防止扩展在 reload 后继续使用旧 ctx，见 [runner.ts#L466](packages/coding-agent/src/core/extensions/runner.ts#L466)。

如果扩展需要保存状态，应该用 `appendEntry()` 或 session manager 暴露的持久机制，而不是依赖模块级变量。模块级变量在 reload、resume、fork 后可能不再对应当前 session。

## 19.6 错误策略与设计训练

事件系统的错误策略是“多数事件继续运行，关键拦截保守失败”。Runner 对普通 emit、message_end、tool_result、input 等会 catch handler error 并 `emitError()`，见 [runner.ts#L698](packages/coding-agent/src/core/extensions/runner.ts#L698)。但 `emitToolCall()` 没有内部 catch；AgentSession 的 `beforeToolCall` 外层 catch 会把非 Error 包装成 `Extension failed, blocking execution`，见 [agent-session.ts#L403](packages/coding-agent/src/core/agent-session.ts#L403)。这符合安全直觉：权限门失败时宁可阻止工具执行。

Pi 还提供扩展间事件总线：`pi.events` 是共享 `EventBus`，支持 `emit(channel, data)` 和 `on(channel, handler)`，handler 错误只打印，不影响核心生命周期，见 [event-bus.ts#L3](packages/coding-agent/src/core/event-bus.ts#L3)。它适合扩展间通信，不适合替代核心 lifecycle events。

训练：设计一个“保护 `.env` 写入”的 extension。用 `tool_call` 检查 `write` 和 `edit` 参数，命中时在交互模式下 `ctx.ui.confirm()`，非交互模式默认 block；用 `session_shutdown` 清理临时状态；用 `message_end` 只追加显示信息，不改变 role。能按事件语义拆开这个需求，就说明你理解了 extension 生命周期，而不是只会复制示例。


**专家验收任务**

完成本章后，读者应该能交付三件东西：一张自己画出的 扩展事件与生命周期 数据流图；一份包含源码链接、输入、输出、失败边界的责任表；一个最小实践任务，证明自己能在不改错层级的情况下使用或扩展该能力。若三件事缺一件，就说明还停留在“会用命令”的阶段，没有达到能设计和审计 Pi 方案的水平。

