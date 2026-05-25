# Pi Agent 实战：从使用到复刻

本书面向只懂 JavaScript/TypeScript 的前端工程师，目标是让读者只看本书就能完成三件事：完整使用 pi 的核心功能，理解这些功能背后的 runtime 设计，基于这些设计复刻一个最小但正确的 coding agent harness。

本版以当前仓库源码和本地 docs 为事实源，不套用不属于 pi 核心的概念。pi 的真实设计是：核心保持小，provider、loop、session、tools、resources 和 events 稳定；复杂工作流通过 TypeScript extensions、skills、prompt templates、themes、packages、SDK、RPC、JSON mode 扩展。

## 阅读结果

读完后应能做到：

1. 从用户视角安装、认证、选模型、引用文件、运行 shell、管理 session、压缩、导出、配置 settings/keybindings、使用 packages。
2. 从源码视角理解 provider stream、agent loop、tool call/result、system prompt、context transform、session JSONL tree、ExtensionRunner、ResourceLoader、ModelRegistry。
3. 用 TypeScript 从零实现一个最小 coding agent：消息协议、stream adapter、工具闭环、JSONL session、abort、faux provider。
4. 设计自定义 AgentHarness：turn snapshot、save point、pending session writes、steering/follow-up/nextTurn、compaction、tree navigation、hook settlement。
5. 判断一个 agent 产品设计是否能生产化，而不是只停留在 prompt demo。

## 章节结构

- 第0章：前端工程师前置知识
- 第1章：架构总览
- 第2章：Agent Loop
- 第3章：Tools
- 第4章：Streaming API Client
- 第5章：System Prompt
- 第6章：从零构建最小 Agent
- 第7章：Context Engineering
- 第8章：Token 与预算管理
- 第9章：权限与安全
- 第10章：扩展系统
- 第11章：记忆系统
- 第12章：Session Resume
- 第13章：MCP 协议接入策略
- 第14章：Session 管理
- 第15章：Skills、Prompt Templates、Themes 与 Packages
- 第16章：Slash Commands
- 第17章：输出风格、TUI 与渲染扩展
- 第18章：Eval 与可观测性
- 第19章：Eval 平台实操
- 第20章：部署与运维
- 第21章：RL 集成蓝图
- 第22章：AgentHarness 专家速查
- 第23章：复刻路径与检查清单

## Docs 映射

| docs 事实源 | 主要映射章节 |
|---|---|
| `packages/agent/docs/agent-harness.md` | 第1、12、22、23章 |
| `packages/agent/docs/hooks.md` | 第10、22章 |
| `packages/agent/docs/durable-harness.md` | 第12、22、23章 |
| `packages/agent/docs/observability.md` | 第18、19、21章 |
| `packages/coding-agent/docs/quickstart.md` | 第1、3、20、23章 |
| `packages/coding-agent/docs/usage.md` | 第1、3、12、14、16、23章 |
| `packages/coding-agent/docs/providers.md` | 第4、16、20章 |
| `packages/coding-agent/docs/models.md` | 第4、16、20章 |
| `packages/coding-agent/docs/custom-provider.md` | 第4、10、20章 |
| `packages/coding-agent/docs/settings.md` | 第8、16、17、20章 |
| `packages/coding-agent/docs/keybindings.md` | 第16、17、23章 |
| `packages/coding-agent/docs/sessions.md` | 第12、14、23章 |
| `packages/coding-agent/docs/session-format.md` | 第12、14、21章 |
| `packages/coding-agent/docs/compaction.md` | 第7、8、12、14章 |
| `packages/coding-agent/docs/extensions.md` | 第9、10、13、15、17章 |
| `packages/coding-agent/docs/skills.md` | 第11、15章 |
| `packages/coding-agent/docs/prompt-templates.md` | 第5、11、15章 |
| `packages/coding-agent/docs/themes.md` | 第15、17章 |
| `packages/coding-agent/docs/packages.md` | 第11、15、20章 |
| `packages/coding-agent/docs/sdk.md` | 第1、18、19、22、23章 |
| `packages/coding-agent/docs/rpc.md` | 第18、19、23章 |
| `packages/coding-agent/docs/json.md` | 第18、19章 |
| `packages/coding-agent/docs/tui.md` | 第17章 |
| `packages/coding-agent/docs/terminal-setup.md`、`tmux.md`、`windows.md`、`termux.md`、`shell-aliases.md` | 第17、20、23章 |
| `packages/coding-agent/docs/development.md` | 第6、18、20章 |

## 构建

```bash
cd book
node postprocess.js
node build-epub.mjs pi-agent-handbook.epub
```

## 源码引用规范

正文中的源码引用使用 `/source-code/...#Lx` 形式，例如 `[agent-loop.ts#L31](/source-code/packages/agent/src/agent-loop.ts#L31)`。EPUB 构建时会把它转换为 GitHub 链接。
