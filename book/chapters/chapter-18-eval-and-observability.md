# 第18章 Eval 与可观测性

> **本章目标**：解释如何评估 Agent 是否真的完成任务。
> **pi 源码对照**：
> - `packages/coding-agent/src/core/telemetry.ts` — 遥测
> - `packages/agent/test/` — 测试目录
>
> **本章结束能做什么**：能设计覆盖 unit/integration/e2e 的评测和观测指标。
> **阅读时间**：约 25 分钟。

---

## 1. Eval 三层体系

```
┌─────────────────────────────────────────┐
│ E2E 层 - 用户价值                       │
│ - 用户采纳率                            │
│ - 节省时间                              │
│ - 人工接管率                            │
├─────────────────────────────────────────┤
│ 集成层 - 任务完成                       │
│ - 端到端完成率                         │
│ - 多步准确性                            │
│ - 工具链执行准确性                      │
├─────────────────────────────────────────┤
│ 单元层 - 原子能力                       │
│ - 工具参数正确性                        │
│ - 输出格式稳定性                        │
│ - 上下文选择效率                        │
└─────────────────────────────────────────┘
```

---

## 2. Trace 设计

### 2.1 Trace Entry

```typescript
// packages/coding-agent/src/core/telemetry.ts
export interface TraceEntry {
  type: 'span' | 'event' | 'metric'
  timestamp: number
  traceId: string
  spanId?: string
  parentSpanId?: string
  name: string
  duration?: number
  attributes: Record<string, unknown>
}
```

### 2.2 关键 Trace 事件

| 事件 | 属性 |
|------|------|
| `agent.turn.start` | turnCount, model |
| `agent.tool.call` | toolName, toolInput |
| `agent.tool.result` | toolName, success, duration |
| `agent.api.request` | model, inputTokens, outputTokens |
| `agent.api.response` | stopReason, cost |

---

## 3. 失败归因

### 3.1 五类失败

| 类别 | 说明 | 例子 |
|------|------|------|
| `model_error` | 模型决策错误 | 选了错误工具 |
| `tool_error` | 工具执行失败 | bash 超时 |
| `context_error` | 上下文超限 | prompt_too_long |
| `permission_error` | 权限被拒 | 权限流水线拒绝 |
| `unknown_error` | 未知错误 | 异常 |

### 3.2 归因逻辑

```typescript
// packages/coding-agent/src/core/telemetry.ts
export function classifyFailure(
  error: Error,
  context: ExecutionContext,
): FailureCategory {
  if (error instanceof ToolError) {
    return 'tool_error'
  }
  if (error instanceof PermissionError) {
    return 'permission_error'
  }
  if (error instanceof ContextOverflowError) {
    return 'context_error'
  }
  if (error instanceof ModelError) {
    return 'model_error'
  }
  return 'unknown_error'
}
```

---

## 4. 指标体系

### 4.1 核心指标

```typescript
// packages/coding-agent/src/core/telemetry.ts
export interface AgentMetrics {
  // 效率
  avgTurnsPerTask: number
  avgTokensPerTurn: number
  avgCostPerTask: number

  // 质量
  taskCompletionRate: number
  humanTakeoverRate: number
  toolCallSuccessRate: number

  // 延迟
  avgApiLatency: number
  avgToolLatency: number
}
```

---

> **下一步阅读**：[第19章 Eval 平台实操](./chapter-19-eval-platform-hands-on.md) — 动手实践。
