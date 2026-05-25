# 第6章 从零构建最小 Agent

> **本章目标**：从空项目实现一个最小可用 Code Agent。
> **pi 源码对照**：
> - `packages/agent/src/` — Agent Harness 核心
> - `packages/coding-agent/examples/mini-agent/src/` — Mini-agent 示例
>
> **本章结束能做什么**：能运行 mini-agent，并说明它与生产 pi 的差距。
> **阅读时间**：约 60 分钟。

---

## 1. 总体架构

```
mini-agent/
├── src/
│   ├── index.ts          # CLI 入口
│   ├── loop.ts           # Agent Loop
│   ├── api.ts            # 流式 API 客户端
│   ├── prompt.ts         # System Prompt
│   ├── tools/
│   │   ├── index.ts      # 工具接口
│   │   ├── read.ts       # Read 工具
│   │   ├── bash.ts       # Bash 工具
│   │   ├── edit.ts       # Edit 工具
│   │   └── agent.ts      # Sub-agent 工具
│   ├── compact.ts        # 上下文压缩
│   ├── memory.ts         # CLAUDE.md 加载
│   └── mcp.ts           # MCP 客户端
```

---

## 2. Step 1：搭起 Agent Loop 骨架

```typescript
// src/loop.ts
export type Message = {
  role: 'user' | 'assistant' | 'tool'
  content: string
}

export type LoopState = {
  messages: Message[]
  turnCount: number
  totalCostUSD: number
}

export type LoopResult =
  | { reason: 'completed'; state: LoopState }
  | { reason: 'max_turns'; state: LoopState }
  | { reason: 'error'; error: Error }

export async function* runLoop(
  initialInput: string,
  config: LoopConfig,
): AsyncGenerator<LoopEvent, LoopResult> {
  const state: LoopState = {
    messages: [{ role: 'user', content: initialInput }],
    turnCount: 0,
    totalCostUSD: 0,
  }

  while (state.turnCount < config.maxTurns) {
    yield { type: 'turn_start', turnCount: state.turnCount }

    // 生成 AI 响应
    const response = yield* generateAndExecute(state, config)

    if (response.done) {
      return { reason: 'completed', state }
    }

    state.turnCount++
  }

  return { reason: 'max_turns', state }
}
```

---

## 3. Step 2：实现工具系统

```typescript
// src/tools/index.ts
export interface Tool {
  name: string
  description: string
  inputSchema: ZodType
  execute(input: unknown): Promise<ToolResult>
}

export interface ToolResult {
  type: 'text' | 'error'
  content: string
}
```

### 3.1 Read 工具

```typescript
// src/tools/read.ts
import { readFile } from 'fs/promises'
import { z } from 'zod'
import { Tool } from './index'

export const ReadArgs = z.object({
  file_path: z.string(),
  offset: z.number().optional(),
  limit: z.number().optional(),
})

export const readTool: Tool = {
  name: 'Read',
  description: 'Read the contents of a file',
  inputSchema: ReadArgs,

  async execute(input) {
    const args = ReadArgs.parse(input)
    const content = await readFile(args.file_path, 'utf-8')
    const lines = content.split('\n')
    const start = args.offset ?? 0
    const end = args.limit ? start + args.limit : lines.length
    return { type: 'text', content: lines.slice(start, end).join('\n') }
  },
}
```

### 3.2 Bash 工具

```typescript
// src/tools/bash.ts
import { exec } from 'child_process'
import { promisify } from 'util'
import { z } from 'zod'
import { Tool } from './index'

const execAsync = promisify(exec)

export const BashArgs = z.object({
  command: z.string(),
  timeout: z.number().optional(),
})

export const bashTool: Tool = {
  name: 'Bash',
  description: 'Execute a shell command',
  inputSchema: BashArgs,

  async execute(input) {
    const args = BashArgs.parse(input)
    try {
      const { stdout, stderr } = await execAsync(args.command, {
        timeout: args.timeout ?? 120_000,
      })
      return { type: 'text', content: stdout + stderr }
    } catch (error) {
      return { type: 'error', content: error.message }
    }
  },
}
```

---

## 4. Step 3：实现流式 API

```typescript
// src/api.ts
import { z } from 'zod'

export const MessageParam = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

export async function* streamMessage(
  apiKey: string,
  params: {
    model: string
    messages: z.infer<typeof MessageParam>[]
    tools: ToolDefinition[]
    systemPrompt: string
  }
): AsyncGenerator<StreamEvent> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      tools: params.tools,
      system: params.systemPrompt,
      stream: true,
      max_tokens: 4096,
    }),
  })

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6))
        yield parseSSEEvent(data)
      }
    }
  }
}
```

---

## 5. Step 4：实现压缩

```typescript
// src/compact.ts
export function compactMessages(
  messages: Message[],
  maxTokens: number,
): Message[] {
  // 阶段 1: Snip - 截断过长的 tool result
  let result = snipLongToolResults(messages, 500)

  // 阶段 2: Microcompact - 合并连续的工具调用为摘要
  result = microcompact(result)

  // 阶段 3: 如果还不够，折叠早期对话
  if (estimateTokens(result) > maxTokens) {
    result = collapseOldMessages(result)
  }

  return result
}

function snipLongToolResults(messages: Message[], maxLength: number): Message[] {
  return messages.map(msg => {
    if (msg.role === 'tool' && msg.content.length > maxLength) {
      return {
        ...msg,
        content: msg.content.slice(0, maxLength) + '\n... [snipped]',
      }
    }
    return msg
  })
}
```

---

## 6. Step 5：实现 CLAUDE.md 加载

```typescript
// src/memory.ts
import { readFile } from 'fs/promises'
import { glob } from 'glob'
import { join } from 'path'

export async function loadCLAUDEMDs(
  projectRoot: string,
): Promise<string[]> {
  const patterns = [
    join(projectRoot, 'CLAUDE.md'),
    join(projectRoot, '.claude', 'CLAUDE.md'),
    join(projectRoot, '.claude', 'instructions.md'),
  ]

  const results: string[] = []

  for (const pattern of patterns) {
    try {
      const files = await glob(pattern)
      for (const file of files) {
        const content = await readFile(file, 'utf-8')
        results.push(content)
      }
    } catch {
      // File not found, skip
    }
  }

  return results
}
```

---

## 7. 运行 mini-agent

```bash
cd examples/mini-agent
npm install
ANTHROPIC_API_KEY=sk-xxx npm run start "Fix the bug in src/index.ts"
```

---

## 8. 与生产 pi 的差距

| 功能 | mini-agent | 生产 pi |
|------|-----------|---------|
| 工具数量 | 4 个 | 40+ 个 |
| 压缩管道 | 2 阶段 | 4 阶段 |
| 权限系统 | 无 | 完整权限流水线 |
| Hook 系统 | 无 | 27 个注入点 |
| MCP 支持 | 基础 | 完整 MCP 支持 |
| Eval 系统 | 基础 | 完整 Eval 平台 |

---

> **下一步阅读**：[第7章 Context Engineering](./chapter-07-context-engineering.md) — 上下文工程深入。
