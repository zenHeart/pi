# 第21章 RL 集成蓝图：从 session 数据到训练样本

## 21.1 先明确边界

pi 本身不是 RL 平台。但它的 session 数据天然适合后续学习：用户任务、模型轨迹、工具调用、文件修改、失败、重试、最终结果都在 transcript 和工作区 diff 中。为未来 RL 做准备，不等于马上训练模型；它意味着从第一天就保存可解释轨迹。

## 21.2 Trajectory 结构

一条 coding agent trajectory 至少包含：

- 初始仓库状态。
- 用户 prompt 和 context files。
- system prompt 版本。
- provider/model/thinking level。
- 每轮 assistant message。
- toolCall/toolResult。
- bash stdout/stderr/exitCode。
- 文件 diff。
- 检查命令结果。
- token/cost。
- 用户是否接受、回滚、继续追问。

JSONL session 提供过程，git diff 提供结果，eval runner 提供判定。缺任何一类，训练样本都会变得难解释。

## 21.3 Reward 信号

可用 reward 信号包括：

- 测试通过。
- lint/check 通过。
- diff 范围小。
- 没有危险命令。
- 没有泄露 secret。
- 用户没有回滚。
- PR 合并。
- issue 关闭。

不要只用最终文本打分。coding agent 的真实价值在于工作区状态和任务完成质量。

## 21.4 数据清洗

真实 session 可能包含 secrets、私有路径、用户名、token、内部 URL、失败命令、大文件输出。发布或训练前必须脱敏、截断、过滤敏感文件，并保留足够上下文解释动作。

redaction 应在 export/eval pipeline 中执行，而不是依赖模型“不要输出 secret”。session 是事实源，事实源需要工程化清洗。

## 21.5 从 eval 到学习

推荐路径：

1. 先做 deterministic regression，保护 harness。
2. 再做真实 provider eval，发现能力问题。
3. 收集成功/失败 session。
4. 提取 trajectory。
5. 人工或规则标注 reward。
6. 做 prompt/tool/harness 改进。
7. 最后再考虑 SFT、DPO、reward model。

大多数团队在第 6 步前都不需要训练模型。

## 21.6 复刻原则

MVP：session export、diff capture、check result、redaction script。

生产级：trajectory schema、dataset versioning、reward labels、privacy review、failure taxonomy、eval mining、human feedback UI、training data lineage。
