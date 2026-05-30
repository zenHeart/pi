# 31. 本地执行型 Agent 的安全边界

## 31.1 本章解决的问题

Pi 是本地执行型 Agent。它拥有读写当前工作目录的完整权限，并可以执行任意 bash 命令。这意味着它同时也是一个潜在的攻击面：被注入恶意提示词的文件、伪装成"任务配置"的第三方扩展包、含有副作用的 skills，都可能通过 Pi 的工具层操作宿主机文件系统或网络。

本章澄清 Pi 的安全设计哲学：**最终安全屏障不在 Pi 内部，而在沙箱层**。Pi 的内置安全机制负责凭证保护和工具限制，但不提供交互式权限确认弹窗——这是有意为之的设计权衡，而不是缺陷。

## 31.2 最小可运行路径

通过 CLI 参数限制工具访问：

```bash
# 禁用所有工具（只读问答模式）
pi --no-tools -p "解释这段代码"

# 禁用内置工具（read/bash/edit/write），保留扩展工具
pi --no-builtin-tools

# 白名单：只允许 read 工具
pi --tools read -p "分析 src/index.ts"
```

这三个参数直接映射到 `createAgentSession()` 的 `noTools` 和 `tools` 选项。

## 31.3 核心机制

#### 工具白名单与禁用逻辑

`createAgentSession()` 在 [`sdk.ts#L280`](packages/coding-agent/src/core/sdk.ts#L280) 中处理工具过滤：

```typescript
const defaultActiveToolNames: ToolName[] = ["read", "bash", "edit", "write"];
const allowedToolNames = options.tools ?? (options.noTools === "all" ? [] : undefined);
const initialActiveToolNames: string[] = options.tools
  ? [...options.tools]
  : options.noTools
    ? []
    : defaultActiveToolNames;
```

CLI 层（[`main.ts#L370`](packages/coding-agent/src/main.ts#L370)）将命令行参数转换为此选项：

```typescript
if (parsed.noTools) {
  options.noTools = "all";
} else if (parsed.noBuiltinTools) {
  options.noTools = "builtin";
}
if (parsed.tools) {
  options.tools = [...parsed.tools];
}
```

`noTools: "all"` 和 `noTools: "builtin"` 的语义差异：前者关闭包括扩展工具在内的全部工具，后者只关闭 `read/bash/edit/write` 四个内置工具，保留来自扩展的自定义工具。

#### auth.json 凭证保护

[`auth-storage.ts`](packages/coding-agent/src/core/auth-storage.ts#L53) 中的 `FileAuthStorageBackend` 在创建文件时强制设置 `0600` 权限（仅所有者可读写）：

```typescript
// auth-storage.ts#L70
writeFileSync(this.authPath, "{}", "utf-8");
chmodSync(this.authPath, 0o600);
```

每次写入凭证后也重新应用权限：

```typescript
// auth-storage.ts#L112
writeFileSync(this.authPath, next, "utf-8");
chmodSync(this.authPath, 0o600);
```

此外，`AuthStorage` 支持多种凭证来源，优先级依次为：CLI 运行时 `--api-key` > `auth.json` 中的持久化凭证 > OAuth token（自动刷新，带文件锁防竞态）> 环境变量 > `models.json` 中的 fallback resolver。

#### 供应链安全：`--ignore-scripts`

Pi 官方安装指南要求 `npm install -g --ignore-scripts`，以阻断 npm 包的 `preinstall`/`postinstall` 生命周期脚本。这是因为第三方 Pi packages 同样通过 npm 安装，运行 install scripts 可能在安装时就执行任意代码，而不是等到 Pi 实际加载扩展时。

AGENTS.md 中规定：扩展 packages 的 lifecycle scripts 需要显式审查并加入 shrinkwrap allowlist；没有审查就决不能静默添加。

#### 为什么不内置权限确认弹窗

Pi 的设计文档明确说明：不内置"是否允许此操作"的确认弹窗，是因为：

1. **弹窗可被提示词操纵**：如果模型可以生成弹窗文本，它也可以生成诱导用户点击"确认"的措辞。
2. **真实安全边界在沙箱**：Docker、gVisor、tmux 沙箱能从内核层隔离文件系统和网络访问，这远比应用层弹窗可靠。
3. **工具白名单已是应用层最有效的防御**：通过 `--tools read` 限制到只读工具，在应用层实现了最实用的安全控制。

#### bash 工具的工作目录检查

[`bash.ts`](packages/coding-agent/src/core/tools/bash.ts#L66) 在执行命令前，会验证工作目录是否存在：

```typescript
try {
  await fsAccess(cwd, constants.F_OK);
} catch {
  throw new Error(`Working directory does not exist: ${cwd}\nCannot execute bash commands.`);
}
```

这防止了 Agent 在 cwd 被删除后继续以错误的上下文执行命令。

## 31.4 为什么这样设计

#### 凭证分层保护

凭证优先级链的设计，是为了满足不同部署场景：

- CI 环境：只用环境变量，不存储 `auth.json`
- 开发者本机：`auth.json` 持久化，多实例共用同一文件（通过文件锁防竞态）
- 企业集成：通过 fallback resolver 接入 OAuth 网关

任何层级都可以单独使用，而不需要改动 Pi 核心代码。

#### 没有中央沙箱的理由

Pi 作为本地工具，不对运行环境做假设。它不知道自己是在 Docker 内、tmux 中还是裸机上。统一的内置沙箱会带来平台兼容性问题（Windows 上无法使用 Linux namespace），也会给合法的需求（如 Agent 需要修改 cwd 以外的文件）设置障碍。把安全责任交给部署层，是更灵活且可靠的架构选择。

## 31.5 常见误解与排查

**误解：Pi 的 bash 工具会自动限制危险命令。** 不正确。bash 工具执行模型请求的任何 shell 命令，没有预置的命令黑名单。安全控制在工具白名单层（`--no-tools`/`--tools`），而不在命令层。

**误解：设置了 `--no-tools` 后 Agent 就无法读文件。** `--no-tools` 关闭的是工具调用，但模型可以在提示词中请求用户手动提供文件内容（通过 `@file` 语法）。完整的只读限制需要配合 `--no-tools` 加上不传入任何文件引用。

**排查步骤：**
1. 确认 `auth.json` 权限为 `0600`：`ls -la ~/.pi/agent/auth.json`
2. 环境变量 API key 冲突时，优先检查 `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` 等变量是否覆盖了 `auth.json`
3. 扩展加载异常时，检查 `diagnostics` 中是否有来自 `ResourceLoader` 的安全警告

## 31.6 本章训练

#### 使用级训练

用 `--tools read` 运行 Pi 对一个文件进行分析，然后在同一 cwd 下尝试用默认设置让 Agent 写入文件，对比两次行为的差异，说明工具白名单的实际效果。

#### 原理级训练

阅读 [`auth-storage.ts`](packages/coding-agent/src/core/auth-storage.ts#L407) 的 `refreshOAuthTokenWithLock()` 方法，解释为什么 OAuth token 刷新需要文件锁，以及在多个 Pi 实例同时刷新时锁是如何防止 token 文件损坏的。

#### 扩展级训练

编写一个 Docker Compose 文件，将 Pi 运行在仅挂载目标仓库目录（而不是整个 `~`）的容器中，并设置 `--tools read` 使其只能读取文件。验证 Agent 无法修改宿主机上的文件，并说明该方案相比 `--no-tools` 提供的额外安全层级。

专家级验收标准：能解释 Pi 的三层安全机制（工具白名单、凭证文件保护、部署层沙箱）各自覆盖的威胁模型，并能说明为什么不添加运行时确认弹窗是一个理性设计决策而不是疏漏。
