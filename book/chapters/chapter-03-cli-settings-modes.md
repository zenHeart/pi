# 3. CLI 参数、设置与运行模式选择

## 3. 本章解决的问题

pi 有 interactive、print、json、rpc 和 SDK 等入口。mode 不是 UI 皮肤，而是同一 runtime 的不同控制面。CLI 参数结构定义在 [args.ts#L12](/source-code/packages/coding-agent/src/cli/args.ts#L12)，解析函数在 [args.ts#L59](/source-code/packages/coding-agent/src/cli/args.ts#L59)，mode 分流在 [main.ts#L99](/source-code/packages/coding-agent/src/main.ts#L99)。

对新手来说，命令行参数是“这次运行怎么启动”。对创造者来说，参数是运行时边界：它们决定是否保存 session、是否加载资源、是否允许工具、如何选模型、输出给人还是输出给机器。

## 3. Mode 选择

interactive mode 适合人类持续协作。print mode 适合 shell 中一次性请求。json mode 输出 JSON lines，适合工具读取事件。rpc mode 适合外部程序控制 session。SDK 适合 TypeScript 程序直接嵌入 pi。

`--mode json` 和 `--mode rpc` 在 [args.ts#L74](/source-code/packages/coding-agent/src/cli/args.ts#L74) 解析。运行时分流到 RPC、interactive 或 print 的位置在 [main.ts#L680](/source-code/packages/coding-agent/src/main.ts#L680)、[main.ts#L682](/source-code/packages/coding-agent/src/main.ts#L682) 和 [main.ts#L709](/source-code/packages/coding-agent/src/main.ts#L709)。

| 场景 | 推荐入口 |
|---|---|
| 日常改代码 | `pi` |
| shell 一次性任务 | `pi -p` |
| 机器读取事件 | `pi --mode json` |
| 外部进程控制会话 | `pi --mode rpc` |
| 自己写 wrapper | SDK |

## 3. Settings 分层

settings 有全局和项目两层：`~/.pi/agent/settings.json` 和 `.pi/settings.json`。全局表达个人偏好，项目表达团队规则。settings 能控制默认 provider/model、thinking、theme、compaction、retry、message delivery、terminal image、shell、sessionDir、enabledModels 和 resources。

项目设置会覆盖全局设置，嵌套对象会合并。`main()` 在启动阶段先创建 settings manager，用它解析 sessionDir；等最终 session cwd 确定后再创建 cwd 绑定的 runtime services，避免从别的项目恢复 session 时加载错项目资源，相关注释和代码在 [main.ts#L501](/source-code/packages/coding-agent/src/main.ts#L501) 附近。

专家判断很简单：团队必须一致的放 `.pi/settings.json`；个人终端偏好、theme、默认模型放全局。

## 3. Model 与 thinking 参数

`--model` 支持 provider 前缀和 `:thinking` 简写，参数解析在 [args.ts#L85](/source-code/packages/coding-agent/src/cli/args.ts#L85)，thinking 合法值在 [args.ts#L53](/source-code/packages/coding-agent/src/cli/args.ts#L53)。`--models` 控制 Ctrl+P 循环范围，解析在 [args.ts#L102](/source-code/packages/coding-agent/src/cli/args.ts#L102)。

最终 session option 不是在 parser 里决定，而是在 [main.ts#L288](/source-code/packages/coding-agent/src/main.ts#L288) 的 `buildSessionOptions()` 中结合 CLI、settings、scoped models 和现有 session 共同决定。这是为了让“新 session 默认模型”和“恢复旧 session 的已有模型”有不同规则。

## 3. Tool flags

工具开关是安全和复现实验的重要入口。`--no-tools` 禁用所有工具，`--no-builtin-tools` 禁用内置工具但保留 extension/custom tools，`--tools` 指定 allowlist。解析位置在 [args.ts#L104](/source-code/packages/coding-agent/src/cli/args.ts#L104)，写入 session options 的位置在 [main.ts#L288](/source-code/packages/coding-agent/src/main.ts#L288)。

只读审查建议：

```bash
pi --tools read,grep,find,ls -p "Review this codebase"
```

需要真实改代码时再启用 `edit`、`write` 和 `bash`。不要用 prompt 承诺“不要改文件”来替代工具边界。

## 3. Resource flags

`--extension`、`--skill`、`--prompt-template`、`--theme` 和对应的 `--no-*` 控制本次运行加载哪些资源。`main()` 会先把 CLI 路径解析为绝对路径，再交给 resource loader，路径解析入口在 [main.ts#L526](/source-code/packages/coding-agent/src/main.ts#L526) 附近，resource loader 的 reload 入口在 [resource-loader.ts#L321](/source-code/packages/coding-agent/src/core/resource-loader.ts#L321)。

常见边界：`--no-context-files` 只影响 `AGENTS.md` / `CLAUDE.md` 发现，不等于禁用 settings；`--no-skills` 不等于禁用 extensions；`--offline` 会设置 `PI_OFFLINE` 和 `PI_SKIP_VERSION_CHECK`，入口在 [main.ts#L426](/source-code/packages/coding-agent/src/main.ts#L426)。

## 3. 进一步阅读

读 `packages/coding-agent/docs/usage.md` 的 CLI Reference，读 `packages/coding-agent/docs/settings.md` 的 All Settings。源码继续读 [args.ts#L218](/source-code/packages/coding-agent/src/cli/args.ts#L218) 的 help 文本、[main.ts#L570](/source-code/packages/coding-agent/src/main.ts#L570) 的 session option 构造、[resource-loader.ts#L394](/source-code/packages/coding-agent/src/core/resource-loader.ts#L394) 的 extension 加载控制。
