# MY Military Navigation 🧭🇲🇾

**MY Military Navigation** is a mobile navigation application tailored for military, tactical, and field navigation in Malaysia. It features support for the local Malaysian coordinate datum (GDM2000), real-time location tracking, digital compass, and elevation profiling.

---

## Features

* **GDM2000 Datum Support:** Accurate grid and coordinate transformation standard for Malaysia (Geodetic Datum of Malaysia 2000), including the 9 GDM2000 State Cassini Grids (EPSG:3377–3385) for peninsular cadastral work.
* **Coordinate Converter:** Convert between all 16 supported formats (MGRS, Lat/Lng DD/DMS, and the EPSG grids) — paste one coordinate per line for batch conversion.
* **GPS & Live Location:** Real-time location tracking with precise grid coordinates.
* **Digital Compass:** Field-ready compass for direction finding, bearings, and tactical heading.
* **Elevation Profile:** Visual terrain elevation data to analyze terrain changes and route slopes.
* **Map Tools:** Tactical waypoint creation, measurement, and spatial awareness tools.
* **Any Devices:** Works on any devices either Android, iOS, Windows, MacOS
* **100% Privacy** Saved location will stored locally on user browser

* **In-App User Guide:** The Info button (Compass view) opens a dialog with **ABOUT** and **GUIDE** tabs. The GUIDE tab is generated from `SIMPLE-USER-GUIDE.md` — run `node tools/build-guide.js` after editing it.

---

## Build & verification

This repo has no CI pipeline; the generators and checks are run manually.

```bash
node tools/build-guide.js    # regenerate guide-dialog.html (dialog) + guide.html (SEO page)
node tools/verify-guide.js   # guide fragment in sync with the .md
node tools/verify-info.js    # Info dialog tabs + fragment contract
node tools/verify-convert.js # coordinate converter
node tools/verify-grids.js   # GDM2000 grids vs pyproj ground truth
node tools/verify-seo.js     # titles, H1s, JSON-LD, sitemap, robots, .gitignore
```

**SEO pages:** `index.html` (the app), `guide.html` and `gdm2000-converter.html`
are the indexable entry points and are listed in `sitemap.xml`. `guide.html` is
generated — never edit it by hand.

**URL convention:** the server strips `.html` and serves the extensionless form
(`/guide`, `/gdm2000-converter`). All canonicals, `og:url`, JSON-LD `url` and
sitemap entries must therefore use extensionless URLs — `verify-seo.js` enforces
this. The files on disk keep their `.html` suffix.

---

## Release

[https://military-navigation.jimmy.je](https://military-navigation.jimmy.je/)

---

## Support and feedback

hi@jimmy.je

---
