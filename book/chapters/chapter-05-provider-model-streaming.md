# 5. Provider、模型注册与流式协议

## 5. 本章解决的问题

不同模型 API 的请求字段、流式事件、thinking、tool call、usage、overflow 错误都不同。pi 的策略是把差异收敛到 `packages/ai` 和 `ModelRegistry`，让 agent loop 只面对统一消息和统一事件。基础 API 类型在 [types.ts#L6](/source-code/packages/ai/src/types.ts#L6)，模型类型在 [types.ts#L538](/source-code/packages/ai/src/types.ts#L538)，模型注册入口在 [model-registry.ts#L335](/source-code/packages/coding-agent/src/core/model-registry.ts#L335)。

对新手来说，provider 是“模型服务商或模型入口”，model 是“具体可选模型”。对创造者来说，provider 是兼容性边界：它要把各种上游协议翻译成 pi 的统一 stream contract。

## 5. Provider stream contract

provider 不返回最终字符串，而是返回 assistant message event stream。stream function 的契约在 [types.ts#L206](/source-code/packages/ai/src/types.ts#L206)：调用后应该返回事件流，运行时错误也应编码进事件流，而不是直接 throw 给 loop。

事件序列可以表达 start、text delta、thinking delta、tool call delta、done、error。统一事件定义在 [types.ts#L347](/source-code/packages/ai/src/types.ts#L347)。这样 TUI 能实时渲染，JSON mode 能逐行输出，agent loop 能在 final assistant message 中发现 tool call。

自定义 provider 必须保证四件事：事件顺序能合成最终 assistant message；abort 能产生 `aborted`；错误能产生 `errorMessage`；usage/cost 尽量准确。context overflow 如果不能被识别，自动 compaction 就无法可靠触发。

## 5. 模型能力不是字符串

模型不仅是 `provider/model-id`。pi 还需要知道 API 类型、baseUrl、reasoning、thinkingLevelMap、input 类型、cost、contextWindow、maxTokens、headers 和 compat。否则 UI 无法正确切 thinking，compaction 不知道窗口大小，auth 不知道用哪个 credential，provider adapter 不知道是否能发送 developer role 或 reasoning effort。

这些字段在 [types.ts#L538](/source-code/packages/ai/src/types.ts#L538) 定义。`models.json` 的解析会给本地模型设置默认值，例如 `input` 默认 text、context window 默认 128000、max tokens 默认 16384，解析位置在 [model-registry.ts#L563](/source-code/packages/coding-agent/src/core/model-registry.ts#L563)。

## 5. Auth 与可用模型

`--list-models` 和 `/model` 不是简单列出所有 built-in 模型。pi 会根据 auth 状态判断哪些模型可用，`getAvailable()` 在 [model-registry.ts#L629](/source-code/packages/coding-agent/src/core/model-registry.ts#L629)，底层检查在 [model-registry.ts#L643](/source-code/packages/coding-agent/src/core/model-registry.ts#L643)。

请求时，`ModelRegistry` 会合并 auth storage、models.json provider apiKey、provider headers、model headers 和 `authHeader`，入口在 [model-registry.ts#L685](/source-code/packages/coding-agent/src/core/model-registry.ts#L685)。这就是为什么 credential 解析不能散落在每个 mode 里。

## 5. models.json 与 extension provider

轻量自定义建议先用 `~/.pi/agent/models.json`：Ollama、LM Studio、vLLM、代理服务通常只需要 baseUrl、api、apiKey 和 models。`models.json` 支持注释和尾随逗号，读取和 schema 校验在 [model-registry.ts#L459](/source-code/packages/coding-agent/src/core/model-registry.ts#L459)。

需要 OAuth、动态模型发现或非标准 streaming API 时，再写 extension 并调用 `pi.registerProvider()`。注册 provider 的校验在 [model-registry.ts#L836](/source-code/packages/coding-agent/src/core/model-registry.ts#L836)，实际应用配置在 [model-registry.ts#L860](/source-code/packages/coding-agent/src/core/model-registry.ts#L860)。

最小 extension 示例必须使用当前类型字段：

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function register(pi: ExtensionAPI) {
  pi.registerProvider("local-openai", {
    name: "Local OpenAI",
    baseUrl: "http://localhost:8000/v1",
    apiKey: "LOCAL_OPENAI_KEY",
    api: "openai-completions",
    models: [
      {
        id: "dev-model",
        name: "Dev Model",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  });
}
```

注意 `apiKey` 是字符串，表示环境变量名、字面值或命令解析值；`baseUrl` 是小写 `l`；model 需要 `name`、`reasoning`、`cost` 等字段。类型定义在 [model-registry.ts#L934](/source-code/packages/coding-agent/src/core/model-registry.ts#L934)。

## 5. 常见误解

误解一：只要 endpoint OpenAI-compatible 就一定能用。很多兼容服务不支持 developer role、reasoning_effort、usage in streaming 或 tool result name，需要 `compat` 明确声明。

误解二：model id 能说明所有能力。实际 context window、image input、thinking 支持、cache 行为和 max tokens 都必须显式建模。

误解三：provider 错误就是工具错误。认证失败、rate limit、context overflow 和网络错误属于 provider/request 边界；工具失败是本地 tool execution 边界。

## 5. 进一步阅读

读 `packages/coding-agent/docs/providers.md` 的 Resolution Order，读 `packages/coding-agent/docs/models.md` 的 Supported APIs、Provider Configuration、Model Configuration、Compatibility，读 `packages/coding-agent/docs/custom-provider.md` 的 Custom Streaming API。源码继续读 [types.ts#L192](/source-code/packages/ai/src/types.ts#L192)、[types.ts#L347](/source-code/packages/ai/src/types.ts#L347)、[model-registry.ts#L796](/source-code/packages/coding-agent/src/core/model-registry.ts#L796)。
