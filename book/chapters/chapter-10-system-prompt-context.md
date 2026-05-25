# 10. System Prompt、AGENTS.md 与项目上下文

## 10. 本章解决的问题

coding agent 的行为不只由用户 prompt 决定。system prompt 定义身份、工具、规则、docs 指引、项目上下文、skills 概览、当前日期和 cwd。对新手来说，它像“开工前贴在桌上的规则”；对 agent 创造者来说，它是每次 provider request 的高优先级输入，必须从资源加载、用户配置、扩展和当前工具集稳定构造出来。

构造入口是 `buildSystemPrompt()`，见 [system-prompt.ts#L28](/source-code/packages/coding-agent/src/core/system-prompt.ts#L28)。context file 发现入口是 `loadProjectContextFiles()`，见 [resource-loader.ts#L75](/source-code/packages/coding-agent/src/core/resource-loader.ts#L75)。资源加载器在 `reload()` 中同时刷新 extensions、skills、prompt templates、themes、AGENTS files、SYSTEM 和 APPEND_SYSTEM，见 [resource-loader.ts#L321](/source-code/packages/coding-agent/src/core/resource-loader.ts#L321)。

## 10. 上下文来源

pi 会从 agent 配置目录加载全局 `AGENTS.md` 或 `CLAUDE.md`，再从 cwd 向上遍历祖先目录，收集项目级 `AGENTS.md` 或 `CLAUDE.md`。代码先加入全局文件，再把祖先文件 `unshift` 成从上到下、越靠近 cwd 越靠后的顺序，见 [resource-loader.ts#L85](/source-code/packages/coding-agent/src/core/resource-loader.ts#L85) 和 [resource-loader.ts#L97](/source-code/packages/coding-agent/src/core/resource-loader.ts#L97)。这个顺序让通用组织规则先出现，局部项目规则后出现。

`.pi/SYSTEM.md` 或全局 `SYSTEM.md` 可以替换默认 system prompt，发现逻辑见 [resource-loader.ts#L853](/source-code/packages/coding-agent/src/core/resource-loader.ts#L853)。`.pi/APPEND_SYSTEM.md` 或全局 `APPEND_SYSTEM.md` 用于追加规则，见 [resource-loader.ts#L867](/source-code/packages/coding-agent/src/core/resource-loader.ts#L867)。这个设计让团队规则可放进仓库，个人规则可留在本机；也让“完全替换 agent persona”和“补充一条项目限制”成为两个不同操作。

## 10. 模型看到什么

模型看到的是构造后的 system prompt、当前消息上下文、可用工具描述、skill 概览以及被转换后的 user/assistant/toolResult。低层 stream 边界只把 `context.systemPrompt`、转换后的 messages 和 tools 交给 provider，见 [agent-loop.ts#L275](/source-code/packages/agent/src/agent-loop.ts#L275)。它看不到 session header、label、settings、extension 私有状态，除非这些状态被显式转成消息或被 extension 注入 system prompt。

默认 prompt 会列出 visible tools。一个工具只有在调用方提供 one-line snippet 时才进入 “Available tools”，见 [system-prompt.ts#L87](/source-code/packages/coding-agent/src/core/system-prompt.ts#L87)。这不是安全边界，真正可调用工具由 runtime 的 tool registry 决定；prompt 只是帮助模型选择。默认 prompt 还会附带 pi 文档位置和“何时读 docs”的指引，见 [system-prompt.ts#L121](/source-code/packages/coding-agent/src/core/system-prompt.ts#L121)。

project context 会放进 `<project_context>` 和 `<project_instructions path="...">` 标签中，见 [system-prompt.ts#L157](/source-code/packages/coding-agent/src/core/system-prompt.ts#L157)。skills 概览只有在 `read` 工具可用时才加入，因为 progressive disclosure 依赖模型能读取完整 skill 文件，见 [system-prompt.ts#L167](/source-code/packages/coding-agent/src/core/system-prompt.ts#L167)。当前日期和 cwd 最后追加，见 [system-prompt.ts#L171](/source-code/packages/coding-agent/src/core/system-prompt.ts#L171)。

## 10. 为什么要分 SYSTEM 和 APPEND_SYSTEM

替换 system prompt 适合自定义完整 persona 和协议；追加 system prompt 适合团队补充规则。新手常见错误是用 append 覆盖默认安全和工具指南，或用 SYSTEM 忘记加入 cwd、date、skills、工具说明。pi 的 custom prompt 分支仍会追加 append section、project context、skills、date 和 cwd，见 [system-prompt.ts#L53](/source-code/packages/coding-agent/src/core/system-prompt.ts#L53)。这降低了误配风险，但不会自动恢复默认工具指南；完全替换仍然是高级操作。

从 agent 创造者视角，system prompt 构造有两个边界：

- 它描述工具，但不授权工具。授权和 allowlist 属于 runtime tools 配置。
- 它装载规则，但不保证执行。模型可能遗忘或冲突，关键安全策略必须放在 tool hook、extension 或外部 sandbox。

extensions 可以在 `before_agent_start` 中查看并链式修改 system prompt。扩展事件里会带 `systemPromptOptions`，包括 customPrompt、selectedTools、toolSnippets、contextFiles 和 skills；这让扩展能基于同一份结构化输入修改 prompt，而不是重新扫描资源。对应事件类型见 [types.ts#L625](/source-code/packages/coding-agent/src/core/extensions/types.ts#L625)。

## 10. 实操清单

项目规则写 `AGENTS.md`，agent 专属系统规则写 `.pi/SYSTEM.md`，补充限制写 `.pi/APPEND_SYSTEM.md`。不要把 API key、一次性任务、长日志写进 system prompt。需要复用任务流程时用 prompt template 或 skill。

失败边界：system prompt 过长会挤压任务上下文；规则冲突会让模型优先级难判断；把秘密写进 context file 会直接送进 provider；禁用 `read` 时 skills 概览不会进入 prompt。复刻时 MVP 可以先支持一个项目 `AGENTS.md` 和追加 prompt；生产级再支持祖先目录、global/project 分层、SYSTEM/APPEND_SYSTEM、extension 注入和 reload。
