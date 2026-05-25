# 34. 本地开发与贡献

## 34.1 本章解决的问题

Pi 的 monorepo 是一个高度标准化的代码库，有严格的编码规范、测试要求和版本发布流程。若不了解这些约束，直接提交 PR 会被 Contributor Gate 以各种原因自动拒绝：使用了 TypeScript 不支持 strip-only 模式的语法、硬编码了快捷键、测试污染了 e2e 环境、lockfile 被意外修改。

本章把 AGENTS.md 中的贡献规范转化为可执行的开发工作流，帮助工程师在本地通过所有检查后再提交。

## 34.2 最小可运行路径

**克隆并启动开发环境：**

```bash
git clone https://github.com/earendil-works/pi-mono.git
cd pi-mono
npm install --ignore-scripts   # 不运行 lifecycle scripts
npm run check                   # 类型检查 + lint（不构建，不测试）
```

**运行单元测试（非 e2e）：**

```bash
# 全部非 e2e 测试（推荐）
./test.sh

# 单个测试文件
node ../../node_modules/vitest/dist/cli.js --run test/suite/agent-session-prompt.test.ts
```

**修改代码后的验证流程：**

```bash
npm run check   # 必须通过，不留任何 error/warning/info
```

不需要运行 `npm run build`（除非用户要求），不需要运行完整 `npm test`（会触发 e2e 测试，需要真实 API key）。

## 34.3 核心机制

#### faux provider 与 createHarness()

Pi 的测试套件使用"假 provider"（faux provider）模拟 LLM 响应，完全不需要真实 API key。[`harness.ts`](packages/coding-agent/test/suite/harness.ts#L92) 的 `createHarness()` 函数封装了完整的测试环境创建：

```typescript
// harness.ts#L94
const fauxProvider: FauxProviderRegistration = registerFauxProvider({
  models: options.models,
});
fauxProvider.setResponses([]);
```

faux provider 通过 `setResponses()` 预设模型的响应序列：

```typescript
harness.faux.setResponses([
  { type: "text", text: "Hello, I am the assistant." },
  {
    type: "tool_use",
    tool: "read",
    args: { path: "src/index.ts" },
    result: { type: "text", text: "file contents..." }
  },
]);
```

每次 Agent Loop 调用 LLM 时，faux provider 按序返回预设响应，无需网络请求。这让测试可以精确模拟工具调用循环、错误重试、compaction 等场景。

#### createHarness() 使用内存后端

`createHarness()` 使用的所有关键组件都是内存版本，不访问磁盘：

```typescript
// harness.ts#L103
const sessionManager = SessionManager.inMemory();
const settingsManager = SettingsManager.inMemory(options.settings);
const authStorage = AuthStorage.inMemory();
```

唯一创建临时磁盘目录的是 `createTempDir()`，用于隔离不同测试的文件系统操作，在 `cleanup()` 时删除。

#### TypeScript erasable syntax 限制

Pi 要求所有在 `packages/*/src` 和 `packages/*/test` 下的 TypeScript 代码只使用"可擦除"语法（Node strip-only 模式可直接去除类型注解而不需要编译）。AGENTS.md 明确禁止：

- `parameter properties`（构造函数参数前的 `private`/`public` 修饰符）
- `enum`
- `namespace`/`module`
- `import =`/`export =`
- 其他需要 JS emit 的 TypeScript 语法

**正确写法（使用显式字段 + 构造函数赋值）：**

```typescript
// 正确：erasable syntax
class MyClass {
  private name: string;
  constructor(name: string) {
    this.name = name;
  }
}

// 错误：parameter properties（需要 JS emit）
class MyClass {
  constructor(private name: string) {}
}
```

#### 快捷键不能硬编码

AGENTS.md 规定不能在代码中硬编码按键：

```typescript
// 错误：硬编码
if (matchesKey(data, "ctrl+x")) { ... }

// 正确：通过 keybindings 系统查询
if (this.keybindings.matches(data, "app.myAction")) { ... }
// 并在 DEFAULT_APP_KEYBINDINGS 中定义默认绑定
```

#### Changelog 维护规范

Pi 的 Changelog 位于 `packages/*/CHANGELOG.md`，所有新条目必须写在 `## [Unreleased]` 下，绝不能修改已发布版本（如 `## [0.12.2]`）的内容。

```markdown
## [Unreleased]

### Fixed
- Fixed foo bar ([#123](https://github.com/earendil-works/pi-mono/issues/123))

### Added
- Added feature X ([#456](https://github.com/earendil-works/pi-mono/pull/456) by [@username](https://github.com/username))
```

#### 回归测试命名规范

issue 特定的回归测试放在 `packages/coding-agent/test/suite/regressions/` 下，命名为 `<issue-number>-<short-slug>.test.ts`。这方便将来追溯 bug 修复的来源。

## 34.4 为什么这样设计

#### erasable syntax 的原因

Pi 支持通过 Bun 编译为独立二进制（strip-only 模式直接去除类型注解），也支持在 Node.js 中通过 `--strip-types` 运行。只有 erasable syntax 才能在这两种模式下都正常工作，不依赖 TypeScript 编译器的 JS emit。使用 `enum` 等语法则必须经过完整 tsc 编译，会破坏这个架构目标。

#### `--ignore-scripts` 的安全意义

Pi 的安全哲学同样适用于开发环境：不运行 npm lifecycle scripts，是为了防止恶意依赖在安装时执行任意代码。即使是开发依赖也有供应链风险。

## 34.5 常见误解与排查

**误解：运行 `npm test` 跑全套测试。** 这会触发 e2e 测试，需要真实的 API key 和网络连接，且可能产生费用。只运行 `./test.sh` 或指定测试文件。

**误解：可以用 `git add .` 暂存所有文件。** 多个 Pi 会话可能同时运行在同一 cwd，`git add .` 会暂存其他会话的修改。始终用 `git add <具体文件>` 精确暂存。

**`npm run check` 失败排查：** 检查 error 来源：若是 TypeScript 类型错误，确认是否使用了禁止的语法；若是 lint 规则，查看具体规则名称定位对应约束。

## 34.6 本章训练

#### 使用级训练

克隆 pi-mono，运行 `npm run check` 确认通过；然后在 `test/suite/regressions/` 下创建一个测试文件，使用 `createHarness()` 模拟一次简单的 text 响应，运行该测试确认通过。

#### 原理级训练

阅读 [`harness.ts#L130`](packages/coding-agent/test/suite/harness.ts#L130) 的 Agent 构造部分，说明 faux provider 是如何在不修改 Agent 核心代码的情况下替换真实 LLM 调用的；解释 `getApiKey` 和 `onPayload` 参数在测试环境中的作用。

#### 扩展级训练

在 `test/suite/regressions/` 下编写一个回归测试，模拟 Agent 在工具调用失败（工具返回错误内容）后自动重试的行为；使用 `harness.eventsOfType("tool_execution_result")` 验证重试是否触发了正确次数的工具调用。

专家级验收标准：能在不运行 e2e 测试的情况下验证 Pi 的核心功能修改，能说明 erasable TypeScript syntax 的限制原因，并能写出符合 Pi 测试规范的回归测试。
