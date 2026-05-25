# 第15章 Skills、Prompt Templates、Themes 与 Packages

## 15.1 为什么资源要分层

pi 的扩展生态不是“所有东西都是插件”。它把资源分成四类：skills、prompt templates、themes、extensions，再用 packages 分发。这样做的原因是不同资源的风险和生命周期不同：Markdown 指令不等于本地代码；输入模板不等于模型可主动调用的技能；视觉主题不应该影响 agent 行为。

资源加载器在 reload 时统一加载这些资源，核心流程从 [resource-loader.ts#L321](/source-code/packages/coding-agent/src/core/resource-loader.ts#L321) 开始。

## 15.2 Skills

skills 是可复用任务知识。`loadSkills()` 从 [skills.ts#L387](/source-code/packages/coding-agent/src/core/skills.ts#L387) 开始，会加载用户目录、项目目录、显式路径和 package 贡献路径。每个 skill 通常是一个 `SKILL.md`，加载器会解析 frontmatter、校验 name/description、记录 sourceInfo。

模型可见的 skills 会通过 `formatSkillsForPrompt()` 放入 system prompt，入口见 [skills.ts#L335](/source-code/packages/coding-agent/src/core/skills.ts#L335)。用户也可以显式 `/skill:name` 调用。复刻时要保留这两个入口：模型自动发现和用户显式触发。

## 15.3 Prompt templates

prompt templates 是用户输入模板，不是系统能力。它们适合重复任务：写 release note、做 code review、生成 issue comment。模板可以有参数提示，展开后变成用户消息进入 agent。

区别很关键：skill 教模型如何做，prompt template 帮用户快速说出要做什么。把模板做成 skill 会污染模型可选能力；把 skill 做成模板会失去模型按需调用的能力。

源码里 prompt template 不是简单字符串替换。类型定义从 [prompt-templates.ts#L11](/source-code/packages/coding-agent/src/core/prompt-templates.ts#L11) 开始，加载入口在 [prompt-templates.ts#L194](/source-code/packages/coding-agent/src/core/prompt-templates.ts#L194)，展开入口在 [prompt-templates.ts#L269](/source-code/packages/coding-agent/src/core/prompt-templates.ts#L269)。loader 会解析 frontmatter、文件路径 sourceInfo、参数声明、命令名，并把 diagnostics 留给 UI 或日志。

`AgentSession` 会在处理用户输入时展开模板：普通输入里的模板由 [agent-session.ts#L1000](/source-code/packages/coding-agent/src/core/agent-session.ts#L1000) 附近处理；以 `/` 开头的资源命令也会进入同一套 expand 逻辑，避免“prompt 模板命令”和“普通模板引用”行为不一致。资源加载器合并 prompt paths 的逻辑在 [resource-loader.ts#L436](/source-code/packages/coding-agent/src/core/resource-loader.ts#L436)，去重逻辑在 [resource-loader.ts#L800](/source-code/packages/coding-agent/src/core/resource-loader.ts#L800)。

对前端工程师来说，可以把 prompt template 看成命令面板中的“可参数化输入片段”：

- name 决定命令名和补全。
- description 决定 UI 提示。
- arguments 决定参数提示和替换规则。
- content 是最终追加到用户消息里的自然语言。
- sourceInfo 决定它来自用户、项目、package 还是 CLI 显式路径。

## 15.4 Themes 与渲染

themes 改变终端视觉，不改变模型行为。theme 系统从 [theme.ts#L322](/source-code/packages/coding-agent/src/modes/interactive/theme/theme.ts#L322) 的 `Theme` 类开始，加载 custom theme 的入口在 [theme.ts#L602](/source-code/packages/coding-agent/src/modes/interactive/theme/theme.ts#L602)。资源加载器也会加载 theme 路径，见 [resource-loader.ts#L552](/source-code/packages/coding-agent/src/core/resource-loader.ts#L552)。

主题是产品体验的一部分，但不应承担安全、权限或 agent 行为逻辑。输出风格应通过 system prompt 或 renderer；颜色和布局才属于 theme。

## 15.5 Packages

pi packages 是分发单元，可以来自 npm、git、本地路径，贡献 extensions、skills、prompts、themes。package manager 负责解析来源、安装、更新、启用/禁用资源。复刻时要把 package 当依赖代码处理：版本、来源、锁定、生命周期脚本、信任边界都要审计。

团队场景中，packages 的价值是把工作流标准化：安全审批 extension、公司代码规范 skill、常用 prompt template、统一 theme 可以一起分发。

package manager 的接口从 [package-manager.ts#L92](/source-code/packages/coding-agent/src/core/package-manager.ts#L92) 开始，默认实现从 [package-manager.ts#L757](/source-code/packages/coding-agent/src/core/package-manager.ts#L757) 开始。核心能力包括：

- list：读取当前 settings 中配置的 packages，入口见 [package-manager.ts#L928](/source-code/packages/coding-agent/src/core/package-manager.ts#L928)。
- install / installAndPersist：安装来源并写入 settings，入口见 [package-manager.ts#L956](/source-code/packages/coding-agent/src/core/package-manager.ts#L956) 和 [package-manager.ts#L979](/source-code/packages/coding-agent/src/core/package-manager.ts#L979)。
- remove / removeAndPersist：移除安装与配置，入口见 [package-manager.ts#L984](/source-code/packages/coding-agent/src/core/package-manager.ts#L984) 和 [package-manager.ts#L1003](/source-code/packages/coding-agent/src/core/package-manager.ts#L1003)。
- update：更新已安装来源，入口见 [package-manager.ts#L1008](/source-code/packages/coding-agent/src/core/package-manager.ts#L1008)。
- dedupePackages：避免同一来源重复生效，入口见 [package-manager.ts#L1636](/source-code/packages/coding-agent/src/core/package-manager.ts#L1636)。
- collectPackageResources：读取 package manifest 贡献的 extensions、skills、prompts、themes，入口见 [package-manager.ts#L1997](/source-code/packages/coding-agent/src/core/package-manager.ts#L1997)。
- readPiManifest：解析 package 内的 pi manifest，入口见 [package-manager.ts#L2121](/source-code/packages/coding-agent/src/core/package-manager.ts#L2121)。

这解释了 packages 文档为什么反复强调 manifest、source、scope 和 enable/disable。包不是“下载一个文件夹”，而是把资源路径贡献给资源加载器，并让 session reload 后形成新的可用能力。

## 15.6 资源发现与优先级

extension 还可以通过 `resources_discover` 动态贡献 skill/prompt/theme 路径。事件类型在 [types.ts#L495](/source-code/packages/coding-agent/src/core/extensions/types.ts#L495) 附近定义，handler 返回 `skillPaths`、`promptPaths`、`themePaths`。hooks 文档强调这不是普通 hook，而是资源注册阶段：多个 extension 的结果会聚合，随后由资源加载器统一加载和去重。

复刻时要明确资源优先级，否则会出现同名 skill 或 template 随机覆盖。一个合理顺序是：CLI 显式路径优先，项目级覆盖全局，package 提供默认能力，extension discover 只追加路径并保留 sourceInfo。冲突时要产出 diagnostics，不要静默吞掉。

## 15.7 复刻原则

MVP：项目 `.pi/skills` 和 `.pi/prompts`；手动 reload；简单主题。

生产级：全局/项目/package 多来源；资源 diagnostics；name collision；enable/disable；sourceInfo；packages install/update/remove/list/config；资源热重载；安全提示。
