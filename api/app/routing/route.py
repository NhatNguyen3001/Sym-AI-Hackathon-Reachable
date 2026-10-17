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


def _same_line(a, b) -> bool:
    return a["geometry"]["coordinates"] == b["geometry"]["coordinates"]


def _alt_summary(alt, primary) -> str:
    """One plain sentence a non-specialist can compare with the recommended route. Steps are always named first."""
    slower = alt["minutes"] - primary["minutes"]
    if not alt["stepFree"] and primary["stepFree"]:
        return "Faster, but it has steps" if slower < 0 else "Another way, but it has steps"
    if alt["maxSlope"] < primary["maxSlope"] and slower > 0:
        return f"Gentler slope, but about {slower} min slower"
    if alt["maxSlope"] < primary["maxSlope"] and slower <= 0:
        return "Gentler slope, and no slower"
    if alt["minutes"] < primary["minutes"] and alt["maxSlope"] > primary["maxSlope"]:
        return "Faster, but steeper"
    if slower > 0 and alt["maxSlope"] == primary["maxSlope"] and alt["stepFree"] == primary["stepFree"]:
        return f"A longer way around, about {slower} min slower, with the same slope"
    if slower > 0:
        return f"Another way, about {slower} min slower"
    if slower < 0:
        return f"About {-slower} min faster"
    return "Another way, about the same time"


def _other_routes(G, src, dst, primary, primary_edges, speed_mps, ctx: Context, exit_names, profile, acc_w) -> list[dict]:
    """Up to two real alternatives, drawn dashed on the map. They follow the same rules as the recommended route
    (stairs, lift outages, barriers, kerbs, slope limit): a flatter way, then a way that avoids the recommended one."""
    found: list[dict] = []

    def add(edges):
        if not edges or len(found) >= 2:
            return
        item = _summary(G, edges, speed_mps)
        if _same_line(item, primary) or any(_same_line(item, other) for other in found):
            return
        if (profile.avoid.stairs and not item["stepFree"]) or item["maxSlope"] > profile.max_slope:
            return  # belt and braces: acc_w already rules these out
        item["summary"] = _alt_summary(item, primary)
        item["steps"] = group_steps(G, edges, ctx, exit_names)
        found.append(item)

    def gentle_w(u, v, k, d):
        cost = acc_w(u, v, k, d)
        grade = float(d.get("grade_abs", 0) or 0) * 100
        return cost if cost == math.inf else cost * (1 + grade * grade)

    used = set(primary_edges)

    def detour_w(u, v, k, d):
        cost = acc_w(u, v, k, d)
        return cost * 8 if (u, v, k) in used and cost != math.inf else cost

    add(_path(G, src, dst, gentle_w))
    add(_path(G, src, dst, detour_w))
    return found


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
        return {"ok": False, "reason": reason, "suggestion": SUGGESTION, "fastest": fastest, "alternatives": []}
    accessible = _summary(G, acc, speed_mps)
    fastest = fastest or accessible
    exit_used = next((G.edges[e].get("exit_id") for e in acc if G.edges[e].get("exit_id")), None)
    return {"ok": True, "accessible": accessible, "fastest": fastest,
            "minutesLonger": max(0, accessible["minutes"] - fastest["minutes"]),
            "steps": group_steps(G, acc, ctx, exit_names), "exitUsed": exit_used,
            "alternatives": _other_routes(G, start.node, end.node, accessible, acc, speed_mps, ctx, exit_names, profile, acc_w),
            "edges": [edge_id(*e) for e in acc]}
