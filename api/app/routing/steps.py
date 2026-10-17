from app.routing.cost import is_steps, tag_set
from app.routing.graph import edge_id

ICONS = {"flat": "check", "slope": "slope", "steps": "alert", "lift": "lift", "crossing": "crossing"}


def kind_of(d: dict) -> str:
    if d.get("kind") == "lift":
        return "lift"
    if is_steps(d):
        return "steps"
    if "crossing" in tag_set(d.get("footway")) or d.get("crossing"):
        return "crossing"
    return "slope" if float(d.get("grade_abs", 0) or 0) * 100 >= 2 else "flat"


def group_steps(G, path_edges, ctx, exit_names: dict[str, str] | None = None) -> list[dict]:
    exit_names = exit_names or {}
    groups: list[dict] = []
    for u, v, k in path_edges:
        d = G.edges[u, v, k]
        kind = kind_of(d)
        slope = round(float(d.get("grade_abs", 0) or 0) * 100)
        unsure = ctx.barriers.get(edge_id(u, v, k)) == "needs_checking" or (kind == "crossing" and d.get("kerb") is None)
        measured = bool(d.get("slope_measured"))
        last = groups[-1] if groups else None
        if last and last["kind"] == kind and kind in ("flat", "slope", "steps") and (kind != "slope" or last["slope"] == slope):
            last["length"] += float(d["length"])
            last["unsure"] |= unsure
            last["measured"] |= measured
        else:
            groups.append({"kind": kind, "slope": slope, "length": float(d["length"]), "unsure": unsure,
                           "measured": measured, "exit": d.get("exit_id")})
    out = []
    for g in groups:
        m = round(g["length"])
        exit_name = exit_names.get(g["exit"], f"{g['exit']} exit")
        label = {
            "flat": f"Flat footpath, {m} m",
            "slope": f"Gentle slope, {g['slope']}%, {m} m",
            "steps": f"Steps, {m} m",
            "lift": f"Lift at {exit_name}",
            "crossing": "Kerb ramp at crossing",
        }[g["kind"]]
        conf = "Not sure" if g["unsure"] else ("Measured" if g["measured"] else "Confirmed")
        out.append({"icon": "alert" if g["unsure"] else ICONS[g["kind"]], "label": label, "confidence": conf, "lengthM": m})
    return out
