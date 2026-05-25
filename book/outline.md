# Pi Agent 专家级学习书大纲

本大纲由 Pi Agent 创建者深度编写，专为前端开发工程师量身定制。目标是让一个完全不了解 AI Agent 的前端工程师，只看本书就能彻底掌握 Pi 的使用、理解其内核设计原理、明白架构决策背后的“为什么”，并具备二次开发与团队落地的专家级能力。

---

## 1. 核心设计哲学与认知映射

### 1.1 核心设计哲学
Pi 被设计为一个 **最小化终端编码脚手架（Minimal Terminal Coding Harness）**，而不是内置了所有可能工作流的臃肿 IDE。其核心原则包括：
- **小内核 + 可组合资源（Core-Small, Resource-Driven）**：内核仅处理模型流式调用、工具执行状态机、基础会话管理、资源发现机制与 TUI 渲染。所有的特定工作流（如多 Agent 协同、计划模式、文件审批流程）都属于用户空间资源（extensions, skills, prompts, packages）。
- **完全可审计与可控制（Auditable & Controllability）**：作为本地执行型 Agent，Pi 的所有操作都发生在本机工作区，工具调用被完全建模为可追踪的 Session 消息，并且提供了多级事件钩子（Extension Events）允许用户代码实时干预和裁决。
- **环境绑定与多模态输入（Cwd-bound & Multimodal）**：Pi 绑定当前工作目录（Cwd），通过 `@file` 机制、剪贴板图片提取、Git 状态检测，快速拉取高价值上下文。

### 1.2 前端工程师的认知映射
前端开发工程师通常对视图渲染、状态流转、生命周期、包管理等有深刻理解。为了降低学习曲线，本书将 Agent 概念与前端技术做如下隐喻映射：

| 前端开发概念 | AI Agent 对应概念 | 隐喻意义 |
|---|---|---|
| **Virtual DOM / UI Render** | **TUI 差量渲染 / Component** | `@earendil-works/pi-tui` 的组件式渲染，状态改变仅触发布局重计算与终端字符差量更新。 |
| **Zustand / Redux / Store** | **AppStateStore / bootstrap/state** | Pi 内部的极简发布订阅状态机，用于跨 REPL 屏幕与内核同步会话指标（Token、Cost、Model）。 |
| **浏览器事件循环 (Event Loop)** | **Agent 编排循环 (Agent Loop)** | `queryLoop` 状态机。单次轮次非简单 while，而是带有多退出/恢复路径（Continue）的事务级迭代。 |
| **Webpack / Vite / Esbuild** | **Bun Feature Flags & DCE** | 编译时死代码消除（Dead Code Elimination）。区分内部版与外部公开版，移除无用分支。 |
| **npm packages / monorepo** | **Pi Packages / conventional layout** | 支持 convention-based 资源发现（skills/prompts/themes），支持本地/远程依赖加载与隔离。 |

---

## 2. 知识阶梯与目录结构

本书按照“心智心法 -> 熟练操作 -> 内核机制 -> 会话与状态 -> 扩展系统 -> 模型层 -> 程序化集成 -> 安全与调试 -> 专家级实践”的梯度进行组织：

### 第 0 部分：建立产品心智
*建立产品定位，搞清楚 Pi 的责任边界与设计权衡。*

#### 第 1 章：Pi 的产品身份
- **为什么讲**：防止前端工程师把 Pi 当成“又一个 Copilot”或“包装版 Chat”。必须建立 Harness 框架定位。
- **必须讲**：
  - Monorepo 职责分工：`packages/coding-agent`（CLI与会话外壳）、`packages/agent`（编排层）、`packages/ai`（统一模型API）、`packages/tui`（终端 UI 组件库）。
  - 内置工具集范围：`read`、`edit`、`write`、`bash`、`grep`、`find`、`ls`。
  - 四大入口形态：Interactive, Print/Json, RPC, SDK。
- **不讲的问题**：用户会盲目期待内置 MCP、后台 bash 等不属于内核的功能，无法做出清晰的架构选型。
- **落点源码**：[packages/coding-agent/src/main.ts#L424](/source-code/packages/coding-agent/src/main.ts#L424)、[packages/agent/src/agent.ts#L166](/source-code/packages/agent/src/agent.ts#L166)。
- **图表与例程**：Mermaid 展现 CLI 启动后分发到交互/打印/RPC/JSON 模式的数据分流图。
- **练习**：
  - *使用级*：运行 `pi -p` 并通过管道传入代码文件，完成只读分析。
  - *原理级*：画出 `main.ts` 初始化到启动 `InteractiveMode` 的服务装配顺序。
  - *扩展级*：通过命令行传递 `--no-extensions` 观测 CLI 过滤掉的资源数。

#### 第 2 章：小内核与可组合边界
- **为什么讲**：理解为什么 Pi 能够保持高性能且极其容易定制，这是可扩展体系的理论根基。
- **必须讲**：
  - 小内核边界：只保留模型调用状态机、工具执行、会话、资源加载和 UI 基础。
  - 核心设计权衡：为什么不内置 MCP、sub-agent、permission popups、plan mode、todos、background bash。
  - 安全原则：第三方 package 执行本地代码，所有 runtime 差异均在用户空间隔离。
- **不讲的问题**：用户写扩展时会在错误的地方引入依赖，破坏 Pi 核心的可升级性。
- **落点源码**：[packages/coding-agent/src/core/resource-loader.ts#L28](/source-code/packages/coding-agent/src/core/resource-loader.ts#L28)。
- **图表与例程**：对比表展示“核心内核职责” vs “扩展资源职责”。
- **练习**：
  - *使用级*：在本地项目中创建一个 `.pi` 目录，验证项目级规则覆盖。
  - *原理级*：解释当用户执行 `reload` 时，ResourceLoader 依次刷新了哪些资源目录。
  - *扩展级*：配置项目级 `settings.json` 以禁用特定的全局 themes。

---

### 第 1 部分：成为熟练用户
*让工程师掌握在日常编码场景中，安全、高效、顺畅地操作 Pi 的完整闭环。*

#### 第 3 章：安装、启动与首次运行
- **为什么讲**：本地终端工具的安装方式和本地状态目录，直接决定凭证安全、扩展加载和多环境兼容性。
- **必须讲**：
  - `npm install -g --ignore-scripts @earendil-works/pi-coding-agent` 的供应链安全意义。
  - 全局状态目录 `~/.pi/agent/` 的文件分布（`settings.json`, `auth.json`, `models.json`）。
  - 离线环境与防静默升级控制：`PI_OFFLINE`、`PI_SKIP_VERSION_CHECK`、`PI_TELEMETRY` 环境变量。
  - Windows 环境下的 Git Bash/PowerShell 路径配置。
- **不讲的问题**：新手在配置多开发环境时，因凭证冲突、离线失败、PATH 丢失导致无法运行。
- **落点源码**：[packages/coding-agent/src/config.ts#L472](/source-code/packages/coding-agent/src/config.ts#L472)、[packages/coding-agent/src/utils/windows-self-update.ts#L43](/source-code/packages/coding-agent/src/utils/windows-self-update.ts#L43)。
- **图表与例程**：状态目录 `~/.pi/agent/` 文件夹树状结构图与文件解释。
- **练习**：
  - *使用级*：使用 `PI_OFFLINE=1` 启动 Pi，观察离线启动的行为。
  - *原理级*：画出 CLI 启动时对本地 `migrations.ts` 的自动运行机制。
  - *扩展级*：编写 shell alias，整合 `PI_SKIP_VERSION_CHECK=1` 以提升本地冷启动速度。

#### 第 4 章：鉴权、Provider 与模型选择
- **为什么讲**：模型是代理的动力，鉴权是启动的前提。要理解凭证的加载层次与优先级别，避免盲人摸象。
- **必须讲**：
  - `/login` 服务端鉴权与 API Key 的混合加载逻辑。
  - 凭证解析链与优先级：`CLI --api-key` > `auth.json` > 环境变量 > `models.json` 覆盖。
  - ModelRegistry 加载与合并逻辑。
  - 限制 Thinking 级别：`clampThinkingLevel` 对思考 Token 消耗与模型能力的约束。
- **不讲的问题**：无法排查鉴权失效、多模型环境下 Key 污染、Thinking 级别溢出导致的扣费爆炸。
- **落点源码**：[packages/coding-agent/src/core/model-registry.ts#L333](/source-code/packages/coding-agent/src/core/model-registry.ts#L333)、[packages/coding-agent/src/core/auth-storage.ts#L53](/source-code/packages/coding-agent/src/core/auth-storage.ts#L53)。
- **图表与例程**：鉴权凭证解析优先级时序图。
- **练习**：
  - *使用级*：使用 `/model` 菜单切换不同 Provider 模型。
  - *原理级*：描述当 `auth.json` 不存在时，ModelRegistry 是如何回退去读取 `process.env` 的。
  - *扩展级*：在 `models.json` 中配置一个支持 thinking 的本地模型，并限制其 max thinking tokens。

#### 第 5 章：交互模式与界面模型
- **为什么讲**：InteractiveMode 是 Pi 的主要体验形态，前端必须理解终端 UI 也是声明式组件构成的状态驱动界面。
- **必须讲**：
  - TUI 四个渲染区域划分：Header、Messages、Editor、Footer。
  - 终端输入框（Editor）的高级特性：`@file` fuzzy 匹配补全、图片剪贴板粘贴、`!` 与 `!!` 运行本地 bash。
  - 状态同步与 AppStateStore：Cwd、Token 数、消耗金额（Cost）、上下文窗口比例的计算。
- **不讲的问题**：用户只会打字聊天，无法有效利用多模态、快捷键和 `@file` 上下文注入。
- **落点源码**：[packages/coding-agent/src/modes/interactive/interactive-mode.ts#L680](/source-code/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L680)、[packages/tui/src/tui.ts#L1320](/source-code/packages/tui/src/tui.ts#L1320)。
- **图表与例程**：TUI 视口网格与状态层级关系图。
- **练习**：
  - *使用级*：使用 `@` 搜索并注入当前项目的 3 个关键文件进入 Prompt。
  - *原理级*：追踪一次输入事件从 Stdin 触发，流经 KeybindingsManager，到 TUI 重新 Render 的过程。
  - *扩展级*：在本地配置文件中，修改默认的 Footer 显示指标，隐藏 Cost。

#### 第 6 章：消息队列与中断
- **为什么讲**：这是 Pi 区分于传统 REPL 聊天框的特色机制。前端工程师要了解如何优雅处理异步流控制。
- **必须讲**：
  - 两大队列：`steeringQueue`（用户中途引导队列）与 `followUpQueue`（预设后续队列）。
  - 中断信号传递：`Escape` 键如何触发底层 `AbortController` 并在 stdout 安全输出 `Interrupted` 消息。
  - 队列安全点（Safe Points）：为什么不能在 Tool 运行时立刻抹除数据，中断后如何回灌 `tool_result` 保证会话格式完整。
- **不讲的问题**：无法理解“打断”对正在运行的本地 bash 命令和 LLM 调用的不同物理效果，导致历史状态破坏。
- **落点源码**：[packages/agent/src/agent.ts#L166](/source-code/packages/agent/src/agent.ts#L166)、[packages/agent/src/agent-loop.ts#L450](/source-code/packages/agent/src/agent-loop.ts#L450)。
- **图表与例程**：`Escape` 触发中断并回灌合成 tool_result 的时序图。
- **练习**：
  - *使用级*：在一个长时间运行的 bash 任务中按下 `Escape`，观测中断发生及本地进程终止。
  - *原理级*：分析 `agent-loop.ts` 中 `streamingToolExecutor` 是如何捕获 `aborted` 信号并产生合成 `tool_result` 消息的。
  - *扩展级*：编写一段脚本触发 10 轮 followUp 消息，并在第 3 轮模拟用户按键中止。

#### 第 7 章：CLI 参数与只读审查
- **为什么讲**：在 CI/CD 流水线或自动化脚本中，不能用交互模式，必须精通非交互模式的参数传递。
- **必须讲**：
  - CLI 调用格式：`pi [options] [@files...] [messages...]`。
  - 管道与 Stdin 读取：`readPipedStdin()` 在 TTY 与 non-TTY 下的区别。
  - 只读审查模式配置：通过 `--tools read,grep,find,ls` 实现安全的代码扫描，杜绝写操作。
- **不讲的问题**：无法在 Webhook、CI 脚本或外部程序中安全、无死锁地调用 Pi。
- **落点源码**：[packages/coding-agent/src/cli/args.ts#L74](/source-code/packages/coding-agent/src/cli/args.ts#L74)、[packages/coding-agent/src/main.ts#L637](/source-code/packages/coding-agent/src/main.ts#L637)。
- **图表与例程**：管道输入 -> 模式判定 -> CLI 解析 -> stdout 返回数据流图。
- **练习**：
  - *使用级*：在一行 shell 中通过 `cat file.js | pi -p "explain this"` 运行 Pi 并获得返回。
  - *原理级*：分析 `processFileArguments` 如何解析 CLI 参数中的 `@` 符号前缀并构造初始 Attachment。
  - *扩展级*：编写一个 Shell 脚本，配置 `--no-builtin-tools` 和自定义 extensions，完成全自动只读分析。

---

### 第 2 部分：理解 Agent 内核
*剖析 Agent core 的运行原件：工具解析、生命周期循环、项目规则感知和设置合并。*

#### 第 8 章：内置工具系统
- **为什么讲**：工具是 Agent 的手脚。前端需要懂得如何处理文件冲突、大文本截断、模糊修改以及操作并发。
- **必须讲**：
  - 七个核心工具（`read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`）的 Schema 与校验。
  - `edit`（编辑工具）的 Fuzzy Matching 逻辑与 Line Ending 处理。
  - `bash` 执行：输出 tailing 截断与临时文件全量保留机制（`OutputAccumulator`）。
  - 工具调用原子队列：`file-mutation-queue.ts` 解决多重写入冲突。
- **不讲的问题**：无法理解编辑冲突为什么发生、为何大文件只读了前 800 行、无法调试 fuzz 编辑失败。
- **落点源码**：[packages/coding-agent/src/core/tools/edit.ts#L50](/source-code/packages/coding-agent/src/core/tools/edit.ts#L50)、[packages/coding-agent/src/core/tools/output-accumulator.ts#L30](/source-code/packages/coding-agent/src/core/tools/output-accumulator.ts#L30)。
- **图表与例程**：编辑工具进行行匹配替换的状态转移图。
- **练习**：
  - *使用级*：让 Pi 对一个空文件运行 `write`，再对其进行局部 `edit`。
  - *原理级*：分析 `edit-diff.ts` 是如何将 diff 转换成行操作并确保并发写入互斥的。
  - *扩展级*：修改 `read` 工具的默认限制，将其首次读取的最大行数限制改为 100 行。

#### 第 9 章：Agent 循环的执行状态机
- **为什么讲**：理解 Agent core 真正的 query 迭代，掌握 text-thinking-toolcall 流式协议的流转与终结。
- **必须讲**：
  - 核心编排函数 `queryLoop()` 的 11 个状态字段详解。
  - Assistant Streaming 事件分发：从 LLM 原始流到 text、thinking、tool_call deltas 的分流处理。
  - 工具生命周期钩子：`beforeToolCall`、`afterToolCall`、`terminate`。
  - 并发执行 vs 串行执行的判定逻辑（`parallel` vs `sequential`）。
  - LLM 中止原因（Stop Reason）解析：`stop`、`length`、`tool_use`、`aborted`。
- **不讲的问题**：不理解为什么一轮提问会产生数十轮模型工具调用，无法解释 Streaming 断连与状态回溯。
- **落点源码**：[packages/agent/src/agent-loop.ts#L95](/source-code/packages/agent/src/agent-loop.ts#L95)、[packages/agent/src/harness/agent-harness.ts#L100](/source-code/packages/agent/src/harness/agent-harness.ts#L100)。
- **图表与例程**：Agent Loop 事务状态机转移全景图（含异常处理与流重试路径）。
- **练习**：
  - *使用级*：在交互界面输入一个同时触发 3 个并行 bash 操作的请求，观察执行状态。
  - *原理级*：绘制一次 Assistant 返回 `tool_use` 到 Harness 分发给 Executor 执行并写入 `tool_result` 的事件时间线。
  - *扩展级*：在 Harness 的 mock test 中注入一个延迟返回的自定义工具，调试 sequential 执行机制。

#### 第 10 章：系统提示词与项目规则感知
- **为什么讲**：模型看到的终极 System Prompt 包含项目规则、全局规则、工具描述等，必须理清其拼接机制。
- **必须讲**：
  - 上下文规则文件（`AGENTS.md` / `CLAUDE.md`）的查找与目录树向上攀爬合并算法。
  - `buildSystemPrompt` 模块化拼接器：整合基础提示词、系统环境变量、时间、cwd、已启用 skills 与 extensions 描述。
  - 配置覆写：`~/.pi/SYSTEM.md` 与 `.pi/APPEND_SYSTEM.md`。
- **不讲的问题**：规则文件写在项目里，Agent 却因为查找路径溢出或覆盖顺序错误而不遵守。
- **落点源码**：[packages/coding-agent/src/core/system-prompt.ts#L25](/source-code/packages/coding-agent/src/core/system-prompt.ts#L25)、[packages/agent/src/harness/system-prompt.ts#L10](/source-code/packages/agent/src/harness/system-prompt.ts#L10)。
- **图表与例程**：System Prompt 动态装配流水线图。
- **练习**：
  - *使用级*：创建一个 `CLAUDE.md`，规定只使用 pnpm，观察 Pi 是否遵循。
  - *原理级*：调试 `system-prompt.ts`，打印最终输出给 LLM 接口的完整 system string。
  - *扩展级*：在 `.pi/APPEND_SYSTEM.md` 中注入带有自定义动态变量的模板，观察装配结果。

#### 第 11 章：设置合并系统
- **为什么讲**：SettingsManager 管理着几乎所有的运行时选项。理解全局与局部、项目局部与命令行参数的合并与持久化。
- **必须讲**：
  - 两级加载：全局 `~/.pi/agent/settings.json` 与项目 `.pi/settings.json` 的深层合并（Deep Merge）逻辑。
  - 设置写入排队锁：防止并发写入破坏 settings.json 文件。
  - 核心可配项：models、thinking、themes、compaction、packages 等。
- **不讲的问题**：项目设置被全局设置静默覆盖，或因高并发写入导致配置文件损坏。
- **落点源码**：[packages/coding-agent/src/core/settings-manager.ts#L166](/source-code/packages/coding-agent/src/core/settings-manager.ts#L166)。
- **图表与例程**：7级配置优先级金字塔图。
- **练习**：
  - *使用级*：通过 `/settings` 更改本地 UI 主题，验证 global settings.json 已持久化。
  - *原理级*：写一段代码验证 `SettingsManager.getMergedSettings()` 的深合并正确性。
  - *扩展级*：使用 `proper-lockfile` 为一个自定义配置文件编写带排队并发写入的 manager。

---

### 第 3 部分：掌握会话与记忆
*精通 Agent 记忆的本质：会话树（Session Tree）、状态持久化、长会话压缩及共享资产。*

#### 第 12 章：JSONL 会话文件格式
- **为什么讲**：Pi 不使用外部数据库。JSONL 是唯一的持久化数据库，它的记录格式是所有会话恢复与分支的前提。
- **必须讲**：
  - Append-only 会话文件：第 1 行是 Header，后续为 Entry。
  - Entry 多类型解析：`message`、`model_change`、`thinking_level_change`、`compaction`、`branch_summary`、`label`、`session_info`。
  - 关系连接：每个 Entry 通过 `id` 和 `parentId` 形成一个隐式的单向链表或多叉树。
- **不讲的问题**：将会话当成简单的 linear chat log，无法解释多分支文件是如何在一个 JSONL 里安全并存的。
- **落点源码**：[packages/agent/src/harness/session/jsonl-storage.ts#L20](/source-code/packages/agent/src/harness/session/jsonl-storage.ts#L20)、[packages/agent/src/harness/session/session.ts#L10](/source-code/packages/agent/src/harness/session/session.ts#L10)。
- **图表与例程**：JSONL 文件结构与实体多叉树模型对照图。
- **练习**：
  - *使用级*：手动打开 `~/.pi/agent/sessions/` 下的某个 jsonl 文件，阅读并写出其生命线。
  - *原理级*：实现一个极简的 JSONL 会话读取器，将多分支树重构成以 leafId 为起点的线性数组。
  - *扩展级*：向 JSONL 会话中追加自定义的 meta-data entry，并保证不破坏 SessionManager 的加载逻辑。

#### 第 13 章：分支、克隆与会话树导航
- **为什么讲**：Pi 支持多分支跳转。掌握 resume、continue、fork、clone、tree 的核心状态切换机制。
- **必须讲**：
  - 核心命令映射：`/resume`、`/fork`、`/clone`、`/tree` 在 TUI 与 CLI 上的底层行为。
  - In-file Branching vs Out-of-file Cloning 区别。
  - `AgentSessionRuntime` 生命周期绑定：切换/分叉会话时，如何优雅 teardown 并在新 cwd 重启所有绑定服务。
- **不讲的问题**：不理解多分支跳转，在复杂 Bug 修复时，总是从头新建会话，流失大量 Prompt Cache 余额。
- **落点源码**：[packages/coding-agent/src/core/agent-session-runtime.ts#L187](/source-code/packages/coding-agent/src/core/agent-session-runtime.ts#L187)、[packages/coding-agent/src/core/session-manager.ts#L500](/source-code/packages/coding-agent/src/core/session-manager.ts#L500)。
- **图表与例程**：分支跳转与 Runtime 重生生命周期状态图。
- **练习**：
  - *使用级*：通过 `/tree` 选择历史节点，进行分叉（`/fork`），并在新分支提交不同指令。
  - *原理级*：写出 `AgentSessionRuntime.fork()` 的完整数据流动步骤。
  - *扩展级*：通过 SDK 实现多分支克隆逻辑，并将分支输出重定向到两个并行测试管道中。

#### 第 14 章：上下文压缩与分支摘要生成
- **为什么讲**：大模型 Context 预算有限。长对话稳定性依赖四阶段压缩管道与增量提交日志。
- **必须讲**：
  - 上下文缓冲区预算：`reserveTokens` 与 `keepRecentTokens` 的边界算力。
  - Proactive Auto-compaction 触发：Stage 1 (Snip) -> Stage 2 (Microcompact) -> Stage 3 (Collapse) -> Stage 4 (LLM summary).
  - Reactive Recovery 413 处理：与 Proactive 机制的协作；连续压缩失败的 3 次熔断门限。
  - 摘要条目（Compaction Entry）的数据结构：Goal, Constraints, Decisions, File Mutations, preserved tail.
- **不讲的问题**：随着轮次增加，Token 突然溢出导致模型报错；或者压缩时误切断 `tool_use` 与 `tool_result` 破坏 JSON schema。
- **落点源码**：[packages/agent/src/harness/compaction/compaction.ts#L95](/source-code/packages/agent/src/harness/compaction/compaction.ts#L95)、[packages/coding-agent/src/core/compaction/compaction.ts#L120](/source-code/packages/coding-agent/src/core/compaction/compaction.ts#L120)。
- **图表与例程**：4 阶段压缩渐进降级管道逻辑图。
- **练习**：
  - *使用级*：在大长会话中手动运行 `/compact` 并指定压缩指令，观察 footer token 的变化。
  - *原理级*：画出 413 Prompt Too Long 发生时，Harness 启动 withheld 拦截并转入 Reactive Compact 的逻辑流。
  - *扩展级*：修改 `compaction.ts` 中的 Proactive Compaction 触发条件，使其在超出 80% Context Window 时强制微压缩。

#### 第 15 章：导出、分享与会话资产化
- **为什么讲**：会话不仅是历史，也是团队协作和模型微调/Evals 的核心资产。
- **必须讲**：
  - 导出命令 `/export`：HTML 静态渲染（含 ANSI 转义、代码高亮、主题）与 JSONL 原生轨迹。
  - 分享命令 `/share`：基于 GitHub CLI 发送 Gist 并生成 share viewer 路由。
  - `exportToHtml` 模板与 Vendor 依赖：静态文件的安全沙箱（XSS 过滤与 HTML 字符清洗）。
- **不讲的问题**：无法导出精美的代码审查轨迹；在公开网络分享时泄露本地敏感变量。
- **落点源码**：[packages/coding-agent/src/core/export-html/index.ts#L30](/source-code/packages/coding-agent/src/core/export-html/index.ts#L30)。
- **图表与例程**：会话分享的资产流向与 GitHub 交互图。
- **练习**：
  - *使用级*：运行 `/export html`，在浏览器中查看带有代码块渲染和折叠折叠的会话。
  - *原理级*：分析 HTML 模版渲染器是如何处理 ANSI 颜色控制字符并生成 CSS 彩色文本的。
  - *扩展级*：定制 HTML 模板，为导出的 TUI 界面添加公司的 UI 专属风格 CSS 主题。

---

### 第 4 部分：掌握资源与扩展系统
*进入“扩展阶段”：自定义 Prompt、封装核心 Skills、理解 Extension 运行时和 Package 供应链。*

#### 第 16 章：资源加载与解析优先级
- **为什么讲**：扩展、技能、快捷键和模板等资源，都由 DefaultResourceLoader 解析，需要搞懂谁覆盖了谁。
- **必须讲**：
  - `DefaultResourceLoader` 构造选项：cwd, agentDir, settings, noFlags。
  - 多维目录扫描与资源来源分类：Global, Project, CLI, Conventional packages.
  - 资源标识与命名冲突检测：`sourceInfo`、`scope`、`origin` 机制。
- **不讲的问题**：配置了多个扩展包或同名 prompt 时，出现覆盖冲突，排查不出来生效的到底是哪一个。
- **落点源码**：[packages/coding-agent/src/core/resource-loader.ts#L152](/source-code/packages/coding-agent/src/core/resource-loader.ts#L152)。
- **图表与例程**：ResourceLoader 路径扫描与资源树合并示意图。
- **练习**：
  - *使用级*：运行 `/reload` 并观察控制台输出的已加载 Prompt、Theme 与 Extensions 列表。
  - *原理级*：实现一个极简的 ResourceLoader，根据 scope 排优先级合并两个目录的文件。
  - *扩展级*：向 Loader 注入自定义资源扫描路径，使其支持从团队共享网络路径动态载入 themes。

#### 第 17 章：Prompt 模板系统
- **为什么讲**：最简单但最强大的用户自定义命令机制。掌握 markdown 前置 Frontmatter 与参数映射。
- **必须讲**：
  - Prompt Template 格式：Markdown 文件内容 + Frontmatter 元数据（描述、简写、参数提示）。
  - Slash 命令注册：如何根据文件名生成 TUI 控制台的 `/template` 命令。
  - 参数模板替换算法：`$1`、`$2`、`$@`（全参数）的展开机制。
- **不讲的问题**：由于缺乏 Frontmatter 配置，导致 TUI 输入栏无法对命令参数进行补全和语法验证。
- **落点源码**：[packages/agent/src/harness/prompt-templates.ts#L10](/source-code/packages/agent/src/harness/prompt-templates.ts#L10)、[packages/coding-agent/src/core/prompt-templates.ts#L20](/source-code/packages/coding-agent/src/core/prompt-templates.ts#L20)。
- **图表与例程**：Markdown 模板转换到 Slash Command 的解析状态图。
- **练习**：
  - *使用级*：在本地编写一个 `review-diff.md`，使用 `$1` 接收指定文件并对 diff 进行针对性 review。
  - *原理级*：分析 Harness 是如何解析 Frontmatter 的字段，并把描述绑定到 slash 命令元数据上的。
  - *扩展级*：重写参数解析逻辑，使其支持可选命名参数（如 `--mode=detail`）在 Markdown 内的条件替换。

#### 第 18 章：Agent 技能（Skills）
- **为什么讲**：Skills 是给模型注入的“业务操作手册”。掌握渐进式加载（Progressive Disclosure）的艺术。
- **必须讲**：
  - Skill 包组成：`SKILL.md`（行为指令）、运行脚本、固定资产与参考资料。
  - 自动发现：如何把技能简短的名称与描述，提前塞入 system prompt。
  - 按需展开（Progressive Disclosure）：为什么不在启动时把技能内容全部塞进 prompt，而只在模型调用 `/skill:name` 时才读取 `SKILL.md` 全文。
- **不讲的问题**：技能包设计不合理导致启动时 Prompt Context 撑满；或者模型不知道有此技能，无法主动触发。
- **落点源码**：[packages/agent/src/harness/skills.ts#L10](/source-code/packages/agent/src/harness/skills.ts#L10)、[packages/coding-agent/src/core/skills.ts#L20](/source-code/packages/coding-agent/src/core/skills.ts#L20)。
- **图表与例程**：Skill 的 Progressive Disclosure 生命周期时序图（Harness vs Model）。
- **练习**：
  - *使用级*：定义一个用于重构代码的 `refactor-guide` 技能，通过 `/skill:refactor-guide` 查看其内容。
  - *原理级*：分析 `skills.ts` 源码中 `getSkillPrompt()` 拼接逻辑，看它是如何注册到内置工具注册表的。
  - *扩展级*：开发一个带参数脚本的 Skill，让模型能够在加载它后，主动运行其附属的 python 代码。

#### 第 19 章：TypeScript 扩展系统（Extensions）
- **为什么讲**：最深层的扩展形态，具有修改运行时、拦截事件、增加命令和提供自定义 UI 的最高权能。
- **必须讲**：
  - Extension 定义：TypeScript 模块，默认导出工厂函数 `export default function(pi: ExtensionAPI): void | Promise<void>`。
  - `ExtensionAPI` 对象核心能力：注册 event handlers, tools, commands, shortcuts, flags, message renderers, providers。
  - 生命周期：同步/异步 Factory 执行；冷启动阶段 runtime 会 await 所有的异步工厂完成。
- **不讲的问题**：由于不了解工厂生命周期，导致扩展在初始化之前就去拦截未注册的事件，产生空指针异常。
- **落点源码**：[packages/coding-agent/src/core/extensions/types.ts#L100](/source-code/packages/coding-agent/src/core/extensions/types.ts#L100)、[packages/coding-agent/src/core/extensions/loader.ts#L200](/source-code/packages/coding-agent/src/core/extensions/loader.ts#L200)。
- **图表与例程**：扩展工厂加载与注入 `ExtensionAPI` 的流程图。
- **练习**：
  - *使用级*：在项目中编写一个最简 extension.ts，启动时向 REPL 输出一条欢迎语。
  - *原理级*：解释 Pi 如何通过 `runner.ts` 管理插件注册表并分发事件。
  - *扩展级*：编写一个具备异步加载配置功能的 Extensions 工厂，初始化阶段读取外部 API 以生成动态 Flags。

#### 第 20 章：扩展事件与运行时语义
- **为什么讲**：这是编写扩展的难点。需要精通观测性事件（Observational）与决策性事件（Result-producing）的区别。
- **必须讲**：
  - 27个生命周期事件族分类。
  - `context` transform、`before_provider_request`（前拦截）与 `tool_call`（中拦截）、`tool_result`（后修补）。
  - 中断保护：`session_shutdown` 前置事件如何取消后续异步循环。
  - 避免 Stale Runtime：会话切换后旧 runtime 销毁，扩展如何解除事件绑定，防内存泄漏。
- **不讲的问题**：写出时序错误的扩展，或在会话切换后，旧扩展事件仍强行控制新 runtime 的状态，导致崩溃。
- **落点源码**：[packages/coding-agent/src/core/extensions/runner.ts#L100](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L100)、[packages/coding-agent/src/core/extensions/types.ts#L300](/source-code/packages/coding-agent/src/core/extensions/types.ts#L300)。
- **图表与例程**：核心事件（Context -> Request -> Tool -> Result）的级联拦截与修改时序图。
- **练习**：
  - *使用级*：捕获 `message_added` 事件，过滤内容并在 Footer 展示提示。
  - *原理级*：分析 `before_provider_request` 是如何实现修改 LLM 提问参数而不改动 Session 历史的。
  - *扩展级*：开发一个安全门禁扩展，捕获 `tool_call` 并检测是否为 bash 命令，阻断任何带有 `rm -rf` 的工具执行。

#### 第 21 章：自定义工具与命令注册
- **为什么讲**：将外部系统（如 JIRA、数据库、内部微服务）打包成工具给 Agent 调用。
- **必须讲**：
  - `defineTool()` 接口定义：TypeBox schema 验证器，`execute()` 承诺，`onUpdate()` 进度回传。
  - 自定义命令 `registerCommand()`：注册 `/command`，解构 `commandContext` 以读取会话状态。
  - 自定义 CLI 标志 `registerFlag()` 拦截参数。
- **不讲的问题**：工具描述写得不准导致模型幻觉、参数格式验证不严格导致本地执行注入漏洞。
- **落点源码**：[packages/coding-agent/src/core/extensions/runner.ts#L500](/source-code/packages/coding-agent/src/core/extensions/runner.ts#L500)、[packages/coding-agent/src/core/tools/index.ts#L10](/source-code/packages/coding-agent/src/core/tools/index.ts#L10)。
- **图表与例程**：自定义工具的“参数校验 -> 进度汇报 -> 结果回灌”数据闭环图。
- **练习**：
  - *使用级*：实现一个 `/changelog` 自定义命令，打印指定分支的最近三条 commit。
  - *原理级*：解释模型是如何通过 System Prompt 感知到由 Extension 动态注册的自定义工具 Schema 的。
  - *扩展级*：使用 TypeBox 定义一个接收复杂嵌套 JSON 参数的工具，并在其 `execute` 中处理流式进度回传（`onUpdate`）。

#### 第 22 章：自定义 TUI 组件与主题定制
- **为什么讲**：前端开发最熟悉的强项。如何使用 `@earendil-works/pi-tui` 的组件式 API 编写终端视图。
- **必须讲**：
  - `Component` 基础生命周期：`render(width)` 返回字符矩阵，`handleInput(key)` 处理按键，`invalidate()` 主动重绘。
  - 双缓冲区与差量更新（Differential Rendering）工作原理。
  - UI 注入点：`setWidget()`、`setStatus()`、`setFooter()`、`confirm()` 覆盖。
  - 自定义主题 JSON 格式配置与 TUI Theme Hot Reload 刷新机制。
- **不讲的问题**：在终端手写 console.log 破坏 TUI 渲染缓冲，导致界面闪烁、字符重叠或乱码。
- **落点源码**：[packages/tui/src/tui.ts#L10](/source-code/packages/tui/src/tui.ts#L10)、[packages/tui/src/terminal.ts#L10](/source-code/packages/tui/src/terminal.ts#L10)、[packages/coding-agent/src/modes/interactive/theme/theme.ts#L10](/source-code/packages/coding-agent/src/modes/interactive/theme/theme.ts#L10)。
- **图表与例程**：TUI 树形组件渲染管道与差量更新示意图。
- **练习**：
  - *使用级*：定制一份自定义 `dark.json` 主题，修改 REPL 的 Message 背景色。
  - *原理级*：分析 `SelectList` 与 `Editor` 组件的键盘输入响应与焦点分配逻辑。
  - *扩展级*：编写一个自定义 Footer Widget，接收 `totalCostUSD` 变化事件并在 Footer 上用渐变条展示消耗。

#### 第 23 章：Pi Packages 分发与供应链 hardening
- **为什么讲**：团队生产力的标准化分发手段。需要懂得 Package 的加载协议与本地沙箱防御。
- **必须讲**：
  - Package 清单（Manifest）：`package.json` 中的 `pi` 字段约定（prompts, skills, extensions, themes 路径）。
  - 分发渠道解析：支持 git 链接、npm 包名、本地绝对/相对路径（`-l` / `--local` 覆盖）。
  - 安全原则：三方扩展的权限限制；`--ignore-scripts` 全生命周期加固；npm shrinkwrap 解析。
- **不讲的问题**：因为包路径解析不正确，导致团队成员在安装 package 后无法发现里面包含的 skills。
- **落点源码**：[packages/coding-agent/src/core/package-manager.ts#L20](/source-code/packages/coding-agent/src/core/package-manager.ts#L20)、[packages/coding-agent/src/package-manager-cli.ts#L10](/source-code/packages/coding-agent/src/package-manager-cli.ts#L10)。
- **图表与例程**：Pi Package 从安装到 ResourceLoader 自动发现资源的拓扑图。
- **练习**：
  - *使用级*：在本地创建一个 pi-package 项目，添加一个 custom theme，并使用 `pi package install -l` 本地挂载。
  - *原理级*：分析 `package-manager.ts` 是如何拉取 git repo 并将其元数据同步写入 `.pi/settings.json` 的。
  - *扩展级*：设计一个供应链审计脚本，解析 `npm-shrinkwrap.json`，拦截任何带有外部 preinstall 钩子的包。

---

### 第 5 部分：Provider、模型与 AI 层
*理解统一大模型客户端 `@earendil-works/pi-ai`，掌握自定义 API 协议、OAuth 设备流和跨 Provider 字段映射。*

#### 第 24 章：`pi-ai` 统一模型客户端设计
- **为什么讲**：屏蔽千差万别的 LLM API 协议（OpenAI, Anthropic, Bedrock）。掌握 Pi 对 Tool-use 接口的抽象包装。
- **必须讲**：
  - 核心接口 `Model` 元数据定义与 `api` 协议映射。
  - 统一流式客户端 `stream()` 与单次客户端 `complete()`。
  - 抽象输出事件规范化：`text`、`thinking`、`tool_call`、`done`、`error` 的跨云收束。
  - 模型上下文和成本字段估算器。
- **不讲的问题**：误以为 Pi 直接调用了官方 SDK，导致在接入本地推理网关时无法准确处理流式 Usage metrics。
- **落点源码**：[packages/ai/src/index.ts#L4](/source-code/packages/ai/src/index.ts#L4)、[packages/ai/src/types.ts#L10](/source-code/packages/ai/src/types.ts#L10)。
- **图表与例程**：`pi-ai` 统一事件包装器对多 Provider 原始流的标准化转换图。
- **练习**：
  - *使用级*：编写一段 ts 代码，导入 `@earendil-works/pi-ai` 并对某个模型进行流式提问。
  - *原理级*：解释当模型返回 thinking 块时，`pi-ai` 是如何从 Raw Event 中把 reasoning 从 text 里隔离出来的。
  - *扩展级*：在 `stream()` API 中增加一个耗时统计 hooks，实时输出 TTFT（首包延迟）指标。

#### 第 25 章：自定义模型与 Provider Overrides
- **为什么讲**：企业内部有自己的专有网关或 Ollama。掌握 models.json 的高级覆盖配置。
- **必须讲**：
  - `~/.pi/agent/models.json` 配置结构。
  - 作用域覆写：Provider 级 baseUrl/headers 与 Model 级单独覆写。
  - 字段兼容性映射（`compat`）：`supportsDeveloperRole`、`supportsReasoningEffort`、`supportsUsageInStreaming`、`maxTokensField`。
- **不讲的问题**：将本地模型接入后，因模型不支持 developer 角色或 `max_completion_tokens` 导致 API 报错 400。
- **落点源码**：[packages/coding-agent/src/core/model-registry.ts#L350](/source-code/packages/coding-agent/src/core/model-registry.ts#L350)、[packages/ai/src/providers/register-builtins.ts#L10](/source-code/packages/ai/src/providers/register-builtins.ts#L10)。
- **图表与例程**：内置模型元数据与 models.json 覆写后的运行时配置对比表。
- **练习**：
  - *使用级*：在本地通过 Docker 运行 Ollama，并在 `models.json` 中配置它为 custom provider。
  - *原理级*：分析 ModelRegistry 的 `refresh()` 是如何扫描并加载自定义 json 配置文件的。
  - *扩展级*：通过 compat 参数，覆写默认的 Anthropic 接口，使得其请求使用自定义的 headers 进行签名安全验证。

#### 第 26 章：Custom Providers 动态开发与 OAuth
- **为什么讲**：如果配置文件无法表达（如特殊的加密鉴权或完整的 OAuth 设备流授权），就必须通过代码注册 Provider。
- **必须讲**：
  - 扩展方法 `pi.registerProvider()`。
  - 自定义 `streamSimple()` 实现：如何从头包装一个私有 LLM 服务为 `AsyncGenerator`。
  - OAuth 鉴权生命周期：`getApiKey`、`refresh`、`login` 及其底层的设备代码流（Device Code Flow）。
- **不讲的问题**：无法将企业内部 SSO OAuth 系统接入 Pi，阻碍企业级私有化落地。
- **落点源码**：[packages/coding-agent/src/core/model-registry.ts#L790](/source-code/packages/coding-agent/src/core/model-registry.ts#L790)、[packages/ai/src/utils/oauth/index.ts#L10](/source-code/packages/ai/src/utils/oauth/index.ts#L10)。
- **图表与例程**：SSO OAuth 设备流验证授权状态转换图。
- **练习**：
  - *使用级*：通过 `/login github-copilot` 触发 OAuth 绑定。
  - *原理级*：阅读 `device-code.ts` 源码，解释设备代码轮询（Polling）的逻辑。
  - *扩展级*：通过 Extension 开发，向 ModelRegistry 注册一个完全自定义的 API Provider，模拟动态密钥拉取。

#### 第 27 章：跨 Provider Handoff、思考逻辑与 Prompt Cache
- **为什么讲**：模型能力不同，对 thinking block 的格式要求与 Prompt Cache 友好性也不同，需要做运行时翻译。
- **必须讲**：
  - Thinking Block 在不同 API 下的翻译机制：如何将 Anthropic `<thinking>` tags 正确转换并还原为其他模型的 Reasoning block。
  - Prompt Cache 命中的优化技巧：如何规划 `systemPrompt` 与 `history` Entry 的位置以强保 Cache Affinity。
  - Transport 链路优化：SSE（Server-Sent Events）与 WebSocket 协议在 API Client 侧的自动降级策略。
- **不讲的问题**：频繁跨 Provider 切换模型时，由于没有处理好 reasoning block，导致后续模型将前一个模型的思考记录当成普通 text 吞下，引发幻觉。
- **落点源码**：[packages/ai/src/providers/transform-messages.ts#L10](/source-code/packages/ai/src/providers/transform-messages.ts#L10)、[packages/ai/src/utils/overflow.ts#L10](/source-code/packages/ai/src/utils/overflow.ts#L10)。
- **图表与例程**：Thinking block 跨 Provider 转换映射图。
- **练习**：
  - *使用级*：开启 `--verbose`，观察请求响应时，Prompt Cache 的命中 Token 数和金额优惠。
  - *原理级*：分析 `transform-messages.ts` 源码，写出对 Assistant 消息中 thinking 字段剥离的正则表达式边界。
  - *扩展级*：编写一个 Extension 钩子，修改输出的 Message，把所有的 thinking 内容格式化并保存至外部 DB。

---

### 第 6 部分：程序化集成
*超越 CLI。让工程师能够把 Pi 嵌入到任何 Node.js 程序、跨语言系统、自动化管道或 Web 宿主中。*

#### 第 28 章：Agent SDK 编程基础
- **为什么讲**：当 CLI 交互不满足需求时，前端需要通过 Node SDK 在自己的应用中直接装配并操纵 AgentSession。
- **必须讲**：
  - SDK 入口函数：`createAgentSession()`。
  - 核心注入依赖：`AuthStorage`、`ModelRegistry`、`SessionManager` 的实例创建与挂载。
  - 内存会话（`inMemory()`）与持久化会话的区别与适用场景。
- **不讲的问题**：不理解 SDK 接口，用子进程拉起 CLI 进行频繁 API 交互，性能极差且极易阻塞。
- **落点源码**：[packages/coding-agent/src/core/sdk.ts#L100](/source-code/packages/coding-agent/src/core/sdk.ts#L100)。
- **图表与例程**：SDK 编排自定义 Agent 的装配拓扑图。
- **练习**：
  - *使用级*：运行 `packages/coding-agent/examples/` 下的 SDK 示例代码，输出一次 LLM 对话。
  - *原理级*：分析 `createAgentSession()` 内部是如何初始化 ResourceLoader 并将 global/project config 合并的。
  - *扩展级*：基于 SDK 编写一个 node 脚本，启动一个无 TUI 的 AgentSession，使其自动对当前目录进行 git diff review 并生成 commit。

#### 第 29 章：AgentSessionRuntime 与多会话宿主管理
- **为什么讲**：开发团队内部工具平台时，需要在一台服务器上，为不同工作空间（不同 Cwd）和多个会话进行动态调度。
- **必须讲**：
  - Runtime 隔离：多会话状态下的 `cwd-bound services` 绑定机制。
  - 切换与冷重生：`AgentSessionRuntime` 如何对 settings, resourceLoader 进行 shutdown 再 re-resolve。
  - 诊断信息（Diagnostics）收集与异常恢复。
- **不讲的问题**：在多租户/多目录会话管理中，由于没有做 Service 解绑，导致 A 项目的规则被 A 租户误写到了 B 项目的 settings 中。
- **落点源码**：[packages/coding-agent/src/core/agent-session-runtime.ts#L68](/source-code/packages/coding-agent/src/core/agent-session-runtime.ts#L68)、[packages/coding-agent/src/core/agent-session-services.ts#L100](/source-code/packages/coding-agent/src/core/agent-session-services.ts#L100)。
- **图表与例程**：多会话宿主（Multi-Session Host）与多个 Cwd-bound Services 实例隔离图。
- **练习**：
  - *使用级*：编写一个极简多会话切换脚本，轮流往 2 个不同 Cwd 的会话中写入不同 context 并取得分析。
  - *原理级*：追踪 `AgentSessionRuntime.switchSession()` 时，Loader 中扩展和主题的销毁生命周期。
  - *扩展级*：构建一个内存会话管理器，能根据会话热度自动将冷会话序列化至磁盘并销毁其内存中的 Service 实例。

#### 第 30 章：RPC 协议与跨语言集成
- **为什么讲**：Pi 不仅支持 JS，还能让 Python, Go, Rust 甚至 IDE Extension 进程通过标准 JSON-RPC 控制。
- **必须讲**：
  - RPC 调用标准：Stdin/Stdout JSONL framing，以 `\n` 结尾的请求响应语义。
  - 请求协议 Zod 结构：`Request`（method, params, id）与 `Response`（result, error, id）、`Event`（method, params）。
  - RPC 核心接口方法：`prompt`、`continue`、`abort`、`switch_session`、`register_tool`。
- **不讲的问题**：不了解 RPC 的 stdin/stdout 混合分帧机制，导致跨进程通信时数据粘包或解析死锁。
- **落点源码**：[packages/coding-agent/src/modes/rpc/rpc-mode.ts#L10](/source-code/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L10)、[packages/coding-agent/src/modes/rpc/rpc-client.ts#L10](/source-code/packages/coding-agent/src/modes/rpc/rpc-client.ts#L10)。
- **图表与例程**：外部 IDE 进程与 Pi RPC mode 进行会话交互的时序图。
- **练习**：
  - *使用级*：以 `pi --mode rpc` 启动 Pi，手动输入一条 json-rpc 初始协议并查看输出。
  - *原理级*：绘制 RPC 消息分帧器（JSONL framing）对 Stdin 数据切片的缓冲状态转移图。
  - *扩展级*：用 Python 或 Node.js 编写一个外部 RPC Client，通过 socket 或 stdin 操控 Pi 执行一个本地 edit 任务。

#### 第 31 章：JSON 事件流与自动化流水线
- **为什么讲**：在 CI/CD, Cron 任务中，机器需要解析结构化事件流来判定构建是否成功，或者对生成质量做自动化卡门。
- **必须讲**：
  - `pi --mode json` 输出协议。
  - 事件类型分发：`request_start`、`stream_event`（text, thinking, tool_call）、`message_added`、`diagnostics`。
  - Stdout 与 Stderr 洁净度：如何完全隔离调试日志，保证管道输出只有合法的 JSON。
- **不讲的问题**：CI 脚本解析 json 失败，原因是 bash 管道输出了非 JSON 的 ANSI 字符或警告信息污染。
- **落点源码**：[packages/coding-agent/src/modes/print-mode.ts#L50](/source-code/packages/coding-agent/src/modes/print-mode.ts#L50)、[packages/coding-agent/src/core/output-guard.ts#L10](/source-code/packages/coding-agent/src/core/output-guard.ts#L10)。
- **图表与例程**：JSON 事件流在自动化流水线中的路由与过滤逻辑图。
- **练习**：
  - *使用级*：运行 `pi --mode json -p "say test"`，解析控制台输出的 json array。
  - *原理级*：阅读 `output-guard.ts`，解释 Pi 是如何劫持 `process.stdout.write` 以保证没有垃圾信息污染 json 事件流的。
  - *扩展级*：开发一个 Github Action 脚本，通过 `pi --mode json` 执行只读代码审查，当 diagnostics 包含 error 时触发中断报错。

---

### 第 7 部分：安全、调试与协作
*进入“专家运维与开发阶段”，搞清楚如何防范恶意工具调用、定位跨层 Bug、调试复杂的终端环境以及向社区贡献代码。*

#### 第 32 章：本地执行型 Agent 的安全边界
- **为什么讲**：本地 Agent 拥有操作 Cwd 与运行 Bash 的特权，极易被恶意提示词攻击（Prompt Injection）导致文件损毁。
- **必须讲**：
  - 安全配置开关：`--tools` 参数白名单、`--no-tools`、`--no-builtin-tools`。
  - 凭证保护：`auth.json` 权限设为 `0600`；严防 API Key 泄露。
  - 供应链安全：三方 packages 及扩展的 preinstall lifecycle 拦截。
  - 为什么不内置权限确认弹窗：设计权衡——将最终安全屏障移交至沙箱（Docker / VM / gVisor）或 tmux。
- **不讲的问题**：运行了不受信任的开源 package，导致本地密钥或敏感代码被恶意 bash 工具悄悄上传。
- **落点源码**：[packages/coding-agent/src/core/auth-storage.ts#L112](/source-code/packages/coding-agent/src/core/auth-storage.ts#L112)、[packages/coding-agent/src/core/tools/bash.ts#L300](/source-code/packages/coding-agent/src/core/tools/bash.ts#L300)。
- **图表与例程**：恶性 Prompt 注入通过 Tool Execution 逃逸并在沙箱边界被拦截的网络流图。
- **练习**：
  - *使用级*：通过 `--no-tools` 限制 Pi 仅用于只读问答，无法执行任何本地修改。
  - *原理级*：分析 `auth-storage.ts` 是如何在 Windows/Mac/Linux 上对凭据文件应用最小权限修饰符的。
  - *扩展级*：使用 Docker 封装一个安全的 Pi 运行容器，限制其对宿主机目录的访问权限。

#### 第 33 章：系统调试与诊断体系
- **为什么讲**：当 Agent 行为不符合预期时，专家需要快速定位问题到底出在哪一层（TUI、Harness、Loop、Provider 还是 Tool）。
- **必须讲**：
  - 调试日志捕获：环境变量 `PI_TUI_WRITE_LOG` 的配置与 `pi-debug.log` 定位。
  - 命令与状态查询：`/session`、`/hotkeys`、`/changelog`。
  - settings 诊断错误栈的排查（`drainErrors()`）。
  - Provider 网络拦截与重试逻辑。
- **不讲的问题**：遇到报错只会重启 CLI 或清空配置，无法向平台反馈精确的故障 Entry 细节。
- **落点源码**：[packages/coding-agent/src/config.ts#L521](/source-code/packages/coding-agent/src/config.ts#L521)、[packages/coding-agent/src/core/diagnostics.ts#L10](/source-code/packages/coding-agent/src/core/diagnostics.ts#L10)。
- **图表与例程**：Pi 跨层错误诊断与排查树。
- **练习**：
  - *使用级*：在启动时附加调试日志输出，定位一次因 Extension 重名导致的加载冲突。
  - *原理级*：写出 `pi-debug.log` 的结构，并解释 stdout 劫持恢复的边界。
  - *扩展级*：编写一个扩展，向 settings-manager 注入自定义 diagnostic 验证规则，拦截格式非法的 user config。

#### 第 34 章：终端兼容性与环境治理
- **为什么讲**：Pi 作为纯 TUI 工具，高度依赖终端虚拟视口和键盘事件映射，不同平台会有各种适配深坑。
- **必须讲**：
  - 操作系统兼容：Windows 下 bash 路径缺失（Git Bash fallback）、IME 中文输入法光标漂移。
  - Tmux 视口控制：测试 interactive 模式的专属 tmux 状态快照与按键序列伪造。
  - 剪贴板管理：基于 native npm binding 的 Clipboard image (PNG/BMP) 提取与 resize 压缩。
- **不讲的问题**：在 Windows 上无法运行 bash 工具，或者在 tmux 容器下快捷键 Alt+Enter 完全失效。
- **落点源码**：[packages/tui/src/keybindings.ts#L10](/source-code/packages/tui/src/keybindings.ts#L10)、[packages/coding-agent/src/utils/clipboard-image.ts#L50](/source-code/packages/coding-agent/src/utils/clipboard-image.ts#L50)。
- **图表与例程**：IME 输入与 TUI 编辑器视图同步的字符重算过程图。
- **练习**：
  - *使用级*：在 tmux session 中测试运行 `pi-test.sh` 脚本，观察交互界面冷启动。
  - *原理级*：分析 `clipboard-image.ts` 是如何在 Windows/Darwin/Linux 下调用外部 binary 提取图像数据的。
  - *扩展级*：修改 `keybindings.ts`，为 Windows 用户额外绑定一组能够替代 Alt+Enter 的快捷键。

#### 第 35 章：本地开发与贡献
- **为什么讲**：如何向 Pi 官方 monorepo 提交贡献，并符合官方极度严苛的代码质量检验（DCE/erasable TS）。
- **必须讲**：
  - Monorepo 开发工作流：pnpm/npm workspaces，`npm run check`，`./test.sh`。
  - 单元与回归测试：faux provider 机制、`packages/coding-agent/test/suite/harness.ts`。
  - 编码限制：不使用 parameter properties/enum/namespace 等不满足 node strip-only 的 TypeScript 语法。
  - Changelog 与 Unreleased 版本锁步发布规范。
- **不讲的问题**：提了 PR 却因为包含 parameter properties、硬编码 key 绑定或 test suite 污染而被 Contributor Gate 无情拒绝。
- **落点源码**：`RULE[AGENTS.md]` 所有规范约束、`package.json` 中的构建脚本链。
- **图表与例程**：Pi Monorepo CI 构建与自动化测试门禁图。
- **练习**：
  - *使用级*：下载源码，运行 `npm run check` 观测项目静态检查通过。
  - *原理级*：分析 `harness.ts` 中的 mock LLM 机制，解释为什么测试无需真实 API Key 即可模拟 tool-call。
  - *扩展级*：在 `test/suite/regressions/` 下为 Pi 编写一个自定义回归测试文件，模拟模型遭遇 image resize 失败后的退出。

---

### 第 8 部分：专家级综合项目
*实战检验。通过四大极具含金量的实战项目，带领读者融会贯通整本书的知识体系。*

#### 第 36 章：从零实现一个极简 Pi-like Agent
- **为什么讲**：用最少代码复刻一个小内核 Loop，真正吃透 Agent loop 状态机的本质。
- **必须讲**：
  - 依赖：使用 `@earendil-works/pi-ai` 调用 Anthropic 接口。
  - 工具定义：基于 TypeBox 编写一个文件读写 tool schema。
  - 循环逻辑：处理 `tool_use`、调用工具、生成 `tool_result` 会话 Entry，并将结果重新 Feed 给模型，形成闭环。
- **落点源码**：[packages/coding-agent/src/core/sdk.ts#L200](/source-code/packages/coding-agent/src/core/sdk.ts#L200) 设计。
- **成果交付**：一个小于 150 行的单文件 Agent 执行器，支持流式渲染和自动工具循环。

#### 第 37 章：开发团队专属的工作流扩展包 (Pi Package)
- **为什么讲**：将所有资源（Extension, Skill, Prompt, Theme）集成并打包成分发文件。
- **必须讲**：
  - 封装一个包含特定业务逻辑的 custom tool（如查询团队 API 状态）。
  - 封装一个 markdown skill（如如何按照团队规范编写 CSS）。
  - 封装一个 prompt template 并绑定成命令。
- **落点源码**：[packages/coding-agent/src/core/package-manager.ts#L200](/source-code/packages/coding-agent/src/core/package-manager.ts#L200) 装载。
- **成果交付**：一个可发布至 private npm registry 或 git 仓的 `.tgz` 扩展包，团队一键 `pi package install` 即可就地升级开发流程。

#### 第 38 章：企业私有 AI 接入（自定义 Provider 扩展）
- **为什么讲**：打通最后一公里，将 Pi 接入到企业级专有 OAuth/SSO 鉴权网关。
- **必须讲**：
  - 实现基于特殊加密算法的请求签名机制。
  - 在 Extension 中实现 OAuth 设备码流并与 `AuthStorage` 结合持久化凭证。
- **落点源码**：[packages/coding-agent/src/core/model-registry.ts#L790](/source-code/packages/coding-agent/src/core/model-registry.ts#L790)。
- **成果交付**：一个 Provider 扩展，可供团队成员通过 `/login company-sso` 登录内部大模型网关，并支持 Prompt Cache 的动态配置。

#### 第 39 章：构建终端交互控制台 (Custom TUI Widget)
- **为什么讲**：为开发工程师定制极佳的 TUI 操作面板。
- **必须讲**：
  - 使用 `@earendil-works/pi-tui` 的组件基类，编写自定义 SelectList 和带有框线的加载动画器（BorderedLoader）。
  - 通过 extension hooks 拦截 `/jira` 命令，弹出自定义 UI，引导用户在终端可视化选择待开发的需求卡片。
- **落点源码**：[packages/tui/src/tui.ts#L100](/source-code/packages/tui/src/tui.ts#L100)。
- **成果交付**：一个炫酷的、可以在 TUI 中渲染的交互式卡片选择器，支持完全的键盘导航、回车确认、Esc 取消。

---

## 3. 专家级审计清单与验收标准

### 第 40 章：专家审计清单
作为本书最后一章，它提供了对读者“专家级水平”的硬性检验：

1. **机制追踪**：读者能否闭着眼睛画出：一次 prompt 输入，是如何在 CLI 中解析，在 `AgentSession` 里加载 settings 和 resources，在 System Prompt 里完成拼接，通过 `pi-ai` 标准化为 REST，在 `Agent` 循环中流式返回 `tool_use`，交由 `StreamingToolExecutor` 并行执行，并以 `tool_result` 写入 JSONL 链表，最后通过 `pi-tui` 的差量渲染呈现在终端 Footer 的？
2. **故障诊断**：读者能否在 3 分钟内准确定位并排除：
   - 环境变量与 `auth.json` key 冲突问题。
   - 跨 Provider 切换时 reasoning tokens 的丢失问题。
   - 会话 compaction 导致的上下文丢失与熔断。
   - 三方扩展在 Cwd 切换后的 Stale 内存泄露。
3. **安全把关**：在面临不安全的工作区（如含有恶性提示词攻击的文件）时，能否通过参数和沙箱隔离进行妥善防护？
4. **架构操刀**：能够熟练根据不同的工作流场景，在“最窄资源层”做出抉择（什么时候用 prompt template，什么时候用 skill，什么时候用 extension，什么时候微调模型）。
