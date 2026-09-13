#!/usr/bin/env node
/*
 * build-guide.js - generate guide-dialog.html from SIMPLE-USER-GUIDE.md
 *
 * Manual, run-on-demand generator (this repo has no build pipeline).
 * Edit SIMPLE-USER-GUIDE.md, then run:  node tools/build-guide.js
 * The generated guide-dialog.html is COMMITTED and fetched by the Info dialog.
 *
 * Zero dependencies. Covers the subset of Markdown the guide actually uses:
 *   headings, paragraphs, ordered/unordered (nested) lists, **bold**, *italic*,
 *   `inline code`, fenced code blocks, > callouts, | tables |, --- rules, links.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "SIMPLE-USER-GUIDE.md");
const OUT = path.join(ROOT, "guide-dialog.html");
const PAGE_OUT = path.join(ROOT, "guide.html");
const SITE = "https://military-navigation.jimmy.je";

/* ----------------------------- inline markdown ----------------------------- */
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s) {
  let t = esc(s);
  const codes = [];
  // Protect inline code first so ** / * inside it are not touched.
  t = t.replace(/`([^`]+)`/g, function(m, c) {
    codes.push(c);
    return "\u0000" + (codes.length - 1) + "\u0000";
  });
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  t = t.replace(/\u0000(\d+)\u0000/g, function(m, i) {
    return "<code>" + codes[+i] + "</code>";
  });
  return t;
}

/* ------------------------------ block builders ----------------------------- */
function renderTable(rows) {
  const parsed = rows.map(function(r) {
    return r.trim().replace(/^\||\|$/g, "").split("|").map(function(c) { return c.trim(); });
  });
  let head = null;
  const body = [];
  parsed.forEach(function(r, idx) {
    if (r.every(function(c) { return /^:?-{2,}:?$/.test(c); })) return; // separator row
    if (idx === 0) head = r; else body.push(r);
  });
  let html = '<table class="guide-table">';
  if (head) {
    html += "<thead><tr>" + head.map(function(c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead>";
  }
  html += "<tbody>" + body.map(function(r) {
    return "<tr>" + r.map(function(c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
  }).join("") + "</tbody></table>";
  return html;
}

function renderList(items) {
  const ordered = items[0].ordered;
  let html = ordered ? "<ol>" : "<ul>";
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    const nested = [];
    let j = i + 1;
    while (j < items.length && items[j].indent > it.indent) { nested.push(items[j]); j++; }
    let li = "<li>" + inline(it.text);
    if (nested.length) li += renderList(nested);
    li += "</li>";
    html += li;
    i = j;
  }
  html += ordered ? "</ol>" : "</ul>";
  return html;
}

/* ---------------------------------- parser --------------------------------- */
function parse(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // fenced code block
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre class="guide-code">' + esc(buf.join("\n")) + "</pre>");
      continue;
    }

    // horizontal rule
    if (/^---+\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

    // headings: # -> h4, ## -> h5, ### -> h6
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const tag = h[1].length === 1 ? "h4" : (h[1].length === 2 ? "h5" : "h6");
      out.push("<" + tag + ">" + inline(h[2]) + "</" + tag + ">");
      i++;
      continue;
    }

    // table
    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      out.push(renderTable(rows));
      continue;
    }

    // blockquote -> callout
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, "")); i++;
      }
      out.push('<div class="note">' + inline(buf.join(" ")) + "</div>");
      continue;
    }

    // list (ordered or unordered, with indentation)
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] });
        i++;
      }
      out.push(renderList(items));
      continue;
    }

    // paragraph
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() &&
           !/^(#{1,6}\s|>|\||```|---)/.test(lines[i]) &&
           !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push("<p>" + inline(buf.join(" ")) + "</p>");
  }

  return out.join("\n");
}

/* ---------------------------------- wrapper -------------------------------- */
function wrap(body) {
  // Protect newlines inside <pre> so block-indentation does not corrupt code.
  const guarded = body.replace(/<pre class="guide-code">([\s\S]*?)<\/pre>/g, function(m, code) {
    return '<pre class="guide-code">' + code.replace(/\n/g, "\u0001") + "</pre>";
  });
  const indented = guarded.split("\n").map(function(l) { return "    " + l; }).join("\n");
  return [
    '<div class="dialog dialog-info">',
    "  <div class=\"info-content\">",
    indented.replace(/\u0001/g, "\n"),
    "  </div>",
    "</div>",
    "",
  ].join("\n");
}

function build() {
  const md = fs.readFileSync(SRC, "utf8");
  return wrap(parse(md)).replace(/\n/g, "\r\n");
}

/* Build a full standalone, indexable page from the same Markdown source. */
function buildPage() {
  const md = fs.readFileSync(SRC, "utf8");
  const title = "MY Military Navigation — User Guide (GDM2000 Converter & GPS)";
  const desc = "Step-by-step guide to MY Military Navigation: convert GDM2000 coordinates, use the MGRS grids, save waypoints, navigate, and export GPX/JSON.";
  const ld = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to use MY Military Navigation",
    "description": desc,
    "url": SITE + "/guide.html",
    "step": [
      { "@type": "HowToStep", "position": 1, "name": "Install the app", "text": "Open the app in Safari or Chrome and use Add to Home Screen to install it." },
      { "@type": "HowToStep", "position": 2, "name": "Save a location", "text": "Use the COMPASS view SAVE button, or the MAP crosshair SAVE button." },
      { "@type": "HowToStep", "position": 3, "name": "Convert GDM2000 coordinates", "text": "Open CONVERT, choose FROM and TO formats, then paste one coordinate per line." },
      { "@type": "HowToStep", "position": 4, "name": "Navigate to a target", "text": "Open MAP, tap the navigate icon, set ORIGIN and DEST, then tap CONNECT and GO." }
    ]
  };
  const body = parse(md)
    .replace(/<h4>/g, "<h1>").replace(/<\/h4>/g, "</h1>")
    .replace(/<h5>/g, "<h2>").replace(/<\/h5>/g, "</h2>")
    .replace(/<h6>/g, "<h3>").replace(/<\/h6>/g, "</h3>");
  const head = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <meta name="theme-color" content="#1c2b20">',
    "  <title>" + esc(title) + "</title>",
    '  <meta name="description" content="' + esc(desc) + '">',
    '  <meta name="robots" content="index, follow, max-image-preview:large">',
    '  <link rel="canonical" href="' + SITE + '/guide.html">',
    '  <link rel="icon" type="image/svg+xml" href="icon.svg">',
    '  <link rel="preconnect" href="https://fonts.googleapis.com">',
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">',
    '  <link rel="stylesheet" href="css/style.css">',
    '  <link rel="stylesheet" href="css/page.css">',
    '  <script type="application/ld+json">',
    "  " + JSON.stringify(ld, null, 2).replace(/\n/g, "\n  "),
    "  </script>",
    "</head>",
  ].join("\n");
  const footer = [
    "<footer>",
    '  <p><a href="' + SITE + '/">&larr; Back to the GDM2000 converter app</a></p>',
    '  <p><a href="' + SITE + '/gdm2000-converter.html">GDM2000 coordinate converter</a></p>',
    "</footer>",
  ].join("\n");
  const page = head + "\n<body>\n<main class=\"doc\">\n" + body + "\n" + footer + "\n</main>\n</body>\n</html>\n";
  return page.replace(/\n/g, "\r\n");
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error("Source not found: " + SRC);
    process.exit(1);
  }
  const html = build();
  fs.writeFileSync(OUT, html);
  fs.writeFileSync(PAGE_OUT, buildPage());
  const h2 = (fs.readFileSync(SRC, "utf8").match(/^##\s+/gm) || []).length;
  console.log("Wrote " + path.relative(ROOT, OUT) + " (" + h2 + " sections)");
  console.log("Wrote " + path.relative(ROOT, PAGE_OUT) + " (standalone page)");
}

if (require.main === module) main();

module.exports = { parse: parse, wrap: wrap, build: build, buildPage: buildPage, SRC: SRC, OUT: OUT, PAGE_OUT: PAGE_OUT };
