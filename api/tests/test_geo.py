from app.routing.geo import (
    decode_polyline6, in_bbox, parse_bbox, point_line_distance_m, segment_polygon, square_around,
)
from app.routing.graph import dist_m


def encode_polyline6(points):
    """Reference encoder (Google polyline algorithm, precision 6) used only to test the decoder."""
    out, prev = [], (0, 0)
    for lat, lng in points:
        cur = (round(lat * 1e6), round(lng * 1e6))
        for v in (cur[0] - prev[0], cur[1] - prev[1]):
            v = ~(v << 1) if v < 0 else v << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        prev = cur
    return "".join(out)


def test_decode_polyline6_round_trip():
    pts = [(-33.873201, 151.206612), (-33.8699, 151.2091), (-33.866103, 151.212901)]
    assert decode_polyline6(encode_polyline6(pts)) == pts


def test_decode_empty():
    assert decode_polyline6("") == []


def test_square_is_closed_ring_about_6m():
    ring = square_around(-33.87, 151.21, half_m=3)
    assert len(ring) == 5 and ring[0] == ring[-1]
    (lng0, lat0), (lng2, lat2) = ring[0], ring[2]
    assert 7 < dist_m(lat0, lng0, lat2, lng2) < 10  # diagonal of a 6 m square is about 8.5 m


def test_segment_polygon_is_closed_and_wraps_segment():
    a, b = (-33.87, 151.21), (-33.871, 151.211)
    ring = segment_polygon(a, b, half_width_m=3)
    assert ring[0] == ring[-1] and len(ring) == 5
    lats = [p[1] for p in ring]
    lngs = [p[0] for p in ring]
    assert min(lats) < -33.871 and max(lats) > -33.87 and min(lngs) < 151.21 and max(lngs) > 151.211


def test_bbox():
    b = parse_bbox("149.97,-34.33,151.63,-32.99")
    assert in_bbox(-33.87, 151.21, b) and not in_bbox(-37.81, 144.96, b)


def test_point_line_distance():
    line = [(-33.87, 151.20), (-33.87, 151.22)]
    assert point_line_distance_m(-33.87, 151.21, line) < 1
    assert 100 < point_line_distance_m(-33.869, 151.21, line) < 120
    assert point_line_distance_m(-33.87, 151.21, [(-33.87, 151.21)]) < 1
