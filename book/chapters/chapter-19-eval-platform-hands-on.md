# 第19章 Eval 平台实操：用 JSONL 和 faux provider 起步

## 19.1 最小平台目标

最小 eval 平台只做一件事：给 agent 一个任务，记录事件，验证结果。它不需要网页、数据库或复杂标注系统。先用 JSON/RPC mode、session export、git diff 和 faux provider 构建可重复 runner。

## 19.2 Runner 输入

一个 case 可以这样定义：

```yaml
id: fix-readme-typo
cwd: /repo
prompt: "修复 README 里的拼写错误并运行检查"
model: faux/success-script
limits:
  maxTurns: 8
  maxCostUsd: 0.20
expect:
  filesChanged:
    - README.md
  commandPasses:
    - npm run check
  noDangerousCommands: true
```

这个格式有三个重点：任务、限制、断言。不要把 eval 写成“模型回答包含某个字符串”。

## 19.3 RPC 驱动

RPC mode 从 stdin 接收 JSON command，从 stdout 输出 response 和 event。mode 实现从 [rpc-mode.ts#L51](/source-code/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L51) 开始，严格 JSONL reader/writer 在 [jsonl.ts#L5](/source-code/packages/coding-agent/src/modes/rpc/jsonl.ts#L5)。命令类型从 [rpc-types.ts#L19](/source-code/packages/coding-agent/src/modes/rpc/rpc-types.ts#L19) 开始。

eval runner 可以发送：

- `prompt`
- `abort`
- `compact`
- `get_state`
- `get_messages`
- `get_session_stats`
- `export_html`
- `fork` / `clone`

并订阅事件判断执行过程。

RPC command 覆盖面比普通 “send prompt” 大。`RpcCommand` 还包括 `set_model`、`cycle_model`、`set_thinking_level`、`set_steering_mode`、`set_follow_up_mode`、`set_auto_compaction`、`set_auto_retry`、`bash`、`abort_bash`、`switch_session`、`get_last_assistant_text`、`set_session_name`、`get_commands`，见 [rpc-types.ts#L19](/source-code/packages/coding-agent/src/modes/rpc/rpc-types.ts#L19)。这让 eval 能覆盖产品级状态变化，而不是只测模型输出。

一个严谨 runner 应该把 request id 贯穿进去：发送 `{ id, type }`，等待同 id response，再继续观察事件。否则多个异步命令并行时，容易把 prompt response、extension UI response 和 agent event 混淆。

## 19.4 判定流程

最小判定流程：

1. 创建临时工作区。
2. 复制 fixture repo。
3. 启动 pi RPC 或 SDK session。
4. 发送 prompt。
5. 收集 JSONL events。
6. 等待 `agent_end` 或超时。
7. 运行期望检查命令。
8. 检查 git diff。
9. 导出 session。
10. 生成 eval report。

真实 provider eval 和 faux provider regression 要分开。前者评估能力，后者保护 harness 行为不退化。

当 case 涉及 extension UI，runner 要实现一层 UI policy：看到 `extension_ui_request` 后，根据 case 配置返回 `extension_ui_response`。例如 select 默认选第一项，confirm 根据 case 写死 true/false，editor 返回预设文本，notify/status/widget 只记录不回复。这样同一套 extension 可以在 interactive mode 和 RPC eval 中运行。

## 19.5 失败分类

eval report 至少区分：

- model failed：模型没找到正确方案。
- tool failed：工具实现或环境失败。
- harness failed：事件、session、queue、abort、retry 语义错误。
- context failed：必要信息没进入模型。
- budget failed：token/cost/turn 超限。
- safety failed：危险命令或越权路径。

只有分类清楚，eval 才能指导工程修复。

## 19.6 复刻原则

MVP：本地 YAML cases、RPC runner、JSONL trace、git diff/assert command。

生产级：case registry、parallel execution、provider matrix、faux provider scripts、failure triage、redaction、HTML report、session dataset export。
