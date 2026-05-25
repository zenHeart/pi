# Pi Agent 实战：从源码到复刻

> 基于 pi 源码的 Code Agent 系统设计指南

---

## 📖 书籍简介

本书从 pi 源码出发，系统讲解构建一个完整 Code Agent 所需的核心知识。每一章都遵循同一原则：**原理 + 源码对照 + 关键代码解读**。

读完本书，你将能够：
1. 理解 pi 源码的架构设计和实现细节
2. 掌握 Code Agent 的 7 层架构
3. 从零复刻一个功能完整的 Pi Agent

---

## 🏗️ 7 层架构

```
┌─────────────────────────────────────────────────────┐
│ L7 UX / 交互与协作层                                 │
│   Slash Commands · Output Styles · Subagents        │
├─────────────────────────────────────────────────────┤
│ L6 Eval / 评测层                                     │
│   Eval & Observability · Eval Platform               │
├─────────────────────────────────────────────────────┤
│ L5 Memory / 持久化层                                 │
│   Memory · Session Resume · Transcript              │
├─────────────────────────────────────────────────────┤
│ L4 Permission / 安全扩展层                            │
│   Permission & Security · Hook System               │
├─────────────────────────────────────────────────────┤
│ L3 Loop / 编排层                                     │
│   Agent Loop · 状态机 · 退出路径                     │
├─────────────────────────────────────────────────────┤
│ L2 Tool / 行动层                                    │
│   Tools · Streaming API · MCP · Skills              │
├─────────────────────────────────────────────────────┤
│ L1 Context / 模型输入层                               │
│   System Prompt · Context Engineering · Token/Budget │
└─────────────────────────────────────────────────────┘
```

---

## 📚 章节导航

### 第一部分：入门
- [第0章 前置知识](./chapters/chapter-00-prerequisites.md) - LLM API、Tool Use、AsyncGenerator、Zod
- [第1章 架构总览](./chapters/chapter-01-architecture-overview.md) - 7 层架构、技术选型、设计哲学

### 第二部分：核心模块
- [第2章 Agent Loop](./chapters/chapter-02-agent-loop.md) - 状态机、退出路径、规划策略、熔断器
- [第3章 Tools](./chapters/chapter-03-tools.md) - 工具四分类、Tool 接口、并发执行
- [第4章 Streaming API Client](./chapters/chapter-04-streaming-api-client.md) - SSE 解析、重试、fallback
- [第5章 System Prompt](./chapters/chapter-05-system-prompt.md) - Prompt 模块化、缓存、Skill 注入
- [第6章 从零构建最小 Agent](./chapters/chapter-06-build-from-zero.md) - 9 步构建可运行 mini-agent

### 第三部分：进阶能力
- [第7章 Context Engineering](./chapters/chapter-07-context-engineering.md) - 上下文组装、4 阶段压缩管道
- [第8章 Token 与预算管理](./chapters/chapter-08-token-and-budget.md) - Token 估算、窗口预算、taskBudget
- [第9章 权限与安全](./chapters/chapter-09-permission-and-security.md) - 权限流水线、Auto 分类器、提示注入防御
- [第10章 Hook 系统](./chapters/chapter-10-hook-system.md) - 27 个 Hook 生命周期注入点
- [第11章 记忆系统](./chapters/chapter-11-memory.md) - CLAUDE.md 层级、记忆预取、Team Memory
- [第12章 Session Resume](./chapters/chapter-12-session-resume.md) - transcript jsonl、resume 流程

### 第四部分：扩展生态
- [第13章 MCP 协议](./chapters/chapter-13-mcp-protocol.md) - MCP 作用域、传输层、连接生命周期
- [第14章 Slash Commands](./chapters/chapter-14-slash-commands.md) - 内置命令、自定义 markdown
- [第15章 Skills 与 Plugins](./chapters/chapter-15-skills-and-plugins.md) - 发现、加载、隔离、MCP-as-Skills
- [第16章 Output Styles](./chapters/chapter-16-output-styles.md) - frontmatter 解析、5 级优先级加载
- [第17章 Sub-agents](./chapters/chapter-17-sub-agents.md) - 多 Agent、隔离模型、Team/Coordinator

### 第五部分：评测与交付
- [第18章 Eval 与可观测性](./chapters/chapter-18-eval-and-observability.md) - Eval 三层体系、Trace 设计
- [第19章 Eval 平台实操](./chapters/chapter-19-eval-platform-hands-on.md) - mini-agent runner、transcript viewer
- [第20章 部署与运维](./chapters/chapter-20-deployment-and-ops.md) - Docker、K8s、灰度、多租户
- [第21章 RL 集成蓝图](./chapters/chapter-21-rl-integration.md) - trajectory、reward、Online/Offline
- [第22章 面试速查](./chapters/chapter-22-interview-cheatsheet.md) - 30s 简答、5min 深答、能力证据索引

### 附录
- [第23章 复刻路径与检查清单](./chapters/chapter-23-replication-guide.md) - 从零复刻的完整路线图

---

## 🔧 构建 EPUB

### 方式一：使用 Node.js（推荐）

```bash
cd book

# 安装依赖
npm install jszip

# 预处理分析文档（可选，已有章节文件可跳过）
node preprocess.js

# 后处理生成 EPUB 内容
node postprocess.js

# 构建 EPUB
node build-epub.mjs
# 或指定输出文件名
node build-epub.mjs pi-agent-handbook.epub
```

### 方式二：在线转换

将 `chapters/` 目录下的 Markdown 文件上传到以下工具：
- [Pandocs Online](https://pandocs.org/epub)
- [Markdown to EPUB](https://www.pdf24.org/zh/markdown-to-epub)

### 方式三：使用 Docker

```bash
docker run --rm -v $(pwd):/book pandoc/latex book.epub
```

---

## 📁 目录结构

```
book/
├── README.md                    # 本文件
├── metadata.yaml                # 书籍元数据配置
├── preprocess.js                # 预处理脚本
├── postprocess.js               # 后处理脚本
├── build-epub.mjs               # EPUB 构建脚本
├── cover/
│   └── cover.svg                # 书籍封面
└── chapters/                    # 章节 Markdown 文件（构建后生成）
    ├── chapter-00-prerequisites.md
    ├── chapter-01-architecture-overview.md
    ├── ...
    └── chapter-23-replication-guide.md
```

---

## 🎯 三类目标读者

### 目标 A：通过面试基本盘（1 周）
```
第0章 → 第1章 → 第2章 → 第3章 → 第5章 → 第9章 → 第11章 → 第17章 → 第18章 → 第22章
```
覆盖 JD 核心关键词：Context、Prompt、Tool、Loop、Permission、Memory、Sub-Agent、Eval。

### 目标 B：能独立复刻 MVP（3 周）
```
第0章 → 第1章 → 第2章 → 第3章 → 第4章 → 第5章 → 第6章
→ 第7章 → 第8章 → 第9章 → 第10章 → 第11章 → 第12章
→ 第13章 → 第14章 → 第15章 → 第16章 → 第17章 → 第19章
```
产出：跑通 mini-agent，用 TypeScript 工程实现 Code Agent 核心功能。

### 目标 C：工程化交付（6 周）
```
目标 B 基础上 + 第18章 → 第20章 → 第21章 → 第22章
```
产出：最小 Eval 证据链 + 容器化部署方案 + RL 接口契约。

---

## 🔗 相关资源

- **pi 源码**: `D:\chengle\code\repos\pi`
- **analysis 文档**: `D:\chengle\code\github\claude-code-sourcemap\analysis`
- **pi 官网**: https://github.com/claude-code/claude-code (参考)

---

## 📄 许可证

CC BY-NC-SA 4.0

---

_本书基于 Claude Code 架构分析文档和 pi 源码构建._
