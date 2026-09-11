#!/usr/bin/env python3
"""Generate pyproj ground-truth for the GDM2000 state grids (EPSG:3377-3385).

Output: tools/grid-truth.json  -> { "<epsg>": [ {lat,lng,easting,northing}, ... ] }

Requires: pyproj  (pip install pyproj)
Run from the repo root:  python tools/gen-truth.py
"""
import json
import os

from pyproj import Transformer

# A few interior sample points per state grid (lat, lng).
SAMPLE_POINTS = {
    3377: [(2.0, 103.5), (1.5, 103.8), (2.8, 104.0)],   # Johor
    3378: [(2.6, 102.2), (2.4, 102.4), (3.0, 101.9)],   # Sembilan & Melaka
    3379: [(3.6, 102.5), (3.0, 102.0), (4.5, 103.2)],   # Pahang
    3380: [(3.2, 101.4), (3.0, 101.6), (3.7, 101.2)],   # Selangor
    3381: [(4.9, 103.1), (4.5, 103.0), (5.5, 102.9)],   # Terengganu
    3382: [(5.4, 100.35), (5.3, 100.4), (5.5, 100.3)],  # Pinang
    3383: [(6.0, 100.6), (5.5, 100.4), (6.4, 100.2)],   # Kedah & Perlis
    3384: [(4.8, 100.8), (4.2, 101.0), (5.5, 100.7)],   # Perak
    3385: [(5.9, 102.2), (5.5, 102.0), (6.1, 102.4)],   # Kelantan
}


def main():
    out = {}
    for code, coords in SAMPLE_POINTS.items():
        tr = Transformer.from_crs("EPSG:4326", "EPSG:%d" % code, always_xy=True)
        rows = []
        for lat, lng in coords:
            easting, northing = tr.transform(lng, lat)
            rows.append({
                "lat": lat,
                "lng": lng,
                "easting": easting,
                "northing": northing,
            })
        out[code] = rows

    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "grid-truth.json")
    with open(dest, "w") as fh:
        json.dump(out, fh, indent=2)
    print("Wrote", dest)


if __name__ == "__main__":
    main()
