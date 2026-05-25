# 26. 安全模型、权限边界与第三方包风险

## 26. 本章解决的问题

pi 是本地 coding agent，默认围绕“用户自己的机器、用户自己的仓库、用户自己的 credential”设计。创造者视角下，安全边界不能只靠 system prompt；读者视角下，只要一个功能能读文件、写文件、跑命令、加载代码或发送请求，它就是安全相关功能。

内置 bash 工具定义入口在 [bash.ts#L269](/source-code/packages/coding-agent/src/core/tools/bash.ts#L269)，实际工具工厂在 [bash.ts#L443](/source-code/packages/coding-agent/src/core/tools/bash.ts#L443)。edit/write 工具工厂分别在 [edit.ts#L434](/source-code/packages/coding-agent/src/core/tools/edit.ts#L434) 和 [write.ts#L264](/source-code/packages/coding-agent/src/core/tools/write.ts#L264)。package manager 的安装入口在 [package-manager.ts#L956](/source-code/packages/coding-agent/src/core/package-manager.ts#L956)。

## 26. 权限事实

这些能力都不是“纯文本配置”：

1. `bash` 可以运行本机命令。
2. `write` 和 `edit` 可以修改文件。
3. extension 是本机 TypeScript/JavaScript 代码，运行时拥有用户权限。
4. skill 可以指导模型执行危险动作。
5. package 可以携带 extensions、skills、prompts、themes。
6. RPC controller 可以代表用户发送 prompt、运行 bash、切换 session。
7. auth.json 存 API key 或 OAuth token。
8. session/export/log 可能包含用户输入、工具结果和文件片段。

`AuthStorage` 的 auth 文件 backend 会创建父目录和文件，并把文件 chmod 到 `0600`，相关逻辑在 [auth-storage.ts#L53](/source-code/packages/coding-agent/src/core/auth-storage.ts#L53)。这保护的是本机文件权限，不代表 prompt、日志、extension 或第三方 package 自动安全。

## 26. Prompt 不是权限系统

system prompt 可以提醒模型“不要做危险事”，但不能阻止工具执行。真正的阻止必须发生在这些层：

1. 工具 allowlist：例如只启用 `read`、`grep`、`find`、`ls`。
2. extension policy：例如在 `tool_call` 事件中阻止危险命令。
3. sandbox：例如容器、受限用户、只读挂载。
4. OS/file permissions：让进程本身没有权限。
5. RPC/SDK host policy：不给未认证用户调用本地 runtime。

SDK 创建 session 时默认 active tools 是 `read`、`bash`、`edit`、`write`，见 [sdk.ts#L280](/source-code/packages/coding-agent/src/core/sdk.ts#L280)。如果你的场景是审查或教学，不要默认给写权限；用 `tools` 或 `noTools` 缩小能力面。

## 26. Extension 与 package 风险

extensions docs 明确写着：extensions run with full system permissions。packages docs 也明确写着：Pi packages run with full system access，extensions 可执行任意代码，skills 可指示模型执行动作。正文必须把这当成已实现事实，而不是吓唬人的提示。

package 来源包括 npm、git、local path。npm package 可以带依赖；git package 会 clone 并 reconcile ref；local path 直接指向磁盘。package scope 和 dedupe 规则决定 project settings 可以覆盖 user settings。也就是说，团队仓库里的 `.pi/settings.json` 可以改变你启动 pi 时加载的 package 集合。

## 26. Custom provider 与 credential 边界

custom provider 经常处理企业 API key、OAuth access token、自定义 headers、proxy credentials。`ModelRegistry.getApiKeyAndHeaders()` 会合并多种来源的 key 和 header，见 [model-registry.ts#L685](/source-code/packages/coding-agent/src/core/model-registry.ts#L685)。这些值绝不能进 prompt、session、observability payload、extension error、RPC event 或 export。

`StreamOptions` 支持 `apiKey`、`headers`、`metadata`、`onPayload`、`onResponse` 等字段，见 [types.ts#L84](/source-code/packages/ai/src/types.ts#L84)。这给 provider hooks 很大能力，也意味着 hook 和日志必须默认脱敏。

## 26. 为什么没有内置 permission popup

pi 的设计原则是小核心，复杂工作流放到 extensions、skills、prompt templates、packages、SDK、RPC。usage docs 也明确说 pi core 不内置 MCP、sub-agents、permission popups、plan mode、to-dos 或 background bash，而是允许你通过 extension/package 或外部工具实现。

创造者视角下，这是产品边界：不同团队对风险的定义不同。有人要每次 `rm` 弹窗，有人要按 repo policy 拦截，有人要完全容器化，有人要远程执行。把一个固定 permission popup 放进核心，会给用户错误安全感，也会挡住更严肃的 sandbox 策略。

## 26. 最小安全策略

对于个人使用：

1. 只安装可信 package 和 extension。
2. 审查陌生 extension 的源码和依赖。
3. 只读任务启用 read-only tools。
4. 不把 secret 粘进 prompt。
5. 不把含 secret 的 session/export 发给别人。

对于团队使用：

1. project package 必须 code review 并 pin 版本或 commit。
2. 高风险仓库用容器或专用用户运行 pi。
3. 企业 credential 走 broker 或 OAuth，不散落在 prompt 和 logs。
4. RPC/SDK 服务化必须加认证、workspace isolation、quota、audit log。
5. extension 工具输出要截断、脱敏、限制路径。
6. 自定义 provider 日志默认不记录 headers、payload body、response body。

## 26. 已实现事实、进一步 docs、生态扩展

已实现事实：pi 有真实副作用工具、extension code loading、package installation、auth file、RPC control、custom provider headers/API key resolution、resource loading。工具和 package 风险来自这些实现，不是抽象猜测。

进一步 docs：usage.md、extensions.md、packages.md、providers.md、models.md 分别解释命令、extension 权限、package 来源、provider credential 和 custom model 配置。

生态扩展方式：permission gates、protected paths、dirty repo guard、sandboxed tools、remote execution、credential broker 都应作为 extension、package 或 host policy 实现。它们是安全生态方式，不是 pi core 默认保证。

## 26. 专家边界

判断一个 pi 安全问题属于哪一层：

1. 模型胡说：prompt/context/eval 问题。
2. 工具执行危险动作：tool allowlist、extension policy、sandbox 问题。
3. package 加载恶意代码：supply chain 问题。
4. credential 泄漏：auth/log/session/export/provider hook 问题。
5. RPC 被远程调用：host network/auth 问题。
6. session 暴露敏感内容：durability/export/audit 问题。

不要把所有问题都归结为“模型不听话”。模型只是提出动作，runtime 和 host 才是权限边界。
