# 4. 交互模式与 TUI 心智模型

## 4.1 真实场景下的问题

对于前端工程师而言，第一眼看到 Pi Agent 时很容易把它理解为“运行在终端里的 Chatbot 包装”。但在真实的项目开发中，人类与 AI 协作绝不是单向的“一问一答”，而是高频的、长任务的流式互动。例如：
- 在 Agent 连续执行工具修改文件时，如何观察当前的 CPU 负载与任务进度？
- 如何在不干扰 LLM 推理上下文的前提下，在本地执行一段 bash 命令检查依赖？
- 如何在 TUI 中完成类似 Web IDE 的文件引用自动补全（Autocomplete）？
- 当终端大小发生改变，或者需要切换大模型时，如何让界面状态、底层 Session 缓存以及 Token/Cost 费用统计保持同步更新，同时不产生令人眩晕的屏幕闪烁（Flicker）？

如果仅使用传统的 REPL（Read-Eval-Print Loop）方式，开发者将无法优雅处理多组件并发渲染和精细的键盘焦点分发。如果试图在编写自定义 TUI 扩展组件时直接使用裸写 `console.log` 的黑盒模式，极易导致终端区域闪烁、焦点迷失或布局尺寸崩溃。本章将解密 Pi 基于树形结构设计的 TUI 渲染引擎和心智模型。

## 4.2 最小使用示例

在开始探索源码前，可以通过以下几个基础动作直观体验 TUI 的状态刷新与配置机制。

1. **启动交互模式并查询模型**：
   在终端运行 pi（不带 `-p` 参数），你将进入默认的交互式终端面板：
   ```bash
   pi
   ```
2. **打开设置面板**：
   在编辑器输入框中输入并提交：
   ```text
   /settings
   ```
   TUI 会立即渲染出一个交互式选择列表组件（`SelectList`），你可以使用 `Up/Down` 键选择想修改的参数，回车确认。
3. **切换模型循环**：
   在编辑输入框聚焦时，按下 `Ctrl+P`。你会注意到 TUI 底部 Footer 的 Model 区域发生了流式切换，这表明当前 Session 的模型范围（`scopedModels`）被重新绑定。
4. **调整思考级别**：
   按下 `Shift+Tab` 键可以切换 Thinking 模式（如 `off` / `low` / `medium` / `high`），编辑器输入框的边框颜色会根据当前思考级别产生相应的颜色变化，提供直观的视觉反馈。

## 4.3 源码结构与数据流

Pi 交互模式的核心代码结构由 TUI 引擎（封装于 `packages/tui`）与 coding-agent 的交互模式胶水层共同协作完成。

#### 4.3.1 关键模块责任划分

| 关键类 / 文件 | 系统责任 | 源码证据 | 核心观察点 |
|---|---|---|---|
| `InteractiveMode` | 交互模式主控制器，负责 Session 状态监视、组件组装与 Slash 命令解析 | [interactive-mode.ts#L237](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L237) | 输入输出流的生命周期、Slash 命令在 `onSubmit` 内的解析分发 |
| `TUI` | TUI 渲染引擎根节点，负责终端生命周期管理、重绘调度与原始按键事件捕获 | [tui.ts#L239](/source-code/packages/tui/src/tui.ts#L239) | 监听 `process.stdin` 的 I/O 流，全局键盘焦点分发逻辑 |
| `Container` | 基础容器组件，可嵌套子组件，控制行高布局与渲染流程传递 | [tui.ts#L200](/source-code/packages/tui/src/tui.ts#L200) | `render` 宽度裁剪约束，子组件的顺序重绘 |
| `Editor` | 交互式多行基础编辑器，实现 Autocomplete 联动、History 回溯与快捷键捕获 | [editor.ts#L217](/source-code/packages/tui/src/components/editor.ts#L217) | `@` 字符触发补全与输入框高亮，图片文件粘贴处理 |
| `FooterComponent` | 状态栏组件，统计并投影实时 Token、Cache Read/Write、Cost 及 Model 信息 | [footer.ts#L48](/source-code/packages/coding-agent/src/modes/interactive/components/footer.ts#L48) | 在 Session 事件推送时调用 `invalidate` 调度全局渲染 |

#### 4.3.2 TUI 渲染树与事件分发流

在交互模式启动时，`InteractiveMode` 在构造函数中组装了一棵以 `TUI` 为根节点的组件树。其层级结构与数据更新流如下：

```mermaid
graph TD
    TUI["TUI 根节点 (tui.ts#L239)"]
    Container["Layout Container (tui.ts#L200)"]
    Header["Header Component"]
    Messages["Messages Component"]
    Editor["CustomEditor Component"]
    Footer["Footer Component (footer.ts#L48)"]

    TUI --> Container
    Container --> Header
    Container --> Messages
    Container --> Editor
    Container --> Footer

    subgraph 键盘事件分发流程 (handleInput)
        Input["process.stdin 捕获按键"] -->|handleInput L544| TUI
        TUI -->|查找当前聚焦组件| Editor
        Editor -->|匹配 Slash 命令| Submit["onSubmit 路由触发 L2465"]
    end
```

当用户在终端敲击键盘时，物理输入事件将沿以下链条传递：
1. `TUI` 通过 `process.stdin` 订阅原始按键字节流，在 `handleInput`（[tui.ts#L544](/source-code/packages/tui/src/tui.ts#L544)）中将其还原为按键事件。
2. `TUI` 检查当前设置的 `focusedComponent`。如果有，则优先将事件派发给该组件的 `handleInput` 方法（例如 `CustomEditor`）。
3. 如果聚焦组件消费了该事件（如输入字符、退格、光标移动），它会自行调整内部状态并调用 `this.invalidate()` 通知 TUI 申请重绘。
4. TUI 接收到重绘请求后，不会立刻全屏清屏（避免闪烁），而是在下一个宏任务周期执行 `doRender`（[tui.ts#L953](/source-code/packages/tui/src/tui.ts#L953)），计算每个组件在当前终端宽度限制下的输出行，并利用 ANSI 转义序列进行增量局部绘制。

#### 4.3.3 Slash 命令的解析机制

用户在 `CustomEditor` 中提交以 `/` 开头的文本时，会被注册在 `InteractiveMode` 构造函数中的 `this.defaultEditor.onSubmit`（[interactive-mode.ts#L2465](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2465)）拦截。该方法相当于路由分发器（Router）：
- 精确匹配的短路命令（如 `/settings`）直接打开对应的 TUI Component 浮层，并清空输入框文本。
- 带参数的命令（如 `/model claude`）提取参数后缀，进入 `handleModelCommand(searchTerm)` 进行异步模型查找与重新绑定。
- 若命令未命中内置规则，则会被交给 `isExtensionCommand(text)` 检查是否为扩展命令（[interactive-mode.ts#L3721](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L3721)），确保命令系统具备良好的插拔扩展性。

## 4.4 设计考量与折中方案

#### 4.4.1 Terminal Layout 宽度硬约束
在 Web 前端开发中，CSS 提供了极其便利的 Flexbox、Grid 以及自动折行机制。但在字符终端（TTY）中，布局必须精准控制到单个字符宽度。
- **宽度边界**：`Component.render(width: number)` 方法被强制传入当前分配的终端物理列数限制（即 `width`）。任何组件渲染输出的单行文本长度**绝对不能**超过 `width`，否则物理终端会自动产生硬折行，从而导致整个 TUI 界面的高度计算失效、下边框被挤出屏幕。
- **折行截断**：所有渲染纯文本的组件（如 `Markdown`、`Text`）都必须在渲染前计算字符宽度，并在代码中手动对超长行进行硬切分或截断。

#### 4.4.2 增量局部重绘与防闪烁（Anti-Flicker）
如果每次有字符输入或流式 token 传回都进行 `console.clear()`，终端会在极短时间内反复白屏、闪烁，造成无法承受的体验损伤。
- **清除策略**：Pi 设计了 `setClearOnShrink` 选项（[interactive-mode.ts#L370](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L370)），默认开启。在重绘时，TUI 引擎使用 ANSI 逃逸字符（如 `\x1b[H` 将光标复位到左上角，`\x1b[J` 清除从光标到屏幕末尾的内容），而不是执行广义的清屏。
- **增量重绘**：通过比对当前渲染周期产生的每一行内容与上一个周期（`lastOutput`）的内容，仅输出发生变化的行，最大程度减少发送给物理终端的控制字符数。

#### 4.4.3 物理按键事件捕获的终端兼容性
Windows 终端（Command Prompt/PowerShell）、macOS Terminal、tmux 容器以及远程 SSH 通道，对 `Ctrl`、`Alt`、`Meta` 辅助键及 `Arrow` 键生成的 ANSI 转义序列各有差异。
- Pi 通过底层 `ProcessTerminal` 屏蔽物理差异，将原始 buffer 归一化为标准的 Key 结构，并交由 `KeybindingsManager`（[interactive-mode.ts#L377](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L377)）分配。这使得快捷键行为能够在 `keybindings.json` 中配置，而不需要在组件中硬编码按键判断（例如禁止写入 `matchesKey(keyData, "ctrl+x")`），极大简化了不同终端环境的适配工作。

## 4.5 常见误区与排错指南

#### 4.5.1 TUI 渲染大小崩溃（Crash）
**现象**：调整终端窗口尺寸（Resize）时，程序崩溃或界面扭曲，抛出类似 "Index out of range" 的错误。
- **原因**：当终端被缩窄到极端情况（如 `width < 20`）时，部分自定义组件计算 padding 或折行时的剩余空间出现负数（如 `width - paddingX * 2`），导致数组切片参数异常。
- **排查**：在自定义组件的 `render(width)` 中，务必在计算前进行安全宽度裁决：`const safeWidth = Math.max(1, width - margin)`。

#### 4.5.2 键盘焦点丢失（Focus Loss）
**现象**：用户按下 `Escape` 或者关闭自定义选择器面板后，输入框无法聚焦，输入键盘字符毫无反应。
- **原因**：当关闭弹窗或销毁组件时，忘记调用 `TUI.setFocus(targetComponent)` 将全局活动焦点重新交还回主编辑器（`defaultEditor`）。
- **排查**：检查交互路由回调函数，在任何自定义组件注销或返回主界面的出口处，显式调用 `this.ui.setFocus(this.editor)`。

#### 4.5.3 终端重绘时局部字符残留
**现象**：上一条超长日志被缩短后，终端行末留有上次渲染残留的半截字符。
- **原因**：渲染新的一行文本时，没有在其行尾添加清除行尾残留的转义序列（`\x1b[K`），或者行宽计算有偏差，导致 TUI 未覆盖原有的字符区域。
- **排查**：确保对于任何长度可能缩水的渲染行，输出时尾随 ANSI 清屏控制字符，或在重绘计算中让空白行全覆盖填充。

## 4.6 课后练习

#### 4.6.1 使用级练习
启动交互模式，连续敲击 `Shift+Tab` 观察编辑器边框颜色的切换。然后执行 `/settings`，用键盘上下键选择 `hideThinkingBlock`，切换其值并观察对流式输出展示效果的影响。最后，使用 `Ctrl+P` 切换模型，注意底部 Footer 状态栏是否同步刷新了 Model 名称。

#### 4.6.2 原理级练习
阅读并分析 [tui.ts#L544](/source-code/packages/tui/src/tui.ts#L544) 的 `handleInput` 方法和 [tui.ts#L953](/source-code/packages/tui/src/tui.ts#L953) 的 `doRender` 方法。请回答：
1. 键盘事件（KeyPress）被解析后，是如何通过树状焦点搜索分发到当前聚焦组件的？
2. 简述 `TUI` 引擎在 `doRender` 中是如何利用 `lineBuffer` 对终端屏幕行进行脏重绘检测的。

#### 4.6.3 扩展级练习
请在 `packages/coding-agent/src/modes/interactive/components/` 目录下仿照 `FooterComponent` 编写一个最小的自定义 TUI 组件 `CpuMonitorComponent`。
- **要求 1**：在渲染行中显示一条简单的 CPU 负载模拟指示条（如 `[████░░░░░░] 40%`）。
- **要求 2**：在 `InteractiveMode` 中实例化该组件，并将它作为子节点插入到 `widgetContainerAbove`（[interactive-mode.ts#L375](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L375)）中，实现一个实时处于编辑器上方的系统状态浮窗。
