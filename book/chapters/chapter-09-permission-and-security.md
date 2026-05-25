# 第9章 权限与安全：pi 的核心克制与扩展责任

## 9.1 先校准事实

pi 核心不内置权限弹窗。usage 文档明确说 permission popup、plan mode、todo、background bash 等不是内置核心能力。pi 的安全策略是：核心提供可拦截工具边界、工具选择、资源来源诊断、扩展安全警告；具体审批、沙箱、远程执行、checkpoint 工作流由 extensions/packages 或外部环境实现。

这个选择不是忽略安全，而是避免把一种产品策略硬编码到通用 harness。不同团队对权限的要求差异很大：个人 CLI、企业远程执行、CI eval runner、IDE 插件的安全边界都不同。

## 9.2 工具前拦截

低层 loop 在执行工具前调用 `beforeToolCall`，见 [agent-loop.ts#L579](/source-code/packages/agent/src/agent-loop.ts#L579)。`AgentSession` 把它接到 extension runner 的 `tool_call` 事件，相关接入在 [agent-session.ts#L397](/source-code/packages/coding-agent/src/core/agent-session.ts#L397)。扩展可以允许、修改、阻止工具调用，并把阻止原因作为 tool result 回给模型。

这个边界适合实现：

- 写文件前确认。
- 阻止危险 shell 命令。
- 限制路径范围。
- 审计工具参数。
- 根据工作区状态强制 checkpoint。

## 9.3 工具后拦截

工具执行后还有 `afterToolCall`，`AgentSession` 接到 `tool_result` 事件的位置见 [agent-session.ts#L418](/source-code/packages/coding-agent/src/core/agent-session.ts#L418)。它可以修改结果、脱敏输出、记录审计、补充提示。

前拦截回答“能不能做”；后拦截回答“结果能不能给模型和用户看”。例如 shell 输出里包含 secret，工具本身成功了，但结果需要脱敏后再进入模型上下文。

## 9.4 Extension 本身是信任边界

extensions 是本地 TypeScript 代码。它们可以注册工具、命令、provider、UI、hook，并可能执行本地命令。官方 extensions 文档要求只安装可信来源。package 也要按代码依赖看待。

复刻时要明确：

- extension/package 安装是代码执行风险。
- settings 中启用的资源应该可审计。
- package source、版本、git ref 应可追踪。
- 远程执行、安全审批、secret broker 应是独立能力，不应靠 prompt 约束。

## 9.5 沙箱不是 prompt

“告诉模型不要删除文件”不是安全机制。安全机制必须在模型之外执行。可以选择：

- 工具 allowlist：只启用只读工具。
- extension approval：工具前确认。
- 容器/VM：限制文件系统和网络。
- remote executor：把副作用放到可审计后端。
- git checkpoint：每次危险操作前保存回滚点。
- CI runner：只在临时工作区运行。

pi 核心保留工具和事件边界，允许这些策略被实现，但不假设所有用户需要同一套策略。

## 9.6 复刻原则

MVP：工具 allowlist、路径解析、shell timeout、abort、输出截断、错误回灌。

生产级：before/after tool hook、secret redaction、package trust policy、extension diagnostics、remote execution adapter、checkpoint extension、audit log、sandbox profiles、read-only review mode。
