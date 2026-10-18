"""Accessible places in Greater Sydney from OpenStreetMap (spec section 4a)."""
import math

# Greater Sydney for gathering: west, south, east, north.
SYDNEY = (150.5, -34.2, 151.4, -33.4)
TILE_DEG = 0.3
YES = ("yes", "designated")
VENUE_AMENITIES = ("cafe", "restaurant", "fast_food", "library", "pharmacy", "doctors", "cinema", "bank",
                   "community_centre", "townhall", "theatre", "hospital", "clinic", "post_office")
FALLBACK = {"toilet": "Accessible toilet", "parking": "Accessible parking", "entrance": "Step-free entrance",
            "venue": "Accessible place"}
TYPE_LETTER = {"node": "n", "way": "w", "relation": "r"}


def query(bbox) -> str:
    w, s, e, n = bbox
    b = f"({s},{w},{n},{e})"
    venues = "|".join(VENUE_AMENITIES)
    return (f'[out:json][timeout:90];('
            f'nwr["amenity"="toilets"]["wheelchair"~"^(yes|designated|limited)$"]{b};'
            f'nwr["toilets:wheelchair"~"^(yes|designated)$"]{b};'
            f'nwr["amenity"="parking_space"]["parking_space"="disabled"]{b};'
            f'nwr["amenity"="parking"]["capacity:disabled"]{b};'
            f'nwr["entrance"]["wheelchair"~"^(yes|designated)$"]{b};'
            f'nwr["amenity"~"^({venues})$"]["wheelchair"~"^(yes|designated)$"]{b};'
            f'nwr["shop"]["wheelchair"~"^(yes|designated)$"]{b};'
            f');out tags center;')


def _disabled_capacity(v: str | None) -> bool:
    if v is None:
        return False
    if v == "yes":
        return True
    try:
        return int(v) > 0
    except ValueError:
        return False


def _kind(t: dict) -> tuple[str, list[str]] | None:
    """The kind of place and the tags it was chosen for."""
    if t.get("amenity") == "toilets" and t.get("wheelchair") in (*YES, "limited"):
        return "toilet", ["amenity", "wheelchair"]
    if t.get("toilets:wheelchair") in YES:
        return "toilet", ["toilets:wheelchair"]
    if t.get("amenity") == "parking_space" and t.get("parking_space") == "disabled":
        return "parking", ["amenity", "parking_space"]
    if t.get("amenity") == "parking" and _disabled_capacity(t.get("capacity:disabled")):
        return "parking", ["amenity", "capacity:disabled"]
    if "entrance" in t and t.get("wheelchair") in YES:
        return "entrance", ["entrance", "wheelchair"]
    if t.get("wheelchair") in YES and (t.get("amenity") in VENUE_AMENITIES or "shop" in t):
        return "venue", ["amenity" if "amenity" in t else "shop", "wheelchair"]
    return None


def classify(el: dict) -> dict | None:
    tags = el.get("tags") or {}
    found = _kind(tags)
    if found is None:
        return None
    kind, keys = found
    lat, lng = (el["lat"], el["lon"]) if "lat" in el else (el["center"]["lat"], el["center"]["lon"])
    return {"id": f"place:osm-{TYPE_LETTER[el['type']]}{el['id']}", "osm_id": f"{el['type']}/{el['id']}",
            "name": tags.get("name") or FALLBACK[kind], "kind": kind, "lat": lat, "lng": lng,
            "tags": {k: tags[k] for k in keys if k in tags}}


def tiles(bbox, step: float = TILE_DEG) -> list[tuple[float, float, float, float]]:
    w, s, e, n = bbox
    cols, rows = math.ceil(round((e - w) / step, 6)), math.ceil(round((n - s) / step, 6))
    out = []
    for i in range(rows):
        for j in range(cols):
            out.append((round(w + j * step, 6), round(s + i * step, 6),
                        min(e, round(w + (j + 1) * step, 6)), min(n, round(s + (i + 1) * step, 6))))
    return out


def tile_key(t) -> str:
    return ",".join(f"{v:.3f}" for v in t)
