# 第12章 Session Resume：会话恢复

> **本章目标**：解释 transcript、history 与 sidechain 如何让长任务可恢复。
> **pi 源码对照**：
> - `packages/agent/src/harness/session/jsonl-repo.ts` — JSONL transcript
> - `packages/agent/src/harness/session/jsonl-storage.ts` — JSONL 存储
> - `packages/coding-agent/src/modes/rpc/jsonl.ts` — RPC 模式 JSONL
>
> **本章结束能做什么**：能实现 JSONL transcript、resume、subagent sidechain。
> **阅读时间**：约 25 分钟。

---

## 1. 为什么需要会话持久化

长任务可能跨越几小时、几天。如果每次重启都从零开始：
- 累计的 cost / tokens 丢失
- 历史对话丢失
- 待办列表丢失
- 记忆 cursor 丢失

---

## 2. 三套持久化机制

| 机制 | 作用 | 持久化位置 |
|------|------|-----------|
| **transcript** | 完整 message 序列 | `~/.claude/projects/<slug>/<sessionId>.jsonl` |
| **history** | 用户 prompt 历史 | `~/.claude/history.jsonl` |
| **sidechain** | 子 Agent 独立序列 | `~/.claude/projects/<slug>/<sessionId>/subagents/` |

---

## 3. Transcript 设计

### 3.1 JSONL 格式

```typescript
// packages/agent/src/harness/session/jsonl-repo.ts
export interface TranscriptEntry {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'summary'
  timestamp: string
  sessionId: string
  data: Record<string, unknown>
}

export class TranscriptRepository {
  async append(entry: TranscriptEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n'
    await appendToFile(this.path, line)
  }

  async load(): Promise<TranscriptEntry[]> {
    const content = await readFile(this.path, 'utf-8')
    return content
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
  }
}
```

### 3.2 Session 恢复

```typescript
// packages/agent/src/harness/session/session.ts
export async function resumeSession(
  sessionId: string,
  harness: AgentHarness,
): Promise<AgentSession> {
  // 1. 加载 transcript
  const transcript = await transcriptRepo.load(sessionId)

  // 2. 重建消息列表
  const messages = transcript
    .filter(e => e.type !== 'tool_result' || e.data.content)
    .map(e => reconstructMessage(e))

  // 3. 恢复成本状态
  const totalCost = transcript
    .filter(e => e.type === 'usage')
    .reduce((sum, e) => sum + (e.data.cost as number), 0)

  // 4. 创建恢复后的 session
  return harness.createSession({
    id: sessionId,
    messages,
    totalCost,
  })
}
```

---

## 4. Sidechain 子 Agent 轨迹

### 4.1 Sidechain 结构

```typescript
// packages/coding-agent/src/modes/rpc/jsonl.ts
export interface SidechainTranscript {
  parentSessionId: string
  agentId: string
  agentType: string
  entries: TranscriptEntry[]
}

export class SidechainManager {
  async createSidechain(
    parentSessionId: string,
    agentId: string,
  ): Promise<SidechainTranscript> {
    const path = join(
      this.sessionsDir,
      parentSessionId,
      'subagents',
      `agent-${agentId}.jsonl`,
    )
    return new SidechainTranscript(parentSessionId, agentId, path)
  }

  async appendToSidechain(
    sidechain: SidechainTranscript,
    entry: TranscriptEntry,
  ): Promise<void> {
    await sidechain.append(entry)
  }
}
```

---

## 5. 大结果引用

### 5.1 引用策略

```typescript
// packages/agent/src/harness/session/jsonl-storage.ts
export interface LargeResultRef {
  type: 'reference'
  refId: string
  storagePath: string
  originalSize: number
  truncatedSize: number
}

export function shouldReference(
  content: string,
  maxInlineSize: number = 1000,
): boolean {
  return content.length > maxInlineSize
}

export async function storeLargeResult(
  sessionId: string,
  toolUseId: string,
  content: string,
): Promise<LargeResultRef> {
  const path = join(
    this.resultsDir,
    sessionId,
    `tool-result-${toolUseId}.txt`,
  )

  await writeFile(path, content, 'utf-8')

  return {
    type: 'reference',
    refId: toolUseId,
    storagePath: path,
    originalSize: content.length,
    truncatedSize: maxInlineSize,
  }
}
```

---

> **下一步阅读**：[第13章 MCP 协议](./chapter-13-mcp-protocol.md) — 外部工具接入。
