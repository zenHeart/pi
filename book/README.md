# Pi Agent 实战：从零使用到专家复刻

本书面向完全不懂 pi agent、但熟悉 JavaScript/TypeScript 和前端工程化的工程师。目标是让读者只看本书，就能完整使用 pi 的核心功能，理解核心功能的运行原理，解释为什么 pi 这样设计，并能复刻一个最小但正确的 coding agent harness。

本版只以当前仓库源码、`packages/agent/docs/`、`packages/coding-agent/docs/` 和测试为事实源。没有源码或 docs 支撑的说法不写成结论；MCP、sub-agent、plan mode、todo、background bash 等能力只作为生态设计边界说明。

## 阅读结果

读完后应能做到：

1. 安装、认证、选模型、进入 interactive/print/json/rpc 模式，使用文件引用、shell、内置工具、session、compaction、export、settings、keybindings 和 packages。
2. 从源码解释 provider stream、message schema、agent loop、tool call/result、system prompt、ResourceLoader、ModelRegistry、SessionManager、ExtensionRunner、AgentHarness。
3. 写出自定义 tool、extension、skill、prompt template、custom provider、SDK session 和 RPC JSONL client。
4. 判断一个 agent 能力应该属于核心、产品层、扩展、package 还是外部环境。
5. 按 turn snapshot、save point、pending writes、queue、abort、compaction、tree navigation 设计自己的 harness。

## 覆盖矩阵

| 核心能力 | 章节 | Docs | 源码 | 测试证据 | 掌握标准 |
|---|---|---|---|---|---|
| 安装、认证、模型、运行模式 | 1、3、24 | `quickstart.md`、`usage.md`、`providers.md`、`models.md` | `main.ts`、`auth-storage.ts`、`model-registry.ts` | `auth-storage.test.ts`、`args.test.ts` | 能解释 API key/OAuth/env/auth.json 和 mode 选择 |
| 交互工作流、队列、abort | 2、15 | `usage.md`、`rpc.md` | `agent-loop.ts`、`agent-session.ts` | `agent-session-concurrent.test.ts`、`agent-session-prompt.test.ts` | 能区分 steering、follow-up、abort、slash command |
| provider 与流式协议 | 5、6 | `custom-provider.md`、`models.md` | `packages/ai/src/types.ts`、provider implementations | `packages/ai/test/*` | 能从 stream event 合成 assistant message |
| agent loop 与工具闭环 | 7、8、9 | `extensions.md`、`sdk.md` | `agent-loop.ts`、`tools/*.ts` | `agent-loop.test.ts`、tool regression tests | 能解释 tool call 校验、执行、结果回灌 |
| system prompt 与上下文 | 10、11、12 | `skills.md`、`prompt-templates.md`、`compaction.md` | `system-prompt.ts`、`resource-loader.ts`、`compaction.ts` | `agent-session-compaction.test.ts`、skill collision regression | 能判断模型看到什么、harness 私下保存什么 |
| session 与 durable harness | 13、14 | `session-format.md`、`agent-harness.md`、`durable-harness.md` | `session-manager.ts`、`agent-harness.ts` | `session-manager/*`、`agent-session-tree-navigation.test.ts` | 能从 JSONL tree 恢复、分叉、压缩会话 |
| packages 与资源发现 | 16 | `packages.md`、`settings.md` | `package-manager.ts`、`resource-loader.ts` | package/resource regression tests | 能解释 user/project/package precedence 和冲突 |
| extensions 与 hooks | 17、18、19、20 | `extensions.md`、`hooks.md`、`tui.md` | `extensions/types.ts`、`extensions/runner.ts` | `extensions-discovery.test.ts`、extension suite tests | 能写扩展并解释事件生命周期和执行权限 |
| SDK/RPC 集成 | 22、23 | `sdk.md`、`rpc.md`、`json.md` | `sdk.ts`、`rpc-types.ts`、`rpc-mode.ts` | `agent-session-runtime.test.ts`、RPC tests | 能把 pi 嵌入 TS 程序或外部进程 |
| 安全、观测、生态边界 | 25、26、27 | `observability.md`、`packages.md`、`usage.md` | `bash.ts`、`package-manager.ts`、extension APIs | security/tool/package regressions | 能解释为什么核心小、哪些能力应扩展实现 |
| 从零复刻 | 28 | 全书 | `agent-loop.ts`、`agent.ts`、`session-manager.ts` | faux provider suite | 能实现最小 loop、tool、session、abort、faux provider |
| 创造者/读者最终自审 | 29 | 全部 docs | 全部核心源码入口 | 覆盖矩阵对应测试 | 能判断本书讲到什么、为什么只讲这些、下一步读哪里 |

## 82 法则与进一步阅读

本书正文只展开 pi agent 的核心 20%：使用路径、运行时边界、消息与工具协议、session/durable harness、资源发现、扩展体系、SDK/RPC、安全与复刻。其余细节按主题指向仓库 docs：

- 日常用法、CLI、session、export/share：`packages/coding-agent/docs/usage.md`、`sessions.md`
- provider、models、OAuth、custom provider：`providers.md`、`models.md`、`custom-provider.md`
- compaction、session format、durable harness：`compaction.md`、`session-format.md`、`packages/agent/docs/durable-harness.md`
- extensions、hooks、TUI、packages：`extensions.md`、`packages/agent/docs/hooks.md`、`tui.md`、`packages.md`
- SDK/RPC/JSON：`sdk.md`、`rpc.md`、`json.md`
- 平台细节：`windows.md`、`termux.md`、`tmux.md`、`terminal-setup.md`、`keybindings.md`

## 构建与校验

```bash
node book/validate.js
node book/postprocess.js
node book/build-epub.mjs pi-agent-handbook.epub
```

`book/metadata.yaml` 是章节顺序唯一来源。`book/preprocess.js` 已禁用，避免旧外部分析映射覆盖本书。

## 源码引用规范

正文中的源码引用使用 `/source-code/...#Lx` 形式，例如 [agent-loop.ts#L31](/source-code/packages/agent/src/agent-loop.ts#L31)。不要把 Markdown 源码链接包在反引号中。
