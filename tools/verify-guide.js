#!/usr/bin/env node
/*
 * verify-guide.js - guard against guide-dialog.html drifting from its source.
 *
 * Run after editing SIMPLE-USER-GUIDE.md:
 *   node tools/build-guide.js     # regenerate
 *   node tools/verify-guide.js    # confirm in sync
 *
 * Fails if the committed guide-dialog.html is stale or missing sections.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const build = require("./build-guide.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "guide-dialog.html");

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (detail ? "  -> " + detail : "")); }
}

function plain(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[*`#]/g, "")
    .replace(/[^\x00-\x7F]/g, "")   // drop emoji / arrows
    .replace(/\s+/g, " ")
    .trim();
}

function main() {
  console.log("Guide drift check: SIMPLE-USER-GUIDE.md -> guide-dialog.html");

  if (!fs.existsSync(OUT)) {
    console.log("  FAIL  guide-dialog.html missing - run 'node tools/build-guide.js'");
    process.exit(1);
  }

  const md = fs.readFileSync(build.SRC, "utf8");
  const committed = fs.readFileSync(OUT, "utf8");
  const expected = build.build();

  check("guide-dialog.html is in sync with the .md", committed === expected,
    "stale - re-run 'node tools/build-guide.js'");

  // Every ## heading must appear in the output.
  const committedPlain = plain(committed);
  const headings = (md.match(/^##\s+(.*)$/gm) || []).map(function(h) { return plain(h.replace(/^##\s+/, "")); });
  let missing = [];
  headings.forEach(function(h) {
    if (h && committedPlain.indexOf(h) === -1) missing.push(h);
  });
  check("all " + headings.length + " sections present", missing.length === 0, missing.join(" | "));

  // Structural sanity.
  check("has .info-content wrapper", committed.indexOf('class="info-content"') !== -1);
  check("has guide table", committed.indexOf('class="guide-table"') !== -1);
  check("has callout notes", committed.indexOf('class="note"') !== -1);
  check("uses CRLF line endings", committed.indexOf("\r\n") !== -1 && !/[^\r]\n/.test(committed));
  check("code block not indented", committed.indexOf('<pre class="guide-code">2.0, 103.5\r\n1.5') !== -1);

  console.log("\nRESULT: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
}

main();
