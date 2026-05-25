# 14. Resume、Fork、Clone、Tree 与 Branch Summary

## 14. 本章解决的问题

真实 coding agent 的使用方式不是一条直线。用户会继续昨天的工作、回到某个历史节点重试、把当前路径复制成新 session，或者在同一个 session tree 里保留多个实验分支。pi 用 session tree 承载这些行为，而不是为每次试错复制一整个聊天数组。

对前端小白来说，可以把 session tree 想成浏览器 devtools 里的 DOM tree：当前 leaf 是你正在看的节点；`/tree` 是节点导航器；`/fork` 和 `/clone` 是把某条路径复制成新文件。`getBranch()` 负责从 leaf 回溯路径，见 [session-manager.ts#L1076](/source-code/packages/coding-agent/src/core/session-manager.ts#L1076)；`getTree()` 负责构建完整树，见 [session-manager.ts#L1117](/source-code/packages/coding-agent/src/core/session-manager.ts#L1117)。

## 14. Resume 与 continue

`--continue` 是“找最近一次这个项目的 session”，`--resume` 是“让用户挑一个历史 session”，`--session <path|id>` 是“明确打开某个文件或 id”。`SessionManager.continueRecent()` 的实现很直接：先找最近文件，找不到就创建新 session，见 [session-manager.ts#L1338](/source-code/packages/coding-agent/src/core/session-manager.ts#L1338)。

创造者视角下，resume 的关键不只是读取 JSONL。host app 还必须重新加载 cwd、settings、resources、model registry、tools、extensions、auth provider 和 UI runtime。session 文件只负责 durable facts；运行时依赖在恢复时重建。这也是为什么 durable harness 不能把整个进程内存 dump 成 session。

## 14. Tree navigation 的用户语义

`/tree` 允许用户在同一个 session 文件内切换 leaf。选择 user 或 custom message 时，pi 会把 leaf 移到该消息的 parent，并把消息文本放回 editor，方便用户改写再提交；选择 assistant、tool、compaction 等非用户 entry 时，leaf 移到该 entry，editor 保持空，用户可以从那里继续。

这个语义在 harness 版 `navigateTree()` 里也能看到：如果目标是 user message，就把 `newLeafId` 设为 `targetEntry.parentId` 并抽出文本；否则把 `newLeafId` 设为目标 entry，见 [agent-harness.ts#L788](/source-code/packages/agent/src/harness/agent-harness.ts#L788)。coding-agent 现有路径也会先记录 old leaf、校验目标 entry，再收集待总结路径，见 [agent-session.ts#L2660](/source-code/packages/coding-agent/src/core/agent-session.ts#L2660)。

## 14. Fork 与 clone

`/fork` 适合“从历史某个 user prompt 重新出发”。`/clone` 适合“当前分支已经有价值，我想复制一份再冒险”。两者都会产生新 session 文件，而不是在原文件里移动 leaf。

`SessionManager.forkFrom()` 会创建新的 session id、新 header，并把 source session 的非 header entries 复制过去，header 的 `parentSession` 指向源文件，见 [session-manager.ts#L1359](/source-code/packages/coding-agent/src/core/session-manager.ts#L1359)。`createBranchedSession()` 则从指定 leaf 提取 root-to-leaf 的单一路径，适合 clone 当前 active branch，入口在 [session-manager.ts#L1212](/source-code/packages/coding-agent/src/core/session-manager.ts#L1212)。

实现这类能力时，不要只复制“最后一屏文本”。必须复制 entry path、parentId 关系、model/thinking entries、compaction、branch summary 和 custom message，否则新 session 构建出的 LLM context 会和用户看到的历史不一致。

## 14. Branch summary 解决什么问题

当用户从 branch A 切到 branch B 时，被离开的路径里可能包含重要发现：读过哪些文件、哪些方案失败、某个错误原因是什么。直接切 leaf 会让模型只看到新路径，看不到 abandoned path 的经验；把整个 abandoned path 都塞进去又会浪费上下文。

branch summary 是折中方案：在新路径上插入一个 `branch_summary` entry，保存离开路径的摘要。entry 类型定义在 [session-manager.ts#L78](/source-code/packages/coding-agent/src/core/session-manager.ts#L78)，转成模型上下文的位置在 [session-manager.ts#L385](/source-code/packages/coding-agent/src/core/session-manager.ts#L385)。`branchWithSummary()` 会先移动 leaf，再追加 summary entry，见 [session-manager.ts#L1188](/source-code/packages/coding-agent/src/core/session-manager.ts#L1188)。

## 14. Branch summary 生命周期

pi 在 tree 导航前收集 old leaf、target id、common ancestor、待总结 entries、用户是否要 summary 以及自定义 instructions。extension 可以通过 `session_before_tree` 取消、提供 summary 或改写 instructions，相关 event result 类型见 [types.ts#L1029](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1029)。如果没有 extension summary 且用户选择总结，默认 summarizer 会调用模型，见 [agent-session.ts#L2737](/source-code/packages/coding-agent/src/core/agent-session.ts#L2737)。

完成后，pi 会移动 leaf、可选写入 summary entry，并发出 `session_tree` 事件。harness 版同样在 `session_before_tree` 后生成 summary，再调用 session move，最后发 `session_tree`，见 [agent-harness.ts#L760](/source-code/packages/agent/src/harness/agent-harness.ts#L760) 和 [agent-harness.ts#L812](/source-code/packages/agent/src/harness/agent-harness.ts#L812)。

## 14. 复刻路径

最小可用版本：先实现 `getBranch()`、`branch(entryId)`、`resetLeaf()` 和 `buildSessionContext()`。没有 UI 也没关系，只要能从指定 entry 继续生成新 child，tree 语义就是对的。

第二阶段：实现 `/resume` picker、`/tree` selector、`/fork` 和 `/clone`。这时要确保新文件 header、parent session、leaf、cwd 都正确。

生产级：补 branch summary、summary abort、extension `session_before_tree`、label、tree filter、session rename/delete、trash 删除和跨项目 session list。

## 14. 常见误解

`/tree` 不是 undo。旧 entry 不会被删除，只是当前 leaf 改变。

`/fork` 和 `/clone` 不是同义词。fork 更偏历史点重试，clone 更偏当前分支复制。

branch summary 不是压缩原分支。原分支仍在 JSONL tree 里，summary 只是给新路径带上离开路径的关键上下文。
