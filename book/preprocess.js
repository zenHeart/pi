#!/usr/bin/env node
/**
 * preprocess.js - 预处理分析文档，生成书籍章节
 *
 * 读取 analysis/ 目录下的分析文档，按书籍结构重新组织，
 * 添加 pi 源码对照、代码高亮标记、章节导读等内容。
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYSIS_DIR = join(__dirname, '..', '..', '..', 'chengle', 'code', 'github', 'claude-code-sourcemap', 'analysis');
const OUTPUT_DIR = join(__dirname, 'chapters');
const PI_REPO_DIR = join(__dirname, '..', '..', '..', 'chengle', 'code', 'repos', 'pi');

const CHAPTER_MAP = {
  '00-prerequisites.md': 'chapter-00-prerequisites.md',
  '01-overview.md': 'chapter-01-architecture-overview.md',
  '02-core-loop.md': 'chapter-02-agent-loop.md',
  '03-tools.md': 'chapter-03-tools.md',
  '04-streaming-api-client.md': 'chapter-04-streaming-api-client.md',
  '05-system-prompt.md': 'chapter-05-system-prompt.md',
  '06-build-from-zero.md': 'chapter-06-build-from-zero.md',
  '07-context-engineering.md': 'chapter-07-context-engineering.md',
  '08-token-and-budget.md': 'chapter-08-token-and-budget.md',
  '09-permission-security.md': 'chapter-09-permission-and-security.md',
  '10-hook-system.md': 'chapter-10-hook-system.md',
  '11-memory.md': 'chapter-11-memory.md',
  '12-session-resume.md': 'chapter-12-session-resume.md',
  '13-mcp-protocol.md': 'chapter-13-mcp-protocol.md',
  '14-slash-commands.md': 'chapter-14-slash-commands.md',
  '15-skills-and-plugins.md': 'chapter-15-skills-and-plugins.md',
  '16-output-styles.md': 'chapter-16-output-styles.md',
  '17-sub-agents.md': 'chapter-17-sub-agents.md',
  '18-eval-observability.md': 'chapter-18-eval-and-observability.md',
  '19-eval-platform-hands-on.md': 'chapter-19-eval-platform-hands-on.md',
  '20-deployment-and-ops.md': 'chapter-20-deployment-and-ops.md',
  '21-rl-integration-blueprint.md': 'chapter-21-rl-integration.md',
  '22-interview-cheatsheet.md': 'chapter-22-interview-cheatsheet.md',
};

const PI_SOURCE_MAP = {
  'chapter-02-agent-loop.md': [
    'packages/agent/src/agent-loop.ts',
    'packages/agent/src/agent.ts',
    'packages/coding-agent/src/core/agent-session-runtime.ts',
    'packages/coding-agent/src/core/agent-session.ts',
  ],
  'chapter-03-tools.md': [
    'packages/coding-agent/src/core/tools/index.ts',
    'packages/coding-agent/src/core/tools/bash.ts',
    'packages/coding-agent/src/core/tools/read.ts',
    'packages/coding-agent/src/core/tools/edit.ts',
    'packages/coding-agent/src/core/tools/write.ts',
    'packages/coding-agent/src/core/tools/find.ts',
    'packages/coding-agent/src/core/tools/grep.ts',
    'packages/coding-agent/src/core/tools/ls.ts',
  ],
  'chapter-04-streaming-api-client.md': [
    'packages/ai/src/',
    'packages/agent/src/harness/',
  ],
  'chapter-05-system-prompt.md': [
    'packages/coding-agent/src/core/system-prompt.ts',
    'packages/coding-agent/src/core/prompt-templates.ts',
    'packages/agent/src/harness/system-prompt.ts',
  ],
  'chapter-06-build-from-zero.md': [
    'examples/mini-agent/src/',
  ],
  'chapter-07-context-engineering.md': [
    'packages/coding-agent/src/core/messages.ts',
    'packages/agent/src/harness/messages.ts',
  ],
  'chapter-08-token-and-budget.md': [
    'packages/coding-agent/src/core/messages.ts',
    'packages/agent/src/harness/session/session.ts',
  ],
  'chapter-09-permission-and-security.md': [
    'packages/coding-agent/src/core/exec.ts',
    'packages/coding-agent/src/core/bash-executor.ts',
  ],
  'chapter-10-hook-system.md': [
    'packages/coding-agent/src/core/extensions/runner.ts',
    'packages/coding-agent/src/core/extensions/types.ts',
  ],
  'chapter-11-memory.md': [
    'packages/agent/src/harness/session/memory-repo.ts',
    'packages/agent/src/harness/session/memory-storage.ts',
    'packages/coding-agent/src/core/resource-loader.ts',
  ],
  'chapter-12-session-resume.md': [
    'packages/agent/src/harness/session/jsonl-repo.ts',
    'packages/agent/src/harness/session/jsonl-storage.ts',
    'packages/coding-agent/src/modes/rpc/jsonl.ts',
  ],
  'chapter-13-mcp-protocol.md': [
    'packages/coding-agent/src/core/tools/mcp.ts',
  ],
  'chapter-14-slash-commands.md': [
    'packages/coding-agent/src/core/slash-commands.ts',
  ],
  'chapter-15-skills-and-plugins.md': [
    'packages/coding-agent/src/core/skills.ts',
    'packages/agent/src/harness/skills.ts',
  ],
  'chapter-16-output-styles.md': [
    'packages/coding-agent/src/core/output-guard.ts',
    'packages/coding-agent/src/utils/frontmatter.ts',
  ],
  'chapter-17-sub-agents.md': [
    'packages/coding-agent/src/core/modes/rpc/rpc-client.ts',
    'packages/coding-agent/src/core/modes/rpc/rpc-mode.ts',
  ],
  'chapter-18-eval-and-observability.md': [
    'packages/coding-agent/src/core/telemetry.ts',
    'packages/agent/test/',
  ],
  'chapter-19-eval-platform-hands-on.md': [
    'examples/mini-agent/src/evalRunner.ts',
    'examples/mini-agent/src/viewer.ts',
    'examples/mini-agent/src/transcript.ts',
  ],
  'chapter-20-deployment-and-ops.md': [
    'packages/coding-agent/src/main.ts',
    'Dockerfile',
  ],
  'chapter-21-rl-integration.md': [
    'examples/mini-agent/src/exportTrajectory.ts',
  ],
  'chapter-22-interview-cheatsheet.md': [],
  'chapter-23-replication-guide.md': [],
};

function processContent(content, chapterFile) {
  // 1. 替换源码链接为 pi 仓库路径
  content = content.replace(/`source-code\/src\//g, `\`pi/`);

  // 2. 添加 pi 源码路径标注
  const piSources = PI_SOURCE_MAP[chapterFile] || [];
  if (piSources.length > 0) {
    const sourceNote = piSources.map(s => `- \`${s}\``).join('\n');
    // 插入到文件开头的位置
  }

  // 3. 修复相对链接
  content = content.replace(/\]\(\.\//g, '](#');

  return content;
}

function addChapterHeader(content, chapterNum, title, sources) {
  const sourceBlock = sources.length > 0
    ? `\n\n## pi 源码对照\n\n本章节涉及的 pi 源码文件：\n${sources.map(s => `- \`${s}\``).join('\n')}\n`
    : '';

  return `${content}`;
}

function preprocess() {
  console.log('Starting preprocessing...');
  console.log(`Analysis dir: ${ANALYSIS_DIR}`);
  console.log(`Output dir: ${OUTPUT_DIR}`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let processedCount = 0;

  for (const [srcFile, destFile] of Object.entries(CHAPTER_MAP)) {
    const srcPath = join(ANALYSIS_DIR, srcFile);
    const destPath = join(OUTPUT_DIR, destFile);

    if (!existsSync(srcPath)) {
      console.warn(`Source file not found: ${srcPath}`);
      continue;
    }

    let content = readFileSync(srcPath, 'utf-8');
    content = processContent(content, destFile);

    const sources = PI_SOURCE_MAP[destFile] || [];
    content = addChapterHeader(content, processedCount + 1, destFile, sources);

    writeFileSync(destPath, content, 'utf-8');
    console.log(`Processed: ${srcFile} -> ${destFile}`);
    processedCount++;
  }

  console.log(`\nPreprocessing complete: ${processedCount} chapters processed.`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

preprocess();
