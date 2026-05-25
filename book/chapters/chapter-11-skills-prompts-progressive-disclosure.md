# 11. Skills、Prompt Templates 与 Progressive Disclosure

## 11. 本章解决的问题

上下文窗口有限，不能把所有工作流说明都塞进 system prompt。skills 和 prompt templates 解决“按需加载流程”的问题。对新手来说，prompt template 是“展开一段常用输入”，skill 是“让 agent 先读一本小手册再做事”。对 agent 创造者来说，二者都是上下文预算管理：把 always-on 信息压到最小，把长说明延迟到任务匹配时加载。

skill 加载逻辑在 [skills.ts#L168](/source-code/packages/coding-agent/src/core/skills.ts#L168) 和 [skills.ts#L387](/source-code/packages/coding-agent/src/core/skills.ts#L387)。prompt template 加载和展开逻辑在 [prompt-templates.ts#L194](/source-code/packages/coding-agent/src/core/prompt-templates.ts#L194) 和 [prompt-templates.ts#L269](/source-code/packages/coding-agent/src/core/prompt-templates.ts#L269)。

## 11. Skills

skill 是目录或 Markdown 文件，至少包含名称和描述。`loadSkillFromFile()` 解析 frontmatter、校验 name/description，并保留 filePath、baseDir、sourceInfo，见 [skills.ts#L277](/source-code/packages/coding-agent/src/core/skills.ts#L277)。缺少 description 的 skill 不加载；大多数规范问题只产生 warning，方便跨 harness 共享，见 [skills.ts#L304](/source-code/packages/coding-agent/src/core/skills.ts#L304)。

启动时 pi 只把 skill 名称、描述和位置放入 system prompt；任务匹配时模型用 `read` 加载完整 `SKILL.md`。格式化逻辑在 `formatSkillsForPrompt()`，见 [skills.ts#L335](/source-code/packages/coding-agent/src/core/skills.ts#L335)。这里会过滤 `disable-model-invocation` 为 true 的 skill，见 [skills.ts#L336](/source-code/packages/coding-agent/src/core/skills.ts#L336)。这叫 progressive disclosure：少量 always-on 元数据，完整说明按需读取。

```markdown
---
name: code-review
description: Review TypeScript changes for bugs, security issues, and missing tests.
---

# Code Review

Read the diff first. Report findings before summary. Include file and line references.
```

skill 可以带 `scripts/`、`references/`、`assets/`，但脚本执行仍然通过工具发生，不能绕过安全边界。system prompt 会明确要求相对路径按 skill 文件所在目录解析，见 [skills.ts#L343](/source-code/packages/coding-agent/src/core/skills.ts#L343)。这避免模型把 skill 里的 `scripts/foo.ts` 错解成当前项目路径。

资源发现也有失败边界。pi 会在多个来源合并 skills，并用 skill name 做 collision 检测；同名时保留先发现的 skill 并产出 diagnostic，见 [skills.ts#L397](/source-code/packages/coding-agent/src/core/skills.ts#L397)。目录扫描遇到 `SKILL.md` 后会把该目录当作 skill root，不再继续递归，避免把一个 skill 的内部 references 当成多个 skill，规则见 [skills.ts#L161](/source-code/packages/coding-agent/src/core/skills.ts#L161)。

## 11. Prompt templates

prompt template 是 Markdown 片段，文件名变成 slash command。它适合复用一段用户指令，不适合包含复杂工具或长期资源。加载时文件名去掉 `.md` 作为 name；description 来自 frontmatter，缺失时取正文第一行，见 [prompt-templates.ts#L104](/source-code/packages/coding-agent/src/core/prompt-templates.ts#L104)。默认目录只做非递归扫描，见 [prompt-templates.ts#L138](/source-code/packages/coding-agent/src/core/prompt-templates.ts#L138)。

参数支持 `$1`、`$@`、`$ARGUMENTS`、`${@:N}` 和 `${@:N:L}`。解析参数在 [prompt-templates.ts#L24](/source-code/packages/coding-agent/src/core/prompt-templates.ts#L24)，替换逻辑在 [prompt-templates.ts#L68](/source-code/packages/coding-agent/src/core/prompt-templates.ts#L68)。展开入口会匹配以 `/name` 开头的输入，并把后续字符串当参数，见 [prompt-templates.ts#L269](/source-code/packages/coding-agent/src/core/prompt-templates.ts#L269)。

```markdown
---
description: Create a Vue component with tests
argument-hint: "<ComponentName>"
---
Create a Vue component named $1. Include props, states, accessibility notes, and focused tests.
```

prompt template 是用户主动触发，不是模型自动加载。它不会在 system prompt 里常驻，也不会携带脚本、assets 或 refs 的自动路径语义。如果你的流程需要模型先读完整说明、再按步骤执行，就用 skill；如果只是把 `/review` 展开成一段 review 指令，用 template。

## 11. 设计边界

skill 是“模型可按需学习的能力包”，prompt template 是“用户主动展开的提示片段”。extension 是“运行时代码扩展”。package 是“分发资源的容器”。四者不能混用，否则会出现 prompt 太长、代码权限不清、团队共享困难等问题。

站在 pi agent 创造者视角，progressive disclosure 的核心不变量是：

- system prompt 只放索引，不放整本手册。
- 模型需要完整 skill 时必须通过 `read` 明确读取，留下可观察的 tool call。
- skill 内脚本和引用文件只是资源，不是自动执行权限。
- template 展开后就是普通用户输入，不应该偷偷注册工具或改系统状态。

失败边界：模型不一定会在匹配任务时主动读取 skill，所以 `/skill:name` 命令是强制入口；skill 描述写得太泛会误触发，写得太窄会漏触发；template 参数替换不是 shell，不应该承载复杂解析；`disable-model-invocation` 会让 skill 从 prompt 索引中消失，只能用户显式调用。复刻时 MVP 可以先实现本地 skill 目录和 `/template` 展开；生产级再做包资源、collision diagnostics、sourceInfo、`disable-model-invocation` 和 extension-provided paths。
