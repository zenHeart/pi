# 2. 交互模式与日常工作流

## 2. 本章解决的问题

interactive mode 是 pi 的主要产品界面，但业务逻辑不应该被 UI 拥有。`main()` 在判断 app mode 后才创建 `InteractiveMode`，见 [main.ts#L680](/source-code/packages/coding-agent/src/main.ts#L680)。真正的模型、工具、session、resource 和 extension 状态在 runtime services 中完成。

对新手来说，interactive mode 是“打开一个能改项目的终端编辑器”。对创造者来说，它是同一 agent runtime 的一个 UI 外壳：用户输入、slash command、queue、tool event、model stream 和 extension UI 都必须被收束到可持久化、可导出的会话结构里。

## 2. 日常工作流

典型路径是：

1. 进入项目目录并运行 `pi`。
2. 用自然语言描述任务。
3. 用 `@` 引用文件，或直接把文件作为 CLI 参数传入。
4. 让模型调用 read、bash、edit、write 等工具。
5. 看 tool result 和 assistant response。
6. 根据结果继续 steering、follow-up、abort、resume 或 export。

默认内置工具包括 `read`、`bash`、`edit`、`write`，额外只读工具 `grep`、`find`、`ls` 可通过工具选项启用。help 文本里的内置工具清单在 [args.ts#L345](/source-code/packages/coding-agent/src/cli/args.ts#L345)。

前端读者可以把它类比成“可中断的异步表单”：输入不是直接渲染结果，而是进入 runtime；runtime 决定是否请求模型、执行工具、写 session、更新 UI。

## 2. 输入形态

interactive mode 支持普通文本、文件引用、图片、slash command、prompt template、skill command 和 shell command。非交互入口也能用 `@file`，文件和图片会在 [main.ts#L116](/source-code/packages/coding-agent/src/main.ts#L116) 的初始消息准备阶段合并。

`!command` 的输出会进入模型上下文，`!!command` 只执行但不把输出加入上下文。这个差别很重要：有些命令是给人看的状态检查，有些命令才是给模型继续推理的事实源。

## 2. Message queue

模型工作时用户继续输入，pi 不能简单并发发起另一个 provider request。queue 的基本模式是 `all` 或 `one-at-a-time`，类型定义在 [types.ts#L44](/source-code/packages/agent/src/types.ts#L44)。产品层会把队列变化作为 `queue_update` 事件发出，见 [agent-session.ts#L123](/source-code/packages/coding-agent/src/core/agent-session.ts#L123) 和 [agent-session.ts#L451](/source-code/packages/coding-agent/src/core/agent-session.ts#L451)。

从用户视角，Enter 是 steering，Alt+Enter 是 follow-up，Escape 是 abort，Alt+Up 取回队列。steering 更像“当前任务中途补充约束”；follow-up 更像“等这件事结束后再做下一件事”。

## 2. Abort 与恢复

Escape abort 不是“告诉模型你错了”。它是 runtime 级停止：provider 请求、工具执行和当前 run 都需要响应 abort signal。低层 stream contract 明确 provider 失败或 abort 应该以 `error` event 携带 `stopReason` 为 `error` 或 `aborted` 的 assistant message，见 [types.ts#L206](/source-code/packages/ai/src/types.ts#L206) 和 [types.ts#L347](/source-code/packages/ai/src/types.ts#L347)。

恢复也不是“重新打开一个聊天记录”。session 恢复要重建 cwd、messages、model、资源和分支状态。`--session`、`--resume`、`--continue` 和 `--fork` 的参数解析分别在 [args.ts#L78](/source-code/packages/coding-agent/src/cli/args.ts#L78) 附近，session manager 创建路径在 [main.ts#L424](/source-code/packages/coding-agent/src/main.ts#L424) 后续完成。

## 2. 常见误解

误解一：TUI 直接调用模型。实际是 `main()` 创建 runtime，再由 mode 消费 runtime 事件。

误解二：队列就是多开几个请求。实际 queue 是为了保护当前 turn 的一致性，避免工具结果、用户补充和 provider stream 乱序。

误解三：所有显示内容都会进模型。UI 可以显示通知、错误、extension UI、shell 全量输出，但进入 provider context 的内容必须经过消息协议转换。

## 2. 进一步阅读

读 `packages/coding-agent/docs/usage.md` 的 Interactive Mode、Editor Features、Slash Commands、Message Queue、Sessions。源码继续读 [main.ts#L682](/source-code/packages/coding-agent/src/main.ts#L682)、[agent-session.ts#L123](/source-code/packages/coding-agent/src/core/agent-session.ts#L123)、[types.ts#L403](/source-code/packages/agent/src/types.ts#L403)。
