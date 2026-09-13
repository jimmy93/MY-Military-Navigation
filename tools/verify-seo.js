#!/usr/bin/env node
/*
 * verify-seo.js - guard the SEO surface against regressions.
 *
 * Checks the crawlable essentials on every page, that the sitemap only
 * lists pages that exist on disk, that robots.txt points at the sitemap,
 * and that generated pages are in sync with their source.
 *
 * Run:  node tools/verify-seo.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const buildGuide = require("./build-guide.js");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://military-navigation.jimmy.je";
const PAGES = ["index.html", "guide.html", "gdm2000-converter.html"];

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (detail ? "  -> " + detail : "")); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

function jsonLdBlocks(html) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const out = []; let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function main() {
  console.log("SEO checks\n");

  // ---- per-page head essentials ----
  PAGES.forEach(function(f) {
    if (!fs.existsSync(path.join(ROOT, f))) {
      check(f + " exists", false, "missing file");
      return;
    }
    const html = read(f);
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
    const h1 = (html.match(/<h1[\s>]/g) || []).length;
    const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || "";
    const ld = jsonLdBlocks(html);

    console.log("-- " + f);
    check("  exactly one <h1>", h1 === 1, "found " + h1);
    check("  title present and <= 65 chars", title.length > 0 && title.length <= 65, title.length + " chars");
    check("  description present and <= 165 chars", desc.length > 0 && desc.length <= 165, desc.length + " chars");
    check("  canonical present", canonical.length > 0);
    check("  robots allows indexing", /index/.test(html) && !/noindex/.test(html));
    check("  has JSON-LD", ld.length > 0);

    ld.forEach(function(block, i) {
      try { JSON.parse(block); check("  JSON-LD block " + (i + 1) + " parses", true); }
      catch (e) { check("  JSON-LD block " + (i + 1) + " parses", false, e.message); }
    });

    const body = text(html);
    check("  body mentions GDM2000", /GDM2000/.test(body));
  });

  // ---- keyword targeting on the app entry page ----
  console.log("-- keyword targeting (index.html)");
  const index = read("index.html");
  const indexTitle = (index.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
  check("  title contains GDM2000", /GDM2000/.test(indexTitle), indexTitle);
  check("  title contains Converter", /Converter/.test(indexTitle), indexTitle);
  const indexBody = text(index).toLowerCase();
  ["GDM2000 converter", "GDM2000 to WGS84", "EPSG:3377", "EPSG:3375", "Cassini", "MGRS", "GDM2000 military navigation"]
    .forEach(function(kw) {
      check('  body contains "' + kw + '"', indexBody.indexOf(kw.toLowerCase()) !== -1);
    });
  check("  has Open Graph tags", /property="og:title"/.test(index) && /property="og:image"/.test(index));
  check("  has Twitter card", /name="twitter:card"/.test(index));
  check("  mentions all 9 state grid EPSG codes", ["3377","3378","3379","3380","3381","3382","3383","3384","3385"].every(function(c) { return index.indexOf(c) !== -1; }));

  // ---- landing page has a real embedded converter (not a thin doorway) ----
  console.log("-- landing page");
  const land = read("gdm2000-converter.html");
  check("  embeds convert UI (#convert-from)", /id="convert-from"/.test(land));
  check("  embeds convert UI (#convert-input)", /id="convert-input"/.test(land));
  check("  loads the coordinate engine", /js\/coordinates\.js/.test(land));
  check("  loads the convert controller", /js\/convert\.js/.test(land));
  check("  has substantial unique copy (>=1500 chars)", text(land).length >= 1500, text(land).length + " chars");

  // ---- sitemap ----
  console.log("-- sitemap.xml");
  const sm = read("sitemap.xml");
  const locs = (sm.match(/<loc>([^<]+)<\/loc>/g) || []).map(function(s) { return s.replace(/<\/?loc>/g, ""); });
  check("  parses as XML-ish (has urlset)", /<urlset/.test(sm));
  check("  has at least one <loc>", locs.length > 0, "found " + locs.length);
  locs.forEach(function(u) {
    const rel = u.replace(SITE + "/", "").replace(/\/$/, "");
    const file = rel === "" ? "index.html" : rel;
    check("  " + u + " exists on disk", fs.existsSync(path.join(ROOT, file)), "missing " + file);
  });
  check("  lastmod is not in the future", (function() {
    const m = sm.match(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/);
    if (!m) return false;
    return m[1] <= new Date().toISOString().slice(0, 10);
  })());

  // ---- robots.txt ----
  console.log("-- robots.txt");
  const rb = read("robots.txt");
  check("  allows crawling", /User-agent: \*/.test(rb) && /Allow: \//.test(rb));
  check("  references the sitemap", /Sitemap:\s*https:\/\/military-navigation\.jimmy\.je\/sitemap\.xml/.test(rb));

  // ---- .gitignore must not hide deployable SEO assets ----
  console.log("-- .gitignore");
  const gi = read(".gitignore");
  ["sitemap.xml", "robots.txt", "guide.html", "gdm2000-converter.html", "qr-code.jpeg"].forEach(function(f) {
    const hidden = new RegExp("^" + f.replace(/\./g, "\\.") + "\\s*$", "m").test(gi);
    check("  does NOT ignore " + f, !hidden);
  });

  // ---- generated pages in sync ----
  console.log("-- generated pages");
  if (typeof buildGuide.buildPage === "function") {
    check("  guide.html is in sync with the .md", read("guide.html") === buildGuide.buildPage(),
      "stale - re-run 'node tools/build-guide.js'");
  }

  console.log("\nRESULT: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
}

main();
