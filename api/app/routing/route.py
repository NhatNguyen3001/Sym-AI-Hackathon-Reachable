import math
import networkx as nx
from app.routing.cost import Context, edge_cost, is_steps
from app.routing.graph import edge_id
from app.routing.steps import group_steps

SUGGESTION = "Try a nearby station with working lifts, or an accessible drop-off point."


def _best_key(G, u, v, weight_fn):
    return min(G.get_edge_data(u, v).items(), key=lambda kd: weight_fn(u, v, kd[0], kd[1]))[0]


def _path(G, src, dst, weight_fn):
    def w(u, v, data):  # data: {key: attrs} for a MultiDiGraph
        best = min(weight_fn(u, v, k, d) for k, d in data.items())
        return None if best == math.inf else best
    try:
        nodes = nx.dijkstra_path(G, src, dst, weight=w)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None
    return [(u, v, _best_key(G, u, v, weight_fn)) for u, v in zip(nodes, nodes[1:])]


def _summary(G, edges, speed_mps):
    coords = [[G.nodes[edges[0][0]]["x"], G.nodes[edges[0][0]]["y"]]]
    for u, v, k in edges:
        coords.append([G.nodes[v]["x"], G.nodes[v]["y"]])
    dist = sum(float(G.edges[e]["length"]) for e in edges)
    max_slope = max((float(G.edges[e].get("grade_abs", 0) or 0) * 100 for e in edges), default=0)
    return {"geometry": {"type": "LineString", "coordinates": coords}, "distanceM": round(dist),
            "minutes": max(1, math.ceil(dist / speed_mps / 60)), "maxSlope": round(max_slope),
            "stepFree": not any(is_steps(G.edges[e]) for e in edges)}


def find_routes(G, start, end, profile, ctx: Context, speed_mps: float, exit_names: dict[str, str] | None = None) -> dict:
    def acc_w(u, v, k, d):
        return edge_cost(edge_id(u, v, k), d, profile, ctx)

    def len_w(u, v, k, d):
        return float(d.get("length", 0))

    fast = _path(G, start.node, end.node, len_w)
    fastest = _summary(G, fast, speed_mps) if fast else None
    acc = _path(G, start.node, end.node, acc_w)
    if not acc:
        reason = "No step-free route right now."
        for place in (start, end):
            if place.exits and set(place.exits) <= ctx.lift_out_exits:
                reason = f"Every lift at {place.name} is out of service."
        return {"ok": False, "reason": reason, "suggestion": SUGGESTION, "fastest": fastest}
    accessible = _summary(G, acc, speed_mps)
    fastest = fastest or accessible
    exit_used = next((G.edges[e].get("exit_id") for e in acc if G.edges[e].get("exit_id")), None)
    return {"ok": True, "accessible": accessible, "fastest": fastest,
            "minutesLonger": max(0, accessible["minutes"] - fastest["minutes"]),
            "steps": group_steps(G, acc, ctx, exit_names), "exitUsed": exit_used,
            "edges": [edge_id(*e) for e in acc]}
