# 第22章 面试速查

> **本章目标**：提供面试速查和能力证据索引。
> **阅读时间**：约 90 分钟。

---

## 1. 高频问题 30 秒版

### 1.1 Agent Loop

**Q: Agent Loop 如何处理工具调用的并发？**

A: 通过 `isConcurrencySafe()` 标记只读工具（Read/Grep/Glob），它们可以并发执行；写操作工具必须串行执行。pi 使用 `groupToolCallsByConcurrency()` 分组，然后 `Promise.all()` 并发执行只读组。

### 1.2 Context 管理

**Q: 如何防止上下文溢出？**

A: pi 使用 4 阶段压缩管道：1) Snip 截断过长 tool_result；2) Microcompact 合并连续工具调用为摘要；3) Context Collapse 折叠早期对话；4) AutoCompact 完整压缩。压缩触发阈值是 80% 窗口。

### 1.3 Tool 安全

**Q: 如何防止危险工具调用？**

A: pi 使用权限流水线：1) 风险分类（低/中/高）；2) 规则匹配；3) 模式分发（6 种模式：default/acceptEdits/bypassPermissions/dontAsk/plan/auto）；4) 决策（allow/deny/ask）。Hook 的 PreToolUse 可以拦截，但必须配合权限二次校验。

### 1.4 Memory

**Q: 记忆系统如何避免重复提取？**

A: pi 使用文件系统优先策略：`~/.claude/projects/<slug>/memory/` 存储记忆，MemoryManager 缓存当前会话记忆，跨压缩边界追踪 budget。

---

## 2. 深度问题 5 分钟版

### 2.1 如何设计一个 Agent 的压缩策略？

```
1. 分层降级：先 Snip → 再 Microcompact → 再 Collapse → 最后 AutoCompact
2. 预算追踪：跨压缩边界追踪 taskBudget，记录已用 token
3. 熔断器：连续失败 3 次进入冷却期
4. 摘要质量：使用 LLM 生成摘要而非简单截断
```

### 2.2 AsyncGenerator 在 Agent 中的优势？

```
1. 可测试：for-await 断言事件序列
2. 可组合：yield* 委托子 generator
3. 可观测：每步 yield 暴露给 UI/日志
4. 优雅退出：return 携带终态，而非抛异常
```

### 2.3 如何设计多租户隔离？

```
1. 进程级隔离：每个租户独立进程
2. Session 隔离：每个 session 有独立 ID 和存储路径
3. 工具隔离：租户只能访问自己目录
4. 成本隔离：按 session 独立计费
```

---

## 3. 能力证据矩阵

| 能力 | 证据 | 代码位置 |
|------|------|---------|
| Agent Loop | `runAgentLoop()` AsyncGenerator | `packages/agent/src/agent-loop.ts` |
| 工具注册 | `BUILT_IN_TOOLS` | `packages/coding-agent/src/core/tools/index.ts` |
| 压缩管道 | 4 阶段压缩 | `packages/agent/src/harness/compaction/` |
| 权限系统 | 6 种模式 | `packages/coding-agent/src/core/exec.ts` |
| 记忆系统 | MemoryManager | `packages/agent/src/harness/session/` |
| MCP 集成 | McpClient | `packages/coding-agent/src/core/mcp.ts` |
| Eval | evalRunner | `examples/mini-agent/src/evalRunner.ts` |
| Trajectory | exportTrajectory | `examples/mini-agent/src/exportTrajectory.ts` |

---

> **下一步阅读**：[第23章 复刻路径与检查清单](./chapter-23-replication-guide.md) — 完整复刻指南。
