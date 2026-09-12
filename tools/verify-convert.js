#!/usr/bin/env node
/*
 * Verify the CONVERT view (js/convert.js) and its conversion pipeline.
 *
 * Part A - DOM smoke test: load the REAL js/convert.js in a tiny DOM shim,
 *          feed multi-line input, and check the rendered output element.
 * Part B - Accuracy: run the exact parse -> format pipeline convert.js uses
 *          and diff the projected eastings/northings against pyproj ground
 *          truth in tools/grid-truth.json.
 *
 * Usage (from repo root):
 *   python tools/gen-truth.py
 *   node tools/verify-convert.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const TMP = os.tmpdir();
const PROJ4_PATH = path.join(TMP, "proj4-src.js");
const PROJ4_URL = "https://unpkg.com/proj4@2.11.0/dist/proj4-src.js";

/* ------------------------------ DOM shim ------------------------------ */
function El(tag) {
  const el = {
    tagName: tag, value: "", textContent: "", selected: false,
    style: {}, dataset: {}, children: [], _ls: {},
    set innerHTML(v) { this._html = v; this.children = []; },
    get innerHTML() { return this._html || ""; },
    appendChild(c) { this.children.push(c); if (c.selected) this.value = c.value; return c; },
    addEventListener(ev, fn) { (this._ls[ev] = this._ls[ev] || []).push(fn); },
    dispatch(ev) { (this._ls[ev] || []).forEach((f) => f({ target: this })); },
    focus() {}, select() {}, remove() {},
  };
  return el;
}
function makeDocument() {
  const els = {};
  const ls = {};
  return {
    getElementById(id) { return els[id] || (els[id] = El("div")); },
    createElement(tag) { return El(tag); },
    addEventListener(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); },
    fire(ev) { (ls[ev] || []).forEach((f) => f({})); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: { appendChild() {}, removeChild() {} },
    execCommand() {},
  };
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
      let d = ""; res.on("data", (c) => (d += c));
      res.on("end", () => { fs.writeFileSync(dest, d); resolve(); });
    }).on("error", reject);
  });
}

async function ensureProj4() {
  if (!fs.existsSync(PROJ4_PATH)) {
    process.stdout.write("Downloading proj4-src.js ... ");
    await download(PROJ4_URL, PROJ4_PATH);
    console.log("done");
  }
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (detail ? "  -> " + detail : "")); }
}

function main() {
  const proj4Src = fs.readFileSync(PROJ4_PATH, "utf8");
  const coordSrc = fs.readFileSync(path.join(ROOT, "js", "coordinates.js"), "utf8");
  const convertSrc = fs.readFileSync(path.join(ROOT, "js", "convert.js"), "utf8");

  const doc = makeDocument();
  const sb = {};
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  sb.module = { exports: {} }; sb.exports = sb.module.exports;
  sb.console = console;
  sb.document = doc;
  sb.navigator = { clipboard: { writeText: () => Promise.resolve() } };
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  vm.createContext(sb);

  vm.runInContext(proj4Src, sb, { filename: "proj4-src.js" });
  sb.proj4 = sb.module.exports;
  if (typeof sb.proj4 !== "function") { console.error("proj4 failed to load"); process.exit(2); }
  vm.runInContext(coordSrc, sb, { filename: "coordinates.js" });
  vm.runInContext(convertSrc, sb, { filename: "convert.js" });

  const fmt = vm.runInContext("formatCoordinate", sb);
  const parse = vm.runInContext("parseCoordinate", sb);

  /* ---------------- Part A: DOM smoke test ---------------- */
  console.log("\nPart A - convert.js DOM smoke test");
  doc.fire("DOMContentLoaded");

  const fromSel = doc.getElementById("convert-from");
  const toSel = doc.getElementById("convert-to");
  const inputEl = doc.getElementById("convert-input");
  const outEl = doc.getElementById("convert-output");

  check("from select populated (16)", fromSel.children.length === 16, "got " + fromSel.children.length);
  check("to select populated (16)", toSel.children.length === 16, "got " + toSel.children.length);
  check("default FROM = latlng-dd", fromSel.value === "latlng-dd", fromSel.value);
  check("default TO = epsg-3375", toSel.value === "epsg-3375", toSel.value);

  fromSel.value = "latlng-dd"; toSel.value = "epsg-3377";
  inputEl.value = "2.0, 103.5\nnot-a-coordinate\n1.5, 103.8";
  inputEl.dispatch("input");
  const html = outEl.innerHTML;
  check("good line 1 converted (-6793 E)", html.indexOf("-6793 E") !== -1, html.slice(0, 200));
  check("good line 2 converted (26593 E)", html.indexOf("26593 E") !== -1);
  check("bad line flagged unparsed", html.indexOf("unparsed") !== -1);
  check("two success ticks", (html.match(/convert-ok/g) || []).length === 2);
  check("one error mark", (html.match(/convert-err/g) || []).length === 1);

  inputEl.value = ""; inputEl.dispatch("input");
  check("empty input shows placeholder", outEl.innerHTML.indexOf("Output appears here") !== -1);

  fromSel.value = "epsg-3377"; toSel.value = "latlng-dd";
  inputEl.value = "-6793 E  -4696 N"; inputEl.dispatch("input");
  check("EPSG->DD parse works", outEl.innerHTML.indexOf("convert-ok") !== -1, outEl.innerHTML.slice(0, 160));

  /* ---------------- Part B: accuracy vs pyproj ---------------- */
  console.log("\nPart B - conversion pipeline vs pyproj (tools/grid-truth.json)");
  const truthPath = path.join(__dirname, "grid-truth.json");
  if (!fs.existsSync(truthPath)) {
    console.log("  (skipped - run 'python tools/gen-truth.py' first)");
  } else {
    const truth = JSON.parse(fs.readFileSync(truthPath, "utf8"));
    const TOL = 0.5;
    for (const code of Object.keys(truth).map(Number)) {
      let worstE = 0, worstN = 0;
      for (const pt of truth[code]) {
        const ddStr = Math.abs(pt.lat).toFixed(6) + "° " + (pt.lat >= 0 ? "N" : "S") + " " +
                      Math.abs(pt.lng).toFixed(6) + "° " + (pt.lng >= 0 ? "E" : "W");
        const p = parse(ddStr, "latlng-dd");
        const out = fmt(p.lat, p.lng, "epsg-" + code);
        const m = out.match(/([+-]?\d+)\s*E\s+([+-]?\d+)\s*N/);
        if (!m) { worstE = Infinity; break; }
        worstE = Math.max(worstE, Math.abs(parseFloat(m[1]) - pt.easting));
        worstN = Math.max(worstN, Math.abs(parseFloat(m[2]) - pt.northing));
      }
      check("EPSG:" + code + " DD->grid within 0.5m", worstE <= TOL && worstN <= TOL,
        "worst dE=" + worstE.toFixed(3) + " dN=" + worstN.toFixed(3));
    }

    const mgrs = fmt(4.0, 102.0, "mgrs");
    const back = parse(mgrs, "mgrs");
    check("MGRS round-trip parses", back && Math.abs(back.lat - 4.0) < 0.001 && Math.abs(back.lng - 102.0) < 0.001,
      mgrs + " -> " + JSON.stringify(back));

    const dms = fmt(3.2, 101.4, "latlng-dms");
    const bd = parse(dms, "latlng-dms");
    check("DMS round-trip parses", bd && Math.abs(bd.lat - 3.2) < 1e-4 && Math.abs(bd.lng - 101.4) < 1e-4,
      dms + " -> " + JSON.stringify(bd));
  }

  console.log("\nRESULT: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
}

ensureProj4().then(main).catch((e) => { console.error("ERROR:", e.message); process.exit(2); });
