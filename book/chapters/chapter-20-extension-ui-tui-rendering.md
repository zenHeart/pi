# 20. Extension UI、TUI Component 与渲染模型

## 20. 本章解决的问题

extension 不只影响模型，也可以影响终端 UI：select/confirm/input/editor、custom component、overlay、status、widget、footer、header、message renderer、tool renderer、theme switch、autocomplete provider。UI context 定义在 [types.ts#L124](/source-code/packages/coding-agent/src/core/extensions/types.ts#L124)，interactive mode 把这些方法绑定到真实 TUI 的位置在 [interactive-mode.ts#L1978](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L1978)。

对前端读者来说，TUI component 可以类比 React component，但它不是 DOM。它每次 render 返回字符串行数组，必须自己处理宽度、焦点、按键、缓存和销毁。

## 20. Interactive UI 与 no-op UI

extension 可以在 interactive mode 里弹 dialog 或替换 editor，但 print、JSON、RPC 等模式不一定有本地 UI。runner 默认持有 no-op UI context，`hasUI()` 判断当前是否绑定了真实 UI，见 [runner.ts#L365](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L365)。因此 extension 在调用 `ctx.ui.custom()`、`select()`、`confirm()` 前，应该检查 `ctx.hasUI` 或提供非交互 fallback。

interactive mode 绑定 UI 时，`setWidget()`、`setFooter()`、`custom()`、`setEditorText()`、`setEditorComponent()`、`setTheme()` 等方法都映射到具体实现，见 [interactive-mode.ts#L1981](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L1981) 到 [interactive-mode.ts#L2012](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2012)。

## 20. Dialog、editor 与 custom component

`ctx.ui.editor()` 会临时用 extension editor 替换主 editor，完成或取消后恢复，创建和恢复逻辑在 [interactive-mode.ts#L2154](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2154) 和 [interactive-mode.ts#L2181](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2181)。

`ctx.ui.custom()` 更底层：extension 提供 factory，拿到 tui、theme、keybindings 和 done callback。普通模式会替换 editor；overlay 模式会把组件浮在现有内容上。show/close/overlay 处理在 [interactive-mode.ts#L2272](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2272)，overlay handle 创建在 [interactive-mode.ts#L2315](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2315)。

## 20. Custom editor 的边界

`setEditorComponent()` 可以替换主输入 editor，例如实现 vim mode。interactive mode 会保存当前文本、创建新 editor、复制 submit/change callbacks、复制 border/padding/autocomplete，并把 app-level handlers 接回去，见 [interactive-mode.ts#L2193](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2193) 到 [interactive-mode.ts#L2235](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2235)。

这就是为什么 docs 要求扩展 `CustomEditor` 并对不处理的按键调用 `super.handleInput(data)`。否则 Escape、Ctrl+D、model cycling、paste image 等应用快捷键会被自定义 editor 吞掉。

## 20. Widget、footer、header 与 status

`setStatus()` 适合短状态，显示在 footer/status bar。`setWidget()` 适合 editor 上方或下方的持久小面板。`setFooter()` 可以替换整个 footer。`setHeader()` 可以替换启动 header。这些都属于 UI 状态，不应该成为唯一事实源。

如果 widget 展示 todo 列表，真正的 todo 数据应该存在 extension 内存加 session custom entry，而不是只存在 widget render lines。否则 reload、resume、RPC mode 都会丢状态。

## 20. Renderer 模型

custom tool 可以提供 `renderCall()` 和 `renderResult()`，签名在 [types.ts#L463](/source-code/packages/coding-agent/src/core/extensions/types.ts#L463)。custom message 可以通过 `registerMessageRenderer()` 注册 renderer，API 在 [types.ts#L1170](/source-code/packages/coding-agent/src/core/extensions/types.ts#L1170)。

renderer 的职责是“展示”，不是“改变事实”。模型看到的内容来自 message/tool result content，TUI 展示可以更紧凑、更漂亮或可展开，但不能让 UI 和 transcript 讲两个故事。

## 20. 宽度、ANSI 与 IME

TUI component 的 render 必须尊重传入 width。终端里中文、emoji、ANSI escape、OSC 8 link 都会影响可见宽度，不能用 `string.length` 当列宽。TUI docs 要求每行不超过 width，并建议用 `truncateToWidth()`、`wrapTextWithAnsi()` 这类工具。

输入型 component 还要处理焦点和 IME。显示文本光标的组件应实现 focusable 约定，让 TUI 能把硬件光标定位到正确位置。对 CJK 用户来说，这决定了输入法候选窗是否出现在正确位置。

## 20. Theme 与 invalidate

UI 颜色必须从当前 theme 获取。extension 可以读取 `ctx.ui.theme`，也可以在 custom factory 中使用传入的 theme。切换主题时，TUI 会 invalidate component；如果组件缓存了带 ANSI 的字符串，就要在 `invalidate()` 中重建，否则颜色仍是旧主题。

interactive mode 中 extension 可直接 setTheme，成功后会写 settings 并请求 render，见 [interactive-mode.ts#L2001](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2001)。`/settings` 里的 theme preview 和选择也会调用 `setTheme()` 并 invalidate UI，见 [interactive-mode.ts#L3921](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L3921)。

## 20. RPC 和非交互边界

interactive mode 可以直接渲染 TUI；RPC mode 的宿主可能是编辑器、网页或另一个进程。extension UI 不能假设 terminal 存在。设计一个 extension 时，要决定：非交互模式下是跳过 UI、返回默认值、抛出可解释错误，还是通过 RPC 协议把 UI request 交给外部控制器。

这条边界对生产系统很重要。否则一个需要 confirm 的 extension 在 CI 或 JSON mode 中可能永久等待用户输入。

## 20. 复刻路径

最小可用：提供 `notify()`、`confirm()`、`select()`，以及一个简单 custom component 接口。

第二阶段：实现 widget、status、footer、custom editor、autocomplete provider、tool renderer、message renderer。

生产级：补 overlay、IME、ANSI width、theme invalidate、dispose、RPC fallback、non-interactive no-op UI、terminal resize、narrow-width QA 和历史消息重放。
