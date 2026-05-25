# 29. 创造者与读者双视角最终自审

## 29. 是否讲完 pi agent 的核心概念

从 pi 创造者视角看，核心不是“有多少命令”，而是几条不可破坏的系统边界。本书已经按这些边界组织：provider 适配在 `packages/ai`，低层 agent loop 在 `packages/agent`，产品 runtime 在 `packages/coding-agent`，终端交互在 TUI，生态通过 extensions、skills、prompt templates、themes、packages、SDK 和 RPC 扩展。

核心源码入口分别是 `Model` 和消息类型 [types.ts#L538](/source-code/packages/ai/src/types.ts#L538)、assistant stream event [types.ts#L347](/source-code/packages/ai/src/types.ts#L347)、agent loop [agent-loop.ts#L95](/source-code/packages/agent/src/agent-loop.ts#L95)、Agent 封装 [agent.ts#L166](/source-code/packages/agent/src/agent.ts#L166)、AgentSession [agent-session.ts#L252](/source-code/packages/coding-agent/src/core/agent-session.ts#L252)、SDK [sdk.ts#L202](/source-code/packages/coding-agent/src/core/sdk.ts#L202)、RPC [rpc-mode.ts#L53](/source-code/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L53)。

从读者视角看，核心概念必须能形成一条完整工作链：

1. 用户在项目目录启动 pi。
2. host 解析 mode、session、model、tools、resources。
3. ResourceLoader 加载 context files、skills、prompts、themes、extensions、packages。
4. ModelRegistry 和 AuthStorage 解析模型与 credential。
5. AgentSession 构建当前 session、system prompt、active tools 和 extension runtime。
6. Agent/agent loop 发起 provider request。
7. provider stream 合成 assistant message event。
8. tool call 被查找、校验、拦截、执行。
9. tool result 回灌 transcript。
10. session 在确定边界追加 JSONL entry。
11. compaction/tree/fork/clone 维护长上下文和分支。
12. SDK/RPC/JSON/TUI 在稳定事件边界控制或展示同一 runtime。

这条链路是本书主线。每章只要能解释自己在链路里的位置，读者就不会把 pi 误解成单纯 API wrapper。

## 29. 是否讲清已实现事实、进一步 docs、生态扩展

第 22 到 29 章最重要的补强，是把三类内容分开：

| 类型 | 本书写法 | 例子 |
|---|---|---|
| 已实现事实 | 直接写“当前实现/源码中”并给源码行号 | SDK `createAgentSession()`、RPC command types、AuthStorage priority、ModelRegistry merge、AgentSession events |
| 进一步 docs | 写“设计文档提出/建议/规划”，不冒充已发布 | observability trace/span abstraction、durable harness recovery entries、AgentHarness planned lifecycle hardening |
| 生态扩展方式 | 写“可以通过 extension/package/SDK/RPC host 实现”，不说 core 内置 | MCP、sub-agent、plan/todo、permission gate、background bash、OTel adapter |

这条边界比 API 枚举更重要。它避免读者把 future design 当成可调用 API，也避免把生态能力误认为核心默认保证。

## 29. 是否讲到核心原理和设计决策

本书讲到的核心原理不是函数列表，而是设计不变量：

| 原理 | 设计决策 | 为什么 |
|---|---|---|
| 小核心 | MCP、sub-agent、plan、todo、permission popup、background bash 不进核心 | 核心保持 loop/session/tool/provider 稳定，工作流通过 extension/package 演化 |
| 消息分层 | UI message、session entry、provider message 分开 | 防止自定义 UI、内部状态、summary 污染模型上下文 |
| 工具闭环 | 模型只请求工具，runtime 执行并回灌 result | 保留安全、校验、错误恢复和 transcript 可解释性 |
| 事件协议 | streaming、tool、queue、compaction、retry 都发结构化事件 | 同时支持 TUI、RPC、JSON、SDK、测试和扩展 |
| Durable session | JSONL tree append-only | 支持 resume、fork、clone、tree、crash recovery 和审计 |
| Turn snapshot | 运行中 provider request 不被 live config 污染 | 避免模型、工具、资源、system prompt 在同一 turn 内漂移 |
| Save point | assistant/tool result 完成后刷新 pending writes 和下一轮状态 | 保证 transcript 顺序和扩展写入确定 |
| Resource boundary | ResourceLoader 提供 context、skills、prompts、themes、extensions | UI/host 不应把资源发现写死进 loop |
| Extension contract | hook 有明确 mutation 语义 | 防止扩展任意改内部状态 |
| 安全边界 | 工具、package、extension、RPC 都按本机执行能力看待 | prompt 不能替代权限控制 |

这些原则分别由源码、`packages/agent/docs/agent-harness.md`、`durable-harness.md`、`observability.md`、`packages/coding-agent/docs/usage.md`、`extensions.md`、`packages.md`、`sdk.md`、`rpc.md` 支撑。

## 29. 内容组织是否符合 book/AGENTS.md

`book/AGENTS.md` 要求章节不是罗列代码，而是按“问题和约束 → 机制 → 核心逻辑 → 源码证据 → 设计迁移 → 边界”组织。本书当前采用四层结构满足这个要求：

1. 第 0 到 3 章先建立用户视角，避免读者没用过 pi 就直接追源码。
2. 第 4 到 12 章解释 runtime 主干，覆盖 provider、message、loop、tools、system prompt、skills、compaction。
3. 第 13 到 21 章解释 session、resource、extension、TUI，这些是 pi 从 demo 变成产品的关键。
4. 第 22 到 29 章解释 SDK、RPC、custom provider、observability、security、ecosystem、replication，并做最终自审。

复杂能力都尽量回答生命周期问题：解决什么系统问题，用户流程是什么，启动加载什么，运行时加载什么，模型能看到什么，harness 私下保留什么，触发条件是什么，执行权在哪里，结果如何回灌，失败和安全边界是什么。源码链接保持 `/source-code/...#Lx` 形式，避免 EPUB 构建时退化。

## 29. 是否足够照顾完全小白前端读者

本书没有假设读者一开始懂 agent。第 22 到 29 章特意把很多概念翻译成前端可以理解的模型：

1. SDK 像状态层，TUI/Web 像视图层。
2. RPC 是跨语言事件协议，不是一问一答 HTTP。
3. ResourceLoader 像资源注入层，不是全局魔法。
4. Model capability 像组件 props/schema，让 UI 和 runtime 都能判断可用能力。
5. Event stream 像单向数据流，UI 消费事件而不是窥探内部状态。
6. Extension/package 像拥有本机权限的插件，不是无害配置。
7. MVP agent 先做消息和工具闭环，再做界面。

这能帮助前端读者先抓住系统边界，再逐步深入源码。

## 29. 是否遵守 82 法则

本书没有把所有 docs 内容复制进正文，因为那会让读者淹没在 API 枚举里。正文保留最核心的 20%：

| 主题 | 正文讲到的核心 | 进一步阅读 |
|---|---|---|
| CLI 全量参数 | mode、model、session、tools、resources | `usage.md` |
| SDK | session、events、resource loader、runtime replacement | `sdk.md` |
| RPC | JSONL framing、response/event 分离、extension UI | `rpc.md` |
| provider | auth、model capability、stream contract、compat | `providers.md`、`models.md`、`custom-provider.md` |
| session | JSONL tree、resume/fork/clone、entry 类型 | `sessions.md`、`session-format.md` |
| extension API | lifecycle、registries、hook mutation、UI fallback | `extensions.md` |
| package | npm/git/local source、security、scope/dedupe | `packages.md` |
| observability | event stream、trace/span 设计、脱敏边界 | `observability.md` |

这符合专家学习路径：先掌握不变量，再按需求查局部 API。

## 29. 读者只看本书能否精通

只看本书，读者可以达到“能独立使用和解释 pi 核心能力”的水平：能启动和配置 pi，能理解模型、工具、session、compaction、extension、SDK/RPC 的工作方式，能复刻最小 agent harness，并能判断一个新能力该放核心还是扩展。

但专家级精通还要求三类实践：

1. 使用任务：完成一次代码修改、一次只读审查、一次 session resume/tree/fork、一次 export/share。
2. 扩展任务：写一个 custom tool、一个 slash command、一个 permission gate、一个 skill、一个 prompt template。
3. 复刻任务：实现最小 loop、faux provider、JSONL session、abort、tool result 回灌。

本书提供正确地图和核心机制；仓库 docs 和源码提供按需深入的全量参考。专家水平的判断标准不是记住所有命令，而是能在新问题出现时准确定位：这是 provider 问题、tool 问题、session 问题、extension 问题、resource 问题、terminal 问题，还是产品边界问题。

## 29. 创造者视角的最终红线

如果未来继续改书，不能破坏这些红线：

1. 不把 provider payload 当成内部消息协议。
2. 不把 session 写成线性聊天数组。
3. 不把 extension 描述成低风险配置。
4. 不把 tool execution 交给模型或 prompt。
5. 不把 permission/sandbox 说成核心默认能力。
6. 不把 MCP/sub-agent/plan/todo/background bash 说成 pi 内置核心。
7. 不把 observability 变成会影响执行的 hook。
8. 不把 docs 里尚未实现的 AgentHarness planned item 写成已完成事实。
9. 不把 SDK/RPC host 的安全责任推给 pi core。
10. 不把 custom provider capability 藏进不可见的 if/else。

这些红线比具体章节标题更重要。它们保证读者学到的是 pi 的真实架构，而不是一个看起来像 agent 的 prompt demo。
