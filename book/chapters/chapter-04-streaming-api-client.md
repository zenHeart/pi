# 第4章 Streaming API Client：把 provider 差异收敛成事件

## 4.1 为什么 provider 层必须独立

不同模型供应商的协议差异很大：Anthropic Messages、OpenAI Responses、OpenAI Chat Completions、Google、Mistral、Amazon Bedrock、Codex、Copilot、Cloudflare Workers AI 都有不同的认证方式、请求字段、流式事件、tool call 增量、thinking 表达、usage 和错误格式。pi 把这些差异收敛在 `packages/ai`，对上输出统一的 assistant stream。

公共入口是 [stream.ts#L43](/source-code/packages/ai/src/stream.ts#L43)。agent loop 不应该知道 provider 是 SSE、websocket、HTTP chunk 还是 SDK callback。它只消费统一事件。

## 4.2 EventStream 抽象

pi 的基础事件流在 [event-stream.ts#L4](/source-code/packages/ai/src/utils/event-stream.ts#L4)，assistant 专用事件流在 [event-stream.ts#L69](/source-code/packages/ai/src/utils/event-stream.ts#L69)。对 loop 来说，关键能力是两个：

- `for await` 增量消费事件，驱动 UI 和 partial state。
- `result()` 获取最终 assistant message，作为稳定事实进入后续处理。

这个抽象解决了一个常见问题：如果 provider reader 被 UI、extension 或 session 写入阻塞，就可能影响底层网络读取。pi 的设计把 provider transport reading 和上层事件消费解耦，使 harness 可以在边界处 await listener、hook 和持久化，而不把 provider stream 读坏。

## 4.3 Provider payload 边界

`streamAssistantResponse()` 在发请求前做三件事：`transformContext`、`convertToLlm`、构造 provider `Context`，位置见 [agent-loop.ts#L275](/source-code/packages/agent/src/agent-loop.ts#L275)。这说明 provider payload 是运行时边界，不是系统内部消息。

扩展可以通过 provider request hook 检查或改写 payload。`ExtensionRunner.emitBeforeProviderRequest()` 从 [runner.ts#L890](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L890) 开始。这个能力适合企业代理、审计 headers、实验性 payload 字段，但风险也高：它改的是模型实际看到的请求。

## 4.4 认证与模型注册

pi 支持订阅型 provider、API key provider、cloud provider、自定义 models.json 和 extension provider。低层 `Agent` 支持 `getApiKey`，每次 provider 请求前解析凭证，见 [agent-loop.ts#L300](/source-code/packages/agent/src/agent-loop.ts#L300)。产品层再叠加 auth storage、OAuth、`/login`、`auth.json`、环境变量和 provider-specific headers。

设计上，模型注册和认证不能散落在 UI 或 loop 中。原因是：

- `/model`、CLI `--model`、SDK、RPC 都需要同一套模型选择。
- provider token 可能过期，必须在请求前刷新。
- custom provider 可能来自 extension，需要动态注册和注销。
- `--list-models` 要在不启动完整 TUI 的情况下工作。

custom provider 文档里的关键点是：pi 不是只支持 “OpenAI-compatible”。`Api` 类型列出内置协议族，包括 `mistral-conversations`、`openai-responses`、`azure-openai-responses`、`openai-completions`、`anthropic-messages`、`bedrock-converse-stream`、`google-generative-ai`、`google-vertex`、`opencode`、`cloudflare-workers-ai`，见 [types.ts#L6](/source-code/packages/ai/src/types.ts#L6)。extension 可以调用 `registerProvider()` 注册或覆盖 provider，API 从 [types.ts#L1292](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1292) 开始，配置结构在 [types.ts#L1318](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1318)，单个模型配置在 [types.ts#L1351](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1351)。

这套配置至少覆盖这些字段：

- `baseUrl`、`apiKey`、`headers`、`authHeader`：请求地址与认证。
- `api`：选择哪个 adapter 协议。
- `models`：声明模型 id、展示名、输入能力、context window、max tokens、cost、thinking level map。
- `streamSimple`：当协议不是内置 adapter 时，直接提供自定义流式实现。
- `oauth`：把 `/login` 接入企业 SSO 或第三方 OAuth，包含 login、refreshToken、getApiKey、modifyModels。

`models.json` 适合声明静态 provider 和模型；extension provider 适合运行时代码参与认证、动态模型、企业代理、实验协议。复刻时不要把这两者混成一个 JSON 解析器：静态配置不应该能随意执行本地代码，而 extension provider 本来就是代码执行边界。

## 4.5 Thinking、usage 与 cost

不同 provider 对 reasoning/thinking 的表达不同。pi 在 agent 层使用 `ThinkingLevel`，低层创建配置时把 `off` 转成 `undefined`，见 [agent.ts#L426](/source-code/packages/agent/src/agent.ts#L426)。provider adapter 再把它映射成具体 API 字段。

usage/cost 也应该在 provider 层归一化。assistant message 携带 usage 后，session stats 才能统一聚合，入口在 [agent-session.ts#L2877](/source-code/packages/coding-agent/src/core/agent-session.ts#L2877)。

## 4.6 Context overflow 与自动恢复

provider 的 context overflow 错误格式不同。custom-provider 文档要求自定义 provider 规范化 overflow error，否则 pi 无法识别并触发自动 compaction + retry。这里的设计决策是：恢复策略属于 harness/product，错误识别需要 provider 层提供可理解信号。

复刻时至少要定义一组标准错误类别：auth、rate limit、overloaded、context overflow、network、provider bug、aborted。不要只保留原始字符串。

## 4.7 自定义 provider 测试清单

custom provider 不是“能返回文本”就算完成。至少要测：

- text delta：增量文本能变成统一 assistant message。
- tool call delta：provider 分片返回的 tool name、id、arguments 能被累积成完整 JSON。
- thinking delta：reasoning 内容能按 pi 的 thinking 事件或隐藏块语义处理。
- usage/cost：输入、输出、cache read/write 能进入 session stats。
- abort：AbortSignal 中断网络请求，最终不会继续写 session。
- overflow：provider-specific 错误能归类为 context overflow。
- OAuth refresh：过期 credential 能刷新并持久化，刷新失败能回到 `/login`。
- headers：`authHeader`、custom headers、model-level headers 的优先级确定。

这也是为什么 provider adapter 要有 faux tests。真实 provider 会漂移，只有 fake stream 能稳定覆盖边界条件。

## 4.8 复刻原则

MVP 可以只支持一个 OpenAI-compatible provider，但也要把 provider adapter 独立出来。接口至少包括：model config、auth resolver、stream function、usage/cost、overflow error normalization、tool call delta accumulation。

生产级再补：model registry、custom models、custom providers、OAuth、transport 选择、provider retry、prompt caching、thinking level map、provider payload hook、response header hook。
