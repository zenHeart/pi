# 第5章 System Prompt：模型看到的操作系统说明书

## 5.1 System Prompt 的职责

System prompt 不是“人设”。在 coding agent 中，它是模型看到的操作系统说明书：当前运行环境、项目规则、工具使用方式、安全边界、输出约束、可用 skills、上下文文件、日期、cwd、模型相关说明都在这里组合。

pi 的构建函数是 [system-prompt.ts#L28](/source-code/packages/coding-agent/src/core/system-prompt.ts#L28)。`AgentSession` 在重建系统提示时调用它，入口见 [agent-session.ts#L878](/source-code/packages/coding-agent/src/core/agent-session.ts#L878) 和 [agent-session.ts#L911](/source-code/packages/coding-agent/src/core/agent-session.ts#L911)。

## 5.2 输入来源

pi 的 system prompt 来源包括：

- 默认 coding agent prompt。
- CLI `--system-prompt` 或 `SYSTEM.md`。
- CLI `--append-system-prompt` 或 `APPEND_SYSTEM.md`。
- `AGENTS.md` / `CLAUDE.md` context files。
- 当前 cwd 和日期。
- 当前 active tools 的说明。
- 已加载 skills 的索引。
- prompt templates 和 resources 的可用信息。
- extensions 的 `before_agent_start` 修改。

资源加载器负责发现这些文件和资源，`getSystemPrompt()` 和 `getAppendSystemPrompt()` 分别在 [resource-loader.ts#L273](/source-code/packages/coding-agent/src/core/resource-loader.ts#L273) 与 [resource-loader.ts#L277](/source-code/packages/coding-agent/src/core/resource-loader.ts#L277)。

## 5.3 为什么 prompt 不能写死

写死 system prompt 是最常见的 demo 级错误。pi 的 prompt 必须可重建，原因是运行时能力会变：

- 用户通过 `/reload` 重新加载 context files、extensions、skills、prompts。
- active tools 变化后，工具说明必须同步变化。
- extension 可以在 `before_agent_start` 注入规则或消息。
- session switch/fork/tree 后，cwd、资源和上下文可能变化。
- SDK/RPC 创建 session 时可以自定义 resource loader。

所以 prompt builder 应该是纯组合函数，loop 不应该直接拼字符串。loop 只消费当前 turn snapshot 中已经确定的 system prompt。

## 5.4 Context files 与系统提示文件

`AGENTS.md` / `CLAUDE.md` 是项目规则，通常告诉 agent 如何运行检查、代码风格、提交要求、测试限制。`SYSTEM.md` 更像替换默认系统提示；`APPEND_SYSTEM.md` 是追加规则。pi 会从全局目录、父目录链和当前项目加载 context files，加载逻辑从 [resource-loader.ts#L75](/source-code/packages/coding-agent/src/core/resource-loader.ts#L75) 开始。

设计上要区分三种文本：

- 永久运行规则：适合 context files。
- 单次任务模板：适合 prompt templates。
- 可复用流程知识：适合 skills。

全部塞进 system prompt 会让上下文不可控，也会让资源来源不可审计。

## 5.5 扩展如何介入

扩展的 `before_agent_start` 可以修改 system prompt、注入 persistent message 或调整本轮上下文。runner 中对应逻辑从 [runner.ts#L924](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L924) 开始。

这比让扩展直接修改全局字符串更安全。扩展拿到的是事件和上下文，runner 决定如何合并结果；session 也能记录扩展造成的可见变化。对于自定义 harness，关键不是“开放一个字符串变量”，而是定义清楚 hook 的输入、输出、时机和错误策略。

## 5.6 复刻原则

MVP prompt builder：接收 `cwd`、`tools`、`contextFiles`、`skills`、`date`，输出一个字符串。工具说明来自工具定义，不能手写重复描述。

生产级 prompt builder：支持 `SYSTEM.md`、`APPEND_SYSTEM.md`、全局/项目 context files、resource reload、extension hook、custom resource loader、prompt cache、不同模型的能力差异、系统提示来源诊断。
