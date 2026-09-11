#!/usr/bin/env node
/*
 * Verify js/coordinates.js GDM2000 state grids (EPSG:3377-3385) against
 * pyproj ground truth in tools/grid-truth.json.
 *
 * Usage (from repo root):
 *   python tools/gen-truth.py     # once, to create tools/grid-truth.json
 *   node tools/verify-grids.js
 *
 * Loads the REAL js/coordinates.js inside a Node VM with the REAL proj4
 * (proj4-src.js is auto-downloaded to the OS temp dir on first run).
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

const STATE_NAMES = {
  3377: "Johor", 3378: "Sembilan+Melaka", 3379: "Pahang",
  3380: "Selangor", 3381: "Terengganu", 3382: "Pinang",
  3383: "Kedah+Perlis", 3384: "Perak", 3385: "Kelantan",
};
const RSO_CODES = [3375, 3376, 3168, 29873];
const R = 6371000;

function haversine(a, b, c, d) {
  const r = (x) => (x * Math.PI) / 180;
  const dLa = r(c - a), dLo = r(d - b);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { fs.writeFileSync(dest, data); resolve(); });
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

function loadEngine() {
  const coordSrc = fs.readFileSync(path.join(ROOT, "js", "coordinates.js"), "utf8");
  const proj4Src = fs.readFileSync(PROJ4_PATH, "utf8");
  const sb = {};
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  sb.module = { exports: {} }; sb.exports = sb.module.exports; sb.console = console;
  vm.createContext(sb);
  vm.runInContext(proj4Src, sb, { filename: "proj4-src.js" });
  const proj4 = sb.module.exports;
  if (typeof proj4 !== "function") throw new Error("proj4 did not load");
  sb.proj4 = proj4;
  vm.runInContext(coordSrc, sb, { filename: "coordinates.js" });
  return {
    fmt: vm.runInContext("formatCoordinate", sb),
    parse: vm.runInContext("parseCoordinate", sb),
  };
}

function main() {
  const truthPath = path.join(__dirname, "grid-truth.json");
  if (!fs.existsSync(truthPath)) {
    console.error("Missing tools/grid-truth.json - run: python tools/gen-truth.py");
    process.exit(2);
  }
  const truth = JSON.parse(fs.readFileSync(truthPath, "utf8"));
  const { fmt, parse } = loadEngine();

  const lines = [];
  let pass = 0, fail = 0;
  const FWD_TOL = 0.5;  // integer-metre rounding in formatCoordinate
  const RT_TOL = 1.0;   // round-trip metres

  lines.push("EPSG  State            in(lat,lng)    app_output              app_E     true_E    app_N     true_N   dE(m)  dN(m)  rt(m)  result");
  lines.push("-".repeat(146));

  for (const code of Object.keys(truth).map(Number)) {
    for (const pt of truth[code]) {
      const f = "epsg-" + code;
      const out = fmt(pt.lat, pt.lng, f);
      const m = out.match(/([+-]?\d+)\s*E\s+([+-]?\d+)\s*N/);
      let e = NaN, n = NaN, fwd = false;
      if (m) {
        e = parseFloat(m[1]); n = parseFloat(m[2]);
        fwd = Math.abs(e - pt.easting) <= FWD_TOL && Math.abs(n - pt.northing) <= FWD_TOL;
      }
      const back = parse(out, f);
      const rtM = back ? haversine(pt.lat, pt.lng, back.lat, back.lng) : NaN;
      const ok = fwd && rtM <= RT_TOL;
      ok ? pass++ : fail++;
      lines.push([
        String(code).padEnd(5),
        (STATE_NAMES[code] || "").padEnd(16),
        ("(" + pt.lat + "," + pt.lng + ")").padEnd(14),
        out.padEnd(22),
        String(e).padStart(9),
        pt.easting.toFixed(1).padStart(10),
        String(n).padStart(9),
        pt.northing.toFixed(1).padStart(10),
        (e - pt.easting).toFixed(2).padStart(7),
        (n - pt.northing).toFixed(2).padStart(7),
        rtM.toFixed(3).padStart(7),
        ok ? "PASS" : "FAIL",
      ].join(" "));
    }
  }

  lines.push("-".repeat(146));
  lines.push("Negative / positive coordinate parse cases:");
  for (const code of Object.keys(truth).map(Number)) {
    const f = "epsg-" + code;
    const pt = truth[code][0];
    const txt = Math.round(pt.easting) + " E  " + Math.round(pt.northing) + " N";
    const back = parse(txt, f);
    const ok = back && !isNaN(back.lat) && !isNaN(back.lng);
    ok ? pass++ : fail++;
    lines.push("  " + f + "  \"" + txt + "\"  ->  " + (ok ? "lat " + back.lat.toFixed(6) + ", lng " + back.lng.toFixed(6) : "NULL") + "  " + (ok ? "PASS" : "FAIL"));
  }

  lines.push("Regression: existing RSO grids (formatCoordinate at 4.0,102.0):");
  for (const code of RSO_CODES) {
    const s = fmt(4.0, 102.0, "epsg-" + code);
    const ok = /E\s+-?\d/.test(s);
    ok ? pass++ : fail++;
    lines.push("  epsg-" + code + "  ->  " + s + "  " + (ok ? "PASS" : "FAIL"));
  }

  lines.push("");
  lines.push("RESULT: " + pass + " passed, " + fail + " failed");
  console.log(lines.join("\n"));
  process.exit(fail === 0 ? 0 : 1);
}

ensureProj4().then(main).catch((e) => { console.error("ERROR:", e.message); process.exit(2); });
