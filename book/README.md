# Pi Agent 源码实战指南

这本书按照 `book/outline.md` 重写，面向完全不了解 Pi Agent、但具备前端工程经验的读者。内容只依赖仓库源码与 docs，目标是让读者理解如何使用 Pi 的核心功能、核心功能的原理，以及为什么系统要这样设计。

## 组织原则

全书按理解依赖组织，而不是按菜单罗列。先建立产品心智，再进入日常使用；先理解工具和 Agent loop，再理解 session、compaction 和恢复；先理解 ResourceLoader，再学习 templates、skills、extensions 和 packages；先理解 provider，再学习 SDK、RPC、JSON；最后通过四个项目和审计清单收束为专家判断。

## 写作标准

本书按源码分析书的标准编写，而不是功能简介。每章都必须回答：它解决什么系统问题；用户视角如何使用；启动时和运行时分别加载什么；模型能看到什么、Pi 运行时私下保留什么；触发条件来自用户、模型、生命周期事件还是外部调用；执行权在哪里；结果如何回灌；失败和安全边界是什么。

每章都包含 Mermaid 生命周期图、源码责任表、创建者视角的设计不变量和专家验收任务。源码引用必须使用当前仓库相对路径，例如 `packages/coding-agent/src/main.ts#L424`，并细化到行号；EPUB 构建会把它转换为 `https://github.com/zenHeart/pi/blob/codex/pi-book-rewrite/...#Lx`。

## 目录

### 第 0 部分：建立产品心智

- [00. Pi 是什么](chapters/chapter-00-pi-identity.md)
- [01. 小内核与可组合边界](chapters/chapter-01-small-core.md)

### 第 1 部分：成为熟练用户

- [02. 安装、启动与第一次对话](chapters/chapter-02-install-and-first-run.md)
- [03. Provider、账号与鉴权](chapters/chapter-03-providers-and-auth.md)
- [04. 交互模式与 TUI 心智模型](chapters/chapter-04-interactive-tui.md)
- [05. 输入队列、中断与连续协作](chapters/chapter-05-input-queue-interruptions.md)
- [06. CLI、Print 模式与 JSON 模式](chapters/chapter-06-print-json-cli.md)

### 第 2 部分：理解 Agent 内核

- [07. 内置工具与文件系统动作](chapters/chapter-07-built-in-tools.md)
- [08. Agent Loop 的运行原理](chapters/chapter-08-agent-loop.md)
- [09. 系统提示词与行为契约](chapters/chapter-09-system-prompt.md)
- [10. Settings 与可配置行为](chapters/chapter-10-settings.md)

### 第 3 部分：掌握会话与记忆

- [11. Session 格式与事件历史](chapters/chapter-11-session-format.md)
- [12. 恢复、分支与会话树](chapters/chapter-12-resume-fork-tree.md)
- [13. 上下文压缩与长期任务](chapters/chapter-13-compaction.md)
- [14. 导出、审计与会话共享](chapters/chapter-14-export-and-share.md)

### 第 4 部分：掌握资源与扩展系统

- [15. ResourceLoader 与资源优先级](chapters/chapter-15-resource-loader.md)
- [16. Prompt Templates 与可复用任务](chapters/chapter-16-prompt-templates.md)
- [17. Skills 与模型行为注入](chapters/chapter-17-skills.md)
- [18. Extensions 的能力边界](chapters/chapter-18-extensions-intro.md)
- [19. 扩展事件与生命周期](chapters/chapter-19-extension-events.md)
- [20. 自定义工具、命令与快捷入口](chapters/chapter-20-extension-tools-commands.md)
- [21. 扩展 UI、主题与终端体验](chapters/chapter-21-extension-ui-themes.md)
- [22. Pi Packages 与分发复用](chapters/chapter-22-packages.md)

### 第 5 部分：掌握模型与 Provider

- [23. pi-ai 的模型抽象](chapters/chapter-23-ai-package.md)
- [24. 模型注册、能力与选择策略](chapters/chapter-24-models-registry.md)
- [25. 自定义 Provider 与 OAuth](chapters/chapter-25-custom-provider.md)
- [26. Thinking、缓存与多模态能力](chapters/chapter-26-thinking-cache-images.md)

### 第 6 部分：掌握集成接口

- [27. SDK：把 Pi 嵌入应用](chapters/chapter-27-sdk.md)
- [28. AgentSessionRuntime 与服务装配](chapters/chapter-28-runtime-services.md)
- [29. RPC 模式与外部进程集成](chapters/chapter-29-rpc.md)
- [30. JSON 事件流与机器可读输出](chapters/chapter-30-json-events.md)

### 第 7 部分：掌握安全、调试与协作

- [31. 安全模型与信任边界](chapters/chapter-31-safety.md)
- [32. 调试 Pi：从现象到层级定位](chapters/chapter-32-debugging.md)
- [33. 平台差异与终端环境](chapters/chapter-33-platform-terminal.md)
- [34. 本地开发、贡献与质量门禁](chapters/chapter-34-development.md)

### 第 8 部分：专家级综合项目

- [35. 项目一：实现最小 Pi-like Agent](chapters/chapter-35-project-minimal-agent.md)
- [36. 项目二：构建团队 Pi Package](chapters/chapter-36-project-team-package.md)
- [37. 项目三：接入私有模型 Provider](chapters/chapter-37-project-private-provider.md)
- [38. 项目四：定制交互 UI 与工作流](chapters/chapter-38-project-custom-ui.md)
- [39. 专家级审计清单](chapters/chapter-39-expert-audit.md)

## 校验

修改书稿后运行：

```bash
node book/validate.js
```
