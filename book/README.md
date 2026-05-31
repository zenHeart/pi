# Pi Agent 复刻指南

这本书只围绕一个目标组织：让一个完全不了解 Pi 的工程师，只读本书就能理解 Pi 的核心概念、核心使用方式、核心原理和核心设计边界，并能复刻一个 mini Pi-like coding agent。

本书不是功能菜单，也不是用户手册。它按源码依赖 DAG 写作：先建立 `Runtime / Agent / Provider / Tool / Session / Host` 六个概念，再逐步实现启动链路、cwd 绑定服务、provider stream、Agent loop、工具回灌、资源注入、JSONL session、compaction、extension runtime、host adapters、TUI 与生产化不变量。

## 阅读方式

每章都采用同一结构：

- 问题场景：说明没有这个边界会出现什么失败。
- 用户如何使用：先从 Pi 的真实入口观察行为。
- 源码定位：用当前仓库相对链接定位实现，例如 [main.ts#L424](packages/coding-agent/src/main.ts#L424)。
- 生命周期图：用 Mermaid 表达启动、运行、回灌、失败或替换流程。
- 关键代码片段：代码片段前后都给出源码链接，并解释输入、输出、状态所有权和复刻取舍。
- 机制拆解：区分模型能看到什么、runtime 私下保留什么、执行权在哪里。
- 设计不变量：给出不能破坏的边界、原因、违反后果和复刻建议。
- 复刻任务：按最小可用版、接近 Pi 的增强版、生产级暂缓项推进。
- 验收清单：读者能据此检查自己的复刻实现。

## 目录

### 第 1 部分：建立 Pi-like Agent 的依赖 DAG

- [1. Pi 的依赖 DAG 与 Harness 边界](chapters/chapter-01-dependency-dag.md)
- [2. 启动链路：CLI、模式选择、CWD 与诊断](chapters/chapter-02-boot-runtime.md)
- [3. CWD 绑定服务：Settings、Auth、ModelRegistry、ResourceLoader](chapters/chapter-03-cwd-services.md)
- [4. AgentSessionRuntime：new、resume、fork、import、reload](chapters/chapter-04-agent-session-runtime.md)

### 第 2 部分：实现模型、会话与 Agent 内核

- [5. pi-ai：消息类型、模型类型与流事件协议](chapters/chapter-05-pi-ai-stream.md)
- [6. 模型选择、鉴权与 Provider 注册](chapters/chapter-06-model-provider-auth.md)
- [7. SDK 创建 AgentSession：服务如何变成可运行 Agent](chapters/chapter-07-create-agent-session.md)
- [8. Agent Core Loop：turn、stream、tool-use、steer 与 follow-up](chapters/chapter-08-agent-loop.md)
- [9. 工具系统：内置工具、active tools、校验与结果回灌](chapters/chapter-09-tools.md)
- [10. System Prompt 与资源注入：AGENTS、skills、templates、tool snippets](chapters/chapter-10-system-prompt-resources.md)
- [11. Session DAG 与 JSONL 持久化](chapters/chapter-11-session-dag-jsonl.md)
- [12. 压缩、分支摘要、重试与 Overflow 恢复](chapters/chapter-12-compaction-retry-overflow.md)

### 第 3 部分：扩展、宿主、安全与最终复刻

- [13. Extension Runtime：加载、注册、hook、命令、工具、UI bridge](chapters/chapter-13-extension-runtime.md)
- [14. Host Adapters：print、json、rpc、interactive 共享同一 session](chapters/chapter-14-host-adapters.md)
- [15. Interactive TUI：编辑器、渲染、快捷键、队列与扩展 UI](chapters/chapter-15-interactive-tui.md)
- [16. 安全、诊断与生产化不变量](chapters/chapter-16-safety-diagnostics-production.md)

## 校验

修改书稿后运行：

```bash
node book/validate.js
```
