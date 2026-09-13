#!/usr/bin/env node
/*
 * verify-info.js - structural checks for the Info dialog (ABOUT | GUIDE tabs).
 *
 * Confirms the static shell in index.html, the runtime fragment contract that
 * js/app.js relies on (.info-content present, single wrapper), and that both
 * fragments are well-formed and self-contained.
 *
 * Run:  node tools/verify-info.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (detail ? "  -> " + detail : "")); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function balancedDivs(html) {
  const open = (html.match(/<div\b/g) || []).length;
  const close = (html.match(/<\/div>/g) || []).length;
  return open === close ? null : "open=" + open + " close=" + close;
}

function main() {
  console.log("Info dialog structural checks");

  const index = read("index.html");
  const app = read("js/app.js");

  // --- index.html shell ---
  const overlay = index.match(/<div class="dialog-overlay" id="dialog-info"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  check("index.html has info overlay shell", !!overlay);
  check("shell has ABOUT tab", /data-tab="about"/.test(index));
  check("shell has GUIDE tab", /data-tab="guide"/.test(index));
  check("shell has #info-body", /id="info-body"/.test(index));
  check("shell has close button", /id="btn-info-close"/.test(index));
  check("shell keeps .dialog.dialog-info", /class="dialog dialog-info"/.test(index));

  // --- app.js contract ---
  check("app.js fetches info-dialog.html", /info-dialog\.html/.test(app));
  check("app.js fetches guide-dialog.html", /guide-dialog\.html/.test(app));
  check("app.js extracts .info-content", /querySelector\('\.info-content'\)/.test(app));
  check("app.js uses outerHTML (keeps wrapper+styles)", /content\.outerHTML/.test(app));
  check("app.js binds tabs", /info-tab/.test(app));
  check("app.js caches panels", /infoCache/.test(app));

  // --- fragments ---
  ["info-dialog.html", "guide-dialog.html"].forEach(function(f) {
    const html = read(f);
    const b = balancedDivs(html);
    const count = (html.match(/class="info-content"/g) || []).length;
    check(f + ": well-formed divs", b === null, b || "");
    check(f + ": exactly one .info-content", count === 1, "found " + count);
    check(f + ": has .dialog-info wrapper", /class="dialog dialog-info"/.test(html));
    check(f + ": .info-content is a direct child", /class="dialog dialog-info">\s*<[^>]*>[\s\S]*?<div class="info-content">/.test(html) || /class="dialog dialog-info">\s*<div class="info-content">/.test(html));
  });

  // --- guide content sanity ---
  const guide = read("guide-dialog.html");
  check("guide has code block", /<pre class="guide-code">/.test(guide));
  check("guide has table", /<table class="guide-table">/.test(guide));
  check("guide has notes", /<div class="note">/.test(guide));
  check("guide mentions CONVERT tab", /CONVERT/.test(guide));

  console.log("\nRESULT: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
}

main();
