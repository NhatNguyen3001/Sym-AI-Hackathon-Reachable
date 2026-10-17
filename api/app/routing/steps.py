from app.routing.cost import is_steps, tag_set
from app.routing.graph import edge_id

ICONS = {"flat": "check", "slope": "slope", "steps": "alert", "lift": "lift", "crossing": "crossing"}
MERGEABLE = {"flat", "slope", "steps", "crossing"}
TINY_M = 10  # flat/slope runs shorter than this fold into their neighbours


def kind_of(d: dict) -> str:
    if d.get("kind") == "lift":
        return "lift"
    if is_steps(d):
        return "steps"
    if "crossing" in tag_set(d.get("footway")) or d.get("crossing"):
        return "crossing"
    return "slope" if float(d.get("grade_abs", 0) or 0) * 100 >= 2 else "flat"


def _merge_into(a: dict, b: dict):
    a["length"] += b["length"]
    a["slope"] = max(a["slope"], b["slope"])
    a["unsure"] |= b["unsure"]
    a["measured"] |= b["measured"]


def group_steps(G, path_edges, ctx, exit_names: dict[str, str] | None = None) -> list[dict]:
    exit_names = exit_names or {}
    groups: list[dict] = []
    for u, v, k in path_edges:
        d = G.edges[u, v, k]
        kind = kind_of(d)
        g = {"kind": kind, "slope": round(float(d.get("grade_abs", 0) or 0) * 100), "length": float(d["length"]),
             "unsure": ctx.barriers.get(edge_id(u, v, k)) == "needs_checking" or (kind == "crossing" and d.get("kerb") is None),
             "measured": bool(d.get("slope_measured")), "exit": d.get("exit_id")}
        last = groups[-1] if groups else None
        if last and kind in MERGEABLE and last["kind"] == kind:
            _merge_into(last, g)
        elif last and kind in ("flat", "slope") and last["kind"] in ("flat", "slope") and g["length"] < TINY_M:
            _merge_into(last, g)
        elif last and kind in ("flat", "slope") and last["kind"] in ("flat", "slope") and last["length"] < TINY_M:
            g["length"] += last["length"]
            groups[-1] = g
        else:
            groups.append(g)
    out = []
    for g in groups:
        m = round(g["length"])
        exit_name = exit_names.get(g["exit"], f"{g['exit']} exit")
        label = {
            "flat": f"Flat footpath, {m} m",
            "slope": f"Gentle slope, up to {g['slope']}%, {m} m",
            "steps": f"Steps, {m} m",
            "lift": f"Lift at {exit_name}",
            "crossing": "Kerb ramp at crossing",
        }[g["kind"]]
        conf = "Not sure" if g["unsure"] else ("Measured" if g["measured"] else "Confirmed")
        out.append({"icon": "alert" if g["unsure"] else ICONS[g["kind"]], "label": label, "confidence": conf, "lengthM": m})
    return out
