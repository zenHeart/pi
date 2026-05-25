# 第23章 复刻路径与检查清单

> **本章目标**：提供从零复刻 Pi Agent 的完整路线图和检查清单。
> **阅读时间**：约 60 分钟。

---

## 1. 复刻路线图

### 阶段 1：最小可运行 Agent（1 周）

**目标**：运行一个能处理简单任务的 Agent。

| 步骤 | 任务 | 检查点 |
|------|------|--------|
| 1.1 | 搭建 TypeScript 项目 | `npm init` + TypeScript 配置完成 |
| 1.2 | 实现 Agent Loop | AsyncGenerator 状态机跑通 |
| 1.3 | 实现 Read/Bash/Edit 工具 | 三个工具正确执行 |
| 1.4 | 接入 Claude API | 流式响应正常接收 |
| 1.5 | 实现工具调用闭环 | tool_use → tool_result 完整循环 |

### 阶段 2：核心能力（2 周）

| 步骤 | 任务 | 检查点 |
|------|------|--------|
| 2.1 | 实现压缩管道 | Snip/Microcompact 正确工作 |
| 2.2 | 添加 System Prompt | 分模块构建，缓存边界正确 |
| 2.3 | 实现权限检查 | allow/deny/ask 决策正确 |
| 2.4 | 添加 CLAUDE.md 加载 | 项目级规则生效 |
| 2.5 | 实现 Session Resume | 重启后恢复对话 |

### 阶段 3：扩展生态（2 周）

| 步骤 | 任务 | 检查点 |
|------|------|--------|
| 3.1 | 实现 MCP 接入 | 外部 MCP Server 工具可用 |
| 3.2 | 实现 Slash Commands | `/help` `/compact` 等内置命令 |
| 3.3 | 实现 Skills 系统 | Skill 按需加载 |
| 3.4 | 实现 Hook 系统 | PreToolUse/PostToolUse 生效 |
| 3.5 | 实现 Sub-agent | 任务委派独立执行 |

### 阶段 4：工程化（1 周）

| 步骤 | 任务 | 检查点 |
|------|------|--------|
| 4.1 | 实现 Eval Runner | 测试用例执行并产出报告 |
| 4.2 | 实现 Transcript Viewer | HTML 可视化正常 |
| 4.3 | 添加 Docker 支持 | 容器化部署成功 |
| 4.4 | 添加健康检查 | `/health` `/ready` 正常 |
| 4.5 | 实现 Graceful Shutdown | SIGTERM 信号处理正确 |

---

## 2. 完整检查清单

### 2.1 Agent Loop ✓

- [ ] AsyncGenerator 模式实现
- [ ] 9 条退出路径覆盖
- [ ] 状态机原子替换
- [ ] 并发工具分组执行
- [ ] 熔断器保护

### 2.2 工具系统 ✓

- [ ] Read 工具（支持 offset/limit）
- [ ] Bash 工具（超时控制）
- [ ] Edit 工具（精确替换）
- [ ] Write 工具
- [ ] Zod 输入校验
- [ ] 工具注册表

### 2.3 上下文管理 ✓

- [ ] Token 估算
- [ ] 4 阶段压缩管道
- [ ] Snip 截断
- [ ] Microcompact 合并
- [ ] 预算跨压缩追踪

### 2.4 权限与安全 ✓

- [ ] 6 种权限模式
- [ ] 风险分类
- [ ] 破坏性命令检测
- [ ] 提示注入防御
- [ ] Hook 与权限协作

### 2.5 记忆与持久化 ✓

- [ ] CLAUDE.md 加载
- [ ] 记忆提取与存储
- [ ] Session Resume
- [ ] JSONL Transcript
- [ ] Sidechain 子 Agent

### 2.6 扩展系统 ✓

- [ ] MCP Client
- [ ] Slash Commands
- [ ] Skills 系统
- [ ] Hook 系统（27 个注入点）
- [ ] Sub-agent 委派

### 2.7 Eval 与可观测性 ✓

- [ ] Trace 事件
- [ ] 失败归因
- [ ] Eval Runner
- [ ] Transcript Viewer
- [ ] 成本追踪

### 2.8 运维 ✓

- [ ] Docker 部署
- [ ] Health Check
- [ ] Graceful Shutdown
- [ ] 结构化日志

---

## 3. 与 pi 源码的差距评估

| 模块 | pi 实现 | 复刻优先级 | 难度 |
|------|---------|-----------|------|
| Agent Loop | `packages/agent/src/agent-loop.ts` | 必须 | 高 |
| 工具系统 | `packages/coding-agent/src/core/tools/` | 必须 | 中 |
| 压缩管道 | `packages/agent/src/harness/compaction/` | 必须 | 高 |
| 权限系统 | `packages/coding-agent/src/core/exec.ts` | 必须 | 高 |
| 记忆系统 | `packages/agent/src/harness/session/memory-*` | 应该 | 中 |
| MCP | `packages/coding-agent/src/core/mcp.ts` | 应该 | 中 |
| Slash Commands | `packages/coding-agent/src/core/slash-commands.ts` | 应该 | 低 |
| Skills | `packages/coding-agent/src/core/skills.ts` | 应该 | 中 |
| Hook 系统 | `packages/coding-agent/src/core/extensions/` | 可选 | 高 |
| Sub-agent | `packages/coding-agent/src/core/modes/rpc/` | 可选 | 高 |
| Eval Runner | `examples/mini-agent/src/evalRunner.ts` | 必须 | 中 |
| Docker | Dockerfile | 应该 | 低 |

---

## 4. 下一步

恭喜完成本书！下一步可以：

1. **深入 pi 源码**：阅读 `packages/` 下的具体实现
2. **运行 mini-agent**：参照 `examples/mini-agent/` 构建
3. **参与贡献**：查看 pi 的 `CONTRIBUTING.md`
4. **构建自己的 Agent**：基于本书知识设计

---

_全书完。感谢阅读！_
