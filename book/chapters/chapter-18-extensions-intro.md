# 18. Extensions 的能力边界

## 18.1 Extension 是什么

Extension 是 Pi 的 TypeScript 扩展点。`packages/coding-agent/docs/extensions.md` 开头说 extensions can subscribe to lifecycle events, register custom tools callable by the LLM, add commands, and more。和 prompt template、skill 不同，extension 是会被加载执行的代码，因此能力更强，风险也更高。

前端工程师可以把 extension 理解成“运行在 Pi 进程里的插件模块”。它的默认导出接收 `ExtensionAPI`，可以注册事件、工具、命令、快捷键、flag、message renderer、provider，也可以通过 `ctx.ui` 与 TUI 交互。类型文件开头列出的能力就是边界说明：订阅 lifecycle events、注册 LLM-callable tools、注册 commands/shortcuts/flags、通过 UI primitives 交互，见 [types.ts#L1084](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1084)。

## 18.2 最小使用路径

最小 extension 是一个 `.ts` 文件，放在 `~/.pi/agent/extensions/` 或 `.pi/extensions/`，或用 `pi -e ./path.ts` 快速测试。docs 特别说明：auto-discovered locations can be hot-reloaded with `/reload`，而 `pi -e` 更适合 quick tests。一个 extension 默认导出函数：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.notify("loaded", "info");
  });
}
```

加载由 jiti 完成，所以 TypeScript 不需要预编译。源码的 loader 通过 `createJiti()` 导入 extension path，要求 default export 是函数，然后创建 `ExtensionAPI` 调用 factory，见 [loader.ts#L331](/source-code/packages/coding-agent/src/core/extensions/loader.ts#L331) 和 [loader.ts#L368](/source-code/packages/coding-agent/src/core/extensions/loader.ts#L368)。如果 factory 返回 Promise，loader 会 await；docs 也说明 async initialization completes before `session_start`、`resources_discover` 和 queued provider registrations flush。

## 18.3 ExtensionAPI 的分类

ExtensionAPI 可以分成三类。

第一类是注册表。`registerTool()` 给模型增加可调用工具；`registerCommand()` 增加 `/name`；`registerShortcut()` 增加键盘入口；`registerFlag()` 增加 CLI flag；`registerMessageRenderer()` 改变自定义消息显示。源码中这些方法只是写入当前 extension 对象的 map，见 [loader.ts#L183](/source-code/packages/coding-agent/src/core/extensions/loader.ts#L183)。这说明注册发生在加载期，运行时再由 AgentSession 和 TUI 读取这些 registry。

第二类是事件。`pi.on("tool_call", ...)`、`pi.on("before_agent_start", ...)` 等把 handler 放进 `extension.handlers`，真正执行由 ExtensionRunner 决定。类型里列出了 `resources_discover`、session、agent、message、tool、model、input 等事件，见 [types.ts#L1084](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1084)。

第三类是动作。`sendMessage()`、`sendUserMessage()`、`appendEntry()`、`setActiveTools()`、`setModel()`、`registerProvider()` 等依赖 runner 绑定后的 runtime。加载期还没绑定核心动作时，runtime 里多数方法是 throwing stub；provider registration 会先排队，绑定后 flush，见 [loader.ts#L120](/source-code/packages/coding-agent/src/core/extensions/loader.ts#L120) 和 [runner.ts#L301](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L301)。


**生命周期图**

```mermaid
flowchart LR
    A["配置与包"] --> B["Skills"]
    B --> C["Prompt Templates"]
    C --> D["Extensions"]
    D --> E["Extensions 的能力边界 的可验证结果"]
```

**源码责任表**

| 环节 | 系统责任 | 源码证据 | 读源码时要确认什么 |
|---|---|---|---|
| 配置与包 | 声明资源来源和优先级 | [resource-loader.ts#L398](/source-code/packages/coding-agent/src/core/resource-loader.ts#L398) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Skills | 模型行为说明书 | [resource-loader.ts#L510](/source-code/packages/coding-agent/src/core/resource-loader.ts#L510) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Prompt Templates | 可复用任务入口 | [resource-loader.ts#L533](/source-code/packages/coding-agent/src/core/resource-loader.ts#L533) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |
| Extensions | 代码能力与 UI/provider 注册 | [types.ts#L1084](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1084) | 输入从哪里来，输出交给谁，失败由哪一层裁决 |

**关键代码说明**

读源码时不要只顺着函数名跳转，而要检查四个边界：输入边界、状态边界、裁决边界、输出边界。输入边界回答“谁把数据交进来”；状态边界回答“哪些信息会跨 turn、跨 session 或跨进程保留”；裁决边界回答“谁有权继续、停止、执行或拒绝”；输出边界回答“结果给人看、给模型看，还是给外部系统看”。本章涉及的源码只有放进这四个边界中才有解释力。

## 18.4 为什么要有 Runner

Loader 负责“把模块加载成 Extension 对象”，Runner 负责“在正确时机执行 Extension 对象”。这个分层避免 extension factory 直接接触 AgentSession 内部状态。Runner 绑定 UI、session、model registry、shutdown、reload 等能力，创建惰性 context，让事件处理器在调用时读取当前状态，见 [runner.ts#L266](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L266) 和 [runner.ts#L569](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L569)。

这对 `/reload`、`/new`、`/resume` 很关键。旧 extension context 会被标记 stale；如果扩展在 session replacement 后继续使用捕获的旧 ctx，会抛出明确错误，见 [runner.ts#L466](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L466)。设计上，extension 可以扩展行为，但不能持有过期 session 的权力。

Runner 还承担冲突与安全边界。工具同名时 first registration per name wins，见 [runner.ts#L373](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L373)。快捷键会和内置 keybinding 冲突检查，保留 interrupt、exit、model select 等保留键，见 [runner.ts#L60](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L60)。


**创建者视角的设计不变量**

资源系统是 Pi 小内核的主要出口。稳定行为进入核心，团队差异进入资源；资源必须保留 sourceInfo、加载顺序和冲突边界，否则用户无法解释为什么某个 skill、命令、主题或工具生效。

**如果省略本章会发生什么**

省略本章，读者会把 Extensions 的能力边界 当成单点功能，而不是 Pi 架构中的责任边界。直接后果是：使用时不知道该改配置、写资源、写扩展、接 provider 还是调用 SDK；排查时也会把 provider、工具、TUI、session 和资源加载混为一谈。专家级学习必须把每章能力放回系统生命周期中验证。

## 18.5 什么时候用 Extension

选择 extension 的标准是：你需要代码执行、运行时事件、用户交互、工具注册、状态持久化或 provider 改造。只要需求是纯文本复用，先用 prompt template；只要需求是模型流程说明，先用 skill；只有当你需要横切 agent loop 或接入外部系统时才用 extension。

docs 的 examples reference 覆盖了典型场景：`permission-gate.ts` 用 `tool_call` 拦危险命令；`input-transform.ts` 改用户输入；`custom-compaction.ts` 定制压缩；`github-issue-autocomplete.ts` 增加 autocomplete；`custom-provider-anthropic/` 注册 provider。这些例子说明 extension 不是单一功能，而是一组经过类型约束的运行时入口。

安全边界也更重。docs 明确说 `Extensions run with your full system permissions and can execute arbitrary code`。所以团队分发 extension 时，应优先 package 化、固定版本、代码评审；不要把不可信脚本随手放入自动发现目录。

## 18.6 本章在全书中的位置

第 18 章是 extension 部分的总览，后续第 19 章讲事件与生命周期，第 20 章讲工具和命令，第 21 章讲 UI 与主题。把总览放在前面，是为了让读者先建立能力边界：Loader 加载模块，API 注册能力，Runner 执行事件，AgentSession 在关键节点调用 Runner。

训练：看一个需求“每次 bash 执行前确认是否包含 `rm -rf`”。解释为什么它不是 prompt template，也不是 skill，而是 extension 的 `tool_call` 事件；再指出它需要 UI 时必须考虑非交互模式，因为 docs 的 Mode Behavior 说明 JSON/print 模式里 UI 是 no-op，需要检查 `ctx.hasUI`。


**专家验收任务**

完成本章后，读者应该能交付三件东西：一张自己画出的 Extensions 的能力边界 数据流图；一份包含源码链接、输入、输出、失败边界的责任表；一个最小实践任务，证明自己能在不改错层级的情况下使用或扩展该能力。若三件事缺一件，就说明还停留在“会用命令”的阶段，没有达到能设计和审计 Pi 方案的水平。

