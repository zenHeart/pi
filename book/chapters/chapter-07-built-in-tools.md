# 7. 内置工具系统

## 7.1 真实场景下的问题

无论大语言模型（LLM）表现得多么像一个真正的“软件工程师”，本质上它依然只是一个只能输入和输出文本的数学模型。它无法直接触碰你的硬盘，无法在你的操作系统中拉起进程，更无法直接修改你的代码。为了让 Agent 能够真正完成“修改代码”和“运行测试”的任务，系统必须向其暴露一组底层的**内置工具（Built-in Tools）**。

然而，在文件系统读写和进程执行的物理世界中，前端工程师开发自定义扩展或定制核心工具时，会遭遇以下极具挑战的技术冲突：
- **文件并发修改冲突（Race Conditions）**：如果 Agent 同时发起两个并行的工具调用来修改同一个文件，如何避免它们互相覆盖、导致代码损坏？
- **上下文膨胀（Context Window Exhaustion）**：如果 Agent 运行的 bash 命令输出了 5MB 的大段报错日志，如何避免这些垃圾信息塞满 LLM 的上下文窗口，同时还要让开发者在本地排查时能看到完整的日志？
- **换行符与 BOM 头的跨平台兼容**：Windows 系统的 `\r\n` 与 Unix 系统的 `\n`，以及 UTF-8 的 BOM 头，在模型做 exact text matching（精确文本匹配）时如何做到不影响匹配精度？

本章将剥离工具的神秘外衣，深入 `packages/coding-agent` 的工具设计细节。

## 7.2 最小使用示例

在交互终端中，你可以通过一连串动作体验核心内置工具的协作与约束。

1. **新建文件（`write` 工具）**：
   在编辑器中输入并提交：
   ```text
   新建一个名为 test_tool.js 的文件，内容包含一个 greet 函数
   ```
   Agent 会自动调用内置的 `write` 工具创建文件，并在屏幕上展示写入成功的通知。
2. **模糊编辑文件（`edit` 工具）**：
   输入指令修改刚刚创建的文件：
   ```text
   修改 test_tool.js，将 greet 的输出内容改成中文问好，并在句尾加上感叹号
   ```
   Agent 此时会发起 `edit` 工具调用。你在屏幕上会清晰地看到一个彩色 Unified Diff 渲染视图，绿色代表新增行，红色代表删除行。
3. **运行诊断命令（`bash` 工具）**：
   在交互终端中输入：
   ```text
   !node test_tool.js
   ```
   物理终端会拉起子进程执行该脚本，并把输出结果管道化收集起来，再交还给大模型，辅助它确认刚才的修改是否生效。

## 7.3 源码结构与数据流

#### 7.3.1 工具系统运作时序

```mermaid
sequenceDiagram
    autonumber
    participant LLM as LLM Decision Engine
    participant Loop as Agent Loop (agent-loop.ts)
    participant Lock as File Mutation Queue
    participant Tool as Edit Tool (edit.ts)
    participant Disk as File System

    LLM->>Loop: 提出 edit 申请 (edits: [{ oldText, newText }])
    Loop->>Lock: withFileMutationQueue(absolutePath)
    activate Lock
    Note over Lock: 锁定当前路径，排队其他修改
    Lock->>Tool: 执行修改任务 (execute L312)
    Tool->>Disk: 读取原始文件 (readFile)
    Disk-->>Tool: 返回带 BOM/CRLF 原始数据
    Note over Tool: 1. stripBom() 剥离 BOM 标记<br/>2. normalizeToLF() 归一化为 LF<br/>3. applyEditsToNormalizedContent() 模糊/精确匹配替换
    Tool->>Disk: 写回最终内容 (bom + restoreLineEndings)
    deactivate Lock
    Tool-->>Loop: 返回 diffResult 和 unified patch
    Loop-->>LLM: 投递 toolResult，推动下一轮决策
```

#### 7.3.2 关键实现剖析

1. **文件修改队列排队机制**：
   为了防止并行任务干扰，所有的写操作（`write` / `edit`）都会包装在 `withFileMutationQueue`（[file-mutation-queue.ts#L32](/source-code/packages/coding-agent/src/core/tools/file-mutation-queue.ts#L32)）中。其底层通过维护一个以文件物理绝对路径（经过 `realpath` 解析）为 Key 的 Promise 链式锁 Map。这保证了**针对同一个文件的所有写入操作会被强制串行化排队**，而对不同文件的读写则依然可以并发执行。
2. **`edit` 工具的精确与模糊匹配算法**：
   当 `edit` 的 `execute`（[edit.ts#L312](/source-code/packages/coding-agent/src/core/tools/edit.ts#L312)）被调用时，它执行以下文本规整：
   - 首先利用 `stripBom` 剥离 UTF-8 的 BOM（Byte Order Mark）头（[edit-diff.ts#L137](/source-code/packages/coding-agent/src/core/tools/edit-diff.ts#L137)）。
   - 将文件的所有换行符转换为统一的 `\n`（LF 格式）（[edit-diff.ts#L19](/source-code/packages/coding-agent/src/core/tools/edit-diff.ts#L19)）。
   - 调用 `applyEditsToNormalizedContent`：先尝试进行完全一致的 exact matching。如果失败，则进入模糊匹配（Fuzzy Match）模式。模糊匹配在 `normalizeForFuzzyMatch`（[edit-diff.ts#L34](/source-code/packages/coding-agent/src/core/tools/edit-diff.ts#L34)）中将行末的无意义空白字符裁掉，并进行 Unicode 归一化（NFKC）、将中文/特殊符号的智能引号及连字符转换为标准 ASCII 字符（如 `“` 转为 `"`, `–` 转为 `-`）。
   - 替换完成后，利用记录的原始行结束符格式（`CRLF` 或 `LF`）进行 `restoreLineEndings`，重新贴回 BOM 头写回磁盘，实现无感的跨平台编辑。
3. **输出流防溢出截断（`OutputAccumulator`）**：
   在运行外部 shell 任务（`bash` 工具）时，Pi 使用 `OutputAccumulator`（[output-accumulator.ts#L35](/source-code/packages/coding-agent/src/core/tools/output-accumulator.ts#L35)）来监控并收集物理子进程的 `stdout` 与 `stderr` 流。
   - **双限约束**：为了控制内存和上下文开销，设置了行数限制（默认 2000 行，[truncate.ts#L11](/source-code/packages/coding-agent/src/core/tools/truncate.ts#L11)）和字节限制（默认 50KB，[truncate.ts#L12](/source-code/packages/coding-agent/src/core/tools/truncate.ts#L12)）。
   - **日志落盘**：一旦流式日志的总量触发了上述任何一个上限值，`OutputAccumulator` 会在后台自动调用 `ensureTempFile`（[output-accumulator.ts#L211](/source-code/packages/coding-agent/src/core/tools/output-accumulator.ts#L211)）创建一个本地临时 log 文件，将完整的日志流持续实时落盘。而在交还给 LLM 的 `toolResult` 中，则只保留经过 `truncateTail` 裁剪的尾部关键行，并附带一条明确的指引提示：“完整日志已转存至临时文件 /tmp/pi-output-xxx.log，请使用相关读取工具查看”。

## 7.4 设计考量与折中方案

#### 7.4.1 为什么不用 Git Diff 作为文件修改工具的基础？
为什么 Pi 没有直接使用 LLM 生成 standard patch 并调用 `git apply`，而是自己用 TS 实现了一套精确文本替换？
- **零外部环境依赖**：大语言模型生成 Unified Patch 的准确率极低，哪怕行号偏移 1 行或者空格有些许误差，`git apply` 就会直接拒绝修改。
- **匹配控制度**：自己实现 exact/fuzzy text replacement，可以在出错时精确定位到“是哪一个 oldText 块没有在源文件中找到”，并把这个具体的定位错误灌回给 Agent。这能够指导大模型在下一轮决策中“重新提取更多前后的上下文线索”，自主修复匹配参数，极大地提升了自动化闭环成功率。

#### 7.4.2 倒序应用多块编辑（Reverse Order Edit Application）
- 在处理单次工具调用内包含多个 disjoint edits 块时，`applyEditsToNormalizedContent`（[edit-diff.ts#L247](/source-code/packages/coding-agent/src/core/tools/edit-diff.ts#L247)）会首先将所有匹配成功的编辑点按 `matchIndex` 升序排列，然后**从后往前（倒序）**依次执行字符切片替换。这避免了先执行的替换改变文件长度，导致后执行的替换字符偏移量（Offset）失效的问题。

## 7.5 常见误解与排错指南

#### 7.5.1 误区：`edit` 工具可以用来删除大块没有任何定位标识的代码
- **现象**：大模型发起 `edit` 传入一个极短的 `oldText`（如仅包含一个右括号 `}`），或者传入一大段带有一大堆省略号的伪代码，导致 edit 失败并提示 `Could not find the exact text` 或 `Found duplicate occurrences`。
- **原因**：如果 oldText 太短，会在文件中匹配到多个目标，违反唯一性约束；如果 oldText 包含大模型脑补的省略号，在源文件中无法找到精确字符。
- **排查**：在设计提示词或调用指令时，约束模型传入的 `oldText` 必须是具体且唯一的文本块，建议至少包含 3 行以上具有排他性的代码特征。

#### 7.5.2 误区：大日志输出直接在终端打印时会把 Pi 的 TUI 撑爆
- **现象**：开发自定义扩展工具时，由于向控制台高频发送海量日志，导致 TUI 界面卡死或闪烁严重。
- **原因**：未将 stdout 输出包装入 `OutputAccumulator`，或者在组件渲染中直接使用了未经过终端宽度换行分片的裸文本。
- **排查**：对于任何包含异步进程输出的自定义工具，必须引入 `OutputAccumulator`，在 `append()` 阶段限制内存常驻大小，并仅向 TUI 呈现截取后的快照内容（`snapshot()`）。

## 7.6 课后练习

#### 7.6.1 使用级练习
使用 Pi Agent 在本地创建一个 `utils.js` 文件，往里面写入 10 行基础代码。然后发起一次 `edit` 工具调用，故意将要匹配的 `oldText` 尾部空格打乱，观察 Pi 的 fuzzy match 是否被唤醒并成功兼容，检查最终的文件换行符是否被还原。

#### 7.6.2 原理级练习
深入剖析 [file-mutation-queue.ts#L32](/source-code/packages/coding-agent/src/core/tools/file-mutation-queue.ts#L32) 的 `withFileMutationQueue` 函数。请回答：
1. `registrationQueue` 在整个进程周期中扮演了什么样的串行化防抢占角色？
2. 它是如何通过 `.then` 链条确保针对**同一个 key** 的前一次文件操作未 settlement 之前，后一次文件操作绝对不被执行的？

#### 7.6.3 扩展级练习
修改 `read` 工具在 coding-agent 内的实现（参考 [read.ts#L302](/source-code/packages/coding-agent/src/core/tools/read.ts#L302)）。
- **任务**：自定义一个限制配置，使其在首次读取大文件时，默认的最大截断行数限制缩减为 100 行（原来默认是 2000 行）。
- **要求**：在不改变 `truncate.ts` 内全局常量的前提下，通过向 `truncateHead()` 传递局部的配置选项实现此需求，并编写一个简短的测试 case 运行验证该首屏截断指引提示。
