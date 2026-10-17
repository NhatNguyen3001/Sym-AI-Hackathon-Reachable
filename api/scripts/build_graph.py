"""Build api/data/graph.graphml from OpenStreetMap + Open-Meteo elevation. Run once; commit the output.

Usage (from api/): .venv/Scripts/python scripts/build_graph.py
"""
import json
import time
from pathlib import Path

import httpx
import networkx as nx
import osmnx as ox

API = Path(__file__).resolve().parent.parent
DATA = API / "data"
CENTER = (-33.7765, 151.1160)
ox.settings.use_cache = True
ox.settings.cache_folder = API / ".osm_cache"
ox.settings.useful_tags_way = list(ox.settings.useful_tags_way) + ["surface", "kerb", "incline", "wheelchair", "width", "footway", "crossing"]
ox.settings.useful_tags_node = list(ox.settings.useful_tags_node) + ["kerb", "crossing"]


GRID = 0.0005  # degrees (~50 m); the source DEM is ~90 m, so finer sampling adds nothing


def _fetch(points):
    params = {"latitude": ",".join(f"{lat:.6f}" for lat, _ in points),
              "longitude": ",".join(f"{lng:.6f}" for _, lng in points)}
    for attempt in range(8):
        r = httpx.get("https://api.open-meteo.com/v1/elevation", params=params, timeout=30)
        if r.status_code == 200:
            return r.json()["elevation"]
        time.sleep(min(60, 5 * 2 ** attempt))
    r.raise_for_status()


SMOOTH = 2  # mean filter radius in grid cells (~250 m window) to remove building/tree bumps in the surface model
GRID_FILE = DATA / "elevation_grid.json"


def elevation_grid(G) -> dict:
    """Regular elevation grid over the graph; fetched once from Open-Meteo, then cached in data/."""
    if GRID_FILE.exists():
        return json.loads(GRID_FILE.read_text())
    lats = [d["y"] for _, d in G.nodes(data=True)]
    lngs = [d["x"] for _, d in G.nodes(data=True)]
    lat0, lng0 = min(lats) - GRID, min(lngs) - GRID
    rows = int((max(lats) - lat0) / GRID) + 2
    cols = int((max(lngs) - lng0) / GRID) + 2
    points = [(lat0 + i * GRID, lng0 + j * GRID) for i in range(rows) for j in range(cols)]
    values = []
    for i in range(0, len(points), 100):
        values += _fetch(points[i:i + 100])
        time.sleep(3)
    grid = {"lat0": lat0, "lng0": lng0, "step": GRID, "rows": rows, "cols": cols,
            "source": "Open-Meteo elevation API (Copernicus DEM GLO-90)", "values": values}
    GRID_FILE.write_text(json.dumps(grid))
    return grid


def smoothed(grid: dict) -> list[list[float]]:
    rows, cols, v = grid["rows"], grid["cols"], grid["values"]
    raw = [v[i * cols:(i + 1) * cols] for i in range(rows)]
    out = []
    for i in range(rows):
        row = []
        for j in range(cols):
            cells = [raw[a][b] for a in range(max(0, i - SMOOTH), min(rows, i + SMOOTH + 1))
                     for b in range(max(0, j - SMOOTH), min(cols, j + SMOOTH + 1))]
            row.append(sum(cells) / len(cells))
        out.append(row)
    return out


def elevations(G) -> dict:
    """Bilinearly interpolate each node's elevation from the smoothed grid."""
    g = elevation_grid(G)
    grid, rows, cols, step = smoothed(g), g["rows"], g["cols"], g["step"]
    out = {}
    for n, d in G.nodes(data=True):
        fi, fj = (d["y"] - g["lat0"]) / step, (d["x"] - g["lng0"]) / step
        i, j = max(0, min(int(fi), rows - 2)), max(0, min(int(fj), cols - 2))
        ty, tx = fi - i, fj - j
        top = grid[i][j] * (1 - tx) + grid[i][j + 1] * tx
        bot = grid[i + 1][j] * (1 - tx) + grid[i + 1][j + 1] * tx
        out[n] = top * (1 - ty) + bot * ty
    return out


def both_ways(G, u, v, attrs):
    G.add_edge(u, v, 0, **attrs)
    G.add_edge(v, u, 0, **attrs)


def main():
    G = ox.graph_from_point(CENTER, dist=700, network_type="walk", simplify=False, retain_all=False)
    nx.set_node_attributes(G, elevations(G), "elevation")
    G = ox.add_edge_grades(G, add_absolute=True)
    ov = json.loads((DATA / "overrides.json").read_text())
    # OSM tags kerbs on nodes: copy a node's kerb tag onto the edges that touch it.
    for u, v, k, d in G.edges(keys=True, data=True):
        kerb = G.nodes[v].get("kerb") or G.nodes[u].get("kerb")
        if kerb:
            d["kerb"] = kerb
        d["slope_measured"] = False
    for s in ov["slopes"]:
        for a, b in ((s["u"], s["v"]), (s["v"], s["u"])):
            if G.has_edge(a, b):
                for d in G.get_edge_data(a, b).values():
                    d["grade_abs"] = s["gradePct"] / 100
                    d["slope_measured"] = True
    st = ov["station"]
    G.add_node(st["id"], y=st["platform"]["lat"], x=st["platform"]["lng"], station=st["id"])
    for ex in ov["exits"]:
        n = ex["osmNode"]
        assert n in G, f"exit node {n} missing from graph"
        attrs = dict(length=20.0, kind=ex["via"], exit_id=ex["id"], grade_abs=0.0, slope_measured=False)
        if ex["via"] == "steps":
            attrs["highway"] = "steps"
        both_ways(G, st["id"], n, attrs)
        G.nodes[n]["exit_id"] = ex["id"]
    for e in ov["edges"]:
        both_ways(G, e["u"], e["v"], {k: v for k, v in e.items() if k not in ("u", "v")})
    ox.save_graphml(G, DATA / "graph.graphml")
    print("saved", len(G), "nodes", G.number_of_edges(), "edges")


if __name__ == "__main__":
    main()
