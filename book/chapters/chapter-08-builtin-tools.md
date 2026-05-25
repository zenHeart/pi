# 8. 内置工具系统：read/write/edit/bash/grep/find/ls

## 8. 本章解决的问题

工具是模型接触真实世界的受控出口。对前端新手来说，tool calling 像是“模型点按钮”；对 agent 创造者来说，它更像一个小型 RPC 系统：模型只负责提出调用，runtime 负责校验参数、执行副作用、把结果变回上下文，并把 UI 渲染和扩展 hook 接在合适位置。

pi 内置工具由 `createToolDefinition()` 和 `createTool()` 统一创建，见 [index.ts#L96](/source-code/packages/coding-agent/src/core/tools/index.ts#L96) 和 [index.ts#L117](/source-code/packages/coding-agent/src/core/tools/index.ts#L117)。默认 coding tools 是 `read`、`bash`、`edit`、`write`，见 [index.ts#L168](/source-code/packages/coding-agent/src/core/tools/index.ts#L168)。只读审查工具是 `read`、`grep`、`find`、`ls`，见 [index.ts#L177](/source-code/packages/coding-agent/src/core/tools/index.ts#L177)。

## 8. 工具职责

| 工具 | 源码 | 责任 |
|---|---|---|
| `read` | [read.ts#L206](/source-code/packages/coding-agent/src/core/tools/read.ts#L206) | 读取文本和图片；文本支持 offset/limit，并按行数或字节截断 |
| `write` | [write.ts#L181](/source-code/packages/coding-agent/src/core/tools/write.ts#L181) | 创建或完整覆写文件，并自动创建父目录 |
| `edit` | [edit.ts#L291](/source-code/packages/coding-agent/src/core/tools/edit.ts#L291) | 用唯一、非重叠的 old/new 文本块做精准替换并返回 diff |
| `bash` | [bash.ts#L269](/source-code/packages/coding-agent/src/core/tools/bash.ts#L269) | 在 cwd 执行 shell，流式输出，超长输出保存到临时文件 |
| `grep` | [grep.ts#L122](/source-code/packages/coding-agent/src/core/tools/grep.ts#L122) | 搜索文件内容，返回路径和行号，尊重 `.gitignore` |
| `find` | [find.ts#L111](/source-code/packages/coding-agent/src/core/tools/find.ts#L111) | 按 glob 查找文件，适合先定位再读取 |
| `ls` | [ls.ts#L99](/source-code/packages/coding-agent/src/core/tools/ls.ts#L99) | 列目录，包含 dotfiles，并控制输出规模 |

pi 没有把 `grep/find/ls` 当成“必须走 bash 的小事”。这是产品策略：常见探索操作用专门工具更快、更稳定，也更容易截断和渲染。system prompt 会在同时有 bash 和只读探索工具时引导模型优先使用 `grep/find/ls`，见 [system-prompt.ts#L96](/source-code/packages/coding-agent/src/core/system-prompt.ts#L96)。

## 8. Schema 是安全边界

工具参数来自模型，TypeScript 类型不可信。每个工具都用 TypeBox schema 描述输入，例如 `write` 的 `path` 和 `content` 在 [write.ts#L12](/source-code/packages/coding-agent/src/core/tools/write.ts#L12)，`edit` 的 `edits[].oldText/newText` 在 [edit.ts#L23](/source-code/packages/coding-agent/src/core/tools/edit.ts#L23)。低层 loop 在执行前调用 `validateToolArguments()`，见 [agent-loop.ts#L579](/source-code/packages/agent/src/agent-loop.ts#L579)。

schema 的作用不是让模型“更懂”，而是让 runtime 拒绝不合法副作用。比如模型把 `edits` 写成字符串，pi 可以在 `prepareArguments` 里兼容特定模型输出，见 [edit.ts#L93](/source-code/packages/coding-agent/src/core/tools/edit.ts#L93)；但参数仍要通过 schema 和业务校验，空 edits 会被拒绝，见 [edit.ts#L119](/source-code/packages/coding-agent/src/core/tools/edit.ts#L119)。

## 8. 输出截断

bash、read、grep、find、ls 都必须控制输出预算。截断工具统一在 [truncate.ts#L1](/source-code/packages/coding-agent/src/core/tools/truncate.ts#L1)。`read` 默认按行数和字节截断，并提示继续用 offset，见 [read.ts#L215](/source-code/packages/coding-agent/src/core/tools/read.ts#L215)。`bash` 返回 stdout/stderr 的尾部，并在截断时保存完整输出到临时文件，见 [bash.ts#L279](/source-code/packages/coding-agent/src/core/tools/bash.ts#L279) 和 [bash.ts#L354](/source-code/packages/coding-agent/src/core/tools/bash.ts#L354)。`grep` 还会截断单行，避免 minified 文件或长日志把上下文撑爆，见 [grep.ts#L261](/source-code/packages/coding-agent/src/core/tools/grep.ts#L261)。

输出截断不是“省钱的小优化”，而是 agent 能长时间工作的前提。没有截断，模型下一轮看到的是无边日志而不是任务状态；自动 compaction 也会被巨型 tool result 拖进不可预测的摘要。

## 8. 工具结果不是 UI 文本

工具定义同时服务三方：description、promptSnippet 和 promptGuidelines 给模型；execute 给 runtime；renderCall 和 renderResult 给 TUI。`wrapToolDefinition()` 把 coding-agent 的 `ToolDefinition` 转成低层 `AgentTool`，保留 `executionMode`、schema、执行函数和渲染元信息，见 [tool-definition-wrapper.ts#L5](/source-code/packages/coding-agent/src/core/tools/tool-definition-wrapper.ts#L5)。

这解释了一个常见误解：工具结果不是“展示给用户的一段字符串”。它首先是要回灌给模型的结构化消息，UI 只是另一层投影。`edit` 成功后把人类可读文案放进 `content`，把 diff 和 patch 放进 `details`，见 [edit.ts#L382](/source-code/packages/coding-agent/src/core/tools/edit.ts#L382)。UI 可以渲染 diff，模型则能读到执行是否成功。

## 8. 自定义 tool 片段

```ts
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function register(pi: ExtensionAPI) {
  pi.registerTool({
    name: "echo_json",
    description: "Return a compact JSON payload for debugging.",
    parameters: Type.Object({ value: Type.Unknown() }),
    promptSnippet: "Echo a JSON value for debugging extension wiring",
    execute: async (_id, input) => ({
      content: [{ type: "text", text: JSON.stringify(input) }],
    }),
  });
}
```

关键点：description 给模型看，schema 给 runtime 校验，execute 执行副作用，result 回灌给模型。自定义工具如果有外部副作用，要像内置工具一样写清楚失败结果；如果会改文件，要使用第 9 章的文件 mutation queue；如果只是读信息，应尽量保持只读并控制输出。

失败边界：内置工具不会自动判断“这个改动是否符合产品需求”，也不会替用户确认危险命令。权限门、路径保护、审批弹窗属于 extension/hook 策略；工具本身只负责把一个明确的调用执行成可解释的结果。
