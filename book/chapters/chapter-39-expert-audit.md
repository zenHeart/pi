# 39. 专家级精通：自我验收与知识体系总结

## 39.1 本章解决的问题

一本技术书的最终价值取决于读者能否独立行动。本章不提供新的技术内容，而是提供一套基于本书全部知识的自我验收框架：5 个场景，每个场景要求调用 3-5 章的知识才能完成。能独立通过这 5 个场景，意味着你已经达到使用和扩展 Pi 的专家级水平。

## 39.2 本书知识体系的结构回顾

全书 40 章分为 5 个层次，层层叠加：

```
层次一（第 00-05 章）：安装与初次运行
  → 理解 Pi 的工具接口和基本使用模式

层次二（第 06-14 章）：核心功能精通
  → 掌握会话管理、上下文窗口、多 provider、思考模式、多媒体

层次三（第 15-24 章）：资源与定制系统
  → 掌握 Skills、Prompts、Extensions、Packages

层次四（第 25-33 章）：架构原理
  → 理解 Agent Loop、SDK、RPC、JSON 事件流、安全边界、调试

层次五（第 34-39 章）：创造与贡献
  → 能从零创建 Agent、扩展包、自定义 Provider 和 TUI 组件
```

这个结构是有意为之的：没有理解 Agent Loop（第 25 章）就无法写好 Extension（第 16-22 章），没有理解 Session 持久化（第 07 章）就无法理解 compaction（第 11 章）的必要性。

## 39.3 五项专家级验收场景

#### 场景一：构建并验证 CI 集成

**目标**：搭建一个 CI 检查，在 PR 提交后自动让 Pi 扫描改动文件，输出代码质量报告，并在发现问题时使流水线失败。

**需要调用的知识**：
- 第 04 章：`-p` 和 `--mode json` 的使用
- 第 30 章：JSON 事件流的消费与 `stopReason` 检测
- 第 31 章：`--tools read` 安全边界配置
- 第 06 章：`@file` 语法在非交互模式的应用

**验收标准**：
1. 命令行参数正确（`--mode json --tools read`）
2. 使用 Node.js 脚本逐行解析事件流，而非只读最后一行
3. `stopReason: "error"` 时以非零码退出
4. 能在 diff 超过上下文窗口时自动分批提交（理解 truncation）

**自检问题**：为什么不能用 `-p` 替代 `--mode json`？bash 工具在 `--tools read` 时是否还可用？

---

#### 场景二：从零开发并发布一个扩展包

**目标**：开发一个包含自定义工具、skill 和 prompt template 的 Pi Package，发布到 npm（或本地路径），团队成员一键安装后立即可用。

**需要调用的知识**：
- 第 16 章：Extension 的 `ExtensionFactory` 接口
- 第 17 章：Skills 的 SKILL.md 格式
- 第 18-19 章：Extension 事件系统（`before_provider_request`）
- 第 22-23 章：Package 的 `pi` manifest 和 `peerDependencies` 规范
- 第 36 章：Package 的安装分发流程

**验收标准**：
1. 扩展工具使用 TypeBox 定义输入 schema
2. Skill 包含正确的 frontmatter（name, description, glob triggers）
3. `package.json` 中 Pi 核心包在 `peerDependencies`，第三方依赖在 `dependencies`
4. 本地安装（`pi install ./pkg`）后扩展正常加载，`/reload` 不报冲突

**自检问题**：如果 skill 触发条件和内置 bash 工具的使用场景重叠，如何设计 glob 触发条件避免干扰？

---

#### 场景三：通过 SDK 集成 Pi 到内部工具

**目标**：把 Pi 的 Agent 能力嵌入一个现有的 TypeScript Node.js 内部工具（如代码审查脚本），使其可以调用 Pi 的完整工具集，并监听 Agent 的执行事件。

**需要调用的知识**：
- 第 26 章：`createAgentSession()` 的参数和返回值
- 第 27 章：`AgentSession.run()` 的调用方式和会话持久化
- 第 28 章：`session.subscribe()` 事件监听
- 第 31 章：`noTools`/`tools` 选项的工具限制
- 第 34 章：`faux provider` 的测试隔离策略（如何为该集成编写测试）

**验收标准**：
1. 使用 `SessionManager.inMemory()` 或基于文件的 session manager
2. 订阅事件流，至少处理 `tool_execution_result` 和错误事件
3. 在测试文件中用 `createHarness()` 和 faux provider 模拟完整流程，不消耗真实 token
4. 能说明为什么 SDK 集成不需要也不应该调用 `--mode json`

---

#### 场景四：为企业私有 AI 接入完整 OAuth 认证流

**目标**：为企业 SSO（支持设备码流）编写一个 Pi Extension，支持 `/login`、token 持久化、token 过期自动刷新，以及根据 OAuth 响应动态更新模型 endpoint。

**需要调用的知识**：
- 第 37 章：`registerProvider()` 的 `oauth` 选项
- 第 10 章：OAuth 凭证管理的用户视角
- 第 31 章：`auth.json` 的文件锁和凭证保护机制
- 第 32 章：调试 auth 相关问题的排查路径

**验收标准**：
1. `oauth.login()` 实现设备码流（发起设备码请求 → 显示 user_code → 轮询 token）
2. `oauth.getApiKey()` 从 OAuth credentials 中提取 access token
3. `oauth.modifyModels()` 根据 token 响应中的 gateway URL 更新模型 baseUrl
4. token 刷新失败时能给用户明确的错误提示（通过 `context.ui.notify()`）

---

#### 场景五：调试并修复一个扩展的命名冲突问题

**目标**：团队扩展包 A 和 B 都注册了名为 `codereview` 的 skill，Pi 静默使用了其中一个。要求：找出是哪个 skill 被使用了，为什么，以及如何在不卸载任何包的情况下解决冲突。

**需要调用的知识**：
- 第 32 章：`ResourceDiagnostic` 的 `collision` 类型
- 第 23 章：包的 deduplication 和 identity 判定规则
- 第 22 章：Package 过滤配置（settings.json 中的 `packages[].skills`）
- 第 16 章：Extension 的命名空间规范

**验收标准**：
1. 能说出 `winnerPath` 和 `loserPath` 的决定规则（全局/项目 scope 优先级）
2. 不卸载任何包：用 settings.json 的 `packages[].skills: []` 禁用冲突方的 codereview skill
3. 用 `/reload` 验证冲突消失，两个包的其他资源仍然正常加载
4. 给团队提出长期方案：命名规范（如 `pkgname.codereview`）和 `pi config` 的使用

## 39.4 核心知识图谱

```
                    ┌─────────────────────────────┐
                    │        Agent Loop            │
                    │   (packages/agent-core)      │
                    │                              │
                    │  User Msg → LLM → tool_use  │
                    │       ↑              ↓       │
                    │  tool_result ← tool exec    │
                    └──────────┬──────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
   ┌─────────────┐    ┌──────────────┐    ┌──────────────┐
   │  AgentSession│    │   Tools      │    │  Extensions  │
   │  (sdk.ts)   │    │ bash/read/   │    │  event bus   │
   │  subscribe()│    │ edit/write   │    │  custom tools│
   └──────┬──────┘    └──────────────┘    └──────────────┘
          │
     ┌────┴──────────────────┐
     │                       │
     ▼                       ▼
┌─────────┐          ┌──────────────────┐
│ TUI Mode │          │  Print/RPC Mode  │
│(interact)│          │ (json/rpc/text)  │
└─────────┘          └──────────────────┘
```

## 39.5 从"使用者"到"贡献者"的思维跃迁

前 34 章建立使用者视角：Pi 是工具，你是用户。后 5 章建立贡献者视角：Pi 是平台，你是构建者。这两种视角的转换标志着真正的专家水平：

| 使用者问题 | 贡献者问题 |
|---|---|
| "这个功能怎么用？" | "这个功能的 API 是否满足我的使用场景？" |
| "为什么不支持 X？" | "X 应该在扩展层还是核心层实现？" |
| "Pi 哪里有 bug？" | "这是 Pi 的 bug，还是我的 extension 的问题？" |
| "如何配置才能支持场景 Y？" | "我应该写 skill、extension 还是 package？" |

## 39.6 精进路线

**下一步行动（按优先级）：**

1. **完成 5 个验收场景** — 这是本书的最高优先级，没有捷径
2. **阅读 AGENTS.md 的 Contributing 部分** — 理解 Pi 的设计哲学和代码规范
3. **研究 `packages/coding-agent/test/suite/` 下的所有测试** — 最好的实际案例集
4. **关注 Pi 的 CHANGELOG** — 了解哪些 API 在演进，哪些设计已经稳定
5. **为 Pi 提交一个修复或功能** — 贡献真实 PR 是验证理解的最终手段

**专家特征：**

真正的 Pi 专家在面对新需求时，会首先判断：这属于 skill（提示词工程）、prompt template（模板化）、extension（程序逻辑）还是 package（分发和复用）？这种分类判断本身就是专业知识的核心体现。

能快速判断使用哪一层，说明你已经内化了 Pi 的整体架构思维，而不仅仅是记住了一系列命令和 API。

这是本书的终点，也是你作为 Pi 专家真正旅程的起点。
