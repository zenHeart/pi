# 第7章 Context Engineering：决定模型看见什么

## 7.1 问题边界

Context engineering 不是把更多文件塞进 prompt。它是管理模型可见世界的工程：哪些 session 消息进入模型，哪些工具输出被截断，哪些文件规则进入 system prompt，哪些历史被压缩成 summary，哪些 UI 通知只保存但不暴露给模型。

pi 的核心边界是 `transformContext` 和 `convertToLlm`。低层 loop 在发 provider 请求前调用它们，位置见 [agent-loop.ts#L275](/source-code/packages/agent/src/agent-loop.ts#L275)。coding-agent 的产品消息转换在 [messages.ts#L148](/source-code/packages/coding-agent/src/core/messages.ts#L148)。

## 7.2 上下文来源

pi 的上下文来源包括：

- 当前 session leaf 所在分支上的消息。
- `AGENTS.md` / `CLAUDE.md` context files。
- `SYSTEM.md` / `APPEND_SYSTEM.md`。
- `@file` 引用和图片附件。
- `!command` 的 bash output。
- skills 和 prompt templates 展开后的用户消息。
- extension 注入的 custom message。
- compaction summary。
- branch summary。
- 当前 active tools 的 schema 和描述。

这些来源有不同生命周期。context files 是长期规则；session message 是短期过程；compaction summary 是历史压缩；branch summary 是离开分支后的交接；tool schema 是当前能力声明。

## 7.3 内部消息到模型消息

`messages.ts` 定义了产品层扩展消息：`bashExecution`、`custom`、`branchSummary`、`compactionSummary`，见 [messages.ts#L29](/source-code/packages/coding-agent/src/core/messages.ts#L29)、[messages.ts#L46](/source-code/packages/coding-agent/src/core/messages.ts#L46)、[messages.ts#L55](/source-code/packages/coding-agent/src/core/messages.ts#L55) 和 [messages.ts#L62](/source-code/packages/coding-agent/src/core/messages.ts#L62)。

`convertToLlm()` 决定它们如何进入模型，见 [messages.ts#L148](/source-code/packages/coding-agent/src/core/messages.ts#L148)。例如 `bashExecution` 会转成 user-role 文本，branch summary 和 compaction summary 也会以用户可理解的方式进入上下文。这个转换层是复刻时最容易低估的部分：新增一种内部消息类型时，必须回答它是否进入模型、以什么身份进入、是否影响 token 预算、是否需要脱敏。

## 7.4 Compaction 是上下文工程，不是删除历史

长会话会超过 context window。pi 的 compaction 不是简单删除旧消息，而是选取 cut point，把旧历史总结成 `CompactionEntry`，并保留最近上下文。`prepareCompaction()` 从 [compaction.ts#L644](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L644) 开始，真正调用模型生成摘要的 `compact()` 从 [compaction.ts#L747](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L747) 开始。

cut point 有约束：不能切在 tool result 前后破坏 toolCall/toolResult 配对；如果切在一个 turn 中间，要生成 turn prefix summary。相关 cut point 逻辑从 [compaction.ts#L386](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L386) 开始。这个细节决定了 compaction 是否会让模型误解历史。

## 7.5 模型能看到什么，Harness 私下保留什么

一个成熟 harness 必须区分：

- 模型可见：用户任务、必要历史、工具结果摘要、压缩摘要、项目规则。
- UI 可见：流式文本、工具执行状态、扩展通知、完整 shell 输出片段。
- session 保留：所有稳定消息、model change、thinking change、label、custom entry、branch summary。
- runtime 私有：pending writes、active abort controller、queue、current phase、extension handler state。

如果把所有信息都发给模型，会浪费 context 并泄露不该泄露的信息。如果只保留模型上下文，会失去恢复、审计、导出和 eval 能力。

## 7.6 复刻原则

MVP：实现 `convertToProviderMessages(messages)`，只处理 user/assistant/toolResult；工具输出截断；手动 compact。

生产级：内部消息和 provider 消息分层；context transform hook；custom message；compaction entry；branch summary；file tracking；hidden bash output；image resize/block；context usage 指标；overflow 自动 compact + retry。
