# 16. Packages、资源发现、优先级与冲突处理

## 16. 本章解决的问题

pi 不把所有能力塞进核心，而是让 extensions、skills、prompt templates 和 themes 通过 package 分发。对前端读者来说，可以把 package 理解成“一个 npm 组件库”，但它不只提供 UI 组件，还可能提供本机代码、模型指令、prompt 和主题。

这带来两个系统问题：第一，资源来自很多地方，必须能稳定发现；第二，不同来源可能同名冲突，必须有可解释的优先级。`DefaultPackageManager` 是安装和解析 package 的入口，见 [package-manager.ts#L757](/source-code/packages/coding-agent/src/core/package-manager.ts#L757)；`DefaultResourceLoader` 是把解析结果加载成运行时资源的入口，见 [resource-loader.ts#L152](/source-code/packages/coding-agent/src/core/resource-loader.ts#L152)。

## 16. 资源来源

资源可以来自全局目录、项目目录、settings 显式路径、CLI 临时路径、npm package、git package、本地 package，以及 extension 在 `resources_discover` 事件中动态提供的路径。

package 可以在 `package.json` 的 `pi` 字段声明资源，字段包括 `extensions`、`skills`、`prompts` 和 `themes`，结构定义在 [package-manager.ts#L147](/source-code/packages/coding-agent/src/core/package-manager.ts#L147)。没有 manifest 时，pi 也会按约定目录发现资源，比如 `extensions/`、`skills/`、`prompts/`、`themes/`。

## 16. Context files 的特殊性

`AGENTS.md` 或 `CLAUDE.md` 不是 package resource，但它们也是系统 prompt 的重要输入。pi 会先加载 global agent dir 下的 context file，再从 cwd 往父目录收集项目 context file，最后按从上到下的项目路径追加，逻辑在 [resource-loader.ts#L75](/source-code/packages/coding-agent/src/core/resource-loader.ts#L75)。

这和前端路由里的 layout 继承很像：全局规则先出现，越靠近当前项目的规则越具体。区别是这些文本会进入模型上下文，所以错误或过期的规则会直接影响 agent 行为。

## 16. Resource loader 的启动流程

`DefaultResourceLoader.reload()` 会先 reload settings，再让 package manager resolve 已安装 package 和 CLI 临时 extension source，见 [resource-loader.ts#L321](/source-code/packages/coding-agent/src/core/resource-loader.ts#L321)。它会筛出 enabled resources，并为路径保留 source metadata，见 [resource-loader.ts#L333](/source-code/packages/coding-agent/src/core/resource-loader.ts#L333)。

随后 loader 分别更新 skills、prompts、themes 和 extensions。skill path 还会处理 `SKILL.md` 目录形式，见 [resource-loader.ts#L353](/source-code/packages/coding-agent/src/core/resource-loader.ts#L353)。系统 prompt 和 append prompt 则从显式配置或 `.pi/SYSTEM.md`、`APPEND_SYSTEM.md` 一类文件解析，append 处理在 [resource-loader.ts#L480](/source-code/packages/coding-agent/src/core/resource-loader.ts#L480)。

## 16. 优先级规则

资源冲突必须可预测。pi 用 `resourcePrecedenceRank()` 给不同来源排序：project settings 最高，其次 project auto-discovered，再其次 user settings、user auto-discovered，package resource 最低，见 [package-manager.ts#L161](/source-code/packages/coding-agent/src/core/package-manager.ts#L161)。

这个规则解释了三个产品现象：项目配置可以覆盖用户全局偏好；用户本地自动发现可以覆盖第三方 package；package 不能悄悄抢走团队已经定义好的同名 skill 或 prompt。

## 16. Dedup 与 first wins

loader 合并路径时会 canonicalize，避免同一个资源通过不同相对路径重复出现，见 [resource-loader.ts#L679](/source-code/packages/coding-agent/src/core/resource-loader.ts#L679)。runner 对 extension tools 也采用 first registration per name wins，见 [runner.ts#L373](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L373)。同名冲突不是随机覆盖，而是按已排序来源取第一个，并产生 diagnostic。

对自研 agent 来说，这比“后加载覆盖前加载”更适合团队环境。后加载覆盖容易让 package 作者无意间抢占项目命令；first wins 配合明确优先级，更容易审计。

## 16. Package 安装与本地路径

`pi install` 和 `pi remove` 本质上是修改 user 或 project settings。`addSourceToSettings()` 会根据 `-l` 选择 project 或 user scope，并把 source 写入对应 settings，见 [package-manager.ts#L775](/source-code/packages/coding-agent/src/core/package-manager.ts#L775)。本地路径会按 settings 所在 scope 规范化，见 [package-manager.ts#L1369](/source-code/packages/coding-agent/src/core/package-manager.ts#L1369)。

npm、git、本地路径三类 source 的解析入口在 [package-manager.ts#L1380](/source-code/packages/coding-agent/src/core/package-manager.ts#L1380)。git package 会被 clone 到对应安装目录，更新时可能 fetch、checkout、reset、clean，并在有 `package.json` 时安装依赖；清理和依赖安装边界可见 [package-manager.ts#L1810](/source-code/packages/coding-agent/src/core/package-manager.ts#L1810)。

## 16. Package filter 与启用控制

package object form 可以只启用某类资源或某些路径。`extensions: []` 表示该 package 的 extension 全部禁用；`!pattern` 表示排除 glob；`+path` 和 `-path` 表示精确强制包含或排除。pattern 应用逻辑集中在 package manager 的 resource filtering 函数，`applyPatterns()` 在 [package-manager.ts#L709](/source-code/packages/coding-agent/src/core/package-manager.ts#L709)。

这对团队很重要：你可以安装一个大型 package，但只启用它的两个 skills；也可以临时禁用某个 extension，保留同包 themes 和 prompts。

## 16. 安全边界

package 不是“主题商店里的皮肤”。extension 是 TypeScript 本机代码，skills 是会影响模型行为的指令文本，prompt template 会直接改用户输入，theme 虽然风险较低但仍来自本地文件。安装第三方 package 等于扩大 agent 的执行面。

生产团队至少要做到：pin npm 版本或 git ref；review package source；把团队共享 package 写进 project settings；对 package 更新做 code review；不要让临时 CLI package 成为长期依赖；不要把 secret 放进 package 资源文本。

## 16. 复刻路径

最小可用：支持 local paths、project/global settings、extensions/skills/prompts/themes 四类目录和禁用开关。

第二阶段：加入 npm/git source、package manifest、convention directories、filters、diagnostics、source metadata。

生产级：实现确定性 precedence、冲突报告、package update、pinned refs、offline mode、temporary CLI package、extension `resources_discover` 动态资源、project package 自动安装。
