# 第5章 System Prompt：行为宪法

> **本章目标**：解释 System Prompt 如何约束 Agent 行为并参与缓存。
> **pi 源码对照**：
> - `packages/coding-agent/src/core/system-prompt.ts` — System Prompt 构建
> - `packages/coding-agent/src/core/prompt-templates.ts` — Prompt 模板
> - `packages/agent/src/harness/system-prompt.ts` — Harness Prompt
>
> **本章结束能做什么**：能把行为规范、工具规则、动态环境和 Skill 指令组织成可维护 prompt。
> **阅读时间**：约 20 分钟。

---

## 1. System Prompt 的角色

System Prompt 是 Agent 的"宪法"——它定义了 AI 的能力边界、行为约束和交互范式。

### 1.1 核心组成

```typescript
// packages/coding-agent/src/core/system-prompt.ts
export interface SystemPromptSections {
  // 静态区（可缓存）
  intro: string           // 身份定义
  systemRules: string    // 系统级行为规则
  toolGuidelines: string // 工具使用契约
  toneAndStyle: string   // 语气风格

  // 动态区（不可缓存）
  sessionGuidance: string // 会话特定指导
  memoryContext: string   // 记忆上下文
  mcpInstructions: string // MCP 指令
  scratchpad: string     // 草稿区
}
```

---

## 2. 模块化构建

### 2.1 构建入口

```typescript
// packages/coding-agent/src/core/system-prompt.ts
export function buildSystemPrompt(
  config: PromptConfig,
): string[] {
  const sections: string[] = []

  // 静态区（可缓存）
  sections.push(buildIntro(config.model))
  sections.push(buildSystemRules())
  sections.push(buildToolGuidelines(config.tools))
  sections.push(buildToneAndStyle(config.outputStyle))

  // 动态区（不可缓存）
  sections.push(buildSessionGuidance(config.session))
  sections.push(buildMemoryContext(config.memory))
  sections.push(buildMcpInstructions(config.mcpServers))

  return sections
}
```

### 2.2 缓存边界

```
┌─────────────────────────────────────────────────────────────┐
│  静态区（可缓存）                                            │
│  - 身份定义                                                 │
│  - 工具契约                                                 │
│  - 语气风格                                                 │
└─────────────────────────────────────────────────────────────┘
                        ↓
         SYSTEM_PROMPT_DYNAMIC_BOUNDARY
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  动态区（不可缓存）                                          │
│  - 会话特定指导                                              │
│  - 记忆上下文                                               │
│  - MCP 指令                                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 工具契约

### 3.1 工具优先原则

```typescript
// packages/coding-agent/src/core/prompt-templates.ts
export const TOOL_GUIDELINES = `
To read files use the Read tool instead of cat, head, tail, or sed.
To edit files use the Edit tool instead of sed or awk.
To create files use the Write tool instead of cat with heredoc.
To search for files use the Glob tool instead of find or ls.
To search the content of files use Grep instead of grep.

Reserve using Bash exclusively for system commands that require shell execution.
`
```

### 3.2 风险管控原则

```typescript
// packages/coding-agent/src/core/prompt-templates.ts
export const RISK_GUIDELINES = `
Carefully consider the reversibility and blast radius of actions.

Generally you can freely take local, reversible actions like editing files.
But for actions that are hard to reverse or affect shared systems, check with the user before proceeding.

Examples of risky actions that warrant user confirmation:
- Destructive: deleting files/branches, dropping database tables
- Hard-to-reverse: force-pushing, git reset --hard
- Shared state: pushing code, creating PRs, sending messages
`
```

---

## 4. Skill 注入

### 4.1 Skill 加载时机

```typescript
// packages/coding-agent/src/core/skills.ts
export function injectSkillInstructions(
  skills: Skill[],
): string[] {
  return skills.map(skill => `
## Skill: ${skill.name}

${skill.description}

${skill.instructions}
`)
}
```

---

## 5. pi 源码实现

```typescript
// packages/agent/src/harness/system-prompt.ts
export class SystemPromptBuilder {
  private sections: string[] = []

  addStaticSection(content: string): this {
    this.sections.push(content)
    return this
  }

  addDynamicSection(content: string): this {
    this.sections.push(content)
    return this
  }

  build(): string[] {
    return this.sections
  }

  toString(): string {
    return this.sections.join('\n\n')
  }
}
```

---

> **下一步阅读**：[第6章 从零构建最小 Agent](./chapter-06-build-from-zero.md) — 动手实践。
