#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mermaidDir = join(__dirname, "epub-content", "mermaid");
const contentDir = join(__dirname, "epub-content", "content");

const svgFiles = readdirSync(mermaidDir).filter((file) => file.endsWith(".svg"));
assert.ok(svgFiles.length > 0, "expected generated mermaid SVG files");

const firstSvg = readFileSync(join(mermaidDir, svgFiles[0]), "utf-8");
assert.ok(
  !firstSvg.includes("Mermaid 图"),
  "expected mermaid SVG to be rendered diagram output, not the fallback source-code placeholder",
);

const agentLoopChapter = readFileSync(join(contentDir, "chapter-08-agent-loop.xhtml"), "utf-8");
assert.ok(
  agentLoopChapter.includes('data-language="TypeScript"'),
  "expected TypeScript code blocks to preserve the language metadata",
);
assert.ok(
  agentLoopChapter.includes('class="hljs-keyword"'),
  "expected TypeScript code blocks to contain syntax-highlighted keyword spans",
);
assert.ok(
  agentLoopChapter.includes("--code-bg: #f6f8fa"),
  "expected light code blocks to use a GitHub-style GFM background",
);
assert.ok(
  agentLoopChapter.includes("@media (prefers-color-scheme: dark)"),
  "expected generated chapters to include dark-mode code highlighting styles",
);
assert.ok(
  agentLoopChapter.includes("--code-bg: #161b22"),
  "expected dark code blocks to use a GitHub-style dark background",
);
assert.ok(
  !agentLoopChapter.includes("content: attr(data-language)"),
  "expected language metadata to stay non-visual to match GFM code block rendering",
);

console.log(`Render regression test passed for ${svgFiles.length} mermaid SVG files.`);
