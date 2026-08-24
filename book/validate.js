#!/usr/bin/env node
/**
 * Validate book structure, heading numbering, and repository-relative source links.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHAPTERS_DIR = join(__dirname, "chapters");
const METADATA_FILE = join(__dirname, "metadata.yaml");
const DOC_DIRS = [join(REPO_ROOT, "packages", "coding-agent", "docs"), join(REPO_ROOT, "packages", "agent", "docs")];
const EXTRA_MARKDOWN_FILES = ["README.md", "AGENTS.md"];

function listDocs() {
  const docs = new Set();
  const basenames = new Set();
  for (const dir of DOC_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      const full = dir.includes(`${join("packages", "agent", "docs")}`)
        ? `packages/agent/docs/${file}`
        : `packages/coding-agent/docs/${file}`;
      docs.add(full);
      basenames.add(file);
    }
  }
  return { docs, basenames };
}

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

function validateHeading(errors, file, lineNumber, line, chapterNumber, expectedH2) {
  const h1 = line.match(/^# (.+)$/);
  if (h1 && !/^[0-9]+\. /.test(h1[1])) {
    fail(errors, `${file}:${lineNumber} H1 must start with numeric chapter prefix`);
  }

  const h2 = line.match(/^## (.+)$/);
  if (h2 && !new RegExp(`^${chapterNumber}\\.${expectedH2} `).test(h2[1])) {
    fail(errors, `${file}:${lineNumber} H2 must use sequential section prefix ${chapterNumber}.${expectedH2}`);
  }

  const h3 = line.match(/^### (.+)$/);
  if (h3 && !/^[0-9]+\.[0-9]+ /.test(h3[1])) {
    fail(errors, `${file}:${lineNumber} H3 must start with numeric section prefix`);
  }
}

function validateSourceLinks(errors, file, content) {
  const wrapped = content.match(/`\[[^\]]+\]\((?:packages|scripts|book|\.github)\/[^)]+#L[0-9]+\)`/g);
  if (wrapped) {
    for (const link of wrapped) fail(errors, `${file} source link wrapped in backticks: ${link}`);
  }

  const sourceLinks = content.matchAll(/\[[^\]]+\]\(((?:packages|scripts|book|\.github)\/[^)#]+)#L([0-9]+)\)/g);
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

  const malformed = content.match(/\[[^\]]+\]\((?:packages|scripts|book|\.github)\/[^)#]+\)/g);
  if (malformed) {
    for (const link of malformed) fail(errors, `${file} source link missing #Lx: ${link}`);
  }

  const virtualLinks = content.match(/\[[^\]]+\]\(\/source-code\/[^)]+\)/g);
  if (virtualLinks) {
    for (const link of virtualLinks) fail(errors, `${file} must not use /source-code virtual links: ${link}`);
  }

  const rootPackageLinks = content.match(/\[[^\]]+\]\(\/packages\/[^)]+\)/g);
  if (rootPackageLinks) {
    for (const link of rootPackageLinks) fail(errors, `${file} source link must be repository-relative, not root-absolute: ${link}`);
  }

  const originalRepoLinks = content.match(/https:\/\/github\.com\/earendil-works\/pi\/blob\/[^)\s]+/g);
  if (originalRepoLinks) {
    for (const link of originalRepoLinks) fail(errors, `${file} must not link source to upstream repo: ${link}`);
  }
}

function validateDocsReferences(errors, file, content, docs) {
  const exampleMarkdownFiles = new Set(["notes.md"]);
  const explicit = content.matchAll(/`(packages\/(?:coding-agent|agent)\/docs\/[^`]+\.md)`/g);
  for (const match of explicit) {
    if (!existsSync(join(REPO_ROOT, match[1]))) {
      fail(errors, `${file} missing docs target: ${match[1]}`);
    }
  }

  const links = content.matchAll(/\[[^\]]+\]\((packages\/(?:coding-agent|agent)\/docs\/[^)]+\.md)\)/g);
  for (const match of links) {
    if (!existsSync(join(REPO_ROOT, match[1]))) {
      fail(errors, `${file} missing docs link target: ${match[1]}`);
    }
  }

  const shortRefs = content.matchAll(/`([a-z0-9][a-z0-9_.-]+\.md)`/g);
  for (const match of shortRefs) {
    const name = match[1];
    if (exampleMarkdownFiles.has(name)) continue;
    if (!docs.basenames.has(name)) {
      fail(errors, `${file} unknown docs basename reference: ${name}`);
    }
  }
}

function validate() {
  const errors = [];
  const docs = listDocs();
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
    let expectedH2 = 1;
    const chapterNumber = Number(file.match(/^chapter-([0-9]+)/)?.[1]);
    for (const [index, line] of lines.entries()) {
      if (line.startsWith("```")) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      validateHeading(errors, file, index + 1, line, chapterNumber, expectedH2);
      if (line.startsWith("## ")) expectedH2 += 1;
    }
    if (inFence) fail(errors, `${file} has unclosed code fence`);
    validateSourceLinks(errors, file, content);
    validateDocsReferences(errors, file, content, docs);
  }

  for (const file of EXTRA_MARKDOWN_FILES) {
    const path = join(__dirname, file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf-8");
    validateSourceLinks(errors, file, content);
    validateDocsReferences(errors, file, content, docs);
  }

  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log(`Book validation passed for ${chapterOrder.length} chapters.`);
}

validate();
