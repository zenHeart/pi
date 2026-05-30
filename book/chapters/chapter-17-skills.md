# 17. Skills 与模型行为注入

## 17.1 Skill 解决什么问题

Skill 是把专家流程、背景知识、脚本入口和参考材料打包给模型看的能力说明。`packages/coding-agent/docs/skills.md` 的定义是 `self-contained capability packages that the agent loads on-demand`。这句话的重点是 on-demand：Pi 启动时不会把所有 SKILL.md 全文塞进上下文，而是先把 name、description、location 暴露给模型；任务匹配时，模型再用 read 工具读取完整 skill。

对前端工程师来说，skill 类似“可发现的工程手册”，而不是插件。它不能自己订阅事件，不能注册 UI，也不能直接拦截工具调用。它影响的是模型如何理解任务、该读哪些资料、该运行哪些脚本。这个边界由数据结构体现：`Skill` 只有 `name`、`description`、`filePath`、`baseDir`、`sourceInfo`、`disableModelInvocation`，见 [skills.ts#L74](packages/coding-agent/src/core/skills.ts#L74)。

## 17.2 目录、格式与触发

Pi 支持多类 skill 来源。docs 中的真实路径包括 `~/.pi/agent/skills/`、`~/.agents/skills/`、`.pi/skills/`、`.agents/skills/`、package 的 `skills/`、settings 的 `skills` 数组，以及 CLI 的 `--skill <path>`。Skill 标准结构是目录里的 `SKILL.md`，frontmatter 至少包含 `name` 和 `description`；Pi 也允许直接 `.md` 文件作为 skill，但不同目录的 root `.md` 发现规则不同。

加载流程先扫描目录，遇到 `SKILL.md` 就把该目录视为 skill root 并停止向下递归，见 [skills.ts#L160](packages/coding-agent/src/core/skills.ts#L160)。这让一个 skill 可以拥有 `scripts/`、`references/`、`assets/` 等子目录，而不会把内部参考文件误当成新的 skill。frontmatter 解析后，缺少 description 的 skill 不加载；name 格式等问题只生成 warning，见 [skills.ts#L277](packages/coding-agent/src/core/skills.ts#L277) 和 [skills.ts#L304](packages/coding-agent/src/core/skills.ts#L304)。

触发有两种。默认方式是模型看到 `<available_skills>` 中的描述后，自己决定是否读取。强制方式是 `/skill:name`，docs 说明 arguments 会追加为 `User: <args>`。`enableSkillCommands` 可以通过 `/settings` 或 settings JSON 控制。

## 17.3 Progressive Disclosure 的实现

Skill 的核心设计是 progressive disclosure。启动时，Pi 不注入全部 skill 正文，而是用 XML 列出可用 skill 的名称、描述和位置。`formatSkillsForPrompt()` 生成的提示明确要求模型 `Use the read tool to load a skill's file when the task matches its description`，并要求相对路径按 skill directory 解析，见 [skills.ts#L335](packages/coding-agent/src/core/skills.ts#L335)。

System prompt 构建时只有 read 工具可用才加入 skills。自定义 system prompt 分支会检查 `selectedTools` 是否包含 `read`；默认分支也用 `hasRead` 控制是否追加 skills，见 [system-prompt.ts#L70](packages/coding-agent/src/core/system-prompt.ts#L70) 和 [system-prompt.ts#L165](packages/coding-agent/src/core/system-prompt.ts#L165)。这是一个重要的不变量：如果模型没有读取文件的能力，告诉它 skill 文件位置没有意义。

`disable-model-invocation` 是另一个边界。加载器会保存这个字段，format 时过滤掉它们，见 [skills.ts#L316](packages/coding-agent/src/core/skills.ts#L316) 和 [skills.ts#L336](packages/coding-agent/src/core/skills.ts#L336)。这类 skill 只能通过 `/skill:name` 主动调用，适合不希望模型自动触发的流程。


**生命周期图**

```mermaid
flowchart LR
    A["配置与包"] --> B["Skills"]
    B --> C["Prompt Templates"]
    C --> D["Extensions"]
    D --> E["Skills 与模型行为注入 的可验证结果"]
```

**源码责任表**

| 环节 | 系统责任 | 源码证据 | 读源码时要确认什么 |
|---|---|---|---|
| 配置与包 | 声明资源来源和优先级 | [resource-loader.ts#L398](packages/coding-agent/src/core/resource-loader.ts#L398) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Skills | 模型行为说明书 | [resource-loader.ts#L510](packages/coding-agent/src/core/resource-loader.ts#L510) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Prompt Templates | 可复用任务入口 | [resource-loader.ts#L533](packages/coding-agent/src/core/resource-loader.ts#L533) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Extensions | 代码能力与 UI/provider 注册 | [types.ts#L1084](packages/coding-agent/src/core/extensions/types.ts#L1084) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |

**关键代码说明**

读源码时不要只顺着函数名跳转，而要检查四个边界：输入边界、状态边界、裁决边界、输出边界。输入边界回答“谁把数据交进来”；状态边界回答“哪些信息会跨 turn、跨 session 或跨进程保留”；裁决边界回答“谁有权继续、停止、执行或拒绝”；输出边界回答“结果给人看、给模型看，还是给外部系统看”。本章涉及的源码只有放进这四个边界中才有解释力。

## 17.4 为什么 skill 不是 prompt template

Prompt template 是用户主动输入 `/name` 后展开成完整 prompt；skill 是模型先看到简短描述，再按需读取详细说明。二者都来自 ResourceLoader，但进入上下文的时机不同。Template 展开后成为用户消息；skill 列表成为 system prompt 的可用能力索引；完整 skill 只有在模型读取文件后才进入上下文。

这解释了它们的不同用途。团队固定任务入口，比如 `/review`，适合 prompt template。需要模型在“看到 PDF 任务时自动加载文档处理流程”或“遇到 Vue 任务先读取最佳实践”，适合 skill。Skill 的 description 因此是触发器，不是摘要。docs 也强调：`The description determines when the agent loads the skill`，过泛的 description 会让模型误触发或不触发。

这个设计也控制 token 成本。一个团队可能安装几十个 skill，如果全文都进 system prompt，模型每轮都要背完整手册；只注入描述，就能让上下文保持小而可发现。第 17 章必须放在第 16 章之后，因为读者需要先理解“文本展开型复用”，再理解“模型可发现型复用”。


**创建者视角的设计不变量**

资源系统是 Pi 小内核的主要出口。稳定行为进入核心，团队差异进入资源；资源必须保留 sourceInfo、加载顺序和冲突边界，否则用户无法解释为什么某个 skill、命令、主题或工具生效。

**如果省略本章会发生什么**

省略本章，读者会把 Skills 与模型行为注入 当成单点功能，而不是 Pi 架构中的责任边界。直接后果是：使用时不知道该改配置、写资源、写扩展、接 provider 还是调用 SDK；排查时也会把 provider、工具、TUI、session 和资源加载混为一谈。专家级学习必须把每章能力放回系统生命周期中验证。

## 17.5 失败模式与安全边界

Skill 的安全风险不是加载时执行代码，而是它可以指导模型执行任何动作。docs 中 `Security` 段落说 skills may include executable code the model invokes，所以安装第三方 skill 要像审查脚本一样审查内容。

常见失败模式有四个。第一，description 缺失，skill 不会加载。第二，同名 collision，先出现的 skill 获胜，后者只留下诊断，见 [skills.ts#L410](packages/coding-agent/src/core/skills.ts#L410)。第三，把参考文件放错层级，导致相对路径说明无法按 skill directory 解析。第四，关闭 read 工具后还期待模型自动使用 skill；此时 system prompt 不会注入 skill 列表。

排查时先问：这个 skill 是否出现在 `<available_skills>`；是否被 `disable-model-invocation` 隐藏；是否存在同名 collision；模型是否真的读了 `SKILL.md`；skill 内引用的 `scripts/` 或 `references/` 是否相对 skill 根目录存在。

## 17.6 本章训练

设计一个 `frontend-audit` skill：frontmatter 的 `description` 写清“Use when reviewing React/Vue UI code for accessibility, responsive layout, and state handling”；正文只放审查步骤，详细 checklist 放 `references/checklist.md`。然后解释为什么这里用 skill，而不是 prompt template：你希望模型在相关任务中自动发现它，并按需读取 checklist，而不是要求用户每次记住 `/frontend-audit`。

完成训练后，应能说清本章在全书中的必要性：它连接 ResourceLoader 的资源发现与 system prompt 的行为注入，说明 Pi 如何在不扩展本地代码权限的情况下扩展模型能力。


**专家验收任务**

完成本章后，读者应该能交付三件东西：一张自己画出的 Skills 与模型行为注入 数据流图；一份包含源码链接、输入、输出、失败边界的责任表；一个最小实践任务，证明自己能在不改错层级的情况下使用或扩展该能力。若三件事缺一件，就说明还停留在“会用命令”的阶段，没有达到能设计和审计 Pi 方案的水平。

