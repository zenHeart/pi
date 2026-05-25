# 1. 安装、认证与第一次运行

## 1. 本章解决的问题

第一次运行 pi 要解决四件事：可执行文件在哪里，配置写到哪里，provider credential 怎么解析，默认进入哪种 mode。入口在 [main.ts#L424](/source-code/packages/coding-agent/src/main.ts#L424)，参数解析在 [args.ts#L59](/source-code/packages/coding-agent/src/cli/args.ts#L59)，mode 选择在 [main.ts#L99](/source-code/packages/coding-agent/src/main.ts#L99)。

对新手来说，安装成功不等于能工作。你还需要确认当前目录正确、模型可用、认证可用、session 可写。对创造者来说，第一次运行是所有边界第一次汇合：CLI、auth、model registry、resource loader、system prompt、session manager、TUI 或 print runner。

## 1. 安装与配置目录

pi 通过 npm 包分发，quickstart 推荐：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

`--ignore-scripts` 的意义是安装时不运行依赖生命周期脚本。pi 正常 npm 安装不需要 install script。卸载 CLI 不会删除 `~/.pi/agent/` 下的 settings、credentials、sessions 和已安装 pi packages，这样你的历史会话和配置不会因为换版本而丢失。

第一次启动建议按顺序做：

```bash
pi --help
pi --version
pi --list-models
pi
```

如果你只想问一次并退出，用 print mode：

```bash
pi -p "Say exactly: ok"
```

`-p` 和 `--print` 在参数解析层设置 print mode，见 [args.ts#L123](/source-code/packages/coding-agent/src/cli/args.ts#L123)。如果 stdin 不是 TTY，pi 也会进入 print 路径，mode 判断见 [main.ts#L99](/source-code/packages/coding-agent/src/main.ts#L99)。

## 1. 认证优先级

认证不应该写进 prompt。`AuthStorage` 从 [auth-storage.ts#L196](/source-code/packages/coding-agent/src/core/auth-storage.ts#L196) 开始管理 `auth.json`、环境变量、runtime override 和 OAuth refresh。auth file 首次创建时会设置为 `0600` 权限，见 [auth-storage.ts#L70](/source-code/packages/coding-agent/src/core/auth-storage.ts#L70)。

实际 API key 解析优先级写在 [auth-storage.ts#L455](/source-code/packages/coding-agent/src/core/auth-storage.ts#L455)：CLI `--api-key` runtime override、auth file API key、auth file OAuth token、环境变量、fallback resolver。`--api-key` 只在已经能解析出目标 model 时生效，否则 pi 不知道这个 key 应该绑定到哪个 provider，相关检查在 [main.ts#L579](/source-code/packages/coding-agent/src/main.ts#L579)。

subscription login 通过 `/login` 写入 OAuth credential；API key 可以来自环境变量，也可以通过 `/login` 存到 `~/.pi/agent/auth.json`。多进程同时刷新 OAuth token 时，auth storage 使用文件锁保护写入，异步锁路径在 [auth-storage.ts#L122](/source-code/packages/coding-agent/src/core/auth-storage.ts#L122) 和 [auth-storage.ts#L415](/source-code/packages/coding-agent/src/core/auth-storage.ts#L415)。

## 1. 第一次成功运行标准

不要只看“模型回了一句话”。第一次成功运行至少确认这些点：

1. `pi --list-models` 能看到目标 provider/model。
2. `pi -p "Say exactly: ok"` 能完成一次无工具请求。
3. `pi` 能打开 interactive mode，底部能看到当前 cwd、model 和 context 使用情况。
4. 运行目录是你想让 pi 工作的项目目录。
5. `AGENTS.md` 或 `CLAUDE.md` 规则能被启动时加载。
6. session 能保存，后续可用 `pi -c`、`pi -r` 或 `--session` 恢复。

system prompt 会把当前日期和工作目录追加进去，见 [system-prompt.ts#L171](/source-code/packages/coding-agent/src/core/system-prompt.ts#L171)。这解释了为什么“从错误目录启动 pi”会让模型理解错项目边界。

## 1. 常见失败边界

认证失败属于 auth/provider 层，不是 agent loop 错误。模型不存在属于 model resolver 或 model registry 问题。`AGENTS.md` 没生效通常是 cwd 或 `--no-context-files` 问题。快捷键失效属于 terminal setup 问题。shell 命令失败属于本地环境问题。

新手排查顺序建议固定：先 `pi --version`，再 `pi --list-models`，再 `pi -p "Say exactly: ok"`，最后进入 interactive mode。这样可以把安装、认证、provider、TUI 四类问题拆开。

## 1. 进一步阅读

继续读 `packages/coding-agent/docs/quickstart.md` 的 Install、Authenticate、First session；读 `packages/coding-agent/docs/providers.md` 的 Subscriptions、API Keys、Resolution Order；读 [auth-storage.ts#L349](/source-code/packages/coding-agent/src/core/auth-storage.ts#L349) 看不暴露明文的 auth status；读 [model-registry.ts#L629](/source-code/packages/coding-agent/src/core/model-registry.ts#L629) 看可用模型如何根据 auth 过滤。
