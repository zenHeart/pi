# 第14章 Slash Commands：用户触发命令

> **本章目标**：解释用户主动触发的命令如何进入 Agent 编排层。
> **pi 源码对照**：
> - `packages/coding-agent/src/core/slash-commands.ts` — Slash Commands 实现
>
> **本章结束能做什么**：能设计内置命令、自定义 markdown 命令、插件命令。
> **阅读时间**：约 25 分钟。

---

## 1. 命令类型

### 1.1 命令分发

```typescript
// packages/coding-agent/src/core/slash-commands.ts
export type CommandType =
  | 'local'      // 本地立即执行
  | 'prompt'     // 注入到对话流
  | 'local-jsx'  // 弹 UI/Modal

export interface Command {
  name: string
  description: string
  type: CommandType
  execute: (args: string[], context: CommandContext) => Promise<CommandResult>
}
```

---

## 2. 命令来源

| 来源 | 路径 | 优先级 |
|------|------|--------|
| 内置命令 | `commands/` 目录 | 最低 |
| 用户命令 | `~/.claude/commands/*.md` | 中 |
| 项目命令 | `.claude/commands/*.md` | 高 |
| 插件命令 | 插件提供 | 中 |
| MCP | MCP prompts | 中 |

---

## 3. 内置命令

### 3.1 常用内置命令

```typescript
// packages/coding-agent/src/core/slash-commands.ts
export const BUILTIN_COMMANDS: Command[] = [
  {
    name: 'help',
    description: 'Show available commands',
    type: 'local',
    execute: async () => ({ output: 'Available commands...' }),
  },
  {
    name: 'compact',
    description: 'Manually trigger context compaction',
    type: 'prompt',
    execute: async (args, ctx) => ({
      injectMessage: `/compact ${args.join(' ')}`,
    }),
  },
  {
    name: 'clear',
    description: 'Clear conversation history',
    type: 'local',
    execute: async () => ({ clearContext: true }),
  },
  {
    name: 'config',
    description: 'Open config editor',
    type: 'local-jsx',
    execute: async () => ({ openModal: 'config' }),
  },
]
```

---

## 4. 自定义命令

### 4.1 Markdown 命令格式

```markdown
---
name: my-command
description: Does something useful
args:
  - name: arg1
    description: First argument
    required: true
  - name: arg2
    description: Second argument
    required: false
---

# My Command

This command does something useful.

Usage: `/my-command <arg1> [arg2]`
```

### 4.2 命令解析

```typescript
// packages/coding-agent/src/core/slash-commands.ts
export function parseCommandFromMarkdown(
  content: string,
): Command {
  const { data, content: body } = parseFrontmatter(content)

  return {
    name: data.name,
    description: data.description,
    type: determineCommandType(data),
    execute: createExecutor(data, body),
  }
}
```

---

## 5. 命令执行

### 5.1 执行流程

```typescript
// packages/coding-agent/src/core/slash-commands.ts
export async function executeCommand(
  input: string,
  context: CommandContext,
): Promise<CommandResult> {
  // 1. 解析命令名和参数
  const { name, args } = parseCommandInput(input)

  // 2. 查找命令
  const command = findCommand(name)
  if (!command) {
    throw new Error(`Unknown command: ${name}`)
  }

  // 3. 验证参数
  validateArgs(command, args)

  // 4. 执行
  return command.execute(args, context)
}
```

---

> **下一步阅读**：[第15章 Skills 与 Plugins](./chapter-15-skills-and-plugins.md) — 能力打包。
