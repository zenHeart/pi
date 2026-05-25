# 第11章 记忆系统：文件、资源与会话共同构成记忆

## 11.1 pi 的记忆不是一个数据库表

pi 没有把“记忆”实现成单个 memory table。它的记忆来自多个层次：项目规则、用户配置、skills、prompt templates、session JSONL、compaction summary、branch summary、package 资源和工具输出。每一类记忆都有不同所有权和生命周期。

这个设计适合本地开发工具。规则和资源可以放进仓库，session 可以导出，skills 可以共享，packages 可以分发。复刻时不要过早引入向量库或数据库；先把可审计的文件系统记忆做好。

## 11.2 Context files

`AGENTS.md` / `CLAUDE.md` 是项目记忆。`loadProjectContextFiles()` 从 [resource-loader.ts#L75](/source-code/packages/coding-agent/src/core/resource-loader.ts#L75) 开始，它加载全局和项目路径上的 context files。它们进入 system prompt，告诉模型项目规则、测试命令、风格限制、协作约束。

这种记忆应该是稳定规则，不适合放临时任务状态。临时状态应该在 session；可复用流程应该在 skill；用户输入模板应该在 prompt template。

## 11.3 Skills

skills 是可复用能力说明。加载入口是 [skills.ts#L387](/source-code/packages/coding-agent/src/core/skills.ts#L387)。一个 skill 通常是 `SKILL.md`，包含 frontmatter name/description 和正文指令。加载器会校验名称和 description，见 [skills.ts#L92](/source-code/packages/coding-agent/src/core/skills.ts#L92) 和 [skills.ts#L117](/source-code/packages/coding-agent/src/core/skills.ts#L117)。

可见 skills 会被格式化进 system prompt，格式化逻辑从 [skills.ts#L335](/source-code/packages/coding-agent/src/core/skills.ts#L335) 开始。设置 `disable-model-invocation` 的 skill 不进入模型可选列表，只能显式 `/skill:name` 调用。这个机制让团队可以区分“模型可主动使用的技能”和“用户必须显式触发的流程”。

## 11.4 Prompt templates 与 packages

prompt templates 是用户输入模板，适合重复任务，如 code review、release note、bug triage。packages 是分发单元，可以贡献 extensions、skills、prompts、themes。资源加载器把 package manager 解析出的路径合并进资源加载过程，相关 reload 逻辑从 [resource-loader.ts#L321](/source-code/packages/coding-agent/src/core/resource-loader.ts#L321) 开始。

复刻时要区分：

- skill：教模型如何做一类任务。
- prompt template：快速生成一条用户请求。
- extension：运行时代码和副作用。
- theme：视觉配置。
- package：分发上述资源。

## 11.5 Session 记忆

session 保存过程记忆。它不仅保存 user/assistant/toolResult，还保存 model change、thinking level change、compaction、branch summary、custom entry、label、session info 等。`SessionEntry` 定义在 [session-manager.ts#L138](/source-code/packages/coding-agent/src/core/session-manager.ts#L138)。

session 记忆用于 resume、tree、fork、clone、export、eval、RL 数据提取。不要把 session 只看成聊天记录，它是 agent 的工作日志和恢复边界。

## 11.6 复刻原则

MVP：context file、session JSONL、manual prompt snippets。

生产级：skills、prompt templates、packages、resource reload、source metadata、diagnostics、compaction/branch summaries、custom messages、resource enable/disable、project/global layering。
