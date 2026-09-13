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

function main() {
  if (!fs.existsSync(SRC)) {
    console.error("Source not found: " + SRC);
    process.exit(1);
  }
  const html = build();
  fs.writeFileSync(OUT, html);
  const h2 = (fs.readFileSync(SRC, "utf8").match(/^##\s+/gm) || []).length;
  console.log("Wrote " + path.relative(ROOT, OUT) + " (" + h2 + " sections)");
}

if (require.main === module) main();

module.exports = { parse: parse, wrap: wrap, build: build, SRC: SRC, OUT: OUT };
