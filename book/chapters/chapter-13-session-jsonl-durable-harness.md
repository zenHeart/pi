# 13. Session JSONL、持久化与 Durable Harness

## 13. 本章解决的问题

对完全小白的前端读者来说，session 可以先理解成“浏览器本地存储里的聊天记录”。但 pi 的 session 不是一条数组，而是一棵可分叉的 JSONL tree：每一行是一个 entry，每个 entry 用 `id` 和 `parentId` 接到上一行或历史节点。entry 基础结构定义在 [session-manager.ts#L44](/source-code/packages/coding-agent/src/core/session-manager.ts#L44)，完整 entry union 在 [session-manager.ts#L137](/source-code/packages/coding-agent/src/core/session-manager.ts#L137)。

站在 pi agent 创造者视角，session 解决的是更硬的问题：进程可以退出，终端可以断开，模型流可以中断，但用户已经接受的事实不能消失。持久化边界必须比 UI 生命周期更稳定，也必须比一次 provider stream 更保守。

## 13. JSONL 不是 transcript 数组

session header 记录版本、session id、时间、cwd 和可选 parent session，见 [session-manager.ts#L30](/source-code/packages/coding-agent/src/core/session-manager.ts#L30)。普通消息只是 entry 的一种，其他同样重要的 durable state 还包括 model change、thinking level、compaction、branch summary、extension custom entry、custom message、label 和 session info，分别从 [session-manager.ts#L51](/source-code/packages/coding-agent/src/core/session-manager.ts#L51) 到 [session-manager.ts#L129](/source-code/packages/coding-agent/src/core/session-manager.ts#L129) 定义。

这意味着“恢复会话”不是把旧聊天文本塞回输入框，而是还原当前 leaf 对应的路径、模型选择、thinking level、压缩摘要、branch summary 和 extension 注入的上下文。`buildSessionContext()` 会从 leaf 回溯到 root，收集路径，再把可进入模型的 entry 转成 messages，核心遍历在 [session-manager.ts#L315](/source-code/packages/coding-agent/src/core/session-manager.ts#L315)，路径回溯在 [session-manager.ts#L346](/source-code/packages/coding-agent/src/core/session-manager.ts#L346)，compaction 的特殊处理在 [session-manager.ts#L390](/source-code/packages/coding-agent/src/core/session-manager.ts#L390)。

## 13. 一个最小 JSONL 文件

下面这个例子展示的是文件形态，不是 UI transcript。第一行是 header，没有 `id` 和 `parentId`；后续每一行才是 tree entry。字段来自 session format 文档和源码类型：header 类型见 [session-manager.ts#L30](/source-code/packages/coding-agent/src/core/session-manager.ts#L30)，entry base 见 [session-manager.ts#L44](/source-code/packages/coding-agent/src/core/session-manager.ts#L44)，message entry 见 [session-manager.ts#L50](/source-code/packages/coding-agent/src/core/session-manager.ts#L50)，model change、compaction、branch summary 和 custom entry 分别见 [session-manager.ts#L58](/source-code/packages/coding-agent/src/core/session-manager.ts#L58)、[session-manager.ts#L64](/source-code/packages/coding-agent/src/core/session-manager.ts#L64)、[session-manager.ts#L77](/source-code/packages/coding-agent/src/core/session-manager.ts#L77)、[session-manager.ts#L93](/source-code/packages/coding-agent/src/core/session-manager.ts#L93)。

```jsonl
{"type":"session","version":3,"id":"019a-session","timestamp":"2026-05-25T10:00:00.000Z","cwd":"/repo/app"}
{"type":"message","id":"u0000001","parentId":null,"timestamp":"2026-05-25T10:00:01.000Z","message":{"role":"user","content":"Read src/auth.ts and explain the login bug.","timestamp":1779688801000}}
{"type":"message","id":"a0000001","parentId":"u0000001","timestamp":"2026-05-25T10:00:04.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"toolu_1","name":"read","arguments":{"path":"src/auth.ts"}}],"api":"anthropic-messages","provider":"anthropic","model":"claude-sonnet-4-5","usage":{"input":100,"output":20,"cacheRead":0,"cacheWrite":0,"totalTokens":120,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"toolUse","timestamp":1779688804000}}
{"type":"message","id":"t0000001","parentId":"a0000001","timestamp":"2026-05-25T10:00:05.000Z","message":{"role":"toolResult","toolCallId":"toolu_1","toolName":"read","content":[{"type":"text","text":"export function login(...) { ... }"}],"isError":false,"timestamp":1779688805000}}
{"type":"model_change","id":"m0000001","parentId":"t0000001","timestamp":"2026-05-25T10:01:00.000Z","provider":"openai","modelId":"gpt-5.1"}
{"type":"compaction","id":"c0000001","parentId":"m0000001","timestamp":"2026-05-25T10:20:00.000Z","summary":"User investigated auth login. src/auth.ts was read. The likely issue is stale token validation.","firstKeptEntryId":"t0000001","tokensBefore":52000}
{"type":"custom","id":"x0000001","parentId":"c0000001","timestamp":"2026-05-25T10:21:00.000Z","customType":"review-helper","data":{"lastChecklist":"auth"}}
{"type":"custom_message","id":"x0000002","parentId":"x0000001","timestamp":"2026-05-25T10:22:00.000Z","customType":"review-helper","content":"For the next turn, preserve the auth checklist.","display":false}
{"type":"branch_summary","id":"b0000001","parentId":"x0000002","timestamp":"2026-05-25T10:30:00.000Z","fromId":"c0000001","summary":"The abandoned branch tried changing token refresh first; that was likely the wrong layer."}
```

读这个文件时要注意四件事：`model_change` 改变后续请求默认模型；`compaction` 和 `branch_summary` 会作为摘要进入模型；`custom` 是 extension 私有状态，不进入模型；`custom_message` 会以 custom message 形式进入上下文，但可以用 `display:false` 对用户隐藏。

## 13. 哪些 entry 会进入模型

前端读者可以用“显示状态”和“业务数据”类比：不是所有存在 store 里的数据都要渲染到页面，也不是所有 session entry 都要发给 LLM。

`message` 会进入上下文；`custom_message` 会转成自定义消息进入上下文；`branch_summary` 和 `compaction` 会转成摘要消息进入上下文。`custom` 只给 extension 恢复内部状态，不进 LLM，上面注释明确写在 [session-manager.ts#L88](/source-code/packages/coding-agent/src/core/session-manager.ts#L88)。`label` 和 `session_info` 是用户和 UI 的元数据，也不直接进入模型。

这个分层很关键：如果把 extension 私有状态全塞进 prompt，模型会看到不该看的内部细节；如果把 branch summary 只存在 UI 状态里，恢复后模型又会丢失离开分支时保留的上下文。

## 13. Append-only 与延迟落盘

`SessionManager` 是 append-only tree 管理器，源码注释从 [session-manager.ts#L701](/source-code/packages/coding-agent/src/core/session-manager.ts#L701) 开始。所有写入最终都走 `_appendEntry()`，它会追加 entry、更新索引、移动 leaf 并尝试持久化，见 [session-manager.ts#L863](/source-code/packages/coding-agent/src/core/session-manager.ts#L863)。

pi 还有一个容易被忽略的产品选择：在还没有 assistant 消息前，`_persist()` 会先不把 session 写成文件，避免只有用户第一句、没有任何模型响应的空会话污染历史列表，判断在 [session-manager.ts#L843](/source-code/packages/coding-agent/src/core/session-manager.ts#L843)。一旦出现 assistant，之前积累的 entries 会整体 flush 到 JSONL 文件，写入逻辑在 [session-manager.ts#L853](/source-code/packages/coding-agent/src/core/session-manager.ts#L853)。

创造者视角下，这不是“偷懒少写文件”，而是 session 列表的质量控制：用户真正开始过的工作才进入可恢复历史。

## 13. Durable Harness 的状态边界

`AgentHarness` 不能简单序列化整个 JavaScript 对象。工具实现、模型 provider、auth、extension handler、resource loader 和 system prompt callback 都是运行时依赖，不能可靠写进 JSONL。`createTurnState()` 每轮重新从 session、resources、tools、model、thinking 和 system prompt 组合出 turn snapshot，见 [agent-harness.ts#L313](/source-code/packages/agent/src/harness/agent-harness.ts#L313)。

因此 durable harness 的现实目标是“半持久化”：session 是 durable source of truth；host app 在 resume 时重建兼容的运行时依赖；harness 只把自己拥有、可重放、可验证的状态写入 session 或 pending queue。`flushPendingSessionWrites()` 会在安全点把运行中产生的 message、model change、thinking change、custom entry、custom message、label、session info 和 leaf mutation 依次落到 session，见 [agent-harness.ts#L459](/source-code/packages/agent/src/harness/agent-harness.ts#L459)。

## 13. Save point 与 pending writes

save point 是“到这里为止，session 可以被认为稳定”的边界。assistant final message、tool result、turn_end、agent_end 都比 streaming 中间 token 更适合持久化。harness 在 `message_end` 先写 message，再发事件，见 [agent-harness.ts#L483](/source-code/packages/agent/src/harness/agent-harness.ts#L483)；在 `turn_end` 后 flush pending writes，再发 `save_point`，见 [agent-harness.ts#L489](/source-code/packages/agent/src/harness/agent-harness.ts#L489)。

小白读者可以把 pending writes 想成 React 的批处理更新：事件 handler 里可以提出“我要写 session”，但不能随便插队改正在渲染的列表。否则 tool result 可能接到错误父节点，或者 extension 消息跑到 assistant 消息前面。

## 13. 崩溃恢复的保守策略

durable harness 文档的核心判断是：provider stream 不可恢复，只能从 durable boundary 重新开始或标记中断。未完成 agent turn 默认标记 interrupted；未完成 provider request 不自动重试；未完成 tool call 只有在工具声明 idempotent/retry-safe 时才可重试；compaction 和 branch summary 可以在没有最终 entry 时重新执行。

这背后的原则适用于自研 agent：能恢复的是“已记录的事实”和“可安全重放的计划”，不是任意一段正在执行的异步调用。尤其工具调用可能已经对外部世界产生副作用，不能因为 JSONL 里没有 result 就自动再跑一次。

## 13. 复刻路径

最小可用实现只需要：session header、append JSONL、message entry、`id`/`parentId`、当前 leaf、`buildContext()` 从 leaf 回 root。做到这里，用户已经能继续上一段对话。

生产级实现再补：model/thinking entries、compaction、branch summary、custom entry/custom message、label、session info、pending writes、save point、queue durability、unfinished operation recovery。pi 现有 `appendMessage()`、`appendCompaction()`、`appendCustomEntry()`、`appendCustomMessageEntry()` 分别落在 [session-manager.ts#L876](/source-code/packages/coding-agent/src/core/session-manager.ts#L876)、[session-manager.ts#L916](/source-code/packages/coding-agent/src/core/session-manager.ts#L916)、[session-manager.ts#L939](/source-code/packages/coding-agent/src/core/session-manager.ts#L939)、[session-manager.ts#L987](/source-code/packages/coding-agent/src/core/session-manager.ts#L987)，可以作为分阶段接口边界参考。

## 13. 常见误解

不要把 session 当成纯 UI 历史。它同时承载恢复、上下文构建、分支、压缩、扩展状态和审计。

不要把“写入 JSONL”当成“可以任意重试”。外部副作用是否可重试，取决于工具语义，不取决于文件里有没有 result。

不要把 runtime dependency 写进 session。session 可以保存 provider/model id，但真正的 provider 实现、auth、工具代码和 extension 版本必须由 host app 在恢复时重新装配。
