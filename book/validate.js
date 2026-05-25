#!/usr/bin/env node
/**
 * Validate book structure, heading numbering, and /source-code links.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHAPTERS_DIR = join(__dirname, "chapters");
const METADATA_FILE = join(__dirname, "metadata.yaml");

function readChapterOrder() {
  const yaml = readFileSync(METADATA_FILE, "utf-8");
  const lines = yaml.split(/\r?\n/);
  const chaptersBlock = [];
  let inChapters = false;
  for (const line of lines) {
    if (line === "chapters:") {
      inChapters = true;
      continue;
    }
    if (inChapters && /^[a-zA-Z_]+:/.test(line)) {
      break;
    }
    if (inChapters) {
      chaptersBlock.push(line);
    }
  }
  return chaptersBlock
    .map((line) => line.match(/^\s+- ([a-zA-Z0-9_.-]+\.md)\s*$/)?.[1])
    .filter(Boolean);
}

function fail(errors, message) {
  errors.push(message);
}

function validateHeading(errors, file, lineNumber, line) {
  const h1 = line.match(/^# (.+)$/);
  if (h1 && !/^[0-9]+\. /.test(h1[1])) {
    fail(errors, `${file}:${lineNumber} H1 must start with numeric chapter prefix`);
  }

  const h2 = line.match(/^## (.+)$/);
  if (h2 && !/^[0-9]+\. /.test(h2[1])) {
    fail(errors, `${file}:${lineNumber} H2 must start with numeric chapter prefix`);
  }

  const h3 = line.match(/^### (.+)$/);
  if (h3 && !/^[0-9]+\.[0-9]+ /.test(h3[1])) {
    fail(errors, `${file}:${lineNumber} H3 must start with numeric section prefix`);
  }
}

function validateSourceLinks(errors, file, content) {
  const wrapped = content.match(/`\[[^\]]+\]\(\/source-code\/[^)]+#L[0-9]+\)`/g);
  if (wrapped) {
    for (const link of wrapped) fail(errors, `${file} source link wrapped in backticks: ${link}`);
  }

  const sourceLinks = content.matchAll(/\[[^\]]+\]\(\/source-code\/([^)#]+)#L([0-9]+)\)/g);
  for (const match of sourceLinks) {
    const sourcePath = join(REPO_ROOT, match[1]);
    const line = Number(match[2]);
    if (!existsSync(sourcePath)) {
      fail(errors, `${file} missing source target: ${match[1]}`);
      continue;
    }
    const count = readFileSync(sourcePath, "utf-8").split(/\r?\n/).length;
    if (line < 1 || line > count) {
      fail(errors, `${file} invalid source line: ${match[1]}#L${line}`);
    }
  }

  const malformed = content.match(/\[[^\]]+\]\(\/source-code\/[^)#]+\)/g);
  if (malformed) {
    for (const link of malformed) fail(errors, `${file} source link missing #Lx: ${link}`);
  }
}

function validate() {
  const errors = [];
  const chapterOrder = readChapterOrder();
  const chapterSet = new Set(chapterOrder);
  const actualChapters = readdirSync(CHAPTERS_DIR).filter((file) => file.endsWith(".md"));

  for (const file of chapterOrder) {
    const path = join(CHAPTERS_DIR, file);
    if (!existsSync(path)) fail(errors, `metadata chapter missing: ${file}`);
  }

  for (const file of actualChapters) {
    if (!chapterSet.has(file)) fail(errors, `orphan chapter not listed in metadata: ${file}`);
  }

  for (const file of chapterOrder) {
    const path = join(CHAPTERS_DIR, file);
    if (!existsSync(path) || !statSync(path).isFile()) continue;
    const content = readFileSync(path, "utf-8");
    const lines = content.split(/\r?\n/);
    let inFence = false;
    for (const [index, line] of lines.entries()) {
      if (line.startsWith("```")) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      validateHeading(errors, file, index + 1, line);
    }
    validateSourceLinks(errors, file, content);
  }

  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log(`Book validation passed for ${chapterOrder.length} chapters.`);
}

validate();
