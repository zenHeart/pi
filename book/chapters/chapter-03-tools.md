# 第3章 Tools：工具系统

> **本章目标**：解释 Tool 接口、工具注册、权限入口和并发执行模型。
> **pi 源码对照**：
> - `packages/coding-agent/src/core/tools/index.ts` — 工具注册表
> - `packages/coding-agent/src/core/tools/bash.ts` — Bash 工具
> - `packages/coding-agent/src/core/tools/read.ts` — Read 工具
> - `packages/coding-agent/src/core/tools/edit.ts` — Edit 工具
> - `packages/coding-agent/src/core/tools/write.ts` — Write 工具
> - `packages/coding-agent/src/core/tools/find.ts` — Glob/Find 工具
> - `packages/coding-agent/src/core/tools/grep.ts` — Grep 工具
>
> **本章结束能做什么**：能实现一个可注册、可校验、可并发分组、可被模型调用的工具系统。
> **阅读时间**：约 30 分钟。

---

## 1. 工具四分类模型

pi 的工具按**风险等级**和**能力类型**划分为四个梯队：

| 分类 | 工具列表 | 并发特性 | 权限行为 |
|------|----------|----------|----------|
| **观察类 (Read-only)** | Read, Grep, Glob, WebFetch | 可并发执行 | 通常放行 |
| **计划类 (Planning)** | TaskCreate, TaskUpdate | 串行执行 | 低风险 |
| **执行类 (Write)** | Write, Edit, Bash | 串行执行 | 中度权限检查 |
| **高风险类 (High-risk)** | Bash(write/delete), Agent, Skill | 串行执行 | 强制权限确认 |

### 1.1 并发安全判断

```typescript
// packages/coding-agent/src/core/tools/index.ts
export function isReadOnlyTool(toolName: string): boolean {
  const readOnlyTools = ['Read', 'Glob', 'Grep', 'WebFetch', 'TaskList', 'TaskGet']
  return readOnlyTools.includes(toolName)
}

export function isConcurrencySafe(toolName: string): boolean {
  return isReadOnlyTool(toolName)
}
```

---

## 2. 工具接口

### 2.1 Tool 基类

```typescript
// packages/coding-agent/src/core/tools/index.ts
export interface Tool {
  name: string
  description: string
  inputSchema: ZodType
  execute(input: unknown): Promise<ToolResult>
  isReadOnly?(): boolean
  isConcurrencySafe?(): boolean
  isDestructive?(): boolean
}
```

### 2.2 pi 内置工具

```typescript
// packages/coding-agent/src/core/tools/index.ts
export const BUILT_IN_TOOLS: Tool[] = [
  ReadTool,
  BashTool,
  EditTool,
  WriteTool,
  GlobTool,
  GrepTool,
  LsTool,
]
```

---

## 3. Read 工具详解

### 3.1 实现

```typescript
// packages/coding-agent/src/core/tools/read.ts
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { Tool } from './index'

export const ReadArgs = z.object({
  file_path: z.string().describe('Path to the file to read'),
  offset: z.number().int().nonnegative().optional()
    .describe('Line offset (0-indexed)'),
  limit: z.number().int().positive().optional()
    .describe('Maximum number of lines to read'),
})

export type ReadArgs = z.infer<typeof ReadArgs>

export const readTool: Tool = {
  name: 'Read',
  description: 'Read the contents of a file',
  inputSchema: ReadArgs,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,

  async execute(input: unknown) {
    const args = ReadArgs.parse(input)

    try {
      const content = await readFile(args.file_path, 'utf-8')
      const lines = content.split('\n')

      const start = args.offset ?? 0
      const end = args.limit ? start + args.limit : lines.length

      const selectedLines = lines.slice(start, end)
      const output = selectedLines.join('\n')

      return {
        type: 'text',
        content: output,
        metadata: {
          linesRead: selectedLines.length,
          totalLines: lines.length,
        }
      }
    } catch (error) {
      return {
        type: 'error',
        content: `Failed to read file: ${error.message}`,
      }
    }
  },
}
```

### 3.2 关键设计点

- **Zod 校验**：`ReadArgs.parse(input)` 在工具入口做运行时校验
- **行偏移支持**：`offset` + `limit` 支持大文件的部分读取
- **只读标记**：`isReadOnly: () => true` 使工具可并发执行

---

## 4. Bash 工具详解

### 4.1 实现

```typescript
// packages/coding-agent/src/core/tools/bash.ts
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import { Tool } from './index'

const execAsync = promisify(exec)

export const BashArgs = z.object({
  command: z.string().describe('Shell command to execute'),
  timeout: z.number().int().positive().optional()
    .describe('Timeout in milliseconds'),
  cwd: z.string().optional()
    .describe('Working directory for the command'),
})

export type BashArgs = z.infer<typeof BashArgs>

export const bashTool: Tool = {
  name: 'Bash',
  description: 'Execute a shell command',
  inputSchema: BashArgs,
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: (input) => {
    const cmd = (input as BashArgs).command ?? ''
    const destructivePatterns = [
      /rm\s+-rf/i, /drop\s+database/i,
      /git\s+push\s+--force/i, />\s*\//,
    ]
    return destructivePatterns.some(p => p.test(cmd))
  },

  async execute(input: unknown) {
    const args = BashArgs.parse(input)

    try {
      const { stdout, stderr } = await execAsync(args.command, {
        timeout: args.timeout ?? 120_000,
        cwd: args.cwd,
      })

      return {
        type: 'text',
        content: stdout + stderr,
        metadata: {
          exitCode: 0,
        }
      }
    } catch (error) {
      return {
        type: 'error',
        content: error.message,
        metadata: {
          exitCode: error.code ?? 1,
        }
      }
    }
  },
}
```

### 4.2 关键设计点

- **破坏性检测**：`isDestructive` 检查危险命令模式
- **超时控制**：默认 120 秒超时
- **错误处理**：返回 exitCode 供 Agent 判断是否重试

---

## 5. Edit 工具详解

### 5.1 实现

```typescript
// packages/coding-agent/src/core/tools/edit.ts
import { z } from 'zod'
import { readFile, writeFile } from 'fs/promises'
import { Tool } from './index'

export const EditArgs = z.object({
  file_path: z.string().describe('Path to the file to edit'),
  old_string: z.string().describe('Text to replace (exact match)'),
  new_string: z.string().describe('Replacement text'),
})

export type EditArgs = z.infer<typeof EditArgs>

export const editTool: Tool = {
  name: 'Edit',
  description: 'Edit a file by replacing text',
  inputSchema: EditArgs,
  isReadOnly: () => false,
  isConcurrencySafe: () => false,

  async execute(input: unknown) {
    const args = EditArgs.parse(input)

    const content = await readFile(args.file_path, 'utf-8')

    if (!content.includes(args.old_string)) {
      return {
        type: 'error',
        content: `old_string not found in file: ${args.file_path}`,
      }
    }

    const newContent = content.replace(args.old_string, args.new_string)
    await writeFile(args.file_path, newContent, 'utf-8')

    return {
      type: 'text',
      content: `Successfully edited ${args.file_path}`,
    }
  },
}
```

---

## 6. 工具注册表

### 6.1 工具池组装

```typescript
// packages/coding-agent/src/core/tools/index.ts
export function getToolByName(name: string): Tool | undefined {
  return BUILT_IN_TOOLS.find(t => t.name === name)
}

export function getAllToolDefinitions(): ToolDefinition[] {
  return BUILT_IN_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: zodToJsonSchema(tool.inputSchema),
  }))
}
```

### 6.2 工具执行入口

```typescript
// packages/coding-agent/src/core/tools/index.ts
export async function executeTool(
  toolName: string,
  toolInput: unknown,
  tools: Tool[],
): Promise<ToolResult> {
  const tool = tools.find(t => t.name === toolName)

  if (!tool) {
    return {
      type: 'error',
      content: `Tool not found: ${toolName}`,
    }
  }

  return tool.execute(toolInput)
}
```

---

## 7. 工具并发分组

### 7.1 分组策略

```typescript
// packages/coding-agent/src/core/tools/index.ts
export function groupToolCallsByConcurrency(
  toolCalls: ToolCall[],
): ToolCall[][] {
  const readOnly = toolCalls.filter(tc =>
    isReadOnlyTool(tc.name)
  )
  const write = toolCalls.filter(tc =>
    !isReadOnlyTool(tc.name)
  )

  const groups: ToolCall[][] = []
  if (readOnly.length > 0) groups.push(readOnly)
  if (write.length > 0) groups.push(write)

  return groups
}
```

### 7.2 并发执行

```typescript
export async function executeToolGroup(
  group: ToolCall[],
  tools: Tool[],
): Promise<ToolResult[]> {
  return Promise.all(
    group.map(tc => executeTool(tc.name, tc.input, tools))
  )
}
```

---

> **下一步阅读**：[第4章 Streaming API Client](./chapter-04-streaming-api-client.md) — API 客户端深度。
