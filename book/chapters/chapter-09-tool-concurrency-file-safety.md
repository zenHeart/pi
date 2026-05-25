# 9. 工具并发、结果回写与文件变更安全

## 9. 本章解决的问题

模型一次 assistant message 可以请求多个工具。读操作可以并行，写同一文件不能并发。对前端小白来说，这像多个按钮同时被点；对 agent 创造者来说，这是一个并发调度问题：既要快，又不能让 transcript 顺序漂移，更不能让两个写操作基于同一个旧文件内容互相覆盖。

pi 的低层工具执行模式在 `ToolExecutionMode` 中定义，见 [types.ts#L36](/source-code/packages/agent/src/types.ts#L36)。`parallel` 的语义不是“什么都同时开始”，而是“先按 assistant 源顺序 preflight，再并发执行允许执行的工具，最后按源顺序写 tool result”。类型注释明确了这个稳定 transcript 约束，见 [types.ts#L247](/source-code/packages/agent/src/types.ts#L247)。

## 9. 并发语义

`executeToolCalls()` 会先检查是否有任一工具要求 `executionMode: "sequential"`；只要有，就整批串行，见 [agent-loop.ts#L373](/source-code/packages/agent/src/agent-loop.ts#L373)。串行路径每个工具都按 prepare、execute、finalize、emit tool result 的顺序完成后才进入下一个，见 [agent-loop.ts#L395](/source-code/packages/agent/src/agent-loop.ts#L395)。

并行路径则先逐个发 `tool_execution_start` 并调用 `prepareToolCall()`，见 [agent-loop.ts#L451](/source-code/packages/agent/src/agent-loop.ts#L451)。准备阶段仍然顺序执行，是为了让参数校验、before hook、block 决策的顺序可预测。真正的工具执行被收集成 promise 后再 `Promise.all()`，见 [agent-loop.ts#L492](/source-code/packages/agent/src/agent-loop.ts#L492)。每个工具的 `tool_execution_end` 可能按完成顺序出现，但 tool result message 统一在 `orderedFinalizedCalls` 上按 assistant 原顺序发出，见 [agent-loop.ts#L501](/source-code/packages/agent/src/agent-loop.ts#L501)。

这个设计同时照顾两种读者：用户在 UI 里能尽早看到哪个工具完成了，模型在下一轮里看到的上下文仍然稳定。稳定上下文是 agent 可调试的基础；否则同一个 assistant message 因机器负载不同产生不同 transcript，后续模型行为就难复现。

## 9. 文件变更队列

`write` 和 `edit` 都使用 file mutation queue。队列入口是 `withFileMutationQueue()`，见 [file-mutation-queue.ts#L32](/source-code/packages/coding-agent/src/core/tools/file-mutation-queue.ts#L32)。它会把目标路径先 resolve；如果文件已存在，再用 `realpath()` 把 symlink 等价路径归一成同一个 key；如果文件不存在，则用解析后的绝对路径作为 key，见 [file-mutation-queue.ts#L16](/source-code/packages/coding-agent/src/core/tools/file-mutation-queue.ts#L16)。

队列的注册本身也要串行。`registrationQueue` 保证两个同时到来的写操作不会都读到“当前没有队列”，见 [file-mutation-queue.ts#L5](/source-code/packages/coding-agent/src/core/tools/file-mutation-queue.ts#L5)。每个 key 只串行同一个文件，不同文件仍然可以并行。操作完成后释放下一个等待者，并在自己仍是最后一个链节点时清理 map，见 [file-mutation-queue.ts#L47](/source-code/packages/coding-agent/src/core/tools/file-mutation-queue.ts#L47)。

`edit` 在锁内完成 access、read、old/new 应用、write 和 diff 生成，见 [edit.ts#L316](/source-code/packages/coding-agent/src/core/tools/edit.ts#L316)。`write` 在锁内创建父目录并写文件，见 [write.ts#L203](/source-code/packages/coding-agent/src/core/tools/write.ts#L203)。两者都刻意不在 abort event listener 里 reject，因为那会提前释放 mutation queue，而底层文件写入可能还没结束，见 [write.ts#L205](/source-code/packages/coding-agent/src/core/tools/write.ts#L205) 和 [edit.ts#L318](/source-code/packages/coding-agent/src/core/tools/edit.ts#L318)。

## 9. 正确的写工具策略

```ts
import { dirname, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

async function appendLine(cwd: string, file: string, line: string) {
  const target = resolve(cwd, file);
  return withFileMutationQueue(target, async () => {
    await mkdir(dirname(target), { recursive: true });
    const oldText = await readFile(target, "utf-8").catch(() => "");
    await writeFile(target, `${oldText}${line}\n`, "utf-8");
    return { content: [{ type: "text", text: `Updated ${file}` }] };
  });
}
```

这段代码的要点不是 append，而是锁住真实目标文件，避免两个工具同时基于旧内容写回。复刻时至少要做到三件事：

- 在进入队列前把用户路径解析到 cwd 语义下的目标路径。
- 对同一真实文件串行，对不同文件保留并行。
- 在文件系统操作 settle 之后再释放锁，即使用户已经 abort。

## 9. 结果回写顺序

tool call 的生命周期有三种事件层次：`tool_execution_start/update/end` 面向 UI 和扩展观察；tool result message 面向 transcript；下一轮 provider request 面向模型。事件类型见 [types.ts#L416](/source-code/packages/agent/src/types.ts#L416)。如果把 tool result 按完成顺序塞进上下文，模型会把“先完成”误读成“assistant 先请求”，尤其在两个工具互相解释时会造成语义错位。

`terminate` 也是批次语义，不是单个工具一返回 true 就立刻停。只有当前批次所有 finalized tool result 都设置 `terminate: true`，agent 才停止继续调用模型，见 [agent-loop.ts#L544](/source-code/packages/agent/src/agent-loop.ts#L544)。这避免一个 terminating 工具和另一个普通工具并发时产生半截上下文。

## 9. 失败边界

工具参数错、文件不存在、权限不足、命令非零退出，都应该返回可解释的 tool result。工具实现崩溃、扩展异常、queue settlement 失败，才属于 runtime 风险。专家级工具设计要让模型知道“失败是什么”，而不是只让 UI 看到红字。

边界也不能夸大：文件 mutation queue 只能防止同一进程内通过该 API 的并发写互相覆盖。它不能阻止用户编辑器、另一个 pi 进程、git checkout、外部 formatter 同时改文件。生产级 agent 如果需要跨进程安全，要引入文件锁、版本校验或编辑前后 hash 检查。
