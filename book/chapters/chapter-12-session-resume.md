# 第12章 Session Resume：从 transcript 恢复工作现场

## 12.1 Resume 解决什么问题

coding agent 的价值不只在单次回答，而在可继续工作。用户需要今天启动、明天继续；需要从历史某个点分叉；需要导出 session；需要在失败后知道做过什么。pi 支持 `pi -c`、`pi -r`、`pi --session <path|id>`，交互中提供 `/resume`、`/new`、`/fork`、`/clone`、`/tree`。

resume 的本质不是“读文件拼回 messages”。它要恢复当前 leaf、当前分支上下文、session metadata、model/thinking 变更、compaction summary、branch summary，并重新绑定 runtime 资源。

## 12.2 JSONL 树

`SessionManager` 管理 append-only JSONL 树，类注释从 [session-manager.ts#L701](/source-code/packages/coding-agent/src/core/session-manager.ts#L701) 开始。每个 entry 有 `id` 和 `parentId`，当前 leaf 指向当前分支尾部。追加消息时，新 entry 挂到 leaf 下，然后 leaf 前进。

这比线性数组更适合 coding agent，因为用户经常会：

- 从旧回答处重新尝试。
- fork 成新 session。
- clone 当前分支做实验。
- 标记某个节点。
- 离开分支时生成 summary。

## 12.3 恢复上下文

`buildSessionContext()` 会从 leaf 往 root 回溯构建当前分支上下文，相关逻辑从 [session-manager.ts#L312](/source-code/packages/coding-agent/src/core/session-manager.ts#L312) 开始。`SessionManager.getBranch()` 从 [session-manager.ts#L1076](/source-code/packages/coding-agent/src/core/session-manager.ts#L1076) 开始返回分支路径。

恢复时不能把所有 entry 都送给模型。只有当前分支上的有效上下文进入 agent state；其他分支保留在文件中供 tree/fork/export 使用。

## 12.4 Tree Navigation

`/tree` 允许用户在同一个 session 文件里跳到任意节点。产品层 `AgentSession.navigateTree()` 从 [agent-session.ts#L2657](/source-code/packages/coding-agent/src/core/agent-session.ts#L2657) 开始。离开当前分支时，pi 可以生成 branch summary，帮助未来理解被放弃分支。

tree navigation 是结构性 session mutation，不能在 agent 正忙时随意执行。`AgentHarness` 文档也强调 compaction 和 tree navigation 只能 idle 时进行，代码里 `navigateTree()` 也要求 idle，见 [agent-harness.ts#L737](/source-code/packages/agent/src/harness/agent-harness.ts#L737)。

## 12.5 Abort 与未完成操作

durable harness 文档强调 provider streams 不可恢复。崩溃或 abort 后，不能假设可以从 provider stream 中间继续。未完成 provider request 应标记 interrupted 或从安全边界重试；未完成 tool call 只有在工具声明 retry-safe/idempotent 时才可自动重试。

复刻时要有保守恢复策略：session 中只信任已经完整写入的 entry；未完成工具不要静默重跑；用户 abort 后恢复 queued messages 的策略要明确。

## 12.6 复刻原则

MVP：JSONL header、message entry、id/parentId、leaf、resume current branch。

生产级：model/thinking entries、compaction entry、branch summary entry、custom entry、label、session info、fork/clone/tree、leaf 持久化、HTML/JSONL export、interrupted operation policy、session switch lifecycle。
