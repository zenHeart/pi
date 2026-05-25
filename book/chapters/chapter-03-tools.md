# 第3章 Tools：模型能力的受控出口

## 3.1 工具系统解决什么问题

LLM 不能直接读文件、改代码、跑命令。Tool 系统把外部副作用包装成可描述、可校验、可拦截、可渲染、可持久化的能力。对 coding agent 来说，工具是模型和真实世界之间的唯一受控出口。

pi 的产品层工具由 `createToolDefinition()` 创建，入口见 [tools/index.ts#L96](/source-code/packages/coding-agent/src/core/tools/index.ts#L96)，集合由 `createAllToolDefinitions()` 输出，见 [tools/index.ts#L156](/source-code/packages/coding-agent/src/core/tools/index.ts#L156)。低层 loop 只认 `AgentTool`；coding-agent 用 `ToolDefinition` 保存 label、description、schema、渲染器、来源和工具操作，再适配成低层工具。

## 3.2 默认工具与可选工具

quickstart 文档说明，pi 默认给模型四个工具：`read`、`write`、`edit`、`bash`。`grep`、`find`、`ls` 是额外内置只读工具，可以通过 tool options 启用。usage 文档也列出完整内置集合。这个区别影响安全和用户预期：默认能力已经能修改文件和运行命令；只读审查场景应使用 `--tools read,grep,find,ls` 或禁用写工具。

| 工具 | 默认 | 责任 | 复刻重点 |
|---|---:|---|---|
| `read` | 是 | 读取文件内容 | 路径解析、行范围、二进制/大文件处理、输出截断 |
| `write` | 是 | 创建或覆盖文件 | 父目录、完整内容、覆盖风险、session/diff 观察 |
| `edit` | 是 | 精准修改文件 | old/new 匹配、失败解释、diff、并发写保护 |
| `bash` | 是 | 执行 shell 命令 | cwd、timeout、流式输出、进程树终止、hidden output |
| `grep` | 否 | 搜索内容 | 优先 `rg`、忽略规则、输出限制 |
| `find` | 否 | 查找文件 | ignore、目录边界、排序、截断 |
| `ls` | 否 | 列目录 | 路径存在性、目录/文件标记、输出预算 |

## 3.3 ToolDefinition 与 AgentTool

`ToolDefinition` 是产品层抽象。它不仅包含执行函数，还包含参数 schema、描述、渲染、sourceInfo、是否可覆盖、操作实现等产品信息。低层 `AgentTool` 更小，只关心模型 schema、执行和执行模式。适配逻辑在 [tool-definition-wrapper.ts#L35](/source-code/packages/coding-agent/src/core/tools/tool-definition-wrapper.ts#L35)。

这个分层让 pi 可以同时满足三类需求：

- provider 只需要 JSON schema 和工具描述。
- agent loop 只需要查找、校验、执行、回灌。
- TUI/HTML/RPC 需要渲染工具调用和结果。

复刻时不要把工具写成 `Record<string, Function>`。那会在参数校验、UI 展示、权限拦截、session 回放、SDK 暴露时迅速失控。

## 3.4 参数校验与错误回灌

工具参数来自模型，不可信。`prepareToolCall()` 会查找工具、预处理参数、校验 schema、运行 `beforeToolCall`，见 [agent-loop.ts#L562](/source-code/packages/agent/src/agent-loop.ts#L562)。如果工具不存在或参数错误，pi 会生成 error tool result，而不是抛出导致整个 loop 崩溃。

这背后的设计原则是：模型犯错属于任务过程的一部分。把错误回灌给模型，模型才能改用正确路径、重新读文件或修正参数。只有 runtime 本身不可继续时，才应该终止 agent run。

## 3.5 工具输出预算

工具输出是 token 爆炸的主要来源。一个 `grep` 或 `bash` 可能产生数万行；如果全部塞进上下文，模型窗口会被日志占满。pi 有截断工具和 output accumulator，分别见 [truncate.ts#L78](/source-code/packages/coding-agent/src/core/tools/truncate.ts#L78) 和 [output-accumulator.ts#L29](/source-code/packages/coding-agent/src/core/tools/output-accumulator.ts#L29)。

生产级工具输出策略至少要支持：

- 头尾保留，中间省略。
- 明确告诉模型输出被截断。
- 对超大输出落盘，只把路径、摘要和关键片段放进上下文。
- UI 可以显示比模型更多的信息，但不能默认都进模型。
- session 记录足够信息以支持审计。

## 3.6 Bash 是工具也是环境边界

`bash` 是最危险也最有用的工具。它会执行真实命令、产生真实文件改动，并可能泄露环境信息。pi 的安全策略不是内置通用权限弹窗，而是通过工具定义、扩展 hook、tool options、外部隔离环境和用户工作流控制风险。

复刻时要给 `bash` 单独设计：

- `cwd` 必须明确。
- timeout 必须可配置。
- stdout/stderr 要流式更新 UI。
- 进程树要能终止。
- `!command` 和 `!!command` 要区分是否进入模型上下文。
- 对远程执行、容器执行、受限 shell，应该通过 operations adapter 或 extension 实现。

## 3.7 复刻原则

MVP 工具系统：`read`、`write`、`edit`、`bash`；每个工具有 schema、description、execute；tool call 错误变成 tool result；输出有截断；所有执行可 abort。

生产级工具系统：工具来源可区分 built-in、extension、SDK、package；active tools 可切换；工具可覆盖；工具有自定义渲染；before/after tool hook；远程执行适配；工具事件进入 RPC/JSON/session/eval。
