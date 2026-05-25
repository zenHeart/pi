# 23. RPC JSONL 协议与外部控制

## 23. 本章解决的问题

RPC mode 让外部进程通过 stdin/stdout JSONL 控制 pi。创造者视角下，它验证了 pi 的 runtime 是否真的和 UI 解耦；读者视角下，它是“不会写 TypeScript SDK，也能用任意语言控制 pi”的接口。

命令类型定义在 [rpc-types.ts#L19](/source-code/packages/coding-agent/src/modes/rpc/rpc-types.ts#L19)，响应类型定义在 [rpc-types.ts#L111](/source-code/packages/coding-agent/src/modes/rpc/rpc-types.ts#L111)，RPC mode 主入口在 [rpc-mode.ts#L53](/source-code/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L53)。

## 23. 协议模型

RPC 的协议很简单，但边界必须严格：

1. stdin 输入 command，每行一个 JSON object。
2. stdout 输出 response、agent event、extension UI request。
3. command 可以带 `id`。
4. response 会带回同一个 `id`。
5. event 没有 `id`，因为它们属于 session stream，不属于某个同步调用返回值。

这就是为什么 GUI wrapper 不能把 stdout 当成“一问一答”。`prompt` 的 response 只代表 prompt 已被接受、排队或立即处理；后续文本、工具调用、queue、compaction、retry 都通过 event 继续流出。`prompt` command 的处理分支在 [rpc-mode.ts#L389](/source-code/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L389)，事件订阅后直接 `output(event)` 在 [rpc-mode.ts#L354](/source-code/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L354)。

## 23. JSONL framing 不是 readline

RPC docs 明确要求 LF 是唯一记录分隔符。源码也没有用 Node `readline`，而是用 `attachJsonlLineReader()` 按 `\n` 切分，并只剥离行尾 `\r`，见 [jsonl.ts#L21](/source-code/packages/coding-agent/src/modes/rpc/jsonl.ts#L21)。输出端用 `serializeJsonLine()` 追加单个 `\n`，见 [jsonl.ts#L10](/source-code/packages/coding-agent/src/modes/rpc/jsonl.ts#L10)。

这对前端小白很重要：如果你的网页后端用 Node 子进程包装 pi，不要用会额外按 Unicode line separator 切分的通用 line reader。JSON 字符串内部可能合法包含这些字符。协议稳定性先于方便。

## 23. 最小 RPC client

下面是一个更接近协议事实的 Node client。注意 command 字段叫 `message`，不是 `prompt`。

```ts
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

const child = spawn("pi", ["--mode", "rpc", "--no-session"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "inherit"],
});

const decoder = new StringDecoder("utf8");
let buffer = "";

child.stdout.on("data", (chunk) => {
  buffer += decoder.write(chunk);
  while (true) {
    const index = buffer.indexOf("\n");
    if (index === -1) break;
    const line = buffer.slice(0, index).replace(/\r$/, "");
    buffer = buffer.slice(index + 1);
    const msg = JSON.parse(line);
    if (msg.type === "response") {
      console.log("response", msg);
    } else if (msg.type === "message_update") {
      const delta = msg.assistantMessageEvent;
      if (delta.type === "text_delta") process.stdout.write(delta.delta);
    } else {
      console.log("event", msg.type);
    }
  }
});

child.stdin.write(JSON.stringify({
  id: "req-1",
  type: "prompt",
  message: "List the files relevant to authentication.",
}) + "\n");
```

真实 client 还要处理 `extension_ui_request`。RPC mode 会把扩展的 select、confirm、input、editor、notify、status、widget、title、editor text 等 UI 请求编码为 stdout event，类型定义在 [rpc-types.ts#L213](/source-code/packages/coding-agent/src/modes/rpc/rpc-types.ts#L213)。客户端回传 `extension_ui_response` 时，`rpc-mode.ts` 会匹配 pending request，见 [rpc-mode.ts#L723](/source-code/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L723)。

## 23. RPC 能力面

RPC 不只是 prompt。它覆盖：

1. prompt、steer、follow_up、abort。
2. get_state、get_messages。
3. set_model、cycle_model、get_available_models。
4. thinking level 和 queue mode。
5. compact、auto compaction、auto retry。
6. bash、abort_bash。
7. session stats、export、switch、fork、clone、last assistant text、session name。
8. get_commands，用于列出 extension commands、prompt templates 和 skills。

`RpcSessionState` 显式包含 model、thinkingLevel、isStreaming、isCompacting、queue modes、sessionFile、sessionId、sessionName、autoCompactionEnabled、messageCount 和 pendingMessageCount，见 [rpc-types.ts#L91](/source-code/packages/coding-agent/src/modes/rpc/rpc-types.ts#L91)。`get_state` 的实现读取同一批 session 属性，见 [rpc-mode.ts#L441](/source-code/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L441)。`get_commands` 会收集 registered commands、prompt templates 和 skills，见 [rpc-mode.ts#L632](/source-code/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L632)。

## 23. RPC、JSON mode、SDK 的边界

SDK 适合同进程 TypeScript host：类型安全、直接访问 session、直接注册 custom tools。RPC 适合跨语言、进程隔离、外部 GUI 和自动化控制。JSON mode 只输出事件流，适合一次性命令和日志处理，不适合双向控制。

这不是三套 agent；它们是同一 runtime 的三种 host 形态。前端读者可以先用 RPC 做原型，因为它不要求理解包导出和类型；等需要更强控制或更低延迟，再迁移到 SDK。

## 23. 已实现事实、进一步 docs、生态扩展

已实现事实：RPC command/response 类型、extension UI sub-protocol、strict JSONL reader、session rebinding 都在源码中。`runRpcMode()` 会在 session replacement 后重新 `bindExtensions()`、重新订阅事件，相关 rebind 逻辑在 [rpc-mode.ts#L319](/source-code/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L319)。

进一步 docs：`packages/coding-agent/docs/rpc.md` 详细列出每个 command 的 request/response shape、event shape 和 extension UI 降级行为。正文不复制全表，是为了让读者先掌握 framing、correlation 和 event stream 三个不变量。

生态扩展方式：你可以在 RPC 外面包 WebSocket、HTTP、IDE protocol 或 job queue。但不要直接把 `pi --mode rpc` 暴露成未认证网络服务。RPC controller 拥有和本机用户相近的文件、shell、credential 间接能力。

## 23. 失败边界

RPC 的常见失败不是“模型不会答”，而是 host 写错协议：

1. 用 `prompt` 字段而不是 `message` 字段。
2. 把 response 当成最终答案。
3. 忽略 event 和 extension UI request。
4. 用非 LF-only reader 破坏 JSONL framing。
5. session replacement 后继续引用旧 UI 状态。
6. 把 stderr 当作协议流。

这些问题都发生在外部 controller，不在模型里。先修协议，再调 prompt。
