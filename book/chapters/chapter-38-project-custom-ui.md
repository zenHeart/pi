# 38. 构建终端交互控制台

## 38.1 本章解决的问题

Pi 的交互模式不仅仅是一个聊天框。它的 TUI 层（`@earendil-works/pi-tui`）提供了一套完整的组件系统：差量渲染引擎、焦点管理、overlay（浮层）系统、键盘路由。Extension 可以通过 `api.ui` 上下文注入自定义 TUI 组件，在不修改 Pi 核心的情况下实现复杂的交互界面。

本章演示如何构建一个交互式卡片选择器：拦截 `/jira` 命令后弹出一个列表，用户用键盘浏览并选择需求卡，选定后把卡片信息自动填入编辑器。

## 38.2 TUI 组件架构

TUI 系统的核心是 [`packages/tui/src/tui.ts`](/source-code/packages/tui/src/tui.ts#L39) 中的 `Component` 接口：

```typescript
export interface Component {
  render(width: number): string[];    // 把自己渲染为 ANSI 字符串数组（每行一个）
  handleInput?(data: string): void;   // 可选：处理键盘输入
  invalidate(): void;                 // 清除缓存，强制下次重渲染
  wantsKeyRelease?: boolean;          // 是否接收 Kitty 按键释放事件
}
```

`TUI` 类扩展自 `Container`，实现差量渲染（只更新变化的行）、overlay 层叠、焦点路由和最小 16ms 帧率限制：

```typescript
// tui.ts#L253
private static readonly MIN_RENDER_INTERVAL_MS = 16;
```

**内置基础组件：**
- `Container`：包含子组件的容器，render 结果为所有子组件的行合并
- `Text`：静态文本，支持 ANSI 转义序列
- `Spacer`：N 行空白
- `Loader`/`CancellableLoader`：带动画的加载指示器
- `BorderedLoader`：带边框的加载组件（见第 14 章的 `/share` 实现）

## 38.3 Extension UI 接口

Extension 通过 `api.ui`（`ExtensionUIContext`）与 TUI 交互：

```typescript
// 注册自定义命令并响应
api.registerCommand({
  name: "jira",
  description: "Select and load a Jira issue",
  async execute(context) {
    // 弹出选择列表
    const selected = await context.ui.select(
      "Select a Jira issue",
      ["PROJ-123: Fix login bug", "PROJ-456: Add dark mode", "PROJ-789: Refactor API"]
    );

    if (selected) {
      // 把选定内容填入编辑器
      context.ui.setEditorText(`Task: ${selected}\n\nPlease implement this feature:`);
    }
  },
});
```

`ExtensionUIContext` 提供的对话接口（详见第 19 章的 `rpc-types.ts`）：
- `select(title, options)` → 列表选择器，返回选中项
- `confirm(title, message)` → 确认对话框，返回 boolean
- `input(title, placeholder)` → 文本输入框
- `editor(title, prefill)` → 全屏文本编辑器
- `notify(message, type)` → 通知消息

## 38.4 自定义 TUI 组件实现

对于需要完全自定义渲染的复杂 UI，Extension 可以实现 `Component` 接口并通过 `api.ui.custom()` 渲染：

```typescript
import { Container, Text, Spacer, type TUI } from "@earendil-works/pi-tui";

// 一个可键盘导航的列表选择器
class JiraSelectList extends Container {
  private items: string[];
  private selectedIndex = 0;
  private onConfirm: (item: string) => void;
  private onCancel: () => void;

  constructor(
    items: string[],
    onConfirm: (item: string) => void,
    onCancel: () => void,
  ) {
    super();
    this.items = items;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  override render(width: number): string[] {
    const lines: string[] = [];
    lines.push("\x1b[1m Select Jira Issue \x1b[0m");
    lines.push("─".repeat(Math.min(width, 40)));

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const truncated = item.length > width - 4
        ? item.slice(0, width - 7) + "..."
        : item;

      if (i === this.selectedIndex) {
        // 高亮选中项
        lines.push(`\x1b[7m > ${truncated}\x1b[0m`);
      } else {
        lines.push(`   ${truncated}`);
      }
    }

    lines.push("─".repeat(Math.min(width, 40)));
    lines.push("\x1b[2m ↑↓ Navigate  Enter Confirm  Esc Cancel \x1b[0m");
    return lines;
  }

  override handleInput(data: string): void {
    if (data === "\x1b[A" || data === "\x1b[D") {  // Up / Left
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    } else if (data === "\x1b[B" || data === "\x1b[C") {  // Down / Right
      this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
    } else if (data === "\r" || data === "\n") {  // Enter
      this.onConfirm(this.items[this.selectedIndex]);
    } else if (data === "\x1b") {  // Escape
      this.onCancel();
    }
  }
}
```

在 Extension 中使用 overlay 展示这个组件：

```typescript
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { JiraSelectList } from "./jira-select-list.ts";

const MOCK_ISSUES = [
  "PROJ-123: Fix login button not responding on mobile",
  "PROJ-456: Add dark mode toggle in settings",
  "PROJ-789: Refactor authentication API",
  "PROJ-1011: Update dependency versions",
];

const extension: ExtensionFactory = (api) => {
  api.registerCommand({
    name: "jira",
    description: "Select and load a Jira issue into context",
    async execute(context) {
      // 使用内置 select 对话（推荐，跨模式兼容）
      const selected = await context.ui.select("Select a Jira Issue", MOCK_ISSUES);

      if (selected) {
        const issueId = selected.split(":")[0];
        context.ui.setEditorText(
          `Working on ${issueId}\n\n` +
          `Issue: ${selected}\n\n` +
          `Please analyze this issue and propose an implementation plan.`
        );
        context.ui.notify(`Loaded ${issueId} into context`, "info");
      }
    },
  });
};

export default extension;
```

## 38.5 setWidget：在 Footer 区域展示自定义内容

Extension 可以通过 `api.ui.setWidget()` 在编辑器上方或下方注入固定的状态显示区域：

```typescript
// 显示当前 Jira sprint 状态
api.ui.setWidget("jira-sprint", [
  "\x1b[33m Sprint 42 \x1b[0m",
  "Open: 5  In Progress: 3  Done: 12",
], { placement: "aboveEditor" });

// 清除 widget
api.ui.setWidget("jira-sprint", undefined);
```

## 38.6 组件渲染的技术细节

**差量渲染原理：**

TUI 的 `doRender()` 把所有 Component 的 `render(width)` 合并为行数组，与 `previousLines` 对比，只向终端写入发生变化的行。光标移动使用 `CSI n A`（上移 n 行）和 `CSI n B`（下移 n 行）定位，最终在内容末尾等待用户输入。

**overlay 的焦点管理（[`tui.ts#L311`](/source-code/packages/tui/src/tui.ts#L311)）：**

`showOverlay()` 会把焦点切换到 overlay 组件，记录 `preFocus`（之前的焦点）。`hide()` 时恢复焦点到 `preFocus`，确保键盘路由正确返回编辑器。

**CURSOR_MARKER：**

获得焦点的组件在 `render()` 输出中的光标位置插入 `CURSOR_MARKER`（`\x1b_pi:c\x07`）。TUI 找到这个标记后，把硬件光标定位到该位置，支持 IME 候选词窗口正确显示。

## 38.7 本章训练

#### 使用级训练

实现一个最小化的 `/pick` 命令扩展：使用 `context.ui.select()` 让用户从三个预设选项中选择代码语言，选定后通过 `setEditorText()` 预填写一个该语言的代码模板；在 Pi 中测试该命令。

#### 原理级训练

阅读 [`bordered-loader.ts`](/source-code/packages/coding-agent/src/modes/interactive/components/bordered-loader.ts#L7)，理解它如何组合 `Container`、`DynamicBorder`、`CancellableLoader`、`Spacer` 和 `Text` 组件；说明 `signal` getter 的作用，以及为什么取消操作通过 `AbortSignal` 而不是回调传递。

#### 扩展级训练

实现完整的 `JiraSelectList` 组件（包含键盘导航和 ANSI 高亮渲染），通过 extension 的 `api.ui.custom()` 在终端中弹出，支持 ↑↓ 键导航、Enter 确认、Esc 取消；验证 overlay 关闭后焦点正确返回编辑器。

专家级验收标准：能实现一个具备完整键盘导航的自定义 TUI 组件，能解释 TUI 的差量渲染原理，并能说明 overlay 焦点管理机制如何保证多层 UI 的键盘路由正确性。
