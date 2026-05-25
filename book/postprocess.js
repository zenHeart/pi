#!/usr/bin/env node
/**
 * Generate EPUB content from book/metadata.yaml and book/chapters.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHAPTERS_DIR = join(__dirname, "chapters");
const OUTPUT_DIR = join(__dirname, "epub-content");
const METADATA_FILE = join(__dirname, "metadata.yaml");

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readMetadata() {
  const yaml = readFileSync(METADATA_FILE, "utf-8");
  const title = yaml.match(/^title:\s*"([^"]+)"/m)?.[1] ?? "Pi Agent Book";
  const author = yaml.match(/^author:\s*"([^"]+)"/m)?.[1] ?? "Pi Agent Handbook";
  const lang =
    yaml.match(/^lang(?:uage)?:\s*([^\n]+)/m)?.[1]?.replace(/"/g, "").trim() ?? "zh-CN";
  const piRepo = yaml.match(/^pi_repo:\s*"([^"]+)"/m)?.[1]?.replace(/\/$/, "") ?? "https://github.com/zenHeart/pi";
  const sourceRef = yaml.match(/^source_ref:\s*"([^"]+)"/m)?.[1] ?? "codex/pi-book-rewrite";
  const lines = yaml.split(/\r?\n/);
  const chaptersBlock = [];
  const chapters = [];
  let currentPart = "";

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

  for (const line of chaptersBlock) {
    const part = line.match(/^\s+- part:\s*"([^"]+)"/);
    if (part) {
      currentPart = part[1];
      continue;
    }
    const item = line.match(/^\s+- ([a-zA-Z0-9_.-]+\.md)\s*$/);
    if (item) {
      chapters.push({ file: item[1], part: currentPart });
    }
  }

  return { title, author, lang, piRepo, sourceRef, chapters };
}

function getChapterTitle(file) {
  const content = readFileSync(join(CHAPTERS_DIR, file), "utf-8");
  return content.match(/^#\s+(.+)$/m)?.[1] ?? file.replace(/\.md$/, "");
}

function normalizeHref(href, metadata) {
  const sourceMatch = href.match(/^((?:packages|scripts|book|\.github)\/.+)#L([0-9]+)$/);
  if (sourceMatch) {
    return `${metadata.piRepo}/blob/${metadata.sourceRef}/${sourceMatch[1]}#L${sourceMatch[2]}`;
  }
  return href;
}

function markdownToHtml(md, metadata) {
  const codeBlocks = [];
  let html = md.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const token = `@@CODE_BLOCK_${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code class="language-${escapeHtml(lang.trim())}">${escapeHtml(code)}</code></pre>`);
    return token;
  });

  html = escapeHtml(html);
  html = html.replace(/^#### (.*)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    return `<a href="${escapeHtml(normalizeHref(href, metadata))}">${label}</a>`;
  });
  html = html.replace(/^- (.*)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`.replace(/<p>\s*<\/p>/g, "");

  for (const [index, block] of codeBlocks.entries()) {
    html = html.replace(`@@CODE_BLOCK_${index}@@`, block);
  }
  return html;
}

function generateTocNcx(metadata, chapters) {
  const points = chapters
    .map(
      (ch, index) => `    <navPoint id="navpoint-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeHtml(ch.title)}</text></navLabel>
      <content src="content/${ch.file.replace(".md", ".xhtml")}"/>
    </navPoint>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="pi-agent-book"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeHtml(metadata.title)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>`;
}

function generateContentOpf(metadata, chapters) {
  const manifestItems = chapters
    .map(
      (ch, index) =>
        `    <item id="chapter${index + 1}" media-type="application/xhtml+xml" href="content/${ch.file.replace(".md", ".xhtml")}"/>`,
    )
    .join("\n");
  const spineItems = chapters.map((_ch, index) => `    <itemref idref="chapter${index + 1}"/>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">pi-agent-book</dc:identifier>
    <dc:title>${escapeHtml(metadata.title)}</dc:title>
    <dc:creator>${escapeHtml(metadata.author)}</dc:creator>
    <dc:language>${escapeHtml(metadata.lang)}</dc:language>
    <meta property="dcterms:modified">2026-05-25T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="ncx" media-type="application/x-dtbncx+xml" href="toc.ncx"/>
    <item id="nav" media-type="application/xhtml+xml" href="nav.xhtml" properties="nav"/>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
}

function generateNavXhtml(metadata, chapters) {
  const items = chapters
    .map((ch) => `      <li><a href="content/${ch.file.replace(".md", ".xhtml")}">${escapeHtml(ch.title)}</a></li>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>目录</title>
  <style>
    body { font-family: sans-serif; margin: 1em; }
    h1 { font-size: 1.5em; }
    ul { list-style-type: none; padding-left: 1em; }
    li { margin: 0.5em 0; }
    a { text-decoration: none; color: #333; }
  </style>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ul>
${items}
    </ul>
  </nav>
</body>
</html>`;
}

function postprocess() {
  const metadata = readMetadata();
  const chapters = metadata.chapters.map((chapter) => ({
    ...chapter,
    title: getChapterTitle(chapter.file),
  }));

  mkdirSync(join(OUTPUT_DIR, "content"), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, "META-INF"), { recursive: true });

  for (const file of readdirSync(join(OUTPUT_DIR, "content"))) {
    if (file.endsWith(".xhtml")) {
      unlinkSync(join(OUTPUT_DIR, "content", file));
    }
  }

  for (const ch of chapters) {
    const md = readFileSync(join(CHAPTERS_DIR, ch.file), "utf-8");
    const html = markdownToHtml(md, metadata);
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeHtml(ch.title)}</title>
  <style>
    body { font-family: 'Noto Sans SC', sans-serif; line-height: 1.8; margin: 1em; }
    h1, h2, h3, h4 { color: #333; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 1em; overflow-x: auto; border-radius: 5px; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 0.5em; text-align: left; }
    th { background: #f4f4f4; }
    blockquote { border-left: 3px solid #ddd; margin: 1em 0; padding-left: 1em; color: #666; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
    writeFileSync(join(OUTPUT_DIR, "content", ch.file.replace(".md", ".xhtml")), xhtml, "utf-8");
  }

  writeFileSync(join(OUTPUT_DIR, "nav.xhtml"), generateNavXhtml(metadata, chapters), "utf-8");
  writeFileSync(join(OUTPUT_DIR, "toc.ncx"), generateTocNcx(metadata, chapters), "utf-8");
  writeFileSync(join(OUTPUT_DIR, "content.opf"), generateContentOpf(metadata, chapters), "utf-8");
  writeFileSync(join(OUTPUT_DIR, "mimetype"), "application/epub+zip", "utf-8");
  writeFileSync(
    join(OUTPUT_DIR, "META-INF", "container.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    "utf-8",
  );

  console.log(`Generated ${chapters.length} chapters from metadata.yaml.`);
}

postprocess();
