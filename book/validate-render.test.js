#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mermaidDir = join(__dirname, "epub-content", "mermaid");

const svgFiles = readdirSync(mermaidDir).filter((file) => file.endsWith(".svg"));
assert.ok(svgFiles.length > 0, "expected generated mermaid SVG files");

const firstSvg = readFileSync(join(mermaidDir, svgFiles[0]), "utf-8");
assert.ok(
  !firstSvg.includes("Mermaid 图"),
  "expected mermaid SVG to be rendered diagram output, not the fallback source-code placeholder",
);

console.log(`Render regression test passed for ${svgFiles.length} mermaid SVG files.`);
