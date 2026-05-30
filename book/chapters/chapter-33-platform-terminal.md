# 33. 终端兼容性与环境治理

## 33.1 本章解决的问题

Pi 是纯 TUI 工具，高度依赖终端虚拟视口、键盘事件映射和系统剪贴板接口。这三者在不同操作系统、终端模拟器和输入法环境中的行为差异极大：Windows 上 Git Bash 和 PowerShell 的 bash 路径不同，WSL 的剪贴板与宿主机隔离，Wayland 和 X11 下的剪贴板工具不同，IME 输入法会导致光标位置计算错误。

本章梳理 Pi 在多平台下的适配机制，说明哪些环境问题有内置处理，哪些需要用户额外配置。

## 33.2 最小可运行路径

**Windows 注意事项：**
- Pi 需要 Git Bash（随 Git for Windows 安装）才能运行 bash 工具；如果路径未在 PATH 中，需手动配置
- 在 Windows Terminal 中，换行键是 `Ctrl+Enter`（而不是 `Shift+Enter`）
- 剪贴板图片通过 native Windows clipboard API 读取，无需额外工具

**Linux/Wayland 注意事项：**
- 粘贴剪贴板图片需要 `wl-paste`（wl-clipboard 包）或 `xclip`（X11）
- Termux 环境不支持剪贴板图片功能

**tmux 调试模式：**
在 tmux 中测试 Pi 的交互模式时，可以模拟键盘输入：

```bash
tmux new-session -d -s pi-test -x 80 -y 24
tmux send-keys -t pi-test "pi" Enter
sleep 3
tmux send-keys -t pi-test "你好" Enter
tmux capture-pane -t pi-test -p  # 截取当前帧
tmux kill-session -t pi-test
```

## 33.3 核心机制

#### 快捷键系统架构

快捷键定义在 [`packages/tui/src/keybindings.ts`](packages/tui/src/keybindings.ts#L7) 的 `Keybindings` 接口中，以语义名称（如 `"tui.editor.cursorUp"`）为键，通过声明合并支持下游包扩展：

```typescript
export interface Keybindings {
  "tui.editor.cursorUp": true;
  "tui.editor.cursorDown": true;
  // ...
}
```

实际的物理按键绑定在 `TUI_KEYBINDINGS` 常量中定义，每个动作支持多个按键备选（数组形式）：

```typescript
// keybindings.ts#L65
"tui.editor.cursorWordLeft": {
  defaultKeys: ["alt+left", "ctrl+left", "alt+b"],
  description: "Move cursor word left",
},
```

`KeybindingsManager` 类（[`keybindings.ts#L155`](packages/tui/src/keybindings.ts#L155)）负责合并默认绑定与用户自定义绑定，并检测冲突（两个动作绑定到同一按键）。用户通过 `settings.json` 中的 `keybindings` 字段覆盖默认值：

```json
{
  "keybindings": {
    "tui.input.newLine": ["shift+enter", "ctrl+enter"]
  }
}
```

#### 剪贴板图片的多平台读取

剪贴板图片读取由 [`clipboard-image.ts`](packages/coding-agent/src/utils/clipboard-image.ts#L254) 的 `readClipboardImage()` 函数实现，平台检测逻辑如下：

```typescript
// clipboard-image.ts#L267
if (platform === "linux") {
  const wsl = isWSL(env);
  const wayland = isWaylandSession(env);

  if (wayland || wsl) {
    image = readClipboardImageViaWlPaste() ?? readClipboardImageViaXclip();
  }

  if (!image && wsl) {
    // WSL 中 Linux clipboard 无法访问 Windows 截图
    // 通过 PowerShell 直接调用 Windows clipboard API
    image = readClipboardImageViaPowerShell();
  }

  if (!image && !wayland) {
    image = await readClipboardImageViaNativeClipboard();
  }
} else {
  // macOS 和 Windows 使用 native binding
  image = await readClipboardImageViaNativeClipboard();
}
```

**WSL 特殊处理**：WSL 环境中，Linux 的剪贴板（Wayland/X11）与 Windows 剪贴板相互隔离。当用户在 Windows 上按 `Win+Shift+S` 截图后，无法通过 `wl-paste` 访问该图片。Pi 检测到 WSL 环境后，额外尝试通过 `powershell.exe` 调用 `System.Windows.Forms.Clipboard::GetImage()` 读取 Windows 剪贴板：

```typescript
// clipboard-image.ts#L176
const psScript = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "Add-Type -AssemblyName System.Drawing",
  `$path = '${psQuotedWinPath}'`,
  "$img = [System.Windows.Forms.Clipboard]::GetImage()",
  "if ($img) { $img.Save($path, [System.Drawing.Imaging.ImageFormat]::Png) } ...",
].join("; ");
```

**不支持的图片格式转换**：BMP（Windows 截图的原始格式）不被 LLM API 支持。Pi 使用 `photon`（WebAssembly 图像处理库）在发送前将其转换为 PNG：

```typescript
// clipboard-image.ts#L71
async function convertToPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  const photon = await loadPhoton();
  if (!photon) return null;
  const image = photon.PhotonImage.new_from_byteslice(bytes);
  try {
    return image.get_bytes();  // 返回 PNG 格式的 bytes
  } finally {
    image.free();
  }
}
```

#### TUI 的重绘与视口管理

TUI 的终端视口通过 `PI_DEBUG_REDRAW=1` 可以开启重绘日志。TUI 在以下情况触发重绘：首次渲染、终端宽度变化、终端高度变化、`clearOnShrink` 条件满足。每次重绘原因都会被记录到 `pi-debug.log`，供排查终端适配问题使用。

#### keybindings.ts 与 AGENTS.md 的规范约束

AGENTS.md 明确规定：**不能硬编码按键检查**（如 `matchesKey(data, "ctrl+x")`），所有默认按键必须通过 `DEFAULT_EDITOR_KEYBINDINGS` 或 `DEFAULT_APP_KEYBINDINGS` 定义。这是因为用户可以在 `settings.json` 中覆盖按键，硬编码会绕过用户配置。

## 33.4 为什么这样设计

#### 多平台剪贴板的复杂性

剪贴板在 Linux 生态中存在三套并行协议：X11（`xclip`/`xsel`）、Wayland（`wl-clipboard`）和 WSL 桥接（`powershell.exe`）。Pi 选择在运行时检测环境并依次 fallback，而不是要求用户配置剪贴板后端，因为这对前端工程师来说是不必要的认知负担。

#### 快捷键语义分层的必要性

`Keybindings` 接口用语义名（`tui.editor.cursorWordLeft`）而不是物理按键名（`alt+left`）定义动作，是因为同一个"向左移动一个词"的操作在 macOS、Windows 和 Emacs 风格下对应的按键不同。语义层让用户在 `settings.json` 中只需指定"我想用 X 键做 cursorWordLeft"，而不必关心该动作在哪里被使用。

## 33.5 常见误解与排查

**Windows 上 bash 工具失败：** 确认 Git Bash 的 `bash.exe` 在 PATH 中；或在 `settings.json` 中通过 shell 配置项指定 bash 路径。

**WSL 中无法粘贴 Windows 截图：** 确认 `wslpath` 命令可用；若 `powershell.exe` 超时（默认 5 秒），检查 PowerShell 版本兼容性。

**IME 输入法导致光标错位：** 这是 TUI 的已知限制。大多数 IME 在合成（composing）阶段会发送不标准的控制序列，Pi 的 TUI 在合成完成后才接收最终字符。建议在 IME 候选词选定后再进行光标移动操作。

**快捷键不生效：** 运行 `/hotkeys` 查看当前有效的按键配置，确认是否被 `settings.json` 中的 `keybindings` 字段覆盖，或是否与扩展注册的快捷键产生冲突。

## 33.6 本章训练

#### 使用级训练

在 tmux 会话中以 80×24 视口启动 Pi，粘贴一段中文并提交，观察终端渲染；然后将终端宽度调整为 40 列，再次观察布局变化，说明 TUI 的自适应渲染机制。

#### 原理级训练

阅读 [`clipboard-image.ts#L254`](packages/coding-agent/src/utils/clipboard-image.ts#L254) 的 `readClipboardImage()`，画出完整的平台检测和 fallback 流程图，标注在每个平台（macOS/Linux X11/Linux Wayland/WSL）下使用的是哪个后端以及原因。

#### 扩展级训练

在 `settings.json` 中为 Windows Terminal 用户添加 `"tui.input.newLine": ["shift+enter", "ctrl+enter"]` 配置，验证两个按键都能插入换行；然后为扩展注册一个自定义快捷键，并通过 `/hotkeys` 确认它出现在 Extensions 部分。

专家级验收标准：能解释 Pi 在 5 种不同平台/环境（macOS、Linux X11、Linux Wayland、WSL、Windows）下剪贴板图片读取的差异，并能在 `settings.json` 中正确配置跨平台兼容的快捷键方案。
