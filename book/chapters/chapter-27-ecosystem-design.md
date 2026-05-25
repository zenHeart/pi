# 27. 生态设计：MCP、Sub-agent、Plan、Todo 为什么不进核心

## 27. 本章解决的问题

pi 的核心选择是“小核心，可扩展生态”。创造者视角下，核心只保留 agent loop、message protocol、provider boundary、tool execution、session/runtime/resource/auth/model 等不变量；读者视角下，不要把“我见过某个 agent 产品有这个功能”误认为“这个功能必须进核心”。

usage docs 的 Design Principles 明确说，pi 不内置 MCP、sub-agents、permission popups、plan mode、to-dos 或 background bash；这些可以通过 extensions、skills、prompt templates、packages 或外部工具实现。extension API 支持注册工具、命令、事件、session entry、provider、active tools 等，入口类型可从 [types.ts#L1133](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1133) 和 [types.ts#L1292](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1292) 看起。

## 27. 什么应该进核心

能力进核心要满足至少一个条件：

1. 它是所有 host 都必须遵守的 runtime 不变量。
2. 它是消息、工具、provider、session、auth、resource 的基础协议。
3. 它无法通过稳定 extension/package/SDK/RPC 边界实现。
4. 它如果放在生态层，会破坏 transcript、credential 或执行顺序。

否则优先放生态层。这样 pi core 可以保持可解释，生态可以按团队习惯演化。

## 27. MCP

MCP 是协议生态，不是 agent loop 的必要组成。可以有三种接法：

1. extension 连接 MCP server，把 MCP tools/resources/prompts 转成 pi tools/skills/prompts。
2. SDK host 在外部维护 MCP client，把结果注入 custom tools 或 context。
3. RPC controller 作为桥，把 MCP UI/approval/session 策略放在 pi 进程外。

核心不内置 MCP 的好处是避免把 server trust、credential、transport lifecycle、tool approval 和 sandbox policy 硬塞进 agent loop。MCP adapter 应是生态组件，不是 provider/message/session 的不变量。

## 27. Sub-agent

sub-agent 是 orchestration 模式。它可以通过 SDK 创建多个 session，也可以通过 RPC 启动多个 pi 子进程，还可以由 extension 注册工具封装 handoff。关键问题不是“能不能起第二个 agent”，而是：

1. cwd 是否隔离。
2. session 是否隔离。
3. tools 是否隔离。
4. credential 是否隔离。
5. 结果如何回灌主 transcript。
6. 失败和取消如何传播。

这些策略因产品不同而不同。把 sub-agent 固化进核心，会过早决定任务分解、并发、权限和 UI。

## 27. Plan 与 Todo

plan mode 和 todo 是工作流，不是 agent harness 必需能力。pi 已提供足够的生态边界：

1. skill 可以指导模型按计划工作。
2. prompt template 可以封装固定流程。
3. extension command 可以创建/更新计划。
4. custom message/entry 可以持久化计划状态。
5. message renderer/UI widget 可以展示计划。
6. package 可以分发整套工作流。

extension API 里 `appendEntry()` 可写自定义 session entry，见 [types.ts#L1193](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1193)。`sendMessage()` 可发送自定义消息，见 [types.ts#L1178](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1178)。这些是实现 todo/plan 的基础，不需要把某一种 UI 进核心。

## 27. Background bash

background bash 涉及进程生命周期、输出持久化、取消、资源占用、跨 session 恢复和安全策略。内置 bash 的语义更清晰：执行命令，拿结果，回灌上下文。后台任务更适合 extension 或外部 job runner。

如果团队需要 background bash，应明确：

1. 输出存哪里。
2. 多久截断。
3. 用户如何取消。
4. agent 何时读取结果。
5. fork/resume 后任务是否继续。
6. 命令是否在 sandbox 中。

这些问题都不是低层 provider loop 的责任。

## 27. Packages 是生态分发边界

packages docs 定义了 npm、git、local path 三类来源，也定义了 resources 的 manifest/convention directory、filtering、enable/disable、scope/deduplication。packages 可以分发 extensions、skills、prompts、themes。安全说明也很明确：package 运行时有本机权限。

这说明 pi 的生态边界不是“复制一段 prompt”。一个 package 可以带代码、说明、主题、命令、工具和模型接入。核心只负责发现、加载、隔离来源信息和遵守用户/项目配置优先级。

## 27. 已实现事实、进一步 docs、生态扩展

已实现事实：pi 有 extension API、skills、prompt templates、themes、packages、SDK、RPC、自定义 provider、custom messages/entries、commands、flags、shortcuts、UI contexts 和 package manager。`registerTool()` 在 [types.ts#L1133](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1133)，`registerCommand()` 在 [types.ts#L1142](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1142)，`setActiveTools()` 在 [types.ts#L1218](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1218)，`registerProvider()` 在 [types.ts#L1292](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1292)。

进一步 docs：extensions.md 是 extension API 全量指南；packages.md 是分发和安装指南；usage.md 解释核心设计原则；custom-provider.md 说明 provider 生态如何扩展。

生态扩展方式：MCP adapter、sub-agent orchestrator、plan/todo workflow、permission gate、background job runner、remote sandbox 都应该作为 package/extension/SDK/RPC host 出现。它们可以很强大，但不要把它们写成 pi core 已实现默认能力。

## 27. 判断原则

当你想给 pi 加能力时，先问：

1. 没有它，agent loop 是否无法正确运行？
2. 它是否必须改变 provider message protocol？
3. 它是否必须改变 session durability invariant？
4. 它是否必须拥有 credential 或 filesystem 权限？
5. 它能否用 extension hook、custom tool、custom entry、SDK 或 RPC 实现？

前四个答案越多是“是”，越可能接近核心。第五个答案是“是”，优先放生态。
