# 第21章 RL 集成蓝图

> **本章目标**：解释 RL 训练对接的接口契约和 trajectory 导出。
> **pi 源码对照**：
> - `packages/coding-agent/examples/mini-agent/src/exportTrajectory.ts` — Trajectory 导出
>
> **本章结束能做什么**：能理解 RL trajectory、reward 设计接口。
> **阅读时间**：约 45 分钟。

---

## 1. RL 集成概述

强化学习（RL）用于优化 Agent 的决策策略。核心接口：

```
Agent → Trajectory → Reward 计算 → 训练队列 → RL 训练
```

---

## 2. Trajectory 导出

### 2.1 Trajectory 格式

```typescript
// examples/mini-agent/src/exportTrajectory.ts
export interface TrajectoryStep {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCall?: {
    name: string
    input: object
  }
  toolResult?: {
    content: string
    success: boolean
  }
  metadata: {
    timestamp: number
    tokens: number
    cost: number
  }
}

export interface Trajectory {
  sessionId: string
  taskDescription: string
  steps: TrajectoryStep[]
  finalOutcome: 'success' | 'failure' | 'aborted'
}
```

### 2.2 导出实现

```typescript
// examples/mini-agent/src/exportTrajectory.ts
export async function exportTrajectory(
  session: AgentSession,
  outputPath: string,
): Promise<void> {
  const trajectory: Trajectory = {
    sessionId: session.id,
    taskDescription: session.taskDescription,
    steps: session.transcript.map(entry => ({
      role: entry.type,
      content: entry.data.content ?? '',
      ...(entry.type === 'tool_use' && {
        toolCall: { name: entry.data.tool, input: entry.data.input },
      }),
      ...(entry.type === 'tool_result' && {
        toolResult: { content: entry.data.content, success: !entry.data.error },
      }),
      metadata: {
        timestamp: new Date(entry.timestamp).getTime(),
        tokens: entry.data.tokens ?? 0,
        cost: entry.data.cost ?? 0,
      },
    })),
    finalOutcome: session.outcome,
  }

  await writeFile(outputPath, JSON.stringify(trajectory, null, 2))
}
```

---

## 3. Reward 设计

### 3.1 Reward 接口

```typescript
// examples/mini-agent/src/exportTrajectory.ts
export interface RewardSignal {
  trajectoryId: string
  finalReward: number
  components: {
    taskCompletion: number      // 0-1, 任务是否完成
    efficiency: number         // -1 to 1, token 效率
    safety: number            // 0 or penalty, 是否有安全违规
    humanPreference?: number   // -1 to 1, 人类偏好
  }
  metadata: {
    evaluator: string
    timestamp: number
  }
}
```

---

## 4. 训练接口

### 4.1 训练数据格式

```typescript
// examples/mini-agent/src/exportTrajectory.ts
export interface TrainingExample {
  trajectory: Trajectory
  reward: RewardSignal
  policy: {
    modelName: string
    systemPrompt: string
    tools: string[]
  }
}
```

---

> **下一步阅读**：[第22章 面试速查](./chapter-22-interview-cheatsheet.md) — 面试准备。
