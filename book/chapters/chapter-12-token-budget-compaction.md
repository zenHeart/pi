# 12. Token Budget、自动压缩与上下文恢复

## 12. 本章解决的问题

长任务会超过模型上下文窗口。pi 不靠“让模型简短回答”解决，而是计算 context budget，在阈值附近自动压缩 session。对新手来说，compaction 像把旧聊天整理成一张任务交接卡；对 agent 创造者来说，它是一个结构性 session mutation：既要减少 provider 输入，又不能丢掉目标、约束、文件状态和下一步。

默认 compaction 设置在 [compaction.ts#L116](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L116)。触发判断是 `contextTokens > contextWindow - reserveTokens`，见 [compaction.ts#L219](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L219)。branch summary 入口是 `generateBranchSummary()`，见 [branch-summarization.ts#L283](/source-code/packages/coding-agent/src/core/compaction/branch-summarization.ts#L283)。

## 12. 自动压缩流程

自动压缩会保留最近上下文，找到合适 cut point，生成 summary entry，再让后续 provider request 使用 summary 加近期消息。`prepareCompaction()` 是结构化准备阶段：找上一次 compaction、确定边界、估算当前 tokens、找 cut point、收集要摘要的消息和文件操作，见 [compaction.ts#L644](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L644)。

cut point 不是随便截断字符串。有效 cut point 包括 user、assistant、custom、bashExecution 等消息，但不能切在 tool result 上，因为 tool result 必须跟它的 assistant tool call 形成协议对，见 [compaction.ts#L299](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L299)。`findCutPoint()` 从最新消息向前累积估算 token，尽量保留 `keepRecentTokens` 近期上下文，见 [compaction.ts#L386](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L386)。

默认策略尽量在 turn 边界切断；如果单个 turn 自己就超过保留预算，pi 会识别 split turn，并把 turn prefix 作为单独摘要合并进最终 summary，见 [compaction.ts#L344](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L344) 和 [compaction.ts#L775](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L775)。压缩不是删除历史，原始 session 仍在 JSONL 中；后续上下文恢复时使用 compaction summary 加 `firstKeptEntryId` 之后的当前 branch 消息。

## 12. Summary 不是普通 assistant 回复

compaction summary 是 harness 生成的结构化上下文，不是模型给用户的回答。它的目标是保留任务状态、文件状态、决策、下一步，而不是“写一段摘要”。摘要 prompt 要求固定格式，并保留路径、函数名和错误信息，见 [compaction.ts#L457](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L457)。如果已有旧 summary，pi 使用 update prompt 合并新信息，而不是重新从零总结，见 [compaction.ts#L490](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L490)。

生成摘要前，pi 会把消息转成文本序列，避免 summarizer 把它当成要继续的对话。序列化入口是 `serializeConversation()`，见 [utils.ts#L109](/source-code/packages/coding-agent/src/core/compaction/utils.ts#L109)。tool result 在摘要请求中最多保留 2000 字符，见 [utils.ts#L89](/source-code/packages/coding-agent/src/core/compaction/utils.ts#L89) 和 [utils.ts#L156](/source-code/packages/coding-agent/src/core/compaction/utils.ts#L156)。summarization system prompt 明确要求只输出结构化摘要，不继续对话，见 [utils.ts#L168](/source-code/packages/coding-agent/src/core/compaction/utils.ts#L168)。

文件状态也不是靠模型自由发挥。pi 从 assistant tool calls 中提取 read/write/edit 的路径，见 [utils.ts#L29](/source-code/packages/coding-agent/src/core/compaction/utils.ts#L29)，再把只读文件和修改文件追加成 `<read-files>` 与 `<modified-files>`，见 [utils.ts#L62](/source-code/packages/coding-agent/src/core/compaction/utils.ts#L62) 和 [utils.ts#L72](/source-code/packages/coding-agent/src/core/compaction/utils.ts#L72)。这让后续模型知道哪些文件只是看过，哪些文件可能被改过。

## 12. Extension 介入点

extensions 可以通过 session-before compact/tree 事件取消或自定义压缩。这样团队可以把特殊资源、外部 ticket 状态、测试结果纳入 summary。介入点必须在结构性 mutation 前完成，不能在 provider streaming 中改 tree。文档里的 `session_before_compact` 会拿到 preparation、branchEntries、customInstructions 和 signal；`session_before_tree` 会拿到 target、old leaf、common ancestor 和用户是否想摘要。

branch summary 解决的是另一个问题：用户在 `/tree` 中离开一个分支时，不能把那个分支的探索完全丢掉。`collectEntriesForBranchSummary()` 从旧 leaf 向上走到和目标 leaf 的共同祖先，收集被放弃路径上的 entries，见 [branch-summarization.ts#L98](/source-code/packages/coding-agent/src/core/compaction/branch-summarization.ts#L98)。`prepareBranchEntries()` 在 token budget 内优先保留最近消息，同时累计历史 branch summary 的文件追踪，见 [branch-summarization.ts#L185](/source-code/packages/coding-agent/src/core/compaction/branch-summarization.ts#L185)。生成阶段用 `contextWindow - reserveTokens` 作为预算，见 [branch-summarization.ts#L291](/source-code/packages/coding-agent/src/core/compaction/branch-summarization.ts#L291)。

## 12. 实操清单

会用 `/compact` 手动压缩；知道 auto compaction 可在 settings 中关闭；知道 context overflow 可能触发压缩重试；知道大工具输出需要截断；知道 branch 切换时 abandoned path 会生成 branch summary。

复刻时 MVP 可以先做手动 summary，生产级再做阈值、cut point、branch summary、extension hooks。必须守住的边界是：

- 不在 tool result 中间切断上下文。
- 不把 summary 当普通 assistant 回复展示给用户。
- 不丢失 `firstKeptEntryId`，否则后续恢复不知道从哪里继续。
- 不假设摘要完美；关键事实、文件列表、错误信息要结构化保留。
- 不在 agent 正在 streaming 的过程中直接改 session tree。

compaction 的失败边界也要诚实说明：摘要模型可能漏掉细节；极长单 turn 只能做 prefix summary，不能保留所有过程；外部文件系统状态可能已经变化，summary 只能说明历史读写意图；extension 自定义 summary 如果格式太自由，会降低后续恢复质量。
