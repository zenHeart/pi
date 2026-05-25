# 第20章 部署与运维

> **本章目标**：解释容器化与运维的最佳实践。
> **pi 源码对照**：
> - `packages/coding-agent/src/main.ts` — 主程序入口
>
> **本章结束能做什么**：能设计 Docker 部署方案。
> **阅读时间**：约 35 分钟。

---

## 1. 容器化

### 1.1 Dockerfile

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

ENV NODE_ENV=production
ENV ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

ENTRYPOINT ["node", "dist/main.js"]
CMD ["--help"]
```

---

## 2. 健康检查

### 2.1 Health Check 端点

```typescript
// packages/coding-agent/src/main.ts
export function setupHealthCheck(server: HttpServer): void {
  server.get('/health', async (req, res) => {
    const status = {
      status: 'ok',
      uptime: process.uptime(),
      version: VERSION,
      sessionCount: sessionManager.size(),
    }
    res.json(status)
  })

  server.get('/ready', async (req, res) => {
    // 检查 API key 是否配置
    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(503).json({ ready: false, reason: 'API key not configured' })
      return
    }
    res.json({ ready: true })
  })
}
```

---

## 3. 信号处理

### 3.1 Graceful Shutdown

```typescript
// packages/coding-agent/src/main.ts
export function setupSignalHandlers(): void {
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`)

    // 停止接收新请求
    server.close()

    // 保存活跃 session
    await sessionManager.saveAll()

    // 刷新待处理的 transcript
    await transcriptManager.flush()

    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}
```

---

## 4. 日志与监控

### 4.1 结构化日志

```typescript
// packages/coding-agent/src/core/telemetry.ts
export interface LogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  service: string
  traceId?: string
  message: string
  attributes?: Record<string, unknown>
}

export function log(
  level: LogEntry['level'],
  message: string,
  attributes?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'pi-agent',
    traceId: getCurrentTraceId(),
    message,
    attributes,
  }

  if (level === 'error') {
    console.error(JSON.stringify(entry))
  } else {
    console.log(JSON.stringify(entry))
  }
}
```

---

> **下一步阅读**：[第21章 RL 集成蓝图](./chapter-21-rl-integration.md) — 强化学习对接。
