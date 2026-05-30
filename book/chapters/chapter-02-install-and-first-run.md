# 2. 安装、启动与首次运行

## 2.1 真实世界的问题

很多开发者在尝试引入一个编码代理工具时，习惯于粗暴地通过全局安装并无阻碍地启动。然而，在真实的大型企业工程环境中，这种方式会引入极高频的安全与网络风险：
1. **凭证泄露与明文存储风险**：许多老旧的 CLI 工具会将 API 密钥直接保存在全局环境变量或明文配置文件中。如果多个项目间密钥混用，极易造成密钥越权泄露。
2. **静默自更新导致的供应链安全威胁**：许多代理框架为了“体验丝滑”会在后台默默更新二进制或扩展依赖。在受监管的工业级网络中，这不仅会因等待连接超时导致启动卡死，还会绕过团队的供应链静态扫描。
3. **Windows 平台的文件句柄锁定（DLL Lock）**：在 Windows 系统上，Node 加载 native 依赖后，系统锁定了相关的 `.node` 动态链接库，导致一旦进行 `npm install -g` 全局更新，就会抛出诡异的文件被锁定或权限拒绝错误（EBUSY）。

本章将详细讲解如何实施规范安全的安装流程，并在了解凭证隔离、离线设置及启动迁移机制的基础上，完成你的第一次无风险对话。

## 2.2 极简示例

在受管控的安全终端环境中，你应该始终通过以下最小安全命令安装并启动 Pi，以防止第三方脚本自动执行，并关闭不必要的网络检测：

```bash
# 使用 --ignore-scripts 排除 npm install 过程中的潜在恶意 lifecycle hooks
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 配置环境变量以强制使用离线模式，并跳过后台版本更新检测
$env:PI_OFFLINE="1"
$env:PI_SKIP_VERSION_CHECK="true"

# 安全启动交互模式
pi
```

## 2.3 源码结构与数据流

#### 2.3.1 全局状态目录树 (~/.pi/agent/)

Pi 的所有配置和运行时状态都保存在用户家目录的 `.pi/agent/` 文件夹下，形成以下清晰的物理层次结构：
- **`settings.json`**：全局偏好设置。记录了默认模型、思考参数上限（thinking budget）、主题样式以及启用的包列表。
- **`auth.json`**：统一的密钥凭证仓，权限为 600（即仅当前用户读写）。将各类 OAuth 令牌和 API Keys 从 settings 中抽离，实现凭证隔离。
- **`models.json`**：用户自定义的模型注册表，可声明本地 Ollama 模型、私有中转代理等。
- **`sessions/`**：持久化记忆库。内部根据项目工作目录的物理路径进行 base64 编码分层，保证不同项目的历史记录永不交叉。

#### 2.3.2 启动迁移系统（Migrations）

当用户升级 Pi 并首次运行新版本时，内核会调用 `runMigrations`，代码路径为 [migrations.ts#L305](packages/coding-agent/src/migrations.ts#L305)。它会自动调度以下子迁移器：
- **凭证迁移**：[migrations.ts#L21](packages/coding-agent/src/migrations.ts#L21) 的 `migrateAuthToAuthJson` 会检测是否存在老旧的 `oauth.json` 或 `settings.json` 内的 `apiKeys` 字段，将其提取后加密合并到安全的 `auth.json` 中，并将原文件重命名为 `.migrated`。
- **会话物理路径归档**：在 v0.30.0 之前的版本中，会话 JSONL 曾被粗暴地堆放在全局 `~/.pi/agent/` 目录下。这导致并发时读写极易崩溃。[migrations.ts#L84](packages/coding-agent/src/migrations.ts#L84) 的 `migrateSessionsFromAgentRoot` 能够读取历史会话里的 cwd 头部，自动创建项目子目录并分流迁移。

#### 2.3.3 Windows 自更新隔离（Quarantine）机制

Windows 开发者的最大痛点是升级 Pi 时遇到 native DLL 文件被 Node 锁定而引发的 EBUSY 崩溃。
Pi 的解决方案是利用隔离机制：
- **隔离装配**：[windows-self-update.ts#L62](packages/coding-agent/src/utils/windows-self-update.ts#L62) 的 `quarantineWindowsNativeDependencies` 函数会在启动更新前，通过 `process.report.getReport()` 检查正在被进程持有的 `.node` 动态库。
- **文件替换**：在 [windows-self-update.ts#L43](packages/coding-agent/src/utils/windows-self-update.ts#L43) 发现这些 native dll 后，它会将其物理重命名移入隔离区（Quarantine），然后在其原始位置留下一个干净的 DLL 副本。由于重命名操作在 Windows 上对于已打开的文件描述符是可行的，这样就释放了原始 DLL 的写锁定，从而允许 `npm install -g` 顺利写入新文件而不报冲突。

#### 2.3.4 启动环境变量

Pi 支持以下高级启动开关，用于完全控制其启动链路：
- **`PI_OFFLINE`**：如果为 `1`，则禁止一切网络握手。包括禁用版本检查、禁止下载在线 package 包，强制只从本地 models.json 与 auth.json 读取可用信息。
- **`PI_SKIP_VERSION_CHECK`**：跳过对 npm registry 的当前最新发布版版本拉取。可以显著降低弱网开发环境下的首轮启动卡顿。
- **`PI_ALLOW_LOCKFILE_CHANGE`**：若为 `1`，允许代理在修改依赖时连带更新 package-lock.json。

## 2.4 设计考量与折衷

#### 2.4.1 为什么要强推 `--ignore-scripts` 安全策略？

由于 Pi 会被全局安装并用于处理商业级代码，防止安全供应链污染（Supply Chain Attack）是最高优先级。许多 npm 依赖被投毒后，会在安装过程的 postinstall 阶段静默拉取远程后门。强推 `--ignore-scripts` 是一条不打折的技术安全线。

#### 2.4.2 运行状态与工作区的隔离原则

为什么不把 `settings.json` 或 `auth.json` 自动写入你正在开发的当前项目根目录？
因为工作区是**共享**且可能被模型直接改写的，而配置是**个人私有且高度安全敏感**的。将运行时偏好隔离在用户家目录下的 `~/.pi` 里，能防止模型在自主执行修改时，误删或窃取到其他项目的配置及认证信息。

## 2.5 常见误区与排错

#### 2.5.1 误区一：Windows 全局更新时因 native dll 报错导致安装一半崩溃
* **排错诊断**：当你在全局更新中遭遇 `better-sqlite3` 锁定错误，这说明有另一个隐蔽的 Pi 终端窗口或子进程仍在后台运行。请确保关闭所有挂起的终端进程，必要时检查任务管理器，精确停止占用 DLL 的 Node.js 进程后再进行更新（**注意：绝对不能使用广谱杀进程命令，防止意外终止当前的会话宿主**）。

#### 2.5.2 误区二：在离线或弱网模式下启动 Pi 极其缓慢
* **排错诊断**：Pi 在启动交互模式时，默认会发起一次异步请求检测 npm 仓库版本。如果网络受限或开启了局域网代理，这个检测可能会悬起并阻塞主渲染循环多达数秒。此时只需将系统环境变量 `PI_SKIP_VERSION_CHECK` 设置为 `true` 即可立刻解决首屏延迟。

#### 2.5.3 误区三：认为 auth.json 可以用其他脚本多进程并发无锁覆写
* **事实**：为了防止多个并行的 Pi 实例在刷新 OAuth Token 或更新 API Key 时破坏文件完整性，Pi 内置了 `proper-lockfile` 锁保护。外部自动化脚本若要更新凭证，必须遵循并发锁机制，不可强行以写覆盖的方式操作 `auth.json`。

## 2.6 练习题

#### 2.6.1 基础使用题
开启 Windows PowerShell 或是你的 Linux 终端，配置全局环境变量 `PI_OFFLINE=1`。随后安全启动 Pi，仔细观察 startup header（启动头部）中关于网络状态与自更新功能的提示信息有什么具体改变。

#### 2.6.2 原理分析题
深入阅读 `packages/coding-agent/src/migrations.ts`，找出并解释老旧的会话（Sessions）文件是如何通过迁移器检测到遗留的 cwd 并顺利转移到对应项目子目录的。如果会话文件损坏（非 JSON 格式），迁移器会如何处理？

#### 2.6.3 扩展实践题
编写一个命令行 Benchmark 脚本，使用 `performance.now()` 计算并比对在设置环境变量 `PI_SKIP_VERSION_CHECK=true` 前后，调用 `pi --version` 命令的耗时差距，以量化跳过网络更新检查带来的启动性能提升。
