# 第8章 Token 与预算管理

## 8.1 为什么预算是产品能力

Token 不是账单统计的附属品。对 coding agent 来说，token 预算决定任务能否继续、工具输出能否进入模型、历史是否需要压缩、thinking level 是否值得开启、provider 是否会触发 overflow。预算管理做不好，用户看到的是随机失败、变慢、变贵和上下文遗忘。

pi 在 footer、session stats、compaction 和 retry 中都使用预算信息。`AgentSession.getSessionStats()` 从 [agent-session.ts#L2877](/source-code/packages/coding-agent/src/core/agent-session.ts#L2877) 开始聚合消息、tool calls、token 和 cost；context usage 计算从 [agent-session.ts#L2931](/source-code/packages/coding-agent/src/core/agent-session.ts#L2931) 附近开始。

## 8.2 usage 从哪里来

provider adapter 负责把供应商返回的 usage 归一化到 assistant message。上层不应该解析每个 provider 的原始响应。这样 session stats、HTML export、RPC event 和 eval runner 才能用同一套字段。

需要区分的 usage 至少包括：

- input tokens。
- output tokens。
- cache read tokens。
- cache write tokens。
- thinking/reasoning tokens。
- cost。

不同 provider 字段不一致，不能假设所有模型都能返回完整 usage。缺失时要显示未知，而不是伪造 0。

## 8.3 工具输出预算

工具输出最容易吞掉上下文。`bash`、`grep`、`read` 都可能输出大量文本。pi 用截断和 accumulator 控制输出，核心位置见 [truncate.ts#L78](/source-code/packages/coding-agent/src/core/tools/truncate.ts#L78) 与 [output-accumulator.ts#L29](/source-code/packages/coding-agent/src/core/tools/output-accumulator.ts#L29)。

好的工具输出策略不是“截断到 N 字符”这么简单。它应该告诉模型：

- 输出被截断。
- 保留了哪些部分。
- 完整输出是否保存到文件。
- 后续如果需要完整内容，应读哪个路径或重新运行什么命令。

否则模型会把不完整输出当完整事实，做出错误判断。

## 8.4 Thinking 预算

pi 用 `ThinkingLevel` 表达 `off`、`minimal`、`low`、`medium`、`high` 等思考等级。低层 `Agent` 在构造 config 时把 `off` 转成 `undefined`，见 [agent.ts#L426](/source-code/packages/agent/src/agent.ts#L426)。不同 provider 对 thinking 的支持不同，model registry 需要映射或隐藏不支持的等级。

产品上，thinking level 是用户可调的成本/质量旋钮。简单编辑不需要 high；复杂架构任务可能需要 high。复刻时不要把 thinking 写成固定 provider 字段，而应作为模型能力的一部分。

## 8.5 自动压缩与 retry

当上下文接近窗口上限，harness 可以主动 compaction。当 provider 返回 overflow，pi 可以识别错误、运行 compaction、再 retry。custom provider 必须规范化 overflow 错误，否则自动恢复无法触发。

这个流程要求预算和错误分类协作：

1. 模型 registry 知道 context window。
2. session/context builder 能估算当前上下文。
3. compaction 能保留最近关键消息。
4. provider error 能标记 overflow。
5. retry 不应无限循环。

## 8.6 复刻原则

MVP：记录 usage；显示 token/cost；截断工具输出；手动 compact。

生产级：context usage；thinking budgets；cache token；cost 聚合；overflow detection；auto compaction；retry backoff；provider retry delay cap；工具输出落盘；eval trace 中记录预算。
