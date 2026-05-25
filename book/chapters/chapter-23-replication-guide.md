# 第23章 复刻路径与检查清单

## 23.1 目标定义

复刻 pi-agent 产品能力，不是复制终端界面，而是实现同类能力边界：用户能在项目目录启动 agent，模型能读写文件和跑命令，过程可恢复，能力可扩展，长会话可压缩，外部程序可通过 SDK/RPC/JSON 集成，团队可以通过资源和 packages 共享工作流。

## 23.2 四周 MVP 路线

第一周：消息与 loop。实现 `AgentMessage`、provider stream adapter、assistant reducer、toolCall/toolResult 闭环、abort、错误消息、事件流、faux provider。

第二周：工具与 session。实现 read/write/edit/bash，JSONL append session，id/parentId，resume，session stats，HTML/JSONL export。

第三周：上下文与预算。实现 context files、system prompt builder、tool output truncation、manual compact、context usage、provider/model/auth registry。

第四周：产品化与扩展。实现 slash commands、settings、skills、prompt templates、extension loader、registerTool/registerCommand、RPC JSONL、SDK wrapper。

## 23.3 生产级补齐

生产级需要继续补：

- grep/find/ls 和工具 allowlist。
- custom provider、models.json、OAuth。
- packages、themes、keybindings、terminal compatibility、platform setup。
- full extension lifecycle、custom UI、message renderer。
- fork/clone/tree、branch summary、auto compaction。
- auto retry、provider retry cap、overflow recovery。
- observability、eval runner、RPC extension UI policy、redaction、dataset export。
- sandbox/remote execution、checkpoint、安全审批。

## 23.4 自定义 AgentHarness 检查表

- 是否有 turn snapshot，避免运行中 provider request 被 live config 污染。
- 是否有 save point，保证工具结果、pending writes、下一轮配置刷新顺序确定。
- 是否有 append-only session storage。
- 是否能传入自定义 model registry 和 credential resolver。
- 是否能注册、覆盖、切换 active tools。
- 是否支持 steering、followUp、nextTurn。
- 是否支持 abort 并定义 queue/pending write 行为。
- 是否支持 compaction 和 tree navigation，或明确不支持。
- 是否有 hook/event settlement 策略。
- 是否有 faux provider 测试。
- 是否区分 internal message、provider message、UI message、session entry。

## 23.5 用户功能覆盖检查表

- 安装、卸载、配置目录、环境变量。
- `/login`、provider、model、thinking level。
- interactive mode、print mode、JSON mode、RPC mode。
- read/write/edit/bash、只读工具集。
- `@file`、图片、`!command`、`!!command`。
- context files、SYSTEM、APPEND_SYSTEM。
- `/resume`、`-c`、`-r`、`--session`、`/new`。
- `/tree`、`/fork`、`/clone`、label。
- `/compact`、auto compaction、branch summary。
- `/export` HTML/JSONL、`/import`、`/share`、`/copy`、session stats。
- `/hotkeys`、`/changelog`、`/quit`。
- skills、prompt templates、themes、packages。
- extensions、custom tools、custom UI、custom provider。
- settings、keybindings、terminal setup。
- `--skill`、`--prompt-template`、`--theme`、`--extension` 以及 `--no-*` 安全排错开关。
- Windows bash、Termux、tmux `csi-u`、外部编辑器。

## 23.6 Docs 映射覆盖检查表

对照 `packages/agent/docs` 与 `packages/coding-agent/docs`，本书必须覆盖：

- AgentHarness：turn lifecycle、tool loop、events、hooks、snapshot、pending writes、save point。
- DurableHarness：append-only storage、resume、session tree、fork/clone、branch summary。
- Hooks：before/after provider、tool、context、resources_discover、mutation 合约、错误隔离。
- Observability：event/trace/span/metric/redaction、JSONL、eval facts。
- Usage：CLI args、slash commands、modes、resources、env vars、terminal flows。
- Compaction：manual/auto compaction、reserve/keep recent、split turns、extension before compact/tree hooks。
- Extensions：registerTool、registerCommand、registerShortcut、registerFlag、registerProvider、UI、custom renderer。
- Custom provider：API types、models.json、OAuth、headers、streamSimple、usage/cost、overflow、tests。
- SDK/RPC：createAgentSession、runtime/services、print/json/rpc modes、RPC command/response/UI request。
- TUI：component interface、overlay、focus、IME、widgets、footer/header、custom editor、themes、keybindings。
- MCP：server config、resources/tools/prompts、security boundary。
- Platform docs：Windows、tmux、terminal setup、Termux、shell aliases。

## 23.7 设计决策检查表

每加一个能力，回答八个问题：

1. 它解决哪个用户问题。
2. 它属于核心、产品层、扩展还是外部环境。
3. 用户如何触发。
4. 模型能看到什么。
5. harness 私下保存什么。
6. 副作用在哪里执行。
7. 结果如何回灌。
8. 失败如何持久化和展示。

这八个问题能防止你把 agent 写成一堆 prompt 和工具函数。

## 23.8 最终判断标准

一个工程师只看本书后，应能做到：

- 从用户视角完整使用 pi。
- 从源码视角解释 loop、tools、provider、session、extensions、resources。
- 从工程视角实现一个最小 coding agent。
- 从产品视角判断哪些能力该进核心，哪些该做扩展。
- 从 harness 视角设计 snapshot、save point、pending writes、queue、abort 和 recovery。

达到这些标准，才算真正理解 pi agent，而不是只会调用一次模型 API。
