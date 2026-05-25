# 0. 学习路线与 pi agent 心智模型

## 0. 本章解决的问题

前端工程师第一次接触 pi agent，最容易把它理解成“聊天框加几个工具”。这个模型只能解释表面 UI，解释不了为什么 pi 要有 provider registry、message block、session tree、resource loader、extension runtime 和 JSON/RPC mode。

站在创造者视角，pi 是一个本地 TypeScript coding harness：它把用户输入、模型流、工具副作用、会话持久化、项目规则和终端 UI 组合成一个可恢复、可观察、可扩展的运行时。最低层循环从 [agent-loop.ts#L31](/source-code/packages/agent/src/agent-loop.ts#L31) 开始，产品级 CLI 会话从 [main.ts#L424](/source-code/packages/coding-agent/src/main.ts#L424) 串起，默认 system prompt 在 [system-prompt.ts#L28](/source-code/packages/coding-agent/src/core/system-prompt.ts#L28) 生成。

站在完全小白读者视角，你只需要先记住一句话：pi 不是“模型自己会改代码”，而是“本地程序把你的项目、模型、工具和规则接在一起，由本地程序执行副作用”。

## 0. 新手到专家的路线

第一阶段先会用：安装 pi，进入项目目录，登录或配置 API key，运行 `pi`，让它读文件、解释项目、修改代码、运行检查。官方 quickstart 的最小路径是全局安装、`cd` 到项目、运行 `pi`、再用 `/login` 或环境变量完成认证。

第二阶段理解运行时：CLI 先解析参数，再决定 interactive、print、json 或 rpc mode。这个分流在 [main.ts#L99](/source-code/packages/coding-agent/src/main.ts#L99)，初始消息会合并命令行文本、`@file` 和 piped stdin，入口在 [main.ts#L116](/source-code/packages/coding-agent/src/main.ts#L116)。

第三阶段理解协议：provider 返回的不是最终字符串，而是一串 assistant message events。消息、内容块、tool call、usage 和 stop reason 的统一类型定义在 [types.ts#L271](/source-code/packages/ai/src/types.ts#L271)、[types.ts#L277](/source-code/packages/ai/src/types.ts#L277) 和 [types.ts#L347](/source-code/packages/ai/src/types.ts#L347)。

第四阶段理解扩展：项目规则来自 `AGENTS.md` 或 `CLAUDE.md`，资源来自 settings、packages、extensions、skills、prompts、themes。context file 发现逻辑在 [resource-loader.ts#L75](/source-code/packages/coding-agent/src/core/resource-loader.ts#L75)，resource reload 在 [resource-loader.ts#L321](/source-code/packages/coding-agent/src/core/resource-loader.ts#L321)。

## 0. 前端类比

如果你熟悉 React 或 Vue，可以把 pi 看成一个“事件驱动应用”。前端是 state 到 render；agent harness 是 transcript 到 provider request 到 streamed events 到 tool side effects 到 transcript。TUI 只是事件消费者之一，JSON mode、RPC mode、session writer 和 extension runner 也消费同一套结构化事件。

| 前端概念 | pi 中的对应物 | 关键区别 |
|---|---|---|
| component state | session/runtime state | 必须能跨进程恢复 |
| event stream | `AgentEvent` / `AgentSessionEvent` | 同时驱动 UI、持久化和扩展 |
| reducer | assistant stream 合成 final message | partial message 和 final message 边界必须清楚 |
| plugin | extension/package/skill | extension 可以拥有本机执行权限 |
| route history | session tree | 支持 resume、fork、clone、branch summary |

## 0. 核心不变量

pi 的专家级理解可以压缩成八条不变量：

1. 模型不能直接执行副作用，只能请求工具；本地 runtime 执行工具。
2. 模型看到的 provider message 不等于 UI message，也不等于 session entry。
3. provider 差异必须收敛到 `packages/ai` 和 model registry，不能污染 agent loop。
4. 工具结果必须回灌为 transcript 中的 `toolResult`。
5. settings、auth、resource 和 session 都有独立边界，不能混在 prompt 里。
6. interactive、print、json、rpc 只是控制面不同，底层 runtime 尽量复用。
7. 扩展通过注册表、事件和资源加载扩展能力，不应该改核心 loop。
8. 安全不是一句 prompt，而是工具开关、资源来源、凭据解析和本地执行环境的组合。

## 0. 常见误解

误解一：pi 和模型是一回事。实际上模型只负责生成文本、thinking 和 tool call；credential、工具执行、session、context file、UI 都由 pi 负责。

误解二：只要会写 prompt 就会用 pi。prompt 只影响模型行为，不能替代 `--tools`、`--no-context-files`、`.pi/settings.json`、auth file 或 provider compatibility。

误解三：扩展只是“多一点提示词”。skills 和 prompt templates 偏提示词与流程；extensions 能注册工具、命令、provider 和 UI，边界更接近前端插件或 VS Code extension。

## 0. 进一步阅读

先读 `packages/coding-agent/docs/quickstart.md` 和 `packages/coding-agent/docs/usage.md`，建立使用路径。再读 `packages/coding-agent/docs/providers.md`、`models.md`、`settings.md` 和 `json.md`，把认证、模型、配置和机器接口串起来。源码阅读从 [main.ts#L424](/source-code/packages/coding-agent/src/main.ts#L424)、[model-registry.ts#L335](/source-code/packages/coding-agent/src/core/model-registry.ts#L335)、[auth-storage.ts#L196](/source-code/packages/coding-agent/src/core/auth-storage.ts#L196) 和 [types.ts#L347](/source-code/packages/ai/src/types.ts#L347) 开始。
