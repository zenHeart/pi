# 第2章 Agent Loop：核心状态机

> **本章目标**：拆解 pi Agent Loop 的状态机、退出路径和工具闭环。
> **pi 源码对照**：
> - `packages/agent/src/agent-loop.ts` — Agent Loop 主循环
> - `packages/agent/src/agent.ts` — Agent 主类
> - `packages/coding-agent/src/core/agent-session-runtime.ts` — 会话运行时
> - `packages/coding-agent/src/core/agent-session.ts` — Agent Session 实现
>
> **本章结束能做什么**：能实现并审查一个生产级 Agent Loop。
> **阅读时间**：约 35 分钟。

---

## 1. Agent Loop 概述

Agent Loop 是整个 Agent 系统的核心编排引擎。它接收用户输入，通过 LLM 生成响应，决定是否调用工具，并循环直到任务完成或达到终止条件。

### 1.1 核心模式

pi 使用 AsyncGenerator 模式实现 Agent Loop：

```typescript
// packages/agent/src/agent-loop.ts
export async function* runAgentLoop(
  harness: AgentHarness,
  session: AgentSession,
): AsyncGenerator<AgentEvent, AgentResult> {
  let turnCount = 0
  while (true) {
    yield { type: 'turn_start', turnCount }

    const result = yield* executeTurn(harness, session)

    if (result.done) {
      return result.value
    }

    turnCount++
  }
}
```

### 1.2 pi 的 Agent Session

```typescript
// packages/coding-agent/src/core/agent-session.ts
export class AgentSession {
  readonly id: string
  private messages: Message[] = []
  private turnCount: number = 0

  constructor(
    private harness: AgentHarness,
    config: SessionConfig,
  ) {
    this.id = config.id ?? generateSessionId()
  }

  async *run(): AsyncGenerator<SessionEvent, SessionResult> {
    for await (const event of this.harness.generateResponse(this)) {
      yield event
    }
  }
}
```

---

## 2. 状态机设计

### 2.1 状态字段

pi 的 Agent Loop 状态包含：

```typescript
// packages/agent/src/harness/types.ts
export interface LoopState {
  messages: Message[]
  turnCount: number
  autoCompactTracking: AutoCompactState | undefined
  maxOutputTokensRecoveryCount: number
  pendingToolUseSummary: Promise<string> | undefined
  stopHookActive: boolean
  transition: Continue | undefined
}
```

### 2.2 退出路径

Agent Loop 的 9 条退出路径：

| 路径 | 条件 | 恢复策略 |
|------|------|---------|
| `end_turn` | 模型正常结束 | 返回完成结果 |
| `tool_use` | 模型调用工具 | 执行工具并继续循环 |
| `max_tokens` | 输出达到上限 | 扩大 max_tokens 重试 |
| `context_overflow` | 上下文溢出 | 触发压缩并重试 |
| `stop_hook` | Stop Hook 阻止 | 等待或中止 |
| `error` | 执行出错 | 错误处理后决定是否继续 |
| `user_interrupt` | 用户主动中断 | 优雅退出 |
| `max_turns` | 达到轮次上限 | 返回当前状态 |
| `budget_exceeded` | 超出预算 | 停止并报告 |

### 2.3 循环流程图

```
                    ┌─────────────┐
                    │  turn_start │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
              ┌───▶│  AI 生成    │
              │     └──────┬──────┘
              │            ▼
              │     ┌─────────────┐
              │     │ 检查 stop   │
              │     │   reason    │
              │     └──────┬──────┘
              │            │
       ┌──────┼────────────┼──────┐
       │      │            │      │
       ▼      ▼            ▼      ▼
   end_turn  tool_use  max_tokens  error
       │      │            │      │
       │      ▼            ▼      │
       │  ┌────────┐  ┌────────┐ │
       │  │执行工具│  │扩大token│ │
       │  └───┬────┘  └────┬───┘ │
       │      │            │     │
       └──────┴────────────┴─────┘
                    │ continue
                    ▼
              turn_start
```

---

## 3. StreamingToolExecutor 并发模型

### 3.1 工具执行策略

pi 支持工具的并发执行，特别是只读工具：

```typescript
// packages/agent/src/agent-loop.ts
export function groupToolsByConcurrency(
  tools: ToolCall[]
): ToolCall[][] {
  // 可并发组：只读工具（Read, Grep, Glob 等）
  const concurrencySafe = tools.filter(t => isReadOnlyTool(t))
  // 需串行组：写操作工具（Bash, Write, Edit 等）
  const exclusive = tools.filter(t => !isReadOnlyTool(t))

  return [
    ...(concurrencySafe.length > 0 ? [concurrencySafe] : []),
    ...(exclusive.length > 0 ? [exclusive] : []),
  ]
}
```

### 3.2 执行循环

```typescript
async function executeToolGroup(
  group: ToolCall[],
  harness: AgentHarness,
  session: AgentSession,
): Promise<ToolResult[]> {
  return Promise.all(group.map(tool =>
    harness.executeTool(session, tool)
  ))
}
```

---

## 4. 压缩触发器

### 4.1 自动压缩状态

```typescript
// packages/agent/src/harness/compaction/compaction.ts
export interface AutoCompactTrackingState {
  consecutiveFailures: number
  lastCompactTime: number
  compactReason: CompactReason
}

export type CompactReason =
  | 'token_limit'
  | 'auto_compact'
  | 'manual'
  | 'reactive'
```

### 4.2 压缩触发条件

pi 的压缩在以下条件触发：

1. **Token 超限**：当前消息列表接近模型上下文窗口
2. **自动压缩**：按配置的 interval 定期压缩
3. **手动触发**：用户通过命令触发
4. **响应式压缩**：连续操作失败后触发

### 4.3 4 阶段压缩管道

```typescript
// 阶段 1: Snip - 移除过长的 tool result 内容
// 阶段 2: Microcompact - 合并连续的工具调用为摘要
// 阶段 3: Context Collapse - 折叠早期对话
// 阶段 4: AutoCompact - 完整上下文压缩
```

---

## 5. 熔断器模式

### 5.1 压缩熔断器

```typescript
// packages/agent/src/harness/compaction/compaction.ts
export class CompactionCircuitBreaker {
  private failureCount = 0
  private lastFailureTime = 0

  readonly maxConsecutiveFailures = 3
  readonly cooldownMs = 60_000

  shouldTrip(): boolean {
    return this.failureCount >= this.maxConsecutiveFailures
  }

  recordFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
  }

  recordSuccess(): void {
    this.failureCount = 0
  }

  isInCooldown(): boolean {
    return Date.now() - this.lastFailureTime < this.cooldownMs
  }
}
```

### 5.2 API 熔断器

API 调用使用类似的熔断器模式，防止连续失败导致资源耗尽。

---

## 6. 关键代码解读

### 6.1 Agent 主循环

```typescript
// packages/coding-agent/src/core/agent-session-runtime.ts
export async function* runAgentLoop(
  harness: AgentHarness,
  session: AgentSession,
): AsyncGenerator<AgentEvent, AgentResult> {
  let turnCount = 0
  const maxTurns = session.config.maxTurns ?? 100

  while (turnCount < maxTurns) {
    yield { type: 'turn_start', turnCount }

    // 1. 检查是否需要压缩
    if (shouldCompact(session)) {
      yield* compactContext(session)
    }

    // 2. 生成 AI 响应
    for await (const event of harness.generateResponse(session)) {
      yield event

      // 工具调用事件处理
      if (event.type === 'tool_call') {
        const result = await harness.executeTool(session, event.toolCall)
        session.addMessage({ type: 'tool_result', ...result })
        yield { type: 'tool_result', result }
      }
    }

    // 3. 检查停止条件
    if (session.shouldStop()) {
      break
    }

    turnCount++
  }

  return { turnCount, finalState: session.getState() }
}
```

---

> **下一步阅读**：[第3章 Tools](./chapter-03-tools.md) — 深入工具系统。
