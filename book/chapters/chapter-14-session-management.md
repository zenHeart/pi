# 第14章 Session 管理：JSONL 树、分支与导出

## 14.1 Session 管理解决什么问题

用户需要继续、回退、分叉、命名、导出和分享工作过程。普通聊天 transcript 只能线性追加；coding agent 需要树，因为用户会从某个历史节点重新尝试。pi 的 `SessionManager` 是这个能力的核心，从 [session-manager.ts#L711](/source-code/packages/coding-agent/src/core/session-manager.ts#L711) 开始。

session 管理也是 eval、observability 和未来 RL 数据的事实源。没有结构化 session，就只能从终端日志猜 agent 做了什么。

## 14.2 Entry 类型

`SessionEntry` 在 [session-manager.ts#L138](/source-code/packages/coding-agent/src/core/session-manager.ts#L138) 定义。重要 entry 包括：

- `header`：session id、cwd、version、创建时间。
- `message`：user/assistant/toolResult/bashExecution/custom 等消息。
- `model_change`：切换 provider/model。
- `thinking_level_change`：切换 thinking level。
- `compaction`：历史摘要。
- `branch_summary`：离开分支时的交接。
- `custom`：extension 自定义 entry。
- `custom_message`：extension 注入且可进模型的消息。
- `label`：节点标签。
- `session_info`：显示名等元数据。
- `leaf`：当前分支位置。

这些 entry 共同描述“工作现场”，不是所有 entry 都等价于模型消息。

## 14.3 Append-only 与 leaf

`_appendEntry()` 会把 entry 追加到文件并更新 leaf，位置见 [session-manager.ts#L863](/source-code/packages/coding-agent/src/core/session-manager.ts#L863)。常用追加方法包括 `appendMessage()`、`appendModelChange()`、`appendCompaction()`、`appendCustomEntry()`，分别从 [session-manager.ts#L876](/source-code/packages/coding-agent/src/core/session-manager.ts#L876)、[session-manager.ts#L902](/source-code/packages/coding-agent/src/core/session-manager.ts#L902)、[session-manager.ts#L916](/source-code/packages/coding-agent/src/core/session-manager.ts#L916) 和 [session-manager.ts#L939](/source-code/packages/coding-agent/src/core/session-manager.ts#L939) 开始。

append-only 的好处是崩溃恢复简单、历史可审计、分支不会覆盖旧记录。代价是需要明确 leaf 语义和 compaction 策略。

## 14.4 Fork、clone、tree

`branch()` 改变 leaf，让下一条消息从历史节点继续，相关逻辑从 [session-manager.ts#L1163](/source-code/packages/coding-agent/src/core/session-manager.ts#L1163) 开始。`branchWithSummary()` 会同时追加 branch summary，见 [session-manager.ts#L1185](/source-code/packages/coding-agent/src/core/session-manager.ts#L1185)。`createBranchedSession()` 从 [session-manager.ts#L1208](/source-code/packages/coding-agent/src/core/session-manager.ts#L1208) 开始，把某个分支复制成新 session。

用户命令层面，`/tree` 是在当前 session 内移动，`/fork` 是从历史用户消息创建新 session，`/clone` 是复制当前活跃分支。三者都围绕同一个树模型。

## 14.5 Stats 与 export

`/session` 展示 session 文件、ID、消息数、tool calls、token、cost。`AgentSession.getSessionStats()` 从 [agent-session.ts#L2877](/source-code/packages/coding-agent/src/core/agent-session.ts#L2877) 开始。导出 HTML 的入口是 [agent-session.ts#L2973](/source-code/packages/coding-agent/src/core/agent-session.ts#L2973)，JSONL 导出入口是 [agent-session.ts#L2996](/source-code/packages/coding-agent/src/core/agent-session.ts#L2996)。

导出不是附加功能。它让用户分享 session、做 eval、做训练数据清洗、审计 agent 行为。

## 14.6 复刻原则

MVP：session header、message entry、append-only 写入、resume、stats。

生产级：树结构、leaf entry、fork/clone/tree、compaction、branch summary、custom entry、labels、HTML export、JSONL import/export、session directory by cwd、partial UUID lookup、ephemeral mode。
