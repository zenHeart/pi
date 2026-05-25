# 第11章 记忆系统

> **本章目标**：解释项目指令、用户记忆和会话上下文如何长期影响 Agent。
> **pi 源码对照**：
> - `packages/agent/src/harness/session/memory-repo.ts` — 记忆仓库
> - `packages/agent/src/harness/session/memory-storage.ts` — 记忆存储
> - `packages/coding-agent/src/core/resource-loader.ts` — 资源加载
>
> **本章结束能做什么**：能设计文件系统优先的记忆加载、提取、更新机制。
> **阅读时间**：约 30 分钟。

---

## 1. 三层个性化体系

### 1.1 三层对比

| 层 | 存储位置 | 生命周期 | 写入者 | 用途 |
|---|---|---|---|---|
| **CLAUDE.md** | 项目文件系统 | 随代码版本控制 | 团队成员提交 | 架构约定、代码规范 |
| **记忆系统** | `~/.claude/projects/<slug>/memory/` | 跨会话持久 | 模型自动提取 | 用户偏好、反馈校正 |
| **输出风格** | 配置层 | 按需加载 | 当前对话 | 回复风格 |

### 1.2 CLAUDE.md 层级

```
项目根/
├── CLAUDE.md                    # 项目级
└── .claude/
    ├── CLAUDE.md               # 项目配置
    ├── rules/
    │   └── *.md               # 条件规则
    └── memory/                 # 记忆存储
        ├── user-memory.md
        └── project-memory.md
```

---

## 2. 记忆类型

### 2.1 记忆类型定义

```typescript
// packages/agent/src/harness/session/memory-storage.ts
export type MemoryType =
  | 'user_preference'   // 用户偏好
  | 'feedback'          // 反馈校正
  | 'project_context'   // 项目上下文
  | 'reference'         // 外部指针

export interface MemoryEntry {
  id: string
  type: MemoryType
  content: string
  createdAt: Date
  updatedAt: Date
  source: 'extracted' | 'manual' | 'user_feedback'
}
```

### 2.2 记忆提取

```typescript
// packages/agent/src/harness/session/memory-repo.ts
export async function extractMemory(
  messages: Message[],
): Promise<MemoryEntry[]> {
  // 从对话历史中提取记忆
  const extractionPrompt = `
从以下对话中提取关键的用户偏好和项目信息：

${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

返回格式：
- 用户偏好: ...
- 项目上下文: ...
- 反馈校正: ...
`

  const response = await callModel(extractionPrompt)
  return parseMemoryEntries(response)
}
```

---

## 3. 记忆加载

### 3.1 加载流程

```typescript
// packages/coding-agent/src/core/resource-loader.ts
export async function loadMemoryForSession(
  session: AgentSession,
): Promise<string[]> {
  const memoryFiles = await findMemoryFiles(session.projectRoot)
  const memories: string[] = []

  for (const file of memoryFiles) {
    const content = await readFile(file, 'utf-8')
    const { data, content: body } = parseFrontmatter(content)

    // 检查是否适用当前会话
    if (isApplicable(data, session)) {
      memories.push(body)
    }
  }

  return memories
}

function isApplicable(
  frontmatter: Record<string, unknown>,
  session: AgentSession,
): boolean {
  // 检查条件规则
  const when = frontmatter.when as string | undefined
  if (!when) return true

  return evaluateCondition(when, {
    cwd: session.cwd,
    projectRoot: session.projectRoot,
    model: session.config.model,
  })
}
```

---

## 4. 记忆预取

### 4.1 首轮预取

```typescript
// packages/agent/src/harness/session/memory-storage.ts
export class MemoryManager {
  private cache: Map<string, MemoryEntry[]> = new Map()

  async prefetch(session: AgentSession): Promise<void> {
    // 在第一轮循环前预取所有记忆
    const memories = await this.loadAllMemories(session)
    this.cache.set(session.id, memories)
  }

  async getActiveMemories(session: AgentSession): Promise<string[]> {
    const cached = this.cache.get(session.id)
    if (cached) {
      return cached.map(m => m.content)
    }
    return this.loadAllMemories(session)
  }

  async updateMemory(
    session: AgentSession,
    entry: MemoryEntry,
  ): Promise<void> {
    await this.storage.save(entry)
    // 更新缓存
    const existing = this.cache.get(session.id) ?? []
    const index = existing.findIndex(e => e.id === entry.id)
    if (index >= 0) {
      existing[index] = entry
    } else {
      existing.push(entry)
    }
    this.cache.set(session.id, existing)
  }
}
```

---

## 5. Team Memory

### 5.1 团队记忆共享

```typescript
// packages/agent/src/harness/session/memory-storage.ts
export interface TeamMemory {
  teamId: string
  sharedMemories: MemoryEntry[]
  memberMemories: Map<string, MemoryEntry[]>
}

export async function loadTeamMemory(
  teamId: string,
): Promise<TeamMemory> {
  const sharedDir = getTeamMemoryDir(teamId)
  const sharedFiles = await glob(`${sharedDir}/shared/*.md`)

  const sharedMemories: MemoryEntry[] = []
  for (const file of sharedFiles) {
    const content = await readFile(file, 'utf-8')
    sharedMemories.push(parseMemoryFile(content))
  }

  return { teamId, sharedMemories, memberMemories: new Map() }
}
```

---

> **下一步阅读**：[第12章 Session Resume](./chapter-12-session-resume.md) — 会话恢复。
