# 第4章 Streaming API Client：流式通信

> **本章目标**：解释模型事件流如何驱动 Agent Loop，处理重试、fallback 和 usage。
> **pi 源码对照**：
> - `packages/ai/src/` — AI Provider 客户端
> - `packages/agent/src/harness/agent-harness.ts` — Harness 中的 API 调用
> - `packages/coding-agent/src/core/messages.ts` — 消息处理
>
> **本章结束能做什么**：能实现一个可消费 streaming content block、可恢复错误、可记录 cost 的 API 客户端层。
> **阅读时间**：约 30 分钟。

---

## 1. API 客户端架构

### 1.1 客户端接口

```typescript
// packages/ai/src/client.ts
export interface AIClient {
  messages: {
    create(params: MessageCreateParams): Promise<Message>
    stream(params: MessageCreateParams): AsyncGenerator<StreamEvent>
  }
}
```

### 1.2 流式响应解析

SSE 事件流 → 结构化 ContentBlock：

```
event: message_start
data: {"type":"message_start","message":{...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}

event: message_stop
data: {"type":"message_stop"}
```

---

## 2. pi 的消息流

### 2.1 消息创建

```typescript
// packages/coding-agent/src/core/messages.ts
export async function createMessage(
  client: AIClient,
  params: MessageCreateParams,
): Promise<Message> {
  return client.messages.create(params)
}
```

### 2.2 流式消息

```typescript
// packages/coding-agent/src/core/messages.ts
export async function* streamMessage(
  client: AIClient,
  params: MessageCreateParams,
): AsyncGenerator<StreamEvent> {
  const stream = await client.messages.stream(params)

  for await (const event of stream) {
    yield mapEvent(event)
  }
}

function mapEvent(event: SDKEvent): StreamEvent {
  switch (event.type) {
    case 'content_block_delta':
      if (event.delta.type === 'text_delta') {
        return { type: 'text', text: event.delta.text }
      }
      if (event.delta.type === 'input_json_delta') {
        return { type: 'tool_input', partial: event.delta.partial_json }
      }
      break
    case 'content_block_start':
      if (event.content_block.type === 'tool_use') {
        return { type: 'tool_start', id: event.content_block.id, name: event.content_block.name }
      }
      break
    case 'message_delta':
      return { type: 'message_delta', stop_reason: event.delta.stop_reason }
  }
  return { type: 'unknown', event }
}
```

---

## 3. 重试机制

### 3.1 重试策略

```typescript
// packages/ai/src/retry.ts
export interface RetryOptions {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  retryableErrors: string[]
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: Error

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (!isRetryable(error, options.retryableErrors)) {
        throw error
      }

      if (attempt < options.maxRetries) {
        const delay = Math.min(
          options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt),
          options.maxDelayMs,
        )
        await sleep(delay)
      }
    }
  }

  throw lastError!
}
```

### 3.2 错误分类

| 错误类型 | 处理策略 | 重试 |
|---------|---------|------|
| `401 Unauthorized` | 刷新 token | 否 |
| `429 Rate Limit` | 指数退避 | 是 |
| `529 Service Unavailable` | 降级到 fallback 模型 | 是 |
| `ECONNRESET` | 立即重试 | 是 |
| `Timeout` | 增加超时重试 | 是 |

---

## 4. Usage 与成本追踪

### 4.1 Usage 记录

```typescript
// packages/agent/src/harness/session/session.ts
export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  totalCostUSD: number
}

export function trackUsage(
  session: AgentSession,
  usage: ModelUsage,
): void {
  session.totalCost += usage.totalCostUSD

  if (!session.modelUsage[session.config.model]) {
    session.modelUsage[session.config.model] = {
      inputTokens: 0,
      outputTokens: 0,
      totalCostUSD: 0,
    }
  }

  const current = session.modelUsage[session.config.model]
  current.inputTokens += usage.inputTokens
  current.outputTokens += usage.outputTokens
  current.totalCostUSD += usage.totalCostUSD
}
```

---

## 5. Prompt Cache 协同

### 5.1 缓存标记

```typescript
// packages/ai/src/client.ts
export function buildCachedPrompt(
  staticContent: string,
  dynamicContent: string,
): { static: CachedContent, dynamic: string } {
  return {
    static: {
      type: 'text',
      text: staticContent,
      cache_control: { type: 'ephemeral' as const },
    },
    dynamic: dynamicContent,
  }
}
```

### 5.2 缓存命中率追踪

```typescript
// packages/agent/src/harness/session/session.ts
export function trackCacheHit(
  session: AgentSession,
  usage: { cache_read_input_tokens?: number },
): void {
  if (usage.cache_read_input_tokens) {
    session.cacheHits += usage.cache_read_input_tokens
  }
}
```

---

> **下一步阅读**：[第5章 System Prompt](./chapter-05-system-prompt.md) — System Prompt 构建。
