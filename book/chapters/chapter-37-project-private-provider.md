# 37. 企业私有 AI 接入

## 37.1 本章解决的问题

企业内部 AI 网关通常有独特的鉴权要求：HMAC 请求签名、专有 SSO 设备码流、动态 baseUrl（根据 OAuth 响应更新）、或基于路由器的多模型代理（OpenAI 兼容接口但 endpoint 不同）。

Pi 通过 extension 的 `api.registerProvider()` 允许在运行时动态注册一个完整的 provider，包括：自定义 `baseUrl`、API key 来源、OAuth 登录流、`streamSimple` 函数（完全自定义请求实现）和 `modifyModels`（OAuth 成功后动态修改模型配置）。

本章演示如何把企业 AI 网关接入 Pi，让团队成员通过 `/login company-sso` 完成鉴权，然后直接使用企业模型。

## 37.2 核心 API：registerProvider

[`model-registry.ts#L796`](packages/coding-agent/src/core/model-registry.ts#L796) 中的 `registerProvider()` 接受 `ProviderConfigInput`：

```typescript
// model-registry.ts#L934
export interface ProviderConfigInput {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  api?: Api;                     // "anthropic" | "openai" | "google" 等标准 API 协议
  streamSimple?: (...) => ...;   // 完全自定义的流式请求实现
  headers?: Record<string, string>;
  oauth?: Omit<OAuthProviderInterface, "id">;  // OAuth 登录流
  models?: Array<{ id, name, api, reasoning, input, cost, ... }>;
}
```

Extension 通过 `api.modelRegistry.registerProvider()` 调用，在 extension 卸载时用 `unregisterProvider()` 清理：

```typescript
// model-registry.ts#L811
unregisterProvider(providerName: string): void {
  if (!this.registeredProviders.has(providerName)) return;
  this.registeredProviders.delete(providerName);
  this.refresh();  // 重新从磁盘加载，还原被覆盖的内置模型
}
```

## 37.3 场景一：OpenAI 兼容网关（最简单）

企业有一个 OpenAI 兼容的网关 `https://ai.company.com/v1`，使用 JWT token 鉴权：

```typescript
// extensions/company-gateway.ts
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

const extension: ExtensionFactory = (api) => {
  // 从环境变量获取 JWT token
  const token = process.env.COMPANY_AI_TOKEN;
  if (!token) return;

  api.modelRegistry.registerProvider("company-ai", {
    baseUrl: "https://ai.company.com/v1",
    api: "openai",
    apiKey: token,
    models: [
      {
        id: "company-llm-70b",
        name: "Company LLM 70B",
        api: "openai",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  });

  return () => {
    api.modelRegistry.unregisterProvider("company-ai");
  };
};

export default extension;
```

安装后，用户在 Pi 中按 `Ctrl+P` 循环模型时就能看到 "Company LLM 70B"。

## 37.4 场景二：OAuth 设备码流

企业使用设备码流 SSO，登录后获取 access token 和动态 baseUrl：

```typescript
// extensions/company-sso.ts
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { OAuthCredentials } from "@earendil-works/pi-ai";

const PROVIDER_NAME = "company-sso";

const extension: ExtensionFactory = (api) => {
  api.modelRegistry.registerProvider(PROVIDER_NAME, {
    baseUrl: "https://ai.company.com/v1",  // 默认 baseUrl，OAuth 后可能覆盖
    api: "openai",

    // OAuth 配置：实现设备码流
    oauth: {
      usesCallbackServer: false,

      async login(callbacks) {
        // 第一步：获取设备码
        const deviceRes = await fetch("https://sso.company.com/oauth/device", {
          method: "POST",
          body: JSON.stringify({ client_id: "pi-client" }),
          headers: { "Content-Type": "application/json" },
        });
        const { device_code, user_code, verification_uri } = await deviceRes.json();

        // 通知用户打开浏览器
        callbacks.onDeviceCode({
          code: user_code,
          url: verification_uri,
        });

        // 轮询 token
        while (true) {
          await new Promise(r => setTimeout(r, 3000));
          const tokenRes = await fetch("https://sso.company.com/oauth/token", {
            method: "POST",
            body: JSON.stringify({ device_code, client_id: "pi-client" }),
            headers: { "Content-Type": "application/json" },
          });
          const data = await tokenRes.json();
          if (data.access_token) {
            return {
              accessToken: data.access_token,
              expiresAt: Date.now() + data.expires_in * 1000,
              // Pi 的 OAuthCredentials 格式
            } as OAuthCredentials;
          }
        }
      },

      getApiKey(credentials: OAuthCredentials): string {
        return (credentials as any).accessToken;
      },

      // 可选：OAuth 成功后动态修改模型配置
      modifyModels(models, credentials) {
        const baseUrl = (credentials as any).gatewayUrl ?? "https://ai.company.com/v1";
        return models.map(m =>
          m.provider === PROVIDER_NAME ? { ...m, baseUrl } : m
        );
      },
    },

    models: [
      {
        id: "gpt-4o-company",
        name: "GPT-4o (Company)",
        api: "openai",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  });

  return () => api.modelRegistry.unregisterProvider(PROVIDER_NAME);
};

export default extension;
```

用户通过 `/login company-sso` 触发设备码流，完成鉴权后 Pi 把 OAuth token 持久化到 `auth.json`（由 `AuthStorage` 处理），下次启动自动读取并在过期时刷新。

## 37.5 场景三：HMAC 请求签名

如果企业 API 需要对每个请求进行 HMAC 签名，可以通过 `streamSimple` 完全自定义请求实现：

```typescript
api.modelRegistry.registerProvider("company-hmac", {
  baseUrl: "https://ai.company.com",
  api: "openai",
  apiKey: "placeholder",  // HMAC 场景下不用真实 key，签名在 streamSimple 中添加

  streamSimple: async (model, context, options) => {
    const timestamp = Date.now().toString();
    const signature = computeHmac(process.env.COMPANY_SECRET!, timestamp, context);

    return streamSimpleOpenAI(model, context, {
      ...options,
      headers: {
        "X-Timestamp": timestamp,
        "X-Signature": signature,
        ...options?.headers,
      },
    });
  },

  models: [ /* ... */ ],
});
```

## 37.6 为什么通过 Extension 而不是 models.json

`models.json` 支持静态配置自定义 provider（基于 baseUrl + apiKey），适合简单的 API key 场景。但它不支持 OAuth 流程、动态 baseUrl（`modifyModels`）或自定义请求实现（`streamSimple`）。

Extension 是动态的：在 Pi 运行时根据用户状态（是否已登录）决定是否注册 provider，并在 OAuth 成功后实时更新模型配置，这是静态文件无法实现的。

## 37.7 本章训练

#### 使用级训练

使用 `models.json` 配置一个 OpenRouter 代理（OpenAI 兼容）作为自定义 provider，在 Pi 中通过 Ctrl+P 切换到该 provider 的模型，验证请求能成功发出。

#### 原理级训练

阅读 [`model-registry.ts#L860`](packages/coding-agent/src/core/model-registry.ts#L860) 的 `applyProviderConfig()`，说明当 `config.models` 不为空时和为空时，注册逻辑的差异；解释 `oauth.modifyModels` 何时被调用，它能实现什么样的动态配置。

#### 扩展级训练

实现一个完整的企业 SSO 扩展包（基于场景二的框架），把它封装为 Pi Package，让团队成员通过 `pi install ./company-sso-pkg` 安装，然后通过 `/login company-sso` 完成认证；验证 token 存入 `auth.json` 并在重启后自动恢复。

专家级验收标准：能独立实现覆盖三种场景（OpenAI 兼容/OAuth 设备码/HMAC 签名）的企业 provider extension，能解释 `registerProvider()` 的各参数含义，并能说明 extension 注册 provider 与 models.json 静态配置的适用边界。
