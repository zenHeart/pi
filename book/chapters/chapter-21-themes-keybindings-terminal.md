# 21. 主题、Keybindings 与终端体验

## 21. 本章解决的问题

pi 的 UX 建在终端能力上。主题决定颜色，keybindings 决定动作映射，terminal setup 决定 Shift+Enter、Alt+Enter、图片、tmux、Windows shell 等能力是否可用。内置主题加载在 [theme.ts#L427](/source-code/packages/coding-agent/src/modes/interactive/theme/theme.ts#L427)，应用快捷键定义从 [keybindings.ts#L13](/source-code/packages/coding-agent/src/core/keybindings.ts#L13) 开始。

对前端读者来说，主题不是 CSS，keybindings 也不是浏览器 keydown 事件。终端会先把按键编码成 escape sequence，pi 再把它解析成动作。

## 21. Theme 是颜色 token 表

theme JSON 定义 core UI、message、tool、Markdown、diff、syntax、thinking level、bash mode 等 token。它没有 CSS selector、继承和 cascade。每个 renderer 只按 token 取颜色。

theme registry 会先加入 built-in dark/light，再加入 custom themes，并按 name 去重，见 [theme.ts#L451](/source-code/packages/coding-agent/src/modes/interactive/theme/theme.ts#L451)。默认主题会根据 terminal background 或 `COLORFGBG` 粗略判断，没有信息时 fallback 到 dark，见 [theme.ts#L714](/source-code/packages/coding-agent/src/modes/interactive/theme/theme.ts#L714) 和 [theme.ts#L735](/source-code/packages/coding-agent/src/modes/interactive/theme/theme.ts#L735)。

## 21. Theme 切换与热重载

`setTheme()` 会尝试加载指定 theme，成功后可启动 watcher，失败则回退 dark 并返回 error，见 [theme.ts#L793](/source-code/packages/coding-agent/src/modes/interactive/theme/theme.ts#L793)。如果 extension 传入一个内存中的 `Theme` instance，则不能 watch 文件，`setThemeInstance()` 会停止 watcher，见 [theme.ts#L816](/source-code/packages/coding-agent/src/modes/interactive/theme/theme.ts#L816)。

自定义主题热重载只监听非内置主题文件。watcher 会忽略 stale timer、文件临时缺失和编辑中非法 JSON，成功时重载并触发 UI invalidate，见 [theme.ts#L832](/source-code/packages/coding-agent/src/modes/interactive/theme/theme.ts#L832)。这对用户编辑主题很友好：保存半截 JSON 不会让界面崩溃。

## 21. Keybindings 是动作映射

pi 把快捷键定义为 action id 到 key 的映射。`KEYBINDINGS` 合并 TUI 内置编辑动作和 app 动作，`app.message.followUp` 默认是 `alt+enter`，`app.message.dequeue` 默认是 `alt+up`，paste image 在 Windows 默认是 `alt+v`、其他平台是 `ctrl+v`，见 [keybindings.ts#L63](/source-code/packages/coding-agent/src/core/keybindings.ts#L63) 到 [keybindings.ts#L108](/source-code/packages/coding-agent/src/core/keybindings.ts#L108)。

用户配置从 `~/.pi/agent/keybindings.json` 读取，`KeybindingsManager.create()` 定位文件，`reload()` 重新加载，见 [keybindings.ts#L348](/source-code/packages/coding-agent/src/core/keybindings.ts#L348)。interactive `/reload` 会同时 reload session resources、keybindings、themes、extensions、skills 和 prompts，见 [interactive-mode.ts#L4883](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L4883) 到 [interactive-mode.ts#L4940](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L4940)。

## 21. 为什么不能硬编码按键

同一个动作在不同终端可能发出不同 escape sequence。Shift+Enter、Ctrl+Enter、Alt+Enter 最容易出问题。pi 把业务代码绑定到 action id，而不是直接写 `if key === "\x1b..."`，这样用户可以在 keybindings.json 中改映射。

interactive mode 注册 app action handlers 时也是按 action id 绑定，例如 clear、suspend、thinking、model、tool expand、external editor、follow-up、dequeue、session tree 都在 default editor 上注册，见 [interactive-mode.ts#L2407](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2407)。

## 21. Terminal setup 边界

pi 使用 Kitty keyboard protocol 或兼容的 extended key reporting 来可靠识别组合键。Kitty、iTerm2 通常开箱可用；WezTerm 要启用 `enable_kitty_keyboard`；Windows Terminal 需要把 Shift+Enter 和 Alt+Enter remap 成 CSI-u；VS Code integrated terminal 也要把 Shift+Enter 发送成对应 escape sequence。

tmux 是常见边界。pi 会检查 tmux `extended-keys` 和 `extended-keys-format`，如果关闭或是 xterm 格式，会提示用户改成 `csi-u`，检查逻辑在 [interactive-mode.ts#L837](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L837)。tmux 文档推荐：

```tmux
set -g extended-keys on
set -g extended-keys-format csi-u
```

## 21. Windows 与 shell

Windows 上 pi 需要可用 bash。查找顺序是 settings 中的 custom `shellPath`、Git Bash、PATH 上的 bash。对小白用户来说，最稳妥路径通常是安装 Git for Windows。自定义 shell path 要写成 Windows JSON 转义路径，例如 `C:\\cygwin64\\bin\\bash.exe`。

Windows Terminal 默认把 Alt+Enter 绑定到 fullscreen，所以 follow-up 队列收不到按键。必须在 Windows Terminal settings 里把 Alt+Enter 发送为 `\u001b[13;3u`，把 Shift+Enter 发送为 `\u001b[13;2u`。

## 21. 图片与硬件光标

图片粘贴和显示也属于 terminal 能力。keybinding 层定义 paste image 动作，见 [keybindings.ts#L106](/source-code/packages/coding-agent/src/core/keybindings.ts#L106)；interactive mode 会读取剪贴板图片并写入临时文件，见 [interactive-mode.ts#L2436](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2436)。显示图片则依赖终端协议和 settings 中的 `terminal.showImages`、`terminal.imageWidthCells`。

硬件光标默认可能关闭以避免兼容问题。需要 IME 或更明确光标位置时，可以开启对应 setting；reload 会把 `showHardwareCursor` 和 `clearOnShrink` 重新应用到 TUI，见 [interactive-mode.ts#L4925](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L4925)。

## 21. 排障顺序

先判断终端有没有发出期望 key event，再判断 pi keybinding 有没有映射，再判断当前 focus component 有没有处理这个 action。不要一开始就改业务逻辑。

如果 Shift+Enter 变成普通 Enter，先看 terminal 和 tmux；如果 Alt+Enter 没反应，先看 Windows Terminal fullscreen 绑定；如果快捷键改了但没生效，先运行 `/reload`；如果主题保存后没变化，确认当前主题是不是 custom file，而不是 built-in 或 in-memory theme。

## 21. 复刻路径

最小可用：支持 dark/light、Enter submit、Escape abort、Ctrl+C clear、基础 settings。

第二阶段：加入 keybindings.json、action id、reload、theme JSON、theme validation、terminal background detection。

生产级：支持 Kitty keyboard protocol、tmux csi-u、Windows Terminal remap 文档、image paste/render、hardware cursor/IME、custom theme hot reload、extension shortcut conflict diagnostics 和跨平台默认键位。
