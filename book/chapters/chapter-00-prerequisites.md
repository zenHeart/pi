# 第0章 前置知识：进入 Agent 世界的 6 把钥匙

> **本章目标**：补齐进入 Agent 领域的最小知识。
> **pi 源码对照**：
> - `packages/ai/src/` — AI API 客户端（Streaming SSE 解析）
> - `packages/agent/src/agent-loop.ts` — AsyncGenerator 状态机模式
> - `packages/coding-agent/src/core/tools/` — 工具系统（Zod 校验）
> - `packages/coding-agent/src/utils/frontmatter.ts` — frontmatter 解析
>
> **本章结束能做什么**：能读懂后续章节中的消息协议、工具调用、AsyncGenerator、Zod 和 frontmatter。
> **阅读时间**：约 60 分钟，含 6 个动手练习。

---

## 0.1 为什么需要这章

后续章节基于真实 TypeScript 源码的逐行剖析，假设读者熟悉：

- LLM 消息协议（role、content、tool_use、tool_result）
- AsyncGenerator 与 `yield` 状态机
- Zod 运行时校验
- Markdown + frontmatter 的配置写法

如果以上任何一项不熟悉，本章是**前置补课**。每节配一个最小练习，跑通即可继续。

---

## 1. LLM API 基础：从一次 Chat Completion 说起

### 1.1 Messages API 的最小心智模型

主流 LLM API 都把对话建模为「消息序列」：

```typescript
type Message =
  | { role: 'system'; content: string }      // 行为约束、身份定义（System Prompt）
  | { role: 'user';   content: ContentBlock[] }  // 用户输入或工具结果
  | { role: 'assistant'; content: ContentBlock[] } // 模型回复
```

`ContentBlock` 可以是文本、图片、思考过程，也可以是工具调用和工具结果：

```typescript
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64' | 'url'; data: string } }
  | { type: 'thinking'; thinking: string }           // 推理链（部分模型支持）
  | { type: 'tool_use'; id: string; name: string; input: object }
  | { type: 'tool_result'; tool_use_id: string; content: string | ContentBlock[] }
```

**最关键的不变式**：每个 `tool_use` 必须有配对的 `tool_result`，且 `tool_use_id` 一致。

### 1.2 流式响应（SSE）

Agent 必须能**边收边处理**：模型一边生成文本，Agent 一边把工具调用 dispatch 出去。这通过 SSE（Server-Sent Events）实现：

```
event: message_start
data: {"type":"message_start","message":{...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}

event: message_stop
data: {"type":"message_stop"}
```

`stop_reason` 是 Agent Loop 退出路径判断的核心字段：
- `end_turn`：模型自主结束
- `tool_use`：模型想调用工具，Agent 需要执行后回喂 `tool_result`
- `max_tokens`：达到上限（需要主动续写或返回错误）
- `stop_sequence`：命中停止序列

### 1.3 prompt cache

主流 API 支持 **prompt prefix caching**：用 `cache_control: { type: 'ephemeral' }` 标记某段内容可缓存。

```json
{
  "usage": {
    "input_tokens": 120,
    "cache_creation_input_tokens": 8000,
    "cache_read_input_tokens": 0,
    "output_tokens": 456
  }
}
```

缓存策略：「**静态前缀 + 动态后缀**」——不变的内容（系统指令、工具定义）放前面打 `cache_control`，变化的内容（用户消息）放后面。

---

## 2. Function Calling / Tool Use 协议

### 2.1 工具定义

工具定义是 JSON Schema 描述：

```json
{
  "name": "get_weather",
  "description": "Get current weather of a city",
  "input_schema": {
    "type": "object",
    "properties": {
      "city": { "type": "string" },
      "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
    },
    "required": ["city"]
  }
}
```

### 2.2 完整调用闭环

```
1. Agent → API: 发送 messages + tools
2. API → Agent: stop_reason=tool_use，content 含 { tool_use, id: T1, name: "get_weather" }
3. Agent 本地执行工具，得到结果 "22°C, sunny"
4. Agent → API: 追加 { role: 'user', content: [{ tool_result, tool_use_id: T1, content: "22°C" }] }
5. API → Agent: 模型基于工具结果继续生成
```

**并行工具调用**：一次 assistant 消息可以包含多个 `tool_use` block，Agent 应**同时执行**它们。

### 2.3 pi 源码对照

pi 中的工具系统在 `packages/coding-agent/src/core/tools/`：

```typescript
// packages/coding-agent/src/core/tools/index.ts
export interface Tool {
  name: string
  description: string
  inputSchema: ZodType
  execute(input: unknown): Promise<ToolResult>
}
```

---

## 3. AsyncGenerator：用 yield 写状态机

### 3.1 为什么 Agent Loop 用 Generator

Agent 是一个「边跑边产生事件」的过程。AsyncGenerator 让外部（UI/测试/日志）都能用同一套 `for await` 语法精确观察每一步。

```typescript
async function* simpleLoop(): AsyncGenerator<string, number> {
  yield 'started'
  await sleep(100)
  yield 'middle'
  return 42
}

for await (const event of simpleLoop()) {
  console.log(event) // started, middle
}
```

### 3.2 pi 源码对照

pi 的 Agent Loop 使用 AsyncGenerator 模式暴露事件：

```typescript
// packages/agent/src/agent-loop.ts
export async function* runAgentLoop(
  harness: AgentHarness,
  session: AgentSession,
): AsyncGenerator<AgentEvent, AgentResult> {
  let turnCount = 0
  while (true) {
    yield { type: 'turn_start', turnCount }
    const result = yield* executeTurn(harness, session)
    if (result.done) return result.value
    turnCount++
  }
}
```

---

## 4. TypeScript 类型系统精要 + Zod 运行时校验

### 4.1 Zod：API 边界的运行时盾牌

**LLM 输出工具调用参数时，不能信任 TS 类型**——它在编译期就被擦除了。运行时必须用 Zod 校验：

```typescript
import { z } from 'zod'

const ReadToolInput = z.object({
  file_path: z.string().min(1),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
})

// 工具执行入口
const parsed = ReadToolInput.safeParse(rawInput)
if (!parsed.success) {
  return toolError(parsed.error.format())
}
const input: ReadToolInput = parsed.data
```

**为什么用 `safeParse` 而不是 `parse`**：`safeParse` 返回 `{ success: false, error }`，可以把结构化错误回喂给模型让它自我修正。

### 4.2 pi 源码对照

pi 的工具系统广泛使用 Zod 进行输入校验：

```typescript
// packages/coding-agent/src/core/tools/read.ts
export const ReadArgs = z.object({
  file_path: z.string(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
})
```

---

## 5. 文件系统作为数据库：Markdown + Frontmatter

### 5.1 为什么不用数据库

pi 的所有配置、记忆、命令、技能都存在文件系统上的 Markdown 文件里：

| 维度 | Markdown 文件系统 | SQLite |
|------|-----------------|--------|
| 透明度 | 用户可直接编辑 | 需要专用工具 |
| 版本控制 | 天然 git 友好 | binary 不可读 |
| 启动开销 | 读几个文件 | 进程初始化 |

### 5.2 frontmatter 写法

```markdown
---
name: my-skill
description: Does X when Y
allowed-tools:
  - Read
  - Bash
model: claude-3-5-haiku
---

# Skill body

Detailed instructions here...
```

### 5.3 pi 源码对照

```typescript
// packages/coding-agent/src/utils/frontmatter.ts
export function parseFrontmatter(content: string): {
  data: Record<string, unknown>
  content: string
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { data: {}, content }
  return {
    data: yaml.parse(match[1]),
    content: match[2],
  }
}
```

### 5.4 多级配置合并

同一类配置分布在多个层级，后加载的覆盖先加载的同名条目，但 deny 类规则永远累加。

---

## 6. 练习

1. 调用一次 LLM API：发送 system + user message，打印 stop_reason、input_tokens、output_tokens
2. 手写一个 `get_weather` 工具完整闭环
3. 把 `miniLoop` 跑起来，让它接收 `abortSignal`
4. 用 Zod 写一个 `BashToolInput` schema 并导出 JSON Schema
5. 写一个 Ink TUI 组件
6. 写一个 markdown 解析器，提取 frontmatter 并合并 `Map<string, SkillDef>`

---

> **下一步阅读**：[第1章 架构总览](./chapter-01-architecture-overview.md) — 7 层 Harness 架构总览。
