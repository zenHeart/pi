# 第20章 部署与运维

## 20.1 pi 的部署形态

pi 是本地 CLI。常见部署不是把它变成服务，而是通过 npm/curl/bun 等方式安装，在本地项目目录运行，读取本地配置和 credentials。服务化 agent 是另一个产品形态，需要重新设计 workspace、sandbox、credential broker、quota、audit log。

## 20.2 安装安全

仓库开发规则强调 supply-chain hardening：依赖 pinned，安装用 `--ignore-scripts`，CI 用 `npm ci --ignore-scripts`，发布包带 shrinkwrap。对 agent 产品来说，这不是附加要求。extensions 和 packages 能执行本地代码，依赖链就是安全边界。

复刻时要把 npm dependency、package install、extension load 都当作代码执行风险。

## 20.3 配置目录

pi 默认使用 `~/.pi/agent`，可通过环境变量覆盖配置、session、package 目录。项目级 `.pi` 可以覆盖资源和 settings。settings manager 负责全局和项目 settings 的加载、迁移和写入，相关读写逻辑从 [settings-manager.ts#L308](/source-code/packages/coding-agent/src/core/settings-manager.ts#L308) 开始。

运维上要回答：

- 配置放哪里。
- credentials 如何存储和刷新。
- session 如何清理和备份。
- packages 如何升级。
- offline 模式如何工作。
- telemetry/update check 是否可关闭。

usage docs 还覆盖了平台配置细节：Windows 上需要可用的 bash 环境；Termux 需要移动端终端兼容配置；tmux 中某些组合键依赖 `csi-u`；terminal-setup 文档解释了 Shift+Enter、Ctrl+Enter、Alt+Enter 在不同 terminal 里的差异。运维文档必须写这些，因为 pi 的交互质量依赖 terminal input，而不是只依赖 Node.js 运行时。

复刻时建议把平台要求分成三层：

- 必需：Node/Bun 运行时、可写配置目录、可执行 shell、provider credential。
- 推荐：支持 bracketed paste、多行输入、图片协议、现代 key encoding 的终端。
- 可选：tmux 配置、外部编辑器、shell alias、团队共享 `.pi`。

这样用户遇到快捷键或 shell 问题时，能判断是 agent 逻辑、终端兼容还是本地环境问题。

## 20.4 Providers 运维

provider 运维包括 API key、OAuth、cloud provider、custom models、models.json、proxy、retry、rate limit。`ModelRegistry` 负责加载 built-in 和 custom models，见 [model-registry.ts#L384](/source-code/packages/coding-agent/src/core/model-registry.ts#L384)；请求 auth 解析在 [model-registry.ts#L685](/source-code/packages/coding-agent/src/core/model-registry.ts#L685)。

生产环境不要把 key 写进 prompt 或日志。auth storage、环境变量、models.json command resolver、OAuth refresh 都应该有明确优先级。

## 20.5 本地、团队与服务化

个人 CLI：简单安装、透明配置、session 可导出、工具直接操作本地 repo。

团队 CLI：统一 context files、共享 packages、审计 extensions、限制工具、标准化 provider、固定检查命令。

服务化 agent：隔离 workspace、远程 shell、credential broker、job queue、quota、audit、artifact storage、multi-tenant auth。这个形态不能直接复用本地 CLI 的安全假设。

## 20.6 复刻原则

MVP：npm package、config dir、auth file、session dir、basic update story。

生产级：lockfile/shrinkwrap、ignore scripts、package trust policy、offline mode、config migration、credential refresh、provider retry cap、workspace isolation、ops docs。
