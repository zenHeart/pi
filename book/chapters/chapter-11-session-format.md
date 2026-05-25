# 11. JSONL 会话文件格式

## 11.1 真实场景下的问题

大部分编码 Agent 在运行时，都需要记录完整的历史会话。当我们将这些交互数据持久化到本地时，会遇到极具挑战的工程问题：
1. **树状多分支会话（Conversational Forking）**：大模型的回答具有随机性，在遇到错误结果时，开发者通常需要回溯到之前的某个对话节点，重新发起新的尝试（即 Fork 一个会话分支）。这导致历史记录并不是一个简单的线性 List，而是一个复杂的“会话关系树”。
2. **写放大与崩溃风险**：如果每次追加一条消息，都需要重写整个包含了 50 轮对话的巨大 JSON 文件，一旦重写过程中断电或进程崩溃，会导致整个会话历史彻底丢失（File Corruption）。
3. **极简免库分发**：作为一款小巧的终端 CLI，Pi 不希望在本地拉起庞大的 SQLite 或者是数据库进程来管理这棵会话关系树，必须保证仅靠纯文本和简单的 Node API 即可秒级解析和增量追溯。

因此，Pi 设计了一套基于 **JSONL (JSON Lines)** 的追加写（Append-only）会话格式，用以持久化表达和重构底层的树状多分支会话结构。

## 11.2 最小使用示例

我们可以直接观察一个真实的 Pi JSONL 会话文件。

以下是一个由 Pi Agent 生成并更新的 `.pi/sessions/` 目录下的 session 文件示例：

```json
{"type":"session","version":3,"id":"0192e21b-abc1-7bc9-93e1-31a89fbe9f92","timestamp":"2026-05-25T12:00:00.000Z","cwd":"d:/projects/app"}
{"type":"message","id":"0192e21b-def2-7001-a1b2-1234567890ab","parentId":null,"timestamp":"2026-05-25T12:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"Hello Agent!"}],"timestamp":1782388801000}}
{"type":"message","id":"0192e21b-def3-7002-b2c3-234567890abc","parentId":"0192e21b-def2-7001-a1b2-1234567890ab","timestamp":"2026-05-25T12:00:05.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi! How can I help you today?"}],"timestamp":1782388805000,"stopReason":"stop"}}
{"type":"leaf","id":"0192e21b-def4-7003-c3d4-34567890abcd","parentId":"0192e21b-def3-7002-b2c3-234567890abc","timestamp":"2026-05-25T12:00:05.100Z","targetId":"0192e21b-def3-7002-b2c3-234567890abc"}
```

1. **第一行**是会话文件头（Header），记录了 Session ID、协议版本、创建时间及关联的 CWD 路径。
2. **中间各行**是具体的操作记录条目（Entry），通过 `parentId` 串联指向，形成了树状的多分支路径。
3. **最后一行**是 `leaf` 指向，声明了当前会话活跃的叶子节点位置。

## 11.3 源码结构与数据流

#### 11.3.1 会话文件关系树与 JSONL 设计

下图展示了 Pi 会话文件的树状节点关系，以及它是如何通过扁平的 JSON 行（JSON Lines）表达复杂的多分支会话结构的：

```mermaid
graph TD
    Root["Header (ID: 0192e21b..., version: 3)"] --> Node1["User Message L1 (id: U1, parentId: null)"]
    Node1 --> Node2["Assistant Reply L2 (id: A1, parentId: U1)"]
    
    Node2 -->|Branch A| Node3A["User Message L3a (id: U2a, parentId: A1)"]
    Node2 -->|Branch B - Forked| Node3B["User Message L3b (id: U2b, parentId: A1)"]
    
    Node3A --> Node4A["Assistant Reply L4a (id: A2a, parentId: U2a)"]
    
    LeafPointer["Leaf Entry (targetId: A2a)"] -.->|活跃叶子指向| Node4A
    
    subgraph JSONL File (Append-only lines)
        Line1["Line 1: Session Header"]
        Line2["Line 2: Message Entry (U1)"]
        Line3["Line 3: Message Entry (A1)"]
        Line4["Line 4: Message Entry (U2a)"]
        Line5["Line 5: Message Entry (A2a)"]
        Line6["Line 6: Forked Message Entry (U2b)"]
        Line7["Line 7: Leaf Entry (targetId: U2b)"]
    end
```

#### 11.3.2 关键实现剖析

会话格式编解码和管理的源码位于 `packages/agent` 两个核心模块中。

1. **JSONL 的存储层适配器**：
   - `JsonlSessionStorage`（[jsonl-storage.ts#L161](/source-code/packages/agent/src/harness/session/jsonl-storage.ts#L161)）直接承载了文件底层的流式加载与增量写入。
   - 在首次 `open` 某个会话时，`loadJsonlStorage`（[jsonl-storage.ts#L136](/source-code/packages/agent/src/harness/session/jsonl-storage.ts#L136)）会完整读取文件内容，按行拆分，并在 `parseHeaderLine`（[jsonl-storage.ts#L59](/source-code/packages/agent/src/harness/session/jsonl-storage.ts#L59)）和 `parseEntryLine`（[jsonl-storage.ts#L87](/source-code/packages/agent/src/harness/session/jsonl-storage.ts#L87)）中进行强类型验证。
   - 文件物理头部的定义满足 `SessionHeader` 结构（[jsonl-storage.ts#L8](/source-code/packages/agent/src/harness/session/jsonl-storage.ts#L8)），且只支持版本 `version: 3`（[jsonl-storage.ts#L68](/source-code/packages/agent/src/harness/session/jsonl-storage.ts#L68)），任何格式不正确的行都会抛出 `SessionError`。

2. **树状回溯路径追溯**：
   - 因为文件是追加写（Append-only）的，分支可能纵横交错。在启动大模型对话前，系统必须找出当前活跃叶子节点到根节点的一条“线性 transcript 链”。
   - 该解析在 `getPathToRoot`（[jsonl-storage.ts#L275](/source-code/packages/agent/src/harness/session/jsonl-storage.ts#L275)）中实现：它从当前 `leafId` 开始，利用 `parentId` 进行链表回溯，将所有涉及的树节点压入 `path` 数组并最终逆序返回。这保证了**即便文件中混杂了其他废弃分支的数据，编译出的上下文也绝对干净**。

3. **运行时会话上下文重构**：
   - `packages/agent` 的 `Session` 类（[session.ts#L78](/source-code/packages/agent/src/harness/session/session.ts#L78)）在运行时封装了 `buildContext`（[session.ts#L110](/source-code/packages/agent/src/harness/session/session.ts#L110)）。它会调用底层的 `buildSessionContext`（[session.ts#L21](/source-code/packages/agent/src/harness/session/session.ts#L21)）。
   - 在重塑上下文时，它不仅会抽取消息主体，还会扫描路径节点中的特定事件（例如 `thinking_level_change`（[session.ts#L27](/source-code/packages/agent/src/harness/session/session.ts#L27)）和 `model_change`（[session.ts#L29](/source-code/packages/agent/src/harness/session/session.ts#L29)）），从而得出当时环境的配置状态。同时在遇到 `compaction`（[session.ts#L33](/source-code/packages/agent/src/harness/session/session.ts#L33)）历史截断标记时，自动完成历史记录截断与摘要消息拼接（[session.ts#L57](/source-code/packages/agent/src/harness/session/session.ts#L57)）。

4. **节点联合类型规范**：
   - 底层定义的所有 Entry 节点必须符合 `SessionTreeEntry` 联合类型（[types.ts#L404](/source-code/packages/agent/src/harness/types.ts#L404)）。
   - 它的子类型包括 `MessageEntry`、`ThinkingLevelChangeEntry`、`ModelChangeEntry`、`CompactionEntry`、`BranchSummaryEntry`、`CustomEntry`、`LabelEntry`、`LeafEntry` 等，用以完整记录 Agent 交互链路中的各种状态变迁。

## 11.4 设计考量与折中方案

#### 11.4.1 为什么选择 JSONL 而不是常规的 JSON 数组格式？
- **零开销追加写入**：若是 JSON 数组格式（如 `[...]`），每一次追加新元素，物理硬盘都需要将文件尾部的 `]` 抹去、写入新内容、并重新闭合数组。当会话非常大时，每一次重写的物理 I/O 开销会成倍增长。而 JSONL 的每次写操作只是简单的 `appendFile(filePath, JSON.stringify(entry) + "\n")`，达到了物理写入的最佳效率。
- **故障局部性**：如果写入中途进程崩溃，JSONL 仅仅是最后一行损坏。Pi 在解析时可以安全地丢弃末尾的半截行（通过 filter 剔除空白或格式异常的行），而 JSON 数组格式则会因为缺失闭合括号而导致整档损坏。

#### 11.4.2 逻辑 Leaf 指针与线性分支的切换（MoveTo）
- 在 JSONL 中，改变会话指针（如进行 Fork 切换）并不会删除或修改已有的节点。
- 当执行 `moveTo(entryId)`（[session.ts#L232](/source-code/packages/agent/src/harness/session/session.ts#L232)）时，Pi 仅仅是追加了一条类型为 `leaf` 且 `targetId` 指向目标节点的 Entry。通过这种设计，**所有的分支迁移历史本身也成为了被审计的历史轨迹**。

## 11.5 常见误解与排错指南

#### 11.5.1 误区：手动在文本编辑器中删减了 JSONL 的中间行，导致分支回溯错乱
- **现象**：手动删除了一条 `parentId` 处于链路中间的消息，再打开 Pi 终端，发现会话历史全部丢失或报 `Entry not found` 错误。
- **原因**：由于 `getPathToRoot` 是严格依赖 parent 关联链回溯的（[jsonl-storage.ts#L280](/source-code/packages/agent/src/harness/session/jsonl-storage.ts#L280)），如果打断了指针关联，回溯链将无法连通至根部，导致抛出 `SessionError`。
- **排查**：不要手动修改 JSONL 文件的结构。如果需要回滚，可以通过 `/tree` 命令行工具在 TUI 界面中选择历史节点切换，系统会自动安全地追加 `leaf` 节点来实现分支跳转。

#### 11.5.2 误区：认为会话文件包含了所有 Tool Call 执行时的物理磁盘文件快照
- **现象**：切换到了另一个分支（Branch），但是刚才用 `edit` 写入的文件代码并没有被还原。
- **原因**：JSONL 会话文件只记录“交互的历史转录（Transcript）和决策树状态”，它并不充当 Git 等物理版本控制系统的角色。
- **排查**：要实现工作区代码的物理还原，需要通过注册 Hook 监听 `session_tree`（[types.ts#L588](/source-code/packages/agent/src/harness/types.ts#L588)）事件，在分支切换时利用 Git 工具自动进行工作区代码的分支回滚。

## 11.6 课后练习

#### 11.6.1 使用级练习
手动在 `.pi/sessions/` 下创建一个测试 JSONL 文件，按照协议标准手工编写几条包含了分支交叉（两个不同的节点指向同一个 parentId）的 Entry，然后编写脚本使用 `JsonlSessionStorage` 打开它，切换叶子节点，打印其 `buildContext()`，验证输出的消息转录是否符合预期分支。

#### 11.6.2 原理级练习
深入阅读 `packages/agent/src/harness/session/jsonl-storage.ts` 的加载逻辑：
1. 请问在 [jsonl-storage.ts#L17](/source-code/packages/agent/src/harness/session/jsonl-storage.ts#L17) 的 `updateLabelCache` 中，它是如何建立和清空节点标签（Label）缓存映射的？标签对分支树导航有何帮助？
2. 在 [jsonl-storage.ts#L35](/source-code/packages/agent/src/harness/session/jsonl-storage.ts#L35) 的 `generateEntryId` 中，为什么它会在重复 100 次以内的随机截断 UUID 中寻找非重复 ID？如果 100 次碰撞失败，兜底策略是什么？

#### 11.6.3 扩展级练习
为 `JsonlSessionStorage` 实现一个“会话整理与垃圾回收（Garbage Collection）”的方法：`optimizeSessionFile()`。
- **任务**：读取当前 session 文件，分析整棵树，剔除所有无法从任何 `leaf` 节点追溯到根节点的“孤儿悬空节点（Orphaned Nodes）”，并把优化整理后的最小关系树重新覆盖写回文件。
- **要求**：保持 Header 属性不变，保留活跃 leaf 分支链条，编写测试用例证明整理后的 JSONL 尺寸有所减小。
