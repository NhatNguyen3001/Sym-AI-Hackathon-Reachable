import math
import networkx as nx
import osmnx as ox


def edge_id(u, v, k) -> str:
    return f"{u}-{v}-{k}"


def _node_id(s: str):
    """OSM node ids are ints; added nodes (e.g. the station platform) keep string ids."""
    return int(s) if s.isdigit() else s


def load_graph(path) -> nx.MultiDiGraph:
    return ox.load_graphml(path, node_dtypes={"osmid": _node_id},
                           edge_dtypes={"grade_abs": float, "length": float,
                                        "slope_measured": lambda s: s == "True"})


def dist_m(lat1, lng1, lat2, lng2) -> float:
    """Equirectangular distance in metres; accurate enough at campus scale."""
    kx = 111_320 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot((lat2 - lat1) * 110_540, (lng2 - lng1) * kx)


def nearest_node(G, lat: float, lng: float):
    return min(G.nodes, key=lambda n: dist_m(lat, lng, G.nodes[n]["y"], G.nodes[n]["x"]))


def nearest_edge(G, lat: float, lng: float) -> tuple[str, float]:
    """Nearest edge by midpoint distance. Returns (edge_id, metres)."""
    best, best_d = None, math.inf
    for u, v, k in G.edges(keys=True):
        mu, mv = G.nodes[u], G.nodes[v]
        d = dist_m(lat, lng, (mu["y"] + mv["y"]) / 2, (mu["x"] + mv["x"]) / 2)
        if d < best_d:
            best, best_d = edge_id(u, v, k), d
    return best, best_d
