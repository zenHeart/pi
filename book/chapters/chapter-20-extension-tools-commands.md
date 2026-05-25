# 20. 自定义工具、命令与快捷入口

## 20.1 本章解决的问题

前端工程师第一次接触 Pi Agent 时，最容易把“工具”“命令”“快捷键”混成一个概念：都是让 Pi 做事的入口。但在 Pi 里，这三者属于不同层级。

工具是给模型调用的能力。模型在一次 assistant turn 中决定是否调用 `read`、`bash`、`edit`、扩展注册的 `greet` 等工具。扩展文档把它说得很直接：`Custom tools - Register tools the LLM can call via pi.registerTool()`，也就是工具的使用者首先是 LLM，而不是键盘前的人。源码中的 `ToolDefinition` 从 [types.ts#L424](packages/coding-agent/src/core/extensions/types.ts#L424) 开始定义，`ExtensionAPI.registerTool` 在 [types.ts#L1133](packages/coding-agent/src/core/extensions/types.ts#L1133) 暴露给扩展。

命令是给用户触发的能力。你在编辑器里输入 `/hello`、`/model`、`/reload`，命令处理函数立即运行。扩展文档的 quick start 同时展示 `pi.registerTool({ ... })` 和 `pi.registerCommand("hello", ...)`，但这不是两个写法不同的工具，而是两个不同方向的控制面。命令注册入口在 [types.ts#L1142](packages/coding-agent/src/core/extensions/types.ts#L1142)，命令上下文 `ExtensionCommandContext` 在 [types.ts#L333](packages/coding-agent/src/core/extensions/types.ts#L333)。

快捷键是给 TUI 操作绑定的入口。它不一定产生一次模型请求，也不一定执行扩展命令。`packages/coding-agent/docs/keybindings.md` 说明所有快捷键可通过 `~/.pi/agent/keybindings.json` 自定义，并使用 Pi 内部同一套 namespaced id。对应实现是 `KeybindingsManager`，它在 [keybindings.ts#L340](packages/coding-agent/src/core/keybindings.ts#L340) 继承 TUI 的 keybinding 管理器，并在 [keybindings.ts#L354](packages/coding-agent/src/core/keybindings.ts#L354) 提供 reload。

本章的必要性在于：第 18、19 章已经讲过扩展和事件，本章开始把扩展变成可用的工作流入口。如果不分清这三层，前端工程师会把“给模型增加能力”误写成 slash command，或者把“给用户一个开关”误写成 LLM tool，结果是行为时机、权限边界、UI 反馈都不对。

## 20.2 最小可运行路径

先只读这些文档：`packages/coding-agent/docs/extensions.md`、`packages/coding-agent/docs/keybindings.md`、`packages/coding-agent/docs/usage.md`。不要从旧章节推断行为，直接以 docs 和源码为准。

最小验证可以这样设计：写一个扩展文件，注册一个工具 `greet`、一个命令 `/hello`、一个快捷键。工具返回文本，命令调用 `ctx.ui.notify()`，快捷键只填充编辑器文本或切换扩展状态。扩展文档给出的测试方式是 `pi -e ./my-extension.ts`，同时也提醒自动发现路径：`~/.pi/agent/extensions/` 和 `.pi/extensions/` 支持 `/reload` 热重载。

验证时关注三个观察点。第一，只有模型需要时才会调用 `greet`，所以你应在提示中要求模型“用 greet 工具问候 Alice”。第二，`/hello Alice` 不需要等待模型，它由命令 handler 直接处理。第三，快捷键要走配置和 keybinding manager，而不是在组件里硬编码 `ctrl+x` 判断；`packages/coding-agent/docs/keybindings.md` 的 action id 表说明了为什么快捷键要保持可配置。

CLI 侧也有对应开关。`packages/coding-agent/docs/usage.md` 中列出 `--tools <list>`、`--no-builtin-tools`、`--no-tools`，并说明 built-in tools 是 `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`。这告诉你一个重要事实：工具集合是 agent prompt 和运行时安全面的输入，不是 TUI 的装饰。

## 20.3 核心机制

扩展注册不是把函数散落到全局，而是写入扩展运行时收集的 registry。`ExtensionAPI` 在 [types.ts#L1084](packages/coding-agent/src/core/extensions/types.ts#L1084) 汇总了扩展能做的事：监听事件、注册工具、注册命令、注册快捷键、注册 flag、注册 renderer、注册 provider。这个接口是本章的主索引。

工具定义的关键字段是 `name`、`description`、`parameters`、`execute` 和可选渲染器。`parameters` 用 TypeBox schema，原因不是形式主义，而是模型调用工具时传入的是 JSON 参数，运行时必须能把“不可靠的模型输出”变成可验证的结构。工具执行函数被包装到 agent 的 tool registry 中，`tool-definition-wrapper.ts` 在 [tool-definition-wrapper.ts#L7](packages/coding-agent/src/core/tools/tool-definition-wrapper.ts#L7) 把扩展工具的 `execute` 接到统一工具定义上。

命令路径不同。`AgentSession` 注释明确说明 extension commands 会立即处理，即使当前还在 streaming；这段逻辑从 [agent-session.ts#L955](packages/coding-agent/src/core/agent-session.ts#L955) 开始。`_tryExecuteExtensionCommand` 在 [agent-session.ts#L1117](packages/coding-agent/src/core/agent-session.ts#L1117) 解析 `/name args`，找到扩展命令后调用 handler。这样设计是为了让 `/preset`、`/tools`、`/shutdown` 这类控制命令不被排进普通模型消息队列。

autocomplete 则在 interactive mode 里把 built-in slash commands、prompt templates、extension commands、skill commands 合成一个 provider。源码从 [interactive-mode.ts#L449](packages/coding-agent/src/modes/interactive/interactive-mode.ts#L449) 开始构造 slash command 列表，扩展命令转换在 [interactive-mode.ts#L493](packages/coding-agent/src/modes/interactive/interactive-mode.ts#L493)，外部 autocomplete wrapper 在 [interactive-mode.ts#L527](packages/coding-agent/src/modes/interactive/interactive-mode.ts#L527) 叠加。这解释了为什么 `/` 补全里能同时看到内置命令、扩展命令和资源型命令。

快捷键的核心机制是两层 manager：`packages/tui/src/keybindings.ts` 提供通用 keybinding，coding-agent 的 [keybindings.ts#L340](packages/coding-agent/src/core/keybindings.ts#L340) 加载用户配置、迁移旧 id、提供 reload。`packages/coding-agent/docs/keybindings.md` 说旧配置会自动迁移到 namespaced ids，对应迁移函数在 [keybindings.ts#L290](packages/coding-agent/src/core/keybindings.ts#L290)。这也是为什么扩展应注册 action 或使用注入的 `keybindings`，而不是在 UI 组件里写死某个按键。


**生命周期图**

```mermaid
flowchart LR
    A["配置与包"] --> B["Skills"]
    B --> C["Prompt Templates"]
    C --> D["Extensions"]
    D --> E["自定义工具、命令与快捷入口 的可验证结果"]
```

**源码责任表**

| 环节 | 系统责任 | 源码证据 | 读源码时要确认什么 |
|---|---|---|---|
| 配置与包 | 声明资源来源和优先级 | [resource-loader.ts#L398](packages/coding-agent/src/core/resource-loader.ts#L398) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Skills | 模型行为说明书 | [resource-loader.ts#L510](packages/coding-agent/src/core/resource-loader.ts#L510) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Prompt Templates | 可复用任务入口 | [resource-loader.ts#L533](packages/coding-agent/src/core/resource-loader.ts#L533) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Extensions | 代码能力与 UI/provider 注册 | [types.ts#L1084](packages/coding-agent/src/core/extensions/types.ts#L1084) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |

**关键代码说明**

读源码时不要只顺着函数名跳转，而要检查四个边界：输入边界、状态边界、裁决边界、输出边界。输入边界回答“谁把数据交进来”；状态边界回答“哪些信息会跨 turn、跨 session 或跨进程保留”；裁决边界回答“谁有权继续、停止、执行或拒绝”；输出边界回答“结果给人看、给模型看，还是给外部系统看”。本章涉及的源码只有放进这四个边界中才有解释力。

## 20.4 为什么这样设计

Pi 把工具、命令、快捷键分开，是为了把“谁触发”“何时触发”“是否进入模型上下文”说清楚。

工具进入模型上下文。它要有描述、参数 schema、返回结果和错误处理，因为模型会基于这些信息计划下一步。一个 `deploy_preview` 工具如果返回 preview URL，模型后续可以继续读取、总结或修改。它适合表达“模型可委托执行的外部能力”。

命令绕过模型上下文。它更像产品里的 command palette action，适合控制 Pi 自身或改变会话状态。比如扩展示例里的 `tools.ts` 通过命令打开工具开关 UI，而不是让模型自己决定是否改变可用工具。这样用户对控制面有确定性，命令执行也不消耗一次 LLM round trip。

快捷键是交互效率层。`app.model.cycleForward`、`app.tools.expand`、`app.message.followUp` 这类动作通常只改变 TUI 或 session 控制状态。把它们做成配置化 action id，可以让终端用户、Vim/Emacs 用户、Windows Terminal 用户各自调整，而不要求扩展作者预测所有键盘习惯。

对前端工程师可以类比：工具像后端给 AI 暴露的 typed mutation/query；命令像 command palette action；快捷键像把 action 绑定到 keyboard shortcut。三者共享扩展系统，但不能互相替代。


**创建者视角的设计不变量**

资源系统是 Pi 小内核的主要出口。稳定行为进入核心，团队差异进入资源；资源必须保留 sourceInfo、加载顺序和冲突边界，否则用户无法解释为什么某个 skill、命令、主题或工具生效。

**如果省略本章会发生什么**

省略本章，读者会把 自定义工具、命令与快捷入口 当成单点功能，而不是 Pi 架构中的责任边界。直接后果是：使用时不知道该改配置、写资源、写扩展、接 provider 还是调用 SDK；排查时也会把 provider、工具、TUI、session 和资源加载混为一谈。专家级学习必须把每章能力放回系统生命周期中验证。

## 20.5 常见误解与排查

误解一：注册了工具就能直接 `/tool` 调用。不同意。工具由模型调用，用户命令由 slash command 调用。如果你希望用户手动触发，应注册 `pi.registerCommand()`；如果你希望模型按任务需要调用，应注册 `pi.registerTool()`。

误解二：`--no-builtin-tools` 会禁用所有扩展工具。不同意。`packages/coding-agent/docs/usage.md` 写的是 disable built-in tools but keep extension/custom tools enabled。真正禁用所有工具的是 `--no-tools`。排查工具不可见时，先确认 CLI flags，再确认扩展是否加载，再看工具名是否被 allowlist 过滤。

误解三：快捷键冲突应该在组件里硬编码处理。不同意。`packages/coding-agent/docs/keybindings.md` 明确说每个 action 可以绑定一个或多个 key，用户配置覆盖默认值。排查快捷键问题时，先打开 `/hotkeys` 或检查 `~/.pi/agent/keybindings.json`，再运行 `/reload`，最后才看扩展 UI 的 `handleInput`。

误解四：扩展命令和 prompt template 的 `/name` 冲突无所谓。不同意。interactive mode 会把多个来源合并进 autocomplete，并对 built-in 冲突做跳过处理，相关逻辑在 [interactive-mode.ts#L442](packages/coding-agent/src/modes/interactive/interactive-mode.ts#L442)。团队扩展应给命令加清晰前缀，例如 `/team-review`，避免抢占通用命名。

## 20.6 本章训练

第一，写一个“预览构建”扩展设计，不写代码也可以：`preview_build` 应该是工具、命令还是快捷键？如果模型要根据代码状态决定是否构建，它应是工具；如果用户要手动启动并看进度，它应是命令；如果只是快速打开最近 preview，它可以是快捷键绑定的命令。

第二，沿源码追踪 `/hello Alice`：从编辑器输入进入 interactive mode，判断 extension command，交给 `AgentSession` 的 command path，再执行 `RegisteredCommand.handler`。要求你能指出 [agent-session.ts#L955](packages/coding-agent/src/core/agent-session.ts#L955) 为什么说 extension commands bypass normal queue。

第三，沿源码追踪一次工具调用：模型在 `pi-ai` 响应中产生 tool call，agent 找到同名工具定义，执行扩展 `ToolDefinition.execute`，把 result 作为 tool result 放回上下文。要求你能解释为什么工具参数必须有 schema，以及为什么 `renderCall`/`renderResult` 只影响 TUI 展示，不改变模型看到的工具结果。

第四，给团队设计一个“危险命令确认”方案：不要改 built-in bash 工具源码，而是在扩展里监听 `tool_call`，检查 `event.toolName === "bash"`，用 `ctx.ui.confirm()` 阻断危险命令。这个训练把第 19 章事件和本章工具控制面连起来，也是本章在全书结构中的落点。


**专家验收任务**

完成本章后，读者应该能交付三件东西：一张自己画出的 自定义工具、命令与快捷入口 数据流图；一份包含源码链接、输入、输出、失败边界的责任表；一个最小实践任务，证明自己能在不改错层级的情况下使用或扩展该能力。若三件事缺一件，就说明还停留在“会用命令”的阶段，没有达到能设计和审计 Pi 方案的水平。

