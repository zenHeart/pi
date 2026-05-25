# 第18章 Eval 与可观测性

## 18.1 Eval 的事实源

pi 没有把完整托管 eval 平台放进仓库，但它已经具备 eval 所需的事实源：结构化事件、JSONL session、工具调用、usage/cost、HTML/JSONL export、RPC/JSON mode、faux provider 测试、session stats。eval runner 不应该解析 ANSI 终端文本，而应该消费这些结构化输出。

## 18.2 可观测性 mental model

observability docs 的目标是让 pi 能把 agent run、provider request、tool call、session mutation、extension event 变成可追踪信号。对 agent 来说，可观测性不是只有日志，还包括：

- trace：一次用户任务跨 turn、provider、tool、session 的链路。
- span：provider request、tool execution、compaction、export 等阶段。
- event：message_update、tool_execution_end、extension_error。
- metric：token、cost、latency、retry count、tool duration。
- redaction：避免 secrets、路径、用户身份泄漏。

## 18.3 事件流作为 trace

低层 loop 发出结构化事件，第2章已经讲过。print mode 的 JSON 输出会把事件写成 JSON lines，见 [print-mode.ts#L105](/source-code/packages/coding-agent/src/modes/print-mode.ts#L105)。RPC mode 也用 JSONL 协议，协议文件从 [rpc-types.ts#L19](/source-code/packages/coding-agent/src/modes/rpc/rpc-types.ts#L19) 开始。

这让 eval runner 可以订阅：

- `message_end`：最终 assistant 或 tool result。
- `tool_execution_end`：工具结果和错误。
- `compaction_end`：是否压缩成功。
- `auto_retry_*`：是否发生 transient retry。
- `agent_end`：run 是否结束。

RPC 不只输出 agent events，还会输出 extension UI 请求。类型从 [rpc-types.ts#L213](/source-code/packages/coding-agent/src/modes/rpc/rpc-types.ts#L213) 开始，覆盖 select、confirm、input、editor、notify、setStatus、setWidget、setTitle、set_editor_text。对应的 UI response 类型在 [rpc-types.ts#L255](/source-code/packages/coding-agent/src/modes/rpc/rpc-types.ts#L255)。这让 headless runner 可以在没有 TUI 的情况下处理 extension 交互。

对 eval 平台来说，这意味着 trace 至少有三类 JSONL：

- command response：某个 RPC 命令是否被接收或失败。
- agent/session event：模型、工具、compaction、retry 的过程事实。
- extension UI request/response：扩展要求用户选择或输入时的外部交互事实。

不要把这三类事件混成一种 “log”。它们的生命周期和断言方式不同。

## 18.4 Faux provider

测试 agent loop 不应调用真实 provider。faux provider 用脚本化 response 让测试可重复：给定上下文，返回 text 或 toolCall。这样可以稳定测试 tool loop、compaction、session tree、extension hook、retry。

复刻时要从第一天实现 fake model。没有 fake model，就无法写可靠的单元测试和回归测试，只能依赖昂贵且不稳定的真实模型。

## 18.5 判定标准

coding agent eval 不应只看最终回答。更可靠的断言包括：

- 最终 git diff 是否符合预期。
- 指定检查命令是否通过。
- 是否读了必要文件。
- 是否调用了危险工具。
- 是否超过轮次/token/cost 上限。
- 是否出现未处理错误。
- 是否正确保存 session。
- 是否能从 session replay 到关键状态。

## 18.6 复刻原则

MVP：JSON event output、session JSONL、faux provider、工具调用断言。

生产级：trace/span/metric、redaction policy、eval cases、RPC runner、workspace diff checker、cost budget、failure taxonomy、HTML trace viewer、dataset export。
