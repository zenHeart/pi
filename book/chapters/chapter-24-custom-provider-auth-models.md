# 24. Custom Provider、OAuth、AuthStorage 与模型能力

## 24. 本章解决的问题

团队常需要代理、私有模型、本地模型、企业 OAuth 或模型能力修正。创造者视角下，provider 不是一个 URL 字符串，而是模型能力、认证、stream protocol、兼容性和错误恢复的组合。读者视角下，你只要记住：能不能用某个模型，不只取决于模型 ID，还取决于它的 provider、API 类型、credential 和 capability metadata。

认证存储从 `AuthStorage` 开始，源码在 [auth-storage.ts#L196](/source-code/packages/coding-agent/src/core/auth-storage.ts#L196)。模型注册与解析由 `ModelRegistry` 管理，源码在 [model-registry.ts#L335](/source-code/packages/coding-agent/src/core/model-registry.ts#L335)。模型基础类型在 `packages/ai`，`Model` 定义见 [types.ts#L538](/source-code/packages/ai/src/types.ts#L538)。

## 24. AuthStorage：credential 解析必须可解释

AuthStorage 的核心职责不是“存一个 key”，而是让 credential 来源有稳定优先级。当前实现中，`getApiKey()` 的顺序是 runtime override、auth.json API key、auth.json OAuth token、environment variable、fallback resolver，见 [auth-storage.ts#L462](/source-code/packages/coding-agent/src/core/auth-storage.ts#L462)。

几个细节决定生产可用性：

1. `setRuntimeApiKey()` 用于 CLI `--api-key` 这类临时覆盖，不写盘，见 [auth-storage.ts#L227](/source-code/packages/coding-agent/src/core/auth-storage.ts#L227)。
2. `setFallbackResolver()` 让 models.json/custom provider 提供兜底 credential，见 [auth-storage.ts#L242](/source-code/packages/coding-agent/src/core/auth-storage.ts#L242)。
3. `hasAuth()` 是可用性检查，不刷新 OAuth token，见 [auth-storage.ts#L338](/source-code/packages/coding-agent/src/core/auth-storage.ts#L338)。
4. `getAuthStatus()` 返回来源标签，不暴露明文 secret，见 [auth-storage.ts#L349](/source-code/packages/coding-agent/src/core/auth-storage.ts#L349)。
5. OAuth refresh 用 storage lock 防止多个 pi 实例同时刷新，见 [auth-storage.ts#L407](/source-code/packages/coding-agent/src/core/auth-storage.ts#L407)。

对前端 host 来说，不要把 API key 放进 prompt、session message、export HTML 或 telemetry。需要展示状态时展示 source 和 label，不展示 value。

## 24. ModelRegistry：模型 ID 只是入口

`ModelRegistry` 会合并内置模型、models.json、自定义 provider、OAuth modifyModels 和 provider/model overrides。自定义模型 schema 从 [model-registry.ts#L144](/source-code/packages/coding-agent/src/core/model-registry.ts#L144) 开始，provider config schema 在 [model-registry.ts#L188](/source-code/packages/coding-agent/src/core/model-registry.ts#L188)。

模型能力至少包括：

1. `api`：使用哪种 stream implementation。
2. `provider` 和 `baseUrl`：请求去哪。
3. `reasoning` 和 `thinkingLevelMap`：thinking 是否支持、哪些档位可见。
4. `input`：是否支持 image。
5. `contextWindow` 和 `maxTokens`：上下文和输出边界。
6. `cost`：usage 和成本估计。
7. `headers` 和 `compat`：provider quirks。

这些字段不是 UI 装饰。`getAvailable()` 会只返回配置了 auth 的模型，见 [model-registry.ts#L629](/source-code/packages/coding-agent/src/core/model-registry.ts#L629)。`find()` 按 provider/id 查模型，见 [model-registry.ts#L636](/source-code/packages/coding-agent/src/core/model-registry.ts#L636)。真正发请求前，`getApiKeyAndHeaders()` 会合并 auth storage、models.json provider key、provider headers、model headers 和 authHeader，见 [model-registry.ts#L685](/source-code/packages/coding-agent/src/core/model-registry.ts#L685)。

## 24. models.json 与 extension provider 的区别

models.json 适合“已有 API 类型，只是我要加模型、改 URL、加 headers、改 compat”。例如 Ollama、LM Studio、vLLM、OpenAI-compatible proxy，通常只需要 `baseUrl`、`api`、`apiKey`、`models` 和 `compat`。

extension provider 适合“需要代码”。例如动态拉模型列表、企业 OAuth、非标准 streaming API、provider-specific overflow normalization、复杂 request/response hooks。扩展侧 `registerProvider()` 的 API 类型在 [model-registry.ts#L934](/source-code/packages/coding-agent/src/core/model-registry.ts#L934)，实际注册入口在 [model-registry.ts#L796](/source-code/packages/coding-agent/src/core/model-registry.ts#L796)，取消注册在 [model-registry.ts#L811](/source-code/packages/coding-agent/src/core/model-registry.ts#L811)。

一句话判断：能用配置表达的放 models.json；必须执行代码或注册 OAuth/stream handler 的放 extension。

## 24. Custom stream contract

所有 provider 最终都要产出同一种 assistant event stream。`StreamFunction` 的契约写在 [types.ts#L206](/source-code/packages/ai/src/types.ts#L206)：返回 `AssistantMessageEventStream`，请求或运行时失败应编码进 stream，不应该直接 throw 给调用者。`AssistantMessageEvent` 的事件协议在 [types.ts#L347](/source-code/packages/ai/src/types.ts#L347)，包括 start、text/thinking/toolcall delta、done、error。

如果 provider 支持工具调用，必须正确累积 tool call JSON，并生成 `ToolCall` block。`ToolCall` 类型在 [types.ts#L246](/source-code/packages/ai/src/types.ts#L246)。如果失败，最终 assistant message 的 `stopReason` 应是 `"error"` 或 `"aborted"`，`AssistantMessage` 字段在 [types.ts#L277](/source-code/packages/ai/src/types.ts#L277)。

## 24. Capability 不是“降级修 bug”

不要通过删除功能来修类型错误或 provider 错误。provider 不支持 developer role，就设置 `compat.supportsDeveloperRole: false`；不支持 reasoning effort，就设置 `supportsReasoningEffort: false`；thinking level 只支持 high/max，就用 `thinkingLevelMap` 把其他档位设为 `null`。OpenAI-compatible compat 字段定义在 [types.ts#L365](/source-code/packages/ai/src/types.ts#L365)，Anthropic-compatible compat 字段定义在 [types.ts#L411](/source-code/packages/ai/src/types.ts#L411)。

这也是写给小白读者的关键概念：能力要写成数据，让 UI、model selector、request builder 和错误恢复都能看见。不要把“这个模型不能关 thinking”藏在某个 if 里。

## 24. 已实现事实、进一步 docs、生态扩展

已实现事实：AuthStorage 支持 runtime override、auth.json、OAuth refresh、env var、fallback；ModelRegistry 支持 built-in/custom merge、provider override、model override、provider dynamic registration、OAuth provider registration、custom streamSimple registration；`Model` 类型支持 API、provider、baseUrl、reasoning、input、cost、contextWindow、maxTokens、headers 和 compat。

进一步 docs：`providers.md` 解释 subscription/API key/cloud/custom provider 的使用入口；`models.md` 解释 models.json 字段、merge semantics、thinkingLevelMap 和 compat；`custom-provider.md` 解释 extension 注册 provider、OAuth、custom stream、overflow normalization 和测试建议。

生态扩展方式：企业可以把 SSO、proxy routing、region routing、billing tags、zero data retention routing、provider fallback 策略做成 extension 或 package。但这不表示 pi core 内置了你的企业安全策略；core 只提供 provider/auth/model 能力边界。

## 24. Custom provider 设计检查

实现 provider 前先回答这些问题：

1. 模型列表是静态配置、启动时 fetch，还是用户登录后 modifyModels？
2. API key 来自 auth.json、env、models.json command，还是 OAuth access token？
3. 请求使用内置 API type，还是需要 `streamSimple`？
4. thinking、image、tool call、prompt caching、headers 是否由 model capability 表达？
5. usage/cost 是否能从响应里填回 `AssistantMessage.usage`？
6. abort signal 是否传到 fetch/SDK？
7. overflow 错误是否能被 pi 识别并触发 compaction retry？
8. 测试是否覆盖 text、thinking、tool call、abort、usage、overflow 和 unicode？
