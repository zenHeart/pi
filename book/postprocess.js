#!/usr/bin/env node
/**
 * postprocess.js - 后处理，生成 EPUB 内容
 *
 * 读取预处理后的章节，生成：
 * 1. EPUB 所需的 HTML 内容文件
 * 2. 目录文件 (toc.xhtml)
 * 3. 打包清单 (content.opf)
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHAPTERS_DIR = join(__dirname, 'chapters');
const OUTPUT_DIR = join(__dirname, 'epub-content');
const BOOK_DIR = join(__dirname);

const CHAPTER_ORDER = [
  { id: 'ch00', file: 'chapter-00-prerequisites.md', title: '第0章 前置知识' },
  { id: 'ch01', file: 'chapter-01-architecture-overview.md', title: '第1章 架构总览' },
  { id: 'ch02', file: 'chapter-02-agent-loop.md', title: '第2章 Agent Loop' },
  { id: 'ch03', file: 'chapter-03-tools.md', title: '第3章 Tools' },
  { id: 'ch04', file: 'chapter-04-streaming-api-client.md', title: '第4章 Streaming API Client' },
  { id: 'ch05', file: 'chapter-05-system-prompt.md', title: '第5章 System Prompt' },
  { id: 'ch06', file: 'chapter-06-build-from-zero.md', title: '第6章 从零构建最小 Agent' },
  { id: 'ch07', file: 'chapter-07-context-engineering.md', title: '第7章 Context Engineering' },
  { id: 'ch08', file: 'chapter-08-token-and-budget.md', title: '第8章 Token 与预算管理' },
  { id: 'ch09', file: 'chapter-09-permission-and-security.md', title: '第9章 权限与安全' },
  { id: 'ch10', file: 'chapter-10-extension-system.md', title: '第10章 扩展系统' },
  { id: 'ch11', file: 'chapter-11-memory.md', title: '第11章 记忆系统' },
  { id: 'ch12', file: 'chapter-12-session-resume.md', title: '第12章 Session Resume' },
  { id: 'ch13', file: 'chapter-13-mcp-protocol.md', title: '第13章 MCP 协议' },
  { id: 'ch14', file: 'chapter-14-session-management.md', title: '第14章 Session 管理' },
  { id: 'ch15', file: 'chapter-15-skills-and-plugins.md', title: '第15章 Skills 系统' },
  { id: 'ch16', file: 'chapter-16-slash-commands.md', title: '第16章 Slash Commands' },
  { id: 'ch17', file: 'chapter-17-output-styles.md', title: '第17章 Output Styles' },
  { id: 'ch18', file: 'chapter-18-eval-and-observability.md', title: '第18章 Eval 与可观测性' },
  { id: 'ch19', file: 'chapter-19-eval-platform-hands-on.md', title: '第19章 Eval 平台实操' },
  { id: 'ch20', file: 'chapter-20-deployment-and-ops.md', title: '第20章 部署与运维' },
  { id: 'ch21', file: 'chapter-21-rl-integration.md', title: '第21章 RL 集成蓝图' },
  { id: 'ch22', file: 'chapter-22-interview-cheatsheet.md', title: '第22章 面试速查' },
  { id: 'ch23', file: 'chapter-23-replication-guide.md', title: '第23章 复刻路径与检查清单' },
];

function markdownToHtml(md) {
  // 基础 Markdown 转 HTML 转换
  // 实际使用时应替换为 marked 库
  let html = md;

  // 标题
  html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

  // 代码块
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 表格
  html = html.replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)*)/g, (match, header, body) => {
    const headers = header.split('|').filter(h => h.trim());
    const rows = body.trim().split('\n').map(row =>
      row.split('|').filter(c => c.trim())
    );
    let table = '<table><thead><tr>';
    headers.forEach(h => { table += `<th>${h.trim()}</th>`; });
    table += '</tr></thead><tbody>';
    rows.forEach(row => {
      table += '<tr>';
      row.forEach(cell => { table += `<td>${cell.trim()}</td>`; });
      table += '</tr>';
    });
    table += '</tbody></table>';
    return table;
  });

  // 粗体和斜体
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 列表
  html = html.replace(/^- (.*$)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // 换行和段落
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '');

  return html;
}

function generateTocXhtml() {
  let toc = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="pi-agent-book"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>Pi Agent 实战：从源码到复刻</text></docTitle>
  <navMap>
`;

  CHAPTER_ORDER.forEach((ch, idx) => {
    toc += `    <navPoint id="navpoint-${idx + 1}" playOrder="${idx + 1}">
      <navLabel><text>${ch.title}</text></navLabel>
      <content src="content/${ch.file.replace('.md', '.xhtml')}"/>
    </navPoint>
`;
  });

  toc += `  </navMap>
</ncx>`;

  return toc;
}

function generateContentOpf() {
  const manifestItems = CHAPTER_ORDER.map((ch, idx) =>
    `    <item id="chapter${idx + 1}" media-type="application/xhtml+xml" href="content/${ch.file.replace('.md', '.xhtml')}"/>`
  ).join('\n');

  const spineItems = CHAPTER_ORDER.map((ch, idx) =>
    `    <itemref idref="chapter${idx + 1}"/>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">pi-agent-book</dc:identifier>
    <dc:title>Pi Agent 实战：从源码到复刻</dc:title>
    <dc:creator>Pi Agent 团队</dc:creator>
    <dc:language>zh-CN</dc:language>
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

function generateNavXhtml() {
  let nav = `<?xml version="1.0" encoding="UTF-8"?>
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
`;

  CHAPTER_ORDER.forEach((ch) => {
    nav += `      <li><a href="content/${ch.file.replace('.md', '.xhtml')}">${ch.title}</a></li>\n`;
  });

  nav += `    </ul>
  </nav>
</body>
</html>`;

  return nav;
}

function postprocess() {
  console.log('Starting postprocessing...');

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    mkdirSync(join(OUTPUT_DIR, 'content'), { recursive: true });
    mkdirSync(join(OUTPUT_DIR, 'META-INF'), { recursive: true });
  }

  // 生成内容文件
  CHAPTER_ORDER.forEach((ch, idx) => {
    const chapterPath = join(CHAPTERS_DIR, ch.file);
    if (existsSync(chapterPath)) {
      const md = readFileSync(chapterPath, 'utf-8');
      const html = markdownToHtml(md);
      const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${ch.title}</title>
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

      const outputFile = ch.file.replace('.md', '.xhtml');
      writeFileSync(join(OUTPUT_DIR, 'content', outputFile), xhtml, 'utf-8');
      console.log(`Generated: content/${outputFile}`);
    } else {
      console.warn(`Chapter not found: ${chapterPath}`);
    }
  });

  // 生成导航
  writeFileSync(join(OUTPUT_DIR, 'nav.xhtml'), generateNavXhtml(), 'utf-8');
  console.log('Generated: nav.xhtml');

  // 生成 NCX
  writeFileSync(join(OUTPUT_DIR, 'toc.ncx'), generateTocXhtml(), 'utf-8');
  console.log('Generated: toc.ncx');

  // 生成 OPF
  writeFileSync(join(OUTPUT_DIR, 'content.opf'), generateContentOpf(), 'utf-8');
  console.log('Generated: content.opf');

  // 生成 mimetype
  writeFileSync(join(OUTPUT_DIR, 'mimetype'), 'application/epub+zip', 'utf-8');

  // 生成 container.xml
  writeFileSync(join(OUTPUT_DIR, 'META-INF', 'container.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`, 'utf-8');
  console.log('Generated: META-INF/container.xml');

  console.log('\nPostprocessing complete.');
  console.log('EPUB content ready in:', OUTPUT_DIR);
  console.log('\nTo create the EPUB file, run: node build-epub.mjs');
}

postprocess();
