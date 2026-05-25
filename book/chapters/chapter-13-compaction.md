# 13. 历史压缩机制

## 13.1 本章解决的问题

随着对话和工具调用次数的增多，历史上下文中的 Token 数量呈线性爆发式增长。这不仅会导致极高的模型推理开销（Tokens 计费暴增），还可能因为超出模型的最大上下文窗口限制（Context Window Limit）而触发抛错，使长对话任务戛然而止。

Pi Agent 的动态历史压缩（Compaction）机制解决了上下文超载问题。当上下文 Token 达到设定的阈值时，Pi 会通过分析消息关联性自动寻找安全切点，调用大语言模型生成历史阶段性摘要（Compaction Summary），并将先前累积的文件读写等关键状态“压缩级联”入下一个回合，保障 Agent 在超长会话中的智能与连续性。

## 13.2 最小可运行路径

可以通过调整配置阈值，立刻体验自动历史压缩机制：

1. **修改本地配置**：在工作区的 `.pi/settings.json` 中，配置极小的压缩阈值以触发压缩：
   ```json
   {
     "compaction.enabled": true,
     "compaction.maxTokens": 4000,
     "compaction.keepRecentTokens": 1000
   }
   ```
2. **生成长历史会话**：在 Pi 中多次触发工具调用（如多次执行 `bash` 或 `read`），使得上下文 Token 迅速累加至 4000 以上。
3. **触发与观测**：在下一次消息发送后，终端会打印 `[Compacting session context...]` 提示。
4. **验证持久化结果**：打开会话的 `.jsonl` 日志，你会发现在前面的大量 `message` 和 `tool_result` 之后，被插入了一条类型为 `compaction` 的新 Entry。之后再次发送的提示词中，被压缩的历史条目不再发送，取而代之的是这段 Compaction Entry 的总结文本。

## 13.3 核心机制与算法

#### 13.3.1 Token 估算与压缩裁决

Pi 使用 `getLastAssistantUsageInfo` 获得最近一次成功请求的 Token 计数，并累加后续增量消息的字符估算值（公式：`Math.ceil(chars / 4)`），通过 [estimateContextTokens](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L186) 获得最接近真实的上下文 Token 数。

是否需要压缩的裁决逻辑在 [shouldCompact](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L219) 中做出：
- 自动压缩开关 `enabled` 必须为开启状态。
- 当前估算的 Token 数必须大于 `maxTokens`。
- 如果最近一个回合的长度（Turn Token Count）本身就已经超过了 `maxTokens - keepRecentTokens`，系统将进入“Split-Turn”（分劈回合）模式：此时仅仅保留当前超长回合的后半部分，而对前半部分及所有更早的历史强制进行阶段性摘要。

#### 13.3.2 安全切点搜索算法（Find Cut Point）

压缩不是切除随机位置的历史，而是在保留近期信息的同时，确保不破坏助手与工具的对应关系。核心切割算法位于 [findCutPoint](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L386)。它采用以下机制：

1. **倒序回溯**：从活动叶子节点反向逆着 `parentId` 回溯消息历史，累加保留节点的 Token 计数。
2. **拦截于 keepRecentTokens**：当保留节点的估算 Token 数达到 `keepRecentTokens` 时停止。该位置被视为理想的保留边界。
3. **安全边界微调**：由于 LLM 的工具调用通常是成对出现的（即 `assistant` 的 `tool_calls` 必须与后续的多个 `tool_result` 同在上下文中，否则模型会因为找不到工具返回而产生幻觉或直接抛错），算法在边界处进行如下对齐校验：
   - 如果切点刚好落在一组 Tool Result 中间，则必须继续向深层历史回溯，直至越过该批次的所有 Tool Result 消息。
   - 如果切点落在一组并行工具调用的 Assistant 消息中间，则回退到该 Assistant 消息的父节点。
   - 寻找最终的 `firstKeptEntryIndex` 和对应的回合起始位置 `turnStartIndex`，将此位置之前的所有内容裁剪掉。

#### 13.3.3 文件操作追踪级联（Cascade File Operations）

在裁剪掉历史消息后，模型会遗忘之前步骤中“我已经读过哪些文件”和“我已经修改过哪些文件”。这在后续的 turn 中会导致模型做出重复读取文件或在错误假设下覆盖文件的愚蠢决策。

为了解决这一遗忘问题，[extractFileOperations](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L41) 会主动读取上一次 compaction 条目的 `details` 字段，将其所记录的 `readFiles` 与 `modifiedFiles` 重新导入当前的 `FileOperations` 跟踪集合。然后再在此基础上，叠加新的一段历史中发生的工具读写行为。这确保了文件的读写追踪具备**跨压缩的生命周期级联累加性**，模型在多次压缩后仍然清晰知道哪些文件已经被修改过。

#### 13.3.4 双向总结生成（Bi-directional Summarization）

Pi 在对历史做归纳时，使用了严格的 Markdown 模板约束（[SUMMARIZATION_PROMPT](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L454)），要求模型以 `## Goal`、`## Constraints & Preferences`、`## Progress`、`## Key Decisions`、`## Next Steps` 的格式输出。

如果遇到超长的 Split-Turn 情形（当前回合内容超出了单次输入上限），压缩引擎会并行调用两个模型任务：
1. **历史汇总任务**（[generateSummary](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L747)）：负责总结切点之前的所有旧对话进度。
2. **前缀上下文任务**（`generateTurnPrefixSummary`）：负责提炼当前超长回合的开头前缀，并以一条 `branch_summary` 的形式挂载到保留历史的起点，确保输入序列在模型接受的极限之内。

#### 13.3.5 源码责任表

| 环节 | 系统责任 | 源码证据 | 关键确认点 |
|---|---|---|---|
| 决策裁决 | 根据当前 Token 估算值和配置的缓冲区计算是否符合压缩条件 | [compaction.ts#L219](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L219) | 确认在自动压缩关闭时是否能返回 false |
| 切点搜索 | 逆向扫描 entries 并在避开 toolResult 的前提下锚定 firstKeptEntryIndex | [compaction.ts#L386](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L386) | 确认切点遇到 split turn 时能否退回到 turnStartIndex |
| 属性提取 | 计算被弃置的 entries，合并提取先前压缩的读写文件痕迹并包装为 fileOps | [compaction.ts#L644](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L644) | 确认前一次压缩中的 Details 属性是否能级联累加 |
| 双向总结生成 | 分别将历史序列与分劈回合序列转换为纯文本并进行 LLM 归纳 | [compaction.ts#L747](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L747) | 确认在 generateSummary 失败时系统如何捕获异常 |
| 运行时挂载与钩子触发 | 在 prompt 循环前后自动插入决策检查，并对外触发 `session_before_compact` 及 `session_compact` 事件 | [agent-session.ts#L1758](/source-code/packages/coding-agent/src/core/agent-session.ts#L1758) | 检查扩展在拦截并自主提供 summary 时的返回流程 |
| 写入底座持久化 | 将产生的结构化总结和文件痕迹以 `compaction` entry 类型存入 JSONL | [session-manager.ts#L916](/source-code/packages/coding-agent/src/core/session-manager.ts#L916) | 确保 header 文件落盘状态与 flushed 标志同步 |
| 低层 Harness 压缩支持 | 在非 CLI 环境（如测试套件 and 核心 Harness）中以无状态形式复现相同的切点与压缩功能 | [compaction.ts#L626](/source-code/packages/agent/src/harness/compaction/compaction.ts#L626) | 确认与 `packages/coding-agent` 的纯算法实现逻辑一致 |

## 13.4 为什么这样设计

#### 13.4.1 反向回溯而非正向切除

如果使用传统的“从头截断”逻辑（即每次满了就剪掉最老的 10% 消息），极易破坏模型和工具链的会话结构完整性（例如，不小心切掉了正在等待返回的工具调用请求头，或者切掉了一半的并行工具调用）。
Pi 的**反向回溯对齐设计**保证了“安全保留”：
- 优先从最新节点向前数出 `keepRecentTokens` 的安全空间，因为最近的信息对模型的即时指令最关键。
- 在切点处执行状态机分析，对于未闭合的“助理-工具”交互对强制整体保留，从而避免 LLM 因格式残缺而崩溃。

#### 13.4.2 级联文件痕迹（details.readFiles）

单纯归纳文本（Summary）会导致模型丧失对文件树读写行为的记忆。
在 [_checkCompaction](/source-code/packages/coding-agent/src/core/agent-session.ts#L1788) 执行的压缩管线中，前一次 Compaction 产生的 `details.readFiles` 和 `details.modifiedFiles` 数组在后台会被反向读取出来，与当前裁剪范围内的工具调用进行去重并集（Union）合并，然后重新打入新的 Compaction Entry 中。这种“级联合并（Cascading Merge）”设计既降低了文本负担，又保留了精确的工具执行上下文痕迹。

## 13.5 常见误解与排查

#### 13.5.1 误区：认为设置 `compaction.enabled = false` 就能全面禁用压缩机制

在配置中将 `"compaction.enabled"` 设为 `false` 只会关闭**自动阈值检测和自动溢出恢复**。当模型抛出溢出错误时它不会自愈。但用户在命令行中键入的 `/compact` 手动压缩命令仍然是完全允许且正常工作的，其底层执行的切点、LLM 总结等机制没有任何变化。

#### 13.5.2 误区：压缩会破坏未保存的草稿或编辑中的会话树分支

压缩动作是**基于当前活动线性路径（Active Branch Line）** 进行裁剪的。它只会归纳并替换当前叶子节点所在的分支历史。对于会话树上的其他分叉分支（你之前 `/tree` 出来的分支），它们的物理 entries 仍然完好无损地留在 JSONL 日志中，不会被擦除。你仍然可以自由导航回其他未压缩的分支。

#### 13.5.3 故障排查：自动压缩频繁陷入死循环或 Token 暴增报错

若发生此故障，说明 `compaction.maxTokens` 与 `compaction.keepRecentTokens` 的配置区间设计不合理（例如 `maxTokens: 4000` 且 `keepRecentTokens: 3800`）。这会导致系统每次刚压缩完 200 个 tokens 的差额后，下一回合发出指令又立刻触发压缩，造成极高的资源开销甚至导致模型死循环。**建议最大 Token 与保留 Token 的安全间隔至少为 2000 以上**。

## 13.6 本章训练

#### 13.6.1 基础练习：手动压缩与日志对比

在一个测试项目中启动 Pi，执行三次文件读取工具调用，然后在控制台手动输入 `/compact` 强制触发压缩。退出 Pi，用文本编辑器打开当前会话对应的 JSONL 文件，找出新产生的 `compaction` 类型的 entry，抄写它的 `details` 字段，确认它记录的文件列表是否正确包含了你之前读过的文件名。

#### 13.6.2 原理练习：逆向推导安全切点

仔细阅读 [findCutPoint](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L386) 的源码。如果在最近的 `keepRecentTokens` 区间内，回溯遇到的第一个消息是一条 `toolResult`，算法会如何继续向下寻找，以什么规则找出最终的 `firstKeptEntryIndex` 和 `turnStartIndex`？写出具体的搜寻分支逻辑。

#### 13.6.3 扩展练习：压缩事件通知扩展

编写一个简易的 Pi 扩展程序，注册并监听 `session_compact` 事件。每次当系统成功完成一次历史压缩并生成新的总结后，在当前终端控制台上打印一条蓝色的提示，显示本次压缩共削减了多少 Token（即 `beforeTokens - afterTokens`），并在项目的根目录下把本次的压缩 Summary 单独保存为 `.pi/compaction-history.log` 文件。
