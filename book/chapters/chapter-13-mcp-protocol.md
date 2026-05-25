# 第13章 MCP 协议：外部工具接入

> **本章目标**：解释 MCP 的核心组成和 Claude Code 如何把 MCP 接入工具系统。
> **pi 源码对照**：
> - `packages/coding-agent/src/core/tools/` — MCP 工具定义
> - `packages/coding-agent/src/core/mcp.ts` — MCP 客户端
>
> **本章结束能做什么**：能解释 MCP 的核心组成、交互原理。
> **阅读时间**：约 20 分钟。

---

## 1. MCP 心智模型

MCP（Model Context Protocol）是一个开放协议，标准化 AI 应用与外部系统之间的连接。

### 1.1 核心参与者

```
User → MCP Host → MCP Client → MCP Server
                          ↓
                      工具/资源/提示词
```

| 角色 | 职责 |
|------|------|
| **Host** | AI 应用 / Agent 宿主（Claude Code） |
| **Client** | Host 内部为某个 Server 建立的协议连接 |
| **Server** | 暴露工具/资源/提示词的外部服务 |

---

## 2. MCP 核心能力

| 能力 | 说明 |
|------|------|
| **Tools** | MCP Server 暴露的工具 |
| **Resources** | 外部数据/文件 |
| **Prompts** | 预定义提示词模板 |

---

## 3. Claude Code 中的 MCP 集成

### 3.1 工具注册

```typescript
// packages/coding-agent/src/core/tools/mcp.ts
export function convertMcpTools(
  mcpTools: McpTool[],
): Tool[] {
  return mcpTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.object(
      Object.fromEntries(
        Object.entries(tool.inputSchema.properties).map(
          ([key, prop]) => [key, convertSchemaToZod(prop)]
        )
      )
    ),
    execute: async (input) => {
      return callMcpTool(tool.name, input)
    },
  }))
}
```

### 3.2 MCP 客户端

```typescript
// packages/coding-agent/src/core/mcp.ts
export class McpClient {
  private connection: McpConnection

  async connect(config: McpServerConfig): Promise<void> {
    if (config.transport === 'stdio') {
      this.connection = await StdioConnection.connect(config.command, config.args)
    } else {
      this.connection = await HttpConnection.connect(config.url)
    }
  }

  async listTools(): Promise<McpTool[]> {
    return this.connection.sendRequest('tools/list')
  }

  async callTool(name: string, args: object): Promise<ToolResult> {
    return this.connection.sendRequest('tools/call', { name, arguments: args })
  }
}
```

---

## 4. MCP 配置

### 4.1 配置结构

```yaml
# settings.json
mcpServers:
  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: "${GITHUB_TOKEN}"
```

---

> **下一步阅读**：[第14章 Slash Commands](./chapter-14-slash-commands.md) — 用户触发命令。
