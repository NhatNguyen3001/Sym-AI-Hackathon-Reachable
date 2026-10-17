"""Download the Australia OSM extract once and clip it to Greater Sydney for Valhalla.

Usage (from the repo root): api/.venv/Scripts/python api/scripts/build_sydney_extract.py
Output: valhalla/custom_files/greater-sydney.osm.pbf (Valhalla builds its tiles from *.pbf in that folder).
"""
import subprocess
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
FILES = ROOT / "valhalla" / "custom_files"
SOURCE = FILES / "source" / "australia-latest.osm.pbf"  # in a subfolder so Valhalla doesn't build all of Australia
OUT = FILES / "greater-sydney.osm.pbf"
URL = "https://download.geofabrik.de/australia-oceania/australia-latest.osm.pbf"
BBOX = "149.97,-34.33,151.63,-32.99"
OSMIUM_IMAGE = "stefda/osmium-tool"


def download():
    if SOURCE.exists() and SOURCE.stat().st_size > 100_000_000:
        print(f"have {SOURCE.name} ({SOURCE.stat().st_size / 1e6:.0f} MB)")
        return
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    tmp = SOURCE.with_suffix(".part")
    with httpx.stream("GET", URL, follow_redirects=True, timeout=60) as r:
        r.raise_for_status()
        done, step = 0, 50_000_000
        with tmp.open("wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)
                done += len(chunk)
                if done // step != (done - len(chunk)) // step:
                    print(f"  {done / 1e6:.0f} MB", flush=True)
    tmp.replace(SOURCE)


def clip():
    cmd = ["docker", "run", "--rm", "-v", f"{FILES}:/data", OSMIUM_IMAGE, "osmium", "extract", "-b", BBOX,
           "/data/source/australia-latest.osm.pbf", "-o", "/data/greater-sydney.osm.pbf", "--overwrite"]
    print(" ".join(cmd))
    subprocess.run(cmd, check=True)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.0f} MB)")


if __name__ == "__main__":
    download()
    clip()
    sys.exit(0)
