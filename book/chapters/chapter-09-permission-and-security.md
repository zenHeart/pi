# 第9章 权限与安全

> **本章目标**：解释 Agent 操作真实文件系统和 shell 时的权限边界。
> **pi 源码对照**：
> - `packages/coding-agent/src/core/exec.ts` — 执行引擎
> - `packages/coding-agent/src/core/bash-executor.ts` — Bash 执行器
> - `packages/agent/src/harness/agent-harness.ts` — Harness 权限接口
>
> **本章结束能做什么**：能设计 allow/deny/ask、模式切换和规则来源。
> **阅读时间**：约 25 分钟。

---

## 1. 权限模型

### 1.1 权限模式

```typescript
// packages/agent/src/harness/types.ts
export type PermissionMode =
  | 'default'     // 交互式弹窗
  | 'acceptEdits' // 自动接受文件编辑
  | 'bypassPermissions' // 完全绕过
  | 'dontAsk'    // 自动拒绝
  | 'plan'       // 计划模式（只读）
  | 'auto'       // AI 分类器自动审批
```

### 1.2 权限决策

```typescript
// packages/agent/src/harness/agent-harness.ts
export interface PermissionRequest {
  tool: string
  input: object
  risk: 'low' | 'medium' | 'high'
  reason?: string
}

export type PermissionDecision = 'allow' | 'deny' | 'ask'

export function evaluatePermission(
  request: PermissionRequest,
  mode: PermissionMode,
  rules: PermissionRule[],
): PermissionDecision {
  switch (mode) {
    case 'bypassPermissions':
      return 'allow'
    case 'dontAsk':
      return 'deny'
    case 'plan':
      return 'allow' // 计划模式只读
    case 'acceptEdits':
      if (request.tool === 'Edit' || request.tool === 'Write') {
        return 'allow'
      }
      return 'ask'
    case 'auto':
      return autoClassify(request)
    default:
      return 'ask'
  }
}
```

---

## 2. 风险分类

### 2.1 工具风险等级

```typescript
// packages/coding-agent/src/core/exec.ts
export const TOOL_RISK_LEVELS: Record<string, 'low' | 'medium' | 'high'> = {
  Read: 'low',
  Glob: 'low',
  Grep: 'low',
  WebFetch: 'low',
  Edit: 'medium',
  Write: 'medium',
  Bash: 'high',
  Agent: 'high',
  Skill: 'high',
}
```

### 2.2 内容风险检测

```typescript
// packages/coding-agent/src/core/exec.ts
export function detectDestructivePatterns(
  command: string,
): string[] {
  const patterns = [
    { regex: /rm\s+-rf/i, name: 'Recursive delete' },
    { regex: /drop\s+database/i, name: 'Database drop' },
    { regex: /git\s+push\s+--force/i, name: 'Force push' },
    { regex: /\|\s*sudo\s+/i, name: 'Sudo pipe' },
  ]

  return patterns
    .filter(p => p.regex.test(command))
    .map(p => p.name)
}
```

---

## 3. 权限流水线

```
Tool Call → Risk Classification → Rule Matching → Mode Dispatch → Decision
                ↓                    ↓               ↓              ↓
           低/中/高风险          deny/allow      6种模式      allow/deny/ask
```

### 3.1 执行入口

```typescript
// packages/coding-agent/src/core/exec.ts
export async function executeWithPermission(
  tool: string,
  input: object,
  context: ExecutionContext,
): Promise<ExecutionResult> {
  // 1. 风险分类
  const risk = classifyRisk(tool, input)

  // 2. 获取决策
  const decision = evaluatePermission(
    { tool, input, risk },
    context.permissionMode,
    context.rules,
  )

  // 3. 执行或拒绝
  switch (decision) {
    case 'allow':
      return executeTool(tool, input)
    case 'deny':
      return { success: false, error: 'Permission denied' }
    case 'ask':
      return requestUserPermission({ tool, input, risk })
  }
}
```

---

## 4. 提示注入防御

### 4.1 注入模式识别

```typescript
// packages/coding-agent/src/core/exec.ts
export function detectPromptInjection(
  content: string,
): boolean {
  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /disregard\s+(your\s+)?(system|previous)\s+(instruction|prompt)/i,
    /you\s+are\s+now\s+(a|an)\s+(different|new)\s+(AI|assistant)/i,
    /forget\s+(everything|all)\s+(about|you\s+know)/i,
  ]

  return injectionPatterns.some(p => p.test(content))
}
```

### 4.2 防御策略

```typescript
// packages/coding-agent/src/core/exec.ts
export function sanitizeToolResult(
  content: string,
): string {
  // 移除可能的注入模式
  let sanitized = content

  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[filtered]')
  }

  return sanitized
}
```

---

> **下一步阅读**：[第10章 Hook 系统](./chapter-10-hook-system.md) — 生命周期注入。
