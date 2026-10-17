"""Small geometry helpers for Valhalla requests and responses. Local equirectangular maths: fine at street scale."""
import math

M_PER_DEG_LAT = 110_540


def _m_per_deg_lng(lat: float) -> float:
    return 111_320 * math.cos(math.radians(lat))


def decode_polyline6(encoded: str) -> list[tuple[float, float]]:
    """Decode a Valhalla shape (Google polyline algorithm, precision 6) into (lat, lng) pairs."""
    coords, index, lat, lng = [], 0, 0, 0
    while index < len(encoded):
        deltas = []
        for _ in range(2):
            shift, result = 0, 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lng += deltas[1]
        coords.append((lat / 1e6, lng / 1e6))
    return coords


def square_around(lat: float, lng: float, half_m: float = 3) -> list[list[float]]:
    """Closed [lng, lat] ring: a square of side 2*half_m centred on the point."""
    dlat, dlng = half_m / M_PER_DEG_LAT, half_m / _m_per_deg_lng(lat)
    ring = [[lng - dlng, lat - dlat], [lng + dlng, lat - dlat], [lng + dlng, lat + dlat], [lng - dlng, lat + dlat]]
    return ring + [ring[0]]


def segment_polygon(a: tuple[float, float], b: tuple[float, float], half_width_m: float = 3) -> list[list[float]]:
    """Closed [lng, lat] ring around the segment a->b (lat, lng points), padded by half_width_m on every side."""
    lat0 = (a[0] + b[0]) / 2
    kx, ky = _m_per_deg_lng(lat0), M_PER_DEG_LAT
    ax, ay, bx, by = a[1] * kx, a[0] * ky, b[1] * kx, b[0] * ky
    length = math.hypot(bx - ax, by - ay) or 1.0
    ux, uy = (bx - ax) / length, (by - ay) / length  # along the segment
    nx, ny = -uy, ux  # normal
    w = half_width_m
    corners = [
        (ax - ux * w + nx * w, ay - uy * w + ny * w),
        (bx + ux * w + nx * w, by + uy * w + ny * w),
        (bx + ux * w - nx * w, by + uy * w - ny * w),
        (ax - ux * w - nx * w, ay - uy * w - ny * w),
    ]
    ring = [[x / kx, y / ky] for x, y in corners]
    return ring + [ring[0]]


def parse_bbox(text: str) -> tuple[float, float, float, float]:
    """'west,south,east,north' -> (west, south, east, north)."""
    w, s, e, n = (float(v) for v in text.split(","))
    return w, s, e, n


def in_bbox(lat: float, lng: float, bbox: tuple[float, float, float, float]) -> bool:
    w, s, e, n = bbox
    return w <= lng <= e and s <= lat <= n


def point_line_distance_m(lat: float, lng: float, line: list[tuple[float, float]]) -> float:
    """Shortest distance in metres from a point to a polyline of (lat, lng) points."""
    kx, ky = _m_per_deg_lng(lat), M_PER_DEG_LAT
    px, py = lng * kx, lat * ky
    pts = [(p[1] * kx, p[0] * ky) for p in line]
    if len(pts) == 1:
        return math.hypot(px - pts[0][0], py - pts[0][1])
    best = math.inf
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        dx, dy = x2 - x1, y2 - y1
        seg = dx * dx + dy * dy
        t = 0.0 if seg == 0 else max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / seg))
        best = min(best, math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)))
    return best
