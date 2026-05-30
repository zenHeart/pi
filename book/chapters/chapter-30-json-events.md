# 30. JSON 事件流与自动化流水线

## 30.1 本章解决的问题

交互模式的输出适合人阅读，但不适合脚本、CI 流水线或外部平台消费。当你需要让机器判断 Pi 是否成功完成了任务，或者把 Pi 嵌入到自动化检查流程中时，交互模式的 ANSI 彩色文本、进度动画和键盘交互是障碍而非帮助。

Pi 提供 `--mode json`（等价于 `-j`）运行模式，把同一个会话运行过程输出为换行分隔的 JSON 事件流（JSON Lines）。工具调用、模型增量、错误、完成信号都以结构化事件发出，外部系统可以逐行解析并作出状态判定。

本章回答：JSON 模式和文本模式（`-p`）在代码层面的差异是什么；事件流里有哪些事件类型；如何保证 stdout 不被调试信息污染；如何在 CI 中消费完成信号并判断任务结果。

## 30.2 最小可运行路径

用以下命令进入 JSON 模式：

```bash
pi --mode json -p "列出当前目录下所有 .ts 文件"
```

你会看到 stdout 里出现换行分隔的 JSON 对象，而不是 ANSI 格式化文本。每一行是一个独立的 JSON 事件，对应 Agent 运行过程中的一个状态变更。

文本模式（`-p`）是 JSON 模式的简化版：只等待最终 `assistant` 消息并把其中的文本内容写入 stdout，不输出中间过程事件。

```bash
# 文本模式：只输出最终答案
pi -p "说你好"
# JSON 模式：输出所有过程事件
pi --mode json -p "说你好"
```

## 30.3 核心机制

#### print-mode.ts 的双模式实现

Print 模式（包含 text 和 json 子模式）由 [`print-mode.ts`](packages/coding-agent/src/modes/print-mode.ts#L32) 的 `runPrintMode()` 函数实现。它接收一个 `AgentSessionRuntime` 和 `PrintModeOptions`，`options.mode` 决定行为：

```typescript
// packages/coding-agent/src/modes/print-mode.ts#L17
export interface PrintModeOptions {
  mode: "text" | "json";
  messages?: string[];
  initialMessage?: string;
  initialImages?: ImageContent[];
}
```

在 json 模式下，函数在 `rebindSession()` 阶段订阅 session 事件，每次有事件触发就直接序列化写入 stdout：

```typescript
// packages/coding-agent/src/modes/print-mode.ts#L103
unsubscribe = session.subscribe((event) => {
  if (mode === "json") {
    writeRawStdout(`${JSON.stringify(event)}\n`);
  }
});
```

在 text 模式下，不订阅事件流，而是在所有 prompt 执行完毕后，读取 `session.state.messages` 的最后一条消息，输出其中的文本内容：

```typescript
// packages/coding-agent/src/modes/print-mode.ts#L128
if (mode === "text") {
  const state = session.state;
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage?.role === "assistant") {
    for (const content of assistantMsg.content) {
      if (content.type === "text") {
        writeRawStdout(`${content.text}\n`);
      }
    }
  }
}
```

#### output-guard.ts 的 stdout 劫持机制

JSON 模式要求 stdout 完全干净，不能混入任何非 JSON 字符（ANSI 代码、警告信息、依赖库的日志输出）。Pi 通过 [`output-guard.ts`](packages/coding-agent/src/core/output-guard.ts#L45) 的 `takeOverStdout()` 实现这一保障：

```typescript
// packages/coding-agent/src/core/output-guard.ts#L54
process.stdout.write = ((chunk, encodingOrCallback, callback) => {
  // 劫持：把 process.stdout.write 的写入重定向到 stderr
  if (typeof encodingOrCallback === "function") {
    return rawStderrWrite(String(chunk), encodingOrCallback);
  }
  return rawStderrWrite(String(chunk), callback);
}) as typeof process.stdout.write;
```

效果：所有代码中 `console.log()`、`process.stdout.write()` 的输出都被悄悄重定向到 stderr。只有通过 `writeRawStdout()` 显式写入的内容才会出现在 stdout。这样，JSON 事件流始终干净，管道读取方不会遇到意外字符。

#### 事件类型结构

JSON 模式输出的事件来自 `session.subscribe()`，事件类型与 SDK 和 RPC 模式共享同一套语义（参见第 29 章）。关键事件类型包括：

| 事件字段 | 含义 | 消费者关注点 |
|---|---|---|
| `type: "message_added"` | 新消息入队（用户、助手、工具结果） | 跟踪对话轮次 |
| `type: "stream_event"` | 助手流式增量（文本/思考/工具调用） | 实时进度展示 |
| `type: "tool_execution_start"` | 工具开始执行 | 判断副作用边界 |
| `type: "tool_execution_result"` | 工具执行结果 | 验证工具是否成功 |
| `stopReason: "error"` | 会话因错误停止 | CI 非零退出触发器 |
| `stopReason: "end_turn"` | 模型正常结束 | 判断任务完成 |

在 json 模式开始时，Pi 还会先输出 session header（若会话已有历史）：

```typescript
// packages/coding-agent/src/modes/print-mode.ts#L111
if (mode === "json") {
  const header = session.sessionManager.getHeader();
  if (header) {
    writeRawStdout(`${JSON.stringify(header)}\n`);
  }
}
```

#### 信号处理与进程退出

`runPrintMode()` 注册了 `SIGTERM`（以及非 Windows 平台的 `SIGHUP`）信号处理，保证进程被杀死时能够优雅地 dispose 运行时，而不是留下孤儿子进程：

```typescript
// packages/coding-agent/src/modes/print-mode.ts#L47
const signals: NodeJS.Signals[] = ["SIGTERM"];
if (process.platform !== "win32") {
  signals.push("SIGHUP");
}
```

当 prompt 出现错误（stopReason 为 "error" 或 "aborted"）时，进程以退出码 1 退出，供 CI 判断失败。

## 30.4 为什么这样设计

Pi 设计了两种非交互输出模式而不是一种，是因为两种模式对应不同的消费场景：

**文本模式（-p）**：脚本化问答，只关心最终答案，不关心过程。适合 `echo "$(pi -p "总结这段代码")"` 这类管道场景。

**JSON 模式（--mode json）**：结构化自动化，需要观察工具是否执行、任务是否成功、错误发生在哪里。适合 CI/CD、代码 review 机器人、内部平台。

stdout 劫持设计类比前端的"副作用隔离"：把框架内部的 console.log 与应用的数据管道分离开。正如 React 不会让内部调试信息污染 Redux Store，Pi 不让运行时日志污染 JSON 事件流。

不把 JSON 格式放进文本模式（例如用特定 flag 启用），而是作为独立的 `--mode json` 选项，是因为两者的输出语义根本不同：text 模式只有成功路径输出，json 模式需要完整表达错误和过程状态。

## 30.5 常见误解与排查

**误解：只需要解析最后一行 JSON。** 真实任务会有多个工具调用，每个工具的开始和结果都是独立事件，最终答案在最后一条 `message_added` 事件中的 `assistant` 消息里。消费者必须设计状态机而不是只取最后一行。

**误解：JSON 模式和文本模式的退出码一定不同。** 两者在遇到 `stopReason: "error"` 时都返回退出码 1；文本模式在成功时输出文本，JSON 模式在成功时事件流中含 `stopReason: "end_turn"` 事件。CI 应该检查退出码而不是事件内容。

**排查步骤：**
1. 确认 CLI 参数确实触发 json 模式（`--mode json`，而不是 `-j` 的别名是否已绑定）
2. 用 `pi --mode json -p "say ok" 2>/dev/null` 确认 stdout 只包含 JSON
3. 如果看到非 JSON 输出，检查是否有扩展在 `extension_loaded` 事件前输出了副作用
4. 若 CI 无法解析事件，先验证事件每行能被 `JSON.parse()` 处理，再检查字节序标记（BOM）

## 30.6 本章训练

#### 使用级训练

运行 `pi --mode json -p "读取 README.md 并输出标题"` 并把输出保存到文件，然后用 Node.js 脚本逐行解析，提取所有 `type: "stream_event"` 事件，统计文本 token 增量次数。

#### 原理级训练

阅读 [`output-guard.ts`](packages/coding-agent/src/core/output-guard.ts#L45) 的 `takeOverStdout()` 和 `restoreStdout()`，说明：何时调用 takeover，何时 restore；为什么 RPC 模式也调用 `takeOverStdout()` 而 text 模式不调用；`flushRawStdout()` 在进程退出前的作用。

#### 扩展级训练

实现一个 Node.js 脚本：调用 `pi --mode json -p "检查 src/ 下是否有 TODO 注释"`，逐行解析 JSON 事件流；若检测到 `stopReason: "error"` 事件则以非零码退出；若检测到 `tool_execution_result` 事件且结果包含 "TODO" 字样则输出警告并以非零码退出。该脚本集成进 `package.json` 的 `lint` 脚本中。

专家级验收标准：能解释 stdout 劫持的实现原理，能设计消费完整事件流（而非只取最后一行）的状态机，并能区分 text 模式和 json 模式在错误处理上的语义差异。
