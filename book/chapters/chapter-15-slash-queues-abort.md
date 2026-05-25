# 15. Slash Commands、队列、Steer、Follow-up 与 Abort

## 15. 本章解决的问题

用户和 agent 的交互有两条通道：普通 prompt 交给模型，slash command 交给产品控制面。队列则解决“模型还在跑，我又想补一句”的问题。abort 负责把正在运行的 provider、tool、retry、compaction 或 branch summary 拉回可控状态。

内置 slash command 列表定义在 [slash-commands.ts#L18](/source-code/packages/coding-agent/src/core/slash-commands.ts#L18)。交互模式会把内置命令、prompt templates、extension commands 和 skills 合成 autocomplete 列表，见 [interactive-mode.ts#L450](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L450) 到 [interactive-mode.ts#L519](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L519)。

## 15. Slash command 与 prompt 的分界

对小白读者来说，普通输入像“发消息给模型”，slash command 像“点应用菜单”。`/model`、`/settings`、`/resume`、`/tree`、`/fork`、`/clone`、`/compact`、`/reload` 都是控制应用状态，而不是让模型自由解释。

`AgentSession.prompt()` 的第一步就是在文本以 `/` 开头时先尝试执行 extension command，且 extension command 即使在 streaming 中也立即执行，见 [agent-session.ts#L962](/source-code/packages/coding-agent/src/core/agent-session.ts#L962) 和 [agent-session.ts#L968](/source-code/packages/coding-agent/src/core/agent-session.ts#L968)。之后才触发 `input` hook、skill command 展开和 prompt template 展开，见 [agent-session.ts#L979](/source-code/packages/coding-agent/src/core/agent-session.ts#L979) 到 [agent-session.ts#L1003](/source-code/packages/coding-agent/src/core/agent-session.ts#L1003)。

## 15. 命令来源与优先级

slash command 来源分为 builtin、extension、prompt template 和 skill。extension command 由 runner 暴露，prompt template 来自加载的 prompts，skill command 统一用 `/skill:name`，组合逻辑在 [agent-session.ts#L2141](/source-code/packages/coding-agent/src/core/agent-session.ts#L2141)。

设计边界是：用户主动控制的动作适合 command；模型自动决策的动作适合 tool；纯文本复用适合 prompt template；带流程说明的工作方式适合 skill。不要把确认删除文件做成 tool 让模型自己决定，也不要把模型应自动调用的内部 API 做成只能用户手敲的 slash command。

## 15. Queue 的三种语义

pi 支持三种运行中输入语义。`steer` 是“当前 agent run 还没结束，把这句话插到下一轮模型调用前”；`followUp` 是“等当前 run 完全结束后，再当作后续用户消息”；`nextTurn` 是“下一次用户 turn 前插入”。harness API 分别在 [agent-harness.ts#L652](/source-code/packages/agent/src/harness/agent-harness.ts#L652)、[agent-harness.ts#L658](/source-code/packages/agent/src/harness/agent-harness.ts#L658)、[agent-harness.ts#L664](/source-code/packages/agent/src/harness/agent-harness.ts#L664)。

交互 UI 的默认行为是：Enter 在 streaming 时按 steer 处理，Alt+Enter 按 follow-up 处理，Alt+Up 把队列取回 editor。Enter 提交后如果正在 streaming，`prompt()` 要求明确传入 `streamingBehavior`，再走 `_queueSteer()` 或 `_queueFollowUp()`，见 [agent-session.ts#L1005](/source-code/packages/coding-agent/src/core/agent-session.ts#L1005)。真正入队会更新 UI 队列并调用 harness，见 [agent-session.ts#L1218](/source-code/packages/coding-agent/src/core/agent-session.ts#L1218) 和 [agent-session.ts#L1235](/source-code/packages/coding-agent/src/core/agent-session.ts#L1235)。

## 15. 为什么 extension command 不能排队

extension command 是立即执行的本机代码，可能打开 UI、改 session、改工具集、发消息或发起网络请求。如果把 `/deploy` 这种 command 当成 queued follow-up，执行时机就会从“用户按下 Enter 的现在”变成“若干 tool call 之后”，副作用边界会变得不可预测。

因此 `steer()` 和 `followUp()` 会先检查文本是不是 extension command；如果是就抛错，见 [agent-session.ts#L1182](/source-code/packages/coding-agent/src/core/agent-session.ts#L1182)、[agent-session.ts#L1202](/source-code/packages/coding-agent/src/core/agent-session.ts#L1202) 和 [agent-session.ts#L1252](/source-code/packages/coding-agent/src/core/agent-session.ts#L1252)。skill command 和 prompt template 是文本展开，允许排队；extension command 是代码执行，不允许排队。

## 15. Abort 的产品语义

Escape 不是“删除历史”，而是“停止当前运行并把未消费输入还给用户”。UI 在 abort 时会先清队列、把队列文本恢复到 editor，再调用 agent abort，见 [interactive-mode.ts#L3692](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L3692)。`AgentSession.abort()` 会中止 retry、调用 harness abort 并等待 idle，见 [agent-session.ts#L1388](/source-code/packages/coding-agent/src/core/agent-session.ts#L1388)。

harness abort 会清空 steer/follow-up queue、触发当前 run abort controller、更新队列并等待 idle，见 [agent-harness.ts#L936](/source-code/packages/agent/src/harness/agent-harness.ts#L936)。这保证了已经稳定写入的 session entry 留下，未消费队列不被静默吞掉，运行时回到可继续输入的状态。

## 15. Compaction、retry 与 branch summary 的 abort

不是所有 Escape 都打到同一个 controller。auto-compaction 有自己的 escape handler，见 [interactive-mode.ts#L2866](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2866)；retry 有自己的 escape handler，见 [interactive-mode.ts#L2932](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2932)；branch summary 也会临时接管 Escape 并调用 `abortBranchSummary()`，见 [interactive-mode.ts#L4314](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L4314)。

创造者视角下，这叫 phase-specific abort。不同 phase 的可恢复点不同，不能把所有取消都抽象成“一个全局 boolean”。

## 15. 自定义 command 的正确姿势

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function register(pi: ExtensionAPI) {
	pi.registerCommand("label-work", {
		description: "Set a session label before a risky change",
		handler: async (_args, ctx) => {
			const leaf = ctx.sessionManager.getLeafEntry();
			if (!leaf) return;
			ctx.setLabel(leaf.id, "checkpoint");
			ctx.ui.notify("Label saved", "info");
		},
	});
}
```

command handler 是用户主动触发的控制入口。它可以用 command context 做 session 操作，但应该尊重 phase：需要等待 agent 完成时先 `ctx.waitForIdle()`；需要取消结构性操作时用 `session_before_*` hook；不要在 streaming 中悄悄移动 tree leaf。

## 15. 复刻路径

最小可用：实现 `/help`、`/model`、`/settings` 这类同步 command，再实现 prompt template 的纯文本展开。

第二阶段：实现 streaming 时的 steer/follow-up 队列、队列 UI、dequeue、abort 恢复 editor。

生产级：加入 extension command、skill command、phase-specific abort、retry abort、compaction abort、branch summary abort，并把队列接受/消费写入 durable log，避免崩溃后丢失或重复发送。
