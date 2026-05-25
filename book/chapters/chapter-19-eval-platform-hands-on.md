# 第19章 Eval 平台实操

> **本章目标**：把 Eval 理论落到 runner、transcript、viewer 和 CI artifact。
> **pi 源码对照**：
> - `packages/coding-agent/examples/mini-agent/src/evalRunner.ts` — Eval Runner
> - `packages/coding-agent/examples/mini-agent/src/viewer.ts` — Transcript Viewer
> - `packages/coding-agent/examples/mini-agent/src/transcript.ts` — Transcript 处理
>
> **本章结束能做什么**：能用同一份 transcript 产出结果、回放视图和失败归因。
> **阅读时间**：约 40 分钟。

---

## 1. Eval 数据结构

### 1.1 EvalCase

```typescript
// examples/mini-agent/src/evalRunner.ts
export interface EvalCase {
  id: string
  name: string
  description: string
  input: string
  expected: EvalAssertion[]
  unacceptable?: string[]
}

export interface EvalAssertion {
  type: 'contains' | 'regex' | 'json' | 'file_exists'
  value: string
  description: string
}

export interface EvalResult {
  caseId: string
  passed: boolean
  score: number
  output: string
  assertions: AssertionResult[]
  cost: number
  duration: number
}
```

---

## 2. Eval Runner

### 2.1 核心实现

```typescript
// examples/mini-agent/src/evalRunner.ts
export async function runEvalCase(
  agent: MiniAgent,
  evalCase: EvalCase,
): Promise<EvalResult> {
  const startTime = Date.now()

  // 运行 Agent
  const output = await agent.run(evalCase.input)

  // 评估结果
  const assertionResults: AssertionResult[] = []
  for (const assertion of evalCase.expected) {
    const result = await evaluateAssertion(output, assertion)
    assertionResults.push(result)
  }

  const passed = assertionResults.every(r => r.passed)
  const score = passed ? 1 : 0

  return {
    caseId: evalCase.id,
    passed,
    score,
    output,
    assertions: assertionResults,
    cost: agent.totalCost,
    duration: Date.now() - startTime,
  }
}
```

---

## 3. Transcript Viewer

### 3.1 Viewer 实现

```typescript
// examples/mini-agent/src/viewer.ts
export function generateTranscriptHtml(
  transcript: TranscriptEntry[],
): string {
  const rows = transcript.map(entry => {
    switch (entry.type) {
      case 'user':
        return `<div class="user-message">${escapeHtml(entry.data.content)}</div>`
      case 'assistant':
        return `<div class="assistant-message">${escapeHtml(entry.data.content)}</div>`
      case 'tool_use':
        return `<div class="tool-call">
          <span class="tool-name">${entry.data.tool}</span>
          <pre>${escapeHtml(JSON.stringify(entry.data.input))}</pre>
        </div>`
      case 'tool_result':
        return `<div class="tool-result">
          <pre>${escapeHtml(entry.data.content)}</pre>
        </div>`
    }
  }).join('\n')

  return `<!DOCTYPE html>
<html>
<head><title>Transcript Viewer</title>
<style>${VIEWER_CSS}</style></head>
<body>${rows}</body>
</html>`
}
```

---

## 4. CI 集成

### 4.1 Regression Gate

```typescript
// examples/mini-agent/src/evalRunner.ts
export async function runRegressionGate(
  results: EvalResult[],
  threshold: number = 0.8,
): Promise<boolean> {
  const passedRate = results.filter(r => r.passed).length / results.length

  if (passedRate < threshold) {
    console.error(`Regression: ${passedRate * 100}% < ${threshold * 100}%`)
    return false
  }

  return true
}
```

---

> **下一步阅读**：[第20章 部署与运维](./chapter-20-deployment-and-ops.md) — 容器化部署。
