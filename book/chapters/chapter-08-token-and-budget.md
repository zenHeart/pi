# 第8章 Token 与预算管理

> **本章目标**：解释 token、上下文窗口、成本和 task budget 如何共同约束 Agent。
> **pi 源码对照**：
> - `packages/agent/src/harness/session/session.ts` — 会话中的成本追踪
> - `packages/agent/src/harness/session/memory-storage.ts` — 预算持久化
> - `packages/coding-agent/src/core/messages.ts` — Token 估算
>
> **本章结束能做什么**：能为自定义 harness 设计成本追踪、预算提示和压缩触发策略。
> **阅读时间**：约 20 分钟。

---

## 1. Token 基础

### 1.1 估算规则

| 类型 | bytes/token | 示例 |
|------|-------------|------|
| 英文 | ~4 | 1K token ≈ 750 字 |
| 中文 | ~2 | 1K token ≈ 500 字 |
| JSON | ~2 | 1K token ≈ 500 字符 |
| 代码 | ~3-4 | 1K token ≈ 250 行 |

### 1.2 pi 估算实现

```typescript
// packages/coding-agent/src/core/messages.ts
export function roughTokenCount(
  content: string,
  type: 'text' | 'code' | 'json' = 'text',
): number {
  const bytesPerToken = type === 'code' ? 3.5
    : type === 'json' ? 2
    : 4
  return Math.ceil(content.length / bytesPerToken)
}
```

---

## 2. 成本追踪

### 2.1 Usage 记录

```typescript
// packages/agent/src/harness/session/session.ts
export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  totalCostUSD: number
}

export function recordUsage(
  session: AgentSession,
  usage: ModelUsage,
): void {
  // 更新会话总成本
  session.totalCost += usage.totalCostUSD

  // 按模型追踪
  const model = session.config.model
  if (!session.modelUsage[model]) {
    session.modelUsage[model] = {
      inputTokens: 0,
      outputTokens: 0,
      totalCostUSD: 0,
    }
  }

  const current = session.modelUsage[model]
  current.inputTokens += usage.inputTokens
  current.outputTokens += usage.outputTokens
  current.totalCostUSD += usage.totalCostUSD
}
```

### 2.2 成本计算

```typescript
// packages/agent/src/harness/session/session.ts
const MODEL_PRICING = {
  'claude-3-5-sonnet': {
    input: 3,      // $3 / MTok
    output: 15,    // $15 / MTok
  },
  'claude-3-5-haiku': {
    input: 0.8,    // $0.8 / MTok
    output: 4,     // $4 / MTok
  },
}

export function calculateCost(
  model: string,
  usage: ModelUsage,
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['claude-3-5-haiku']
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}
```

---

## 3. 预算管理

### 3.1 预算配置

```typescript
// packages/agent/src/harness/session/session.ts
export interface BudgetConfig {
  maxCostUSD: number           // 最大总成本
  maxTokens: number           // 最大 token 数
  warningThreshold: number     // 警告阈值（百分比）
}

export function checkBudget(
  session: AgentSession,
  config: BudgetConfig,
): BudgetStatus {
  const { maxCostUSD, warningThreshold } = config
  const costRatio = session.totalCost / maxCostUSD

  if (costRatio >= 1) {
    return { status: 'exceeded', ratio: costRatio }
  }
  if (costRatio >= warningThreshold) {
    return { status: 'warning', ratio: costRatio }
  }
  return { status: 'ok', ratio: costRatio }
}
```

### 3.2 预算超限处理

```typescript
// packages/agent/src/harness/session/session.ts
export function handleBudgetExceeded(
  session: AgentSession,
  config: BudgetConfig,
): LoopAction {
  const status = checkBudget(session, config)

  if (status.status === 'exceeded') {
    return {
      action: 'stop',
      reason: 'budget_exceeded',
      message: `Budget exceeded: $${session.totalCost.toFixed(4)} / $${config.maxCostUSD}`,
    }
  }

  if (status.status === 'warning') {
    return {
      action: 'warn',
      reason: 'budget_warning',
      message: `Budget warning: ${(status.ratio * 100).toFixed(0)}% used`,
    }
  }

  return { action: 'continue' }
}
```

---

## 4. taskBudget 跨压缩追踪

```typescript
// packages/agent/src/harness/compaction/compaction.ts
export interface CompactTracking {
  originalBudget: number
  usedAcrossCompacts: number
  preservedEssentialTokens: number
}

export function trackBudgetAcrossCompaction(
  before: CompactState,
  after: CompactState,
  tracking: CompactTracking,
): CompactTracking {
  const beforeTokens = sumMessageTokens(before.messages)
  const afterTokens = sumMessageTokens(after.messages)
  const delta = beforeTokens - afterTokens

  return {
    ...tracking,
    usedAcrossCompacts: tracking.usedAcrossCompacts + delta,
    preservedEssentialTokens: tracking.preservedEssentialTokens + afterTokens,
  }
}
```

---

> **下一步阅读**：[第9章 权限与安全](./chapter-09-permission-and-security.md) — 权限架构。
