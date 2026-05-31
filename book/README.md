# Pi Agent 复刻指南

这本书只围绕一个目标组织：让一个完全不了解 Pi 的工程师，只读本书就能理解 Pi 的核心概念、核心使用方式、核心原理和核心设计边界，并能复刻一个可运行的 mini Pi-like coding agent。

本书不是功能菜单，也不是普通源码导读。它采用两条线并行：

- **源码边界线**：按 Pi 的依赖 DAG 解释 `Host / Runtime / AgentSession / Agent / Provider / Tool / Session / Resource / Extension`。
- **mini 实现线**：每章都给出本章对 mini agent 新增的接口、文件、行为、失败样例和验收方式，最后用 4 章汇总完整实现、协议、测试和审计。

## 你将获得

- 能从新人视角说清 Pi 为什么不是简单 CLI wrapper，而是由 runtime、agent、provider、tool、session、host 共同组成的本地 coding agent。
- 能按章节顺序实现一个离线可测的 mini Pi-like agent，并知道每个 mini 接口对应 Pi 的哪个源码边界。
- 能读懂 Pi 的真实 JSON mode、RPC mode、session JSONL、assistant stream、tool result 形状。
- 能判断自己的复刻实现是否只满足教学 mini 版本，还是已经接近真实 Pi 协议。
- 能用第 20-24 章审计表继续补齐完整 Pi 的生产能力和产品面。

前置知识：读者应能读 TypeScript、理解 CLI/stdin/stdout、JSONL、异步流、基本文件系统操作和单元测试。不了解 Pi 本身不影响阅读。

## 事实来源

本书只使用当前仓库中已经存在的源码和文档作为事实来源。任何真实 Pi 行为都必须能追溯到源码或 docs：

- 日常使用、CLI 参数和交互命令以 [usage.md#L120](packages/coding-agent/docs/usage.md#L120) 的 CLI reference、[usage.md#L32](packages/coding-agent/docs/usage.md#L32) 的 slash commands 为准。
- JSON mode 事件以 [json.md#L9](packages/coding-agent/docs/json.md#L9) 和 [print-mode.ts#L102](packages/coding-agent/src/modes/print-mode.ts#L102) 为准。
- RPC 命令、事件和 LF JSONL framing 以 [rpc.md#L19](packages/coding-agent/docs/rpc.md#L19) 和 [rpc-types.ts#L19](packages/coding-agent/src/modes/rpc/rpc-types.ts#L19) 为准。
- session 文件格式以 [session-format.md#L1](packages/coding-agent/docs/session-format.md#L1) 和 [session-manager.ts#L876](packages/coding-agent/src/core/session-manager.ts#L876) 为准。
- provider stream 事件以 [types.ts#L347](packages/ai/src/types.ts#L347) 和 custom provider 文档 [custom-provider.md#L448](packages/coding-agent/docs/custom-provider.md#L448) 为准。

书中的 `mini-pi` 代码是教学实现，不是 Pi 的源码副本。凡是 mini 类型为了教学而简化，章节会显式标注“mini 教学协议”；凡是要求复刻真实 Pi 行为，章节会使用“真实 Pi 协议”并链接到当前仓库的源码或 docs。

## 阅读方式

每章先回答“没有这个边界会失败在哪里”，再从真实 Pi 命令或源码入口观察行为，最后落到复刻任务。读者不需要先读 Pi 源码；源码链接用于验证本书结论，而不是作为额外必读材料。

每章都包含：

- 问题场景。
- 用户如何使用。
- 源码定位。
- Mermaid 生命周期图。
- 关键代码片段。
- 机制拆解。
- 设计不变量。
- 失败模式与复刻任务。
- 验收清单。
- 本章实现关卡。

## 快速开始

建议按三轮阅读：

1. 第一轮读第 1-4 章，只画出 `Host / Runtime / AgentSession / Agent / Provider / Tool / Session` 的依赖 DAG。
2. 第二轮读第 5-16 章，每章只完成 `本章实现关卡`，不要提前实现 TUI 或 extension。
3. 第三轮读第 17-20 章，用 faux provider、JSONL session、JSON/RPC 输出和审计表检查自己的 mini Pi。
4. 第四轮读第 21-24 章，把 package manager、themes、RPC extension UI、HTML export、keybindings、settings、model selector、session tree 纳入完整复刻。
5. 最后一轮用第 25 章题库做结课自测，确认自己能复述、手写协议、实现、调试和审计。

最小闭环是：faux provider 输出 tool call，runtime 执行 `read`，生成 `ToolResultMessage`，下一轮 provider 根据 tool result 输出最终文本，JSON host 每行输出可解析的 `AgentSessionEvent`。

## 最终产物

读完后应能写出一个 mini Pi-like agent：

- `mini-pi -p "..."` 能运行一次 prompt。
- `--mode json` 能输出事件流。
- faux provider 能产生文本和 tool call。
- agent loop 能执行 tool、回灌 toolResult、继续请求模型。
- `read/write/bash` 这类工具有 schema、校验和 runtime executor。
- JSONL session 能 append、load、resume、fork。
- ResourceLoader 能注入项目规则和工具说明。
- Host adapter 不拥有业务状态。
- 安全策略能区分只读、写入、bash、扩展能力。
- faux provider trajectory 可以回放并测试。

如果目标从“mini Pi-like agent”升级为“完整复刻 Pi”，读者还必须按第 18-24 章的真实协议表和产品矩阵补齐 Pi 的实际消息字段、JSON/RPC 事件、session entry 类型、extension UI bridge、custom provider streaming、package/theme/settings/model/tree/export 等行为；这些能力的事实来源都在当前仓库 docs 和源码中列出。

## 结课自测

读完后，如果不能独立完成下面 8 件事，就还没有达到“专家级理解”：

1. 画出 Pi 从 CLI 到 `AgentSessionRuntime` 再到 host adapter 的启动链路。
2. 解释 provider stream 为什么只能产出 `AssistantMessageEvent`，不能执行文件系统动作。
3. 写出一次 user -> assistant toolCall -> toolResult -> assistant final 的 message 序列。
4. 写出真实 Pi JSON mode 的 session header 和 `message_update` 样例。
5. 写出真实 Pi RPC `prompt`、`export_html`、`fork` 的命令边界。
6. 说明 session JSONL 为什么是 append-only DAG，而不是最终 transcript。
7. 说明 extension runner 如何注册工具、hook、provider 和 UI bridge，但不持有裸 session。
8. 用第 20-24 章 P0/P1/P2 表判断自己的实现缺哪些能力。

## 目录

### 第 1 部分：建立 Pi-like Agent 的依赖 DAG

- [1. Pi 的依赖 DAG 与 Harness 边界](chapters/chapter-01-dependency-dag.md)
- [2. 启动链路：CLI、模式选择、CWD 与诊断](chapters/chapter-02-boot-runtime.md)
- [3. CWD 绑定服务：Settings、Auth、ModelRegistry、ResourceLoader](chapters/chapter-03-cwd-services.md)
- [4. AgentSessionRuntime：new、resume、fork、import、reload](chapters/chapter-04-agent-session-runtime.md)

### 第 2 部分：实现模型、会话与 Agent 内核

- [5. pi-ai：消息类型、模型类型与流事件协议](chapters/chapter-05-pi-ai-stream.md)
- [6. 模型选择、鉴权与 Provider 注册](chapters/chapter-06-model-provider-auth.md)
- [7. SDK 创建 AgentSession：服务如何变成可运行 Agent](chapters/chapter-07-create-agent-session.md)
- [8. Agent Core Loop：turn、stream、tool-use、steer 与 follow-up](chapters/chapter-08-agent-loop.md)
- [9. 工具系统：内置工具、active tools、校验与结果回灌](chapters/chapter-09-tools.md)
- [10. System Prompt 与资源注入：AGENTS、skills、templates、tool snippets](chapters/chapter-10-system-prompt-resources.md)
- [11. Session DAG 与 JSONL 持久化](chapters/chapter-11-session-dag-jsonl.md)
- [12. 压缩、分支摘要、重试与 Overflow 恢复](chapters/chapter-12-compaction-retry-overflow.md)

### 第 3 部分：扩展、宿主、安全与最终复刻

- [13. Extension Runtime：加载、注册、hook、命令、工具、UI bridge](chapters/chapter-13-extension-runtime.md)
- [14. Host Adapters：print、json、rpc、interactive 共享同一 session](chapters/chapter-14-host-adapters.md)
- [15. Interactive TUI：编辑器、渲染、快捷键、队列与扩展 UI](chapters/chapter-15-interactive-tui.md)
- [16. 安全、诊断与生产化不变量](chapters/chapter-16-safety-diagnostics-production.md)

### 第 4 部分：贯穿实现、协议、测试与审计

- [17. 从零实现 mini Pi-like Agent](chapters/chapter-17-mini-pi-implementation.md)
- [18. 协议与数据结构总表](chapters/chapter-18-protocol-data-structures.md)
- [19. Faux Provider、测试与回放验收](chapters/chapter-19-faux-provider-tests.md)
- [20. 最终复刻路线与生产审计](chapters/chapter-20-final-replication-audit.md)

### 第 5 部分：完整产品复刻附录

- [21. Package Manager、资源发现与 Theme](chapters/chapter-21-package-resources-themes.md)
- [22. RPC Extension UI 与 HTML Export](chapters/chapter-22-rpc-extension-ui-html-export.md)
- [23. Interactive 产品面：Keybindings、Settings、Model 与 Session Tree](chapters/chapter-23-interactive-product-surface.md)
- [24. 一模一样复刻矩阵](chapters/chapter-24-complete-replication-matrix.md)
- [25. 结课题库与 FAQ](chapters/chapter-25-course-exercises-faq.md)

## 校验

修改书稿后运行：

```bash
node book/validate.js
```
