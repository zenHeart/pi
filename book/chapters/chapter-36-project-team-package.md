# 36. 开发团队专属的工作流扩展包

## 36.1 本章解决的问题

团队内的工程师需要统一的 AI 工作流：相同的代码规范提示、相同的 API 状态查询工具、相同的 commit 消息模板。每个人在自己的 `~/.pi/agent/` 目录下手动维护这些配置，既难以同步也无法版本化。

Pi Package 是解决这个问题的标准机制：将 extension、skill、prompt template 和 theme 打包为一个 npm 包（或 git 仓库），团队成员一行命令安装，随时升级。本章演示如何从零构建一个团队包并发布。

## 36.2 包结构与 pi manifest

Pi Package 有两种声明资源的方式：

**方式一（推荐）：在 `package.json` 中声明 `pi` 字段**

```json
{
  "name": "@myteam/pi-workflow",
  "version": "1.0.0",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills":     ["./skills"],
    "prompts":    ["./prompts"],
    "themes":     ["./themes"]
  }
}
```

**方式二（约定目录）：不需要 manifest，Pi 自动发现**

当没有 `pi` 字段时，Pi 从以下目录自动加载资源（参考 [`packages.md`](packages/coding-agent/docs/packages.md#L158)）：
- `extensions/`：加载 `.ts` 和 `.js` 文件
- `skills/`：加载 `SKILL.md` 文件夹和顶级 `.md` 文件
- `prompts/`：加载 `.md` 文件
- `themes/`：加载 `.json` 文件

## 36.3 完整示例：团队工作流包

目录结构：

```
@myteam/pi-workflow/
├── package.json
├── extensions/
│   └── api-status.ts        # 自定义工具：查询内部 API 状态
├── skills/
│   └── css-review.md        # 技能：按团队规范审查 CSS
├── prompts/
│   └── commit-message.md    # Prompt 模板：生成规范 commit 消息
└── themes/
    └── myteam-dark.json     # 自定义主题
```

#### extensions/api-status.ts

```typescript
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const extension: ExtensionFactory = (api) => {
  // 注册一个自定义工具：查询内部 CI 状态
  api.registerTool({
    name: "checkApiStatus",
    description: "Check the status of our internal API services",
    schema: Type.Object({
      service: Type.String({ description: "Service name (auth/search/payment)" }),
    }),
    async execute({ service }) {
      const res = await fetch(`https://status.internal.company.com/api/${service}`);
      const data = await res.json();
      return [{ type: "text", text: `${service}: ${data.status} (${data.latency}ms)` }];
    },
  });

  // 注册一个 slash 命令
  api.registerCommand({
    name: "status",
    description: "Check all internal service statuses",
    async execute(context) {
      const services = ["auth", "search", "payment"];
      for (const svc of services) {
        context.ui.notify(`Checking ${svc}...`);
      }
    },
  });
};

export default extension;
```

#### skills/css-review.md

```markdown
---
name: css-review
description: Review CSS code following team conventions
---

When reviewing CSS code, check these team-specific rules:

1. Use CSS custom properties (variables) for all colors: `var(--color-primary)`
2. Mobile-first: base styles for mobile, use `@media (min-width: 768px)` for desktop
3. BEM naming: `.block__element--modifier`
4. No magic numbers: all spacing must use `var(--spacing-*)` tokens
5. No inline `!important` unless justified with a comment

Flag any violations and suggest corrections.
```

#### prompts/commit-message.md

```markdown
---
name: commit-message
description: Generate a conventional commit message
---

Based on the git diff, write a commit message following Conventional Commits:

Format: `type(scope): subject`

Types: feat, fix, docs, style, refactor, test, chore
Subject: imperative mood, no period, max 72 chars

Include a body if the change is non-trivial.
```

## 36.4 安装与分发

**团队成员安装（全局）：**

```bash
pi install npm:@myteam/pi-workflow
```

**项目级安装（写入 `.pi/settings.json`，可提交到 git）：**

```bash
pi install -l npm:@myteam/pi-workflow
```

当项目 `.pi/settings.json` 中声明了包，Pi 会在启动时自动安装缺失的包，无需团队成员手动执行 install。

**Git 仓库安装（适合私有企业环境）：**

```bash
pi install git:github.com/myteam/pi-workflow@v1.2.0
```

**临时试用（不写入配置）：**

```bash
pi -e npm:@myteam/pi-workflow "运行一次 /status 命令"
```

## 36.5 依赖管理

扩展包中引用的 Pi 核心包（`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui` 等）必须声明为 `peerDependencies` 而不是 `dependencies`，这样 Pi 会使用安装时的宿主版本，不会造成版本冲突：

```json
{
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  },
  "dependencies": {
    "some-api-client": "^2.0.0"
  }
}
```

非 Pi 核心的第三方运行时依赖（如 `some-api-client`）正常放入 `dependencies`，Pi 安装包时会自动运行 `npm install`。

## 36.6 Package 过滤：只加载部分资源

如果团队成员只想使用包中的 skill 而不想激活所有 extension，可以在 `settings.json` 中过滤：

```json
{
  "packages": [
    {
      "source": "npm:@myteam/pi-workflow",
      "skills": ["skills/css-review.md"],
      "extensions": [],
      "prompts": []
    }
  ]
}
```

## 36.7 为什么通过 Package 而不是直接共享配置文件

直接共享 `~/.pi/agent/` 目录下的文件存在几个问题：
1. 文件格式升级时不同版本的 Pi 可能不兼容
2. 无法版本化和回滚
3. 本地配置会被团队配置污染

Pi Package 通过 npm/git 版本控制，每个包是独立命名空间（不会和用户本地配置冲突），`ResourceLoader` 的碰撞检测（见第 16 章）会在冲突时给出明确的 `collision` 诊断而不是静默覆盖。

## 36.8 本章训练

#### 使用级训练

创建一个最小的团队包（只含一个 skill 和一个 prompt template），用 `pi install ./local-path` 安装到本地，验证 skill 在对话中可以通过 `/skill:name` 调用，prompt template 可以通过 `/<name>` 触发。

#### 原理级训练

阅读 [`packages.md`](packages/coding-agent/docs/packages.md#L220) 的"Scope and Deduplication"部分，解释当同一个包同时出现在全局设置和项目设置时，Pi 如何决定使用哪个版本；说明 identity 判定对 npm、git 和 local path 包的差异。

#### 扩展级训练

把第 35 章极简 Agent 的工具调用逻辑封装成一个 Pi extension tool，发布为本地包；安装后在 Pi 交互模式中验证该工具可以被模型调用；为该扩展添加单元测试，使用 `createHarness()` 模拟工具执行。

专家级验收标准：能独立构建、发布（本地路径或 npm）并安装一个包含 extension/skill/prompt 的 Pi Package，能解释 package 过滤机制，并能说明团队共享配置应该优先使用 package 而不是手动同步 `~/.pi/agent/` 文件的原因。
