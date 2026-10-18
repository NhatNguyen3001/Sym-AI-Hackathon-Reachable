MODEL = "claude-sonnet-5-5"


def template_explanation(f: dict) -> str:
    if not f.get("ok"):
        return ("We couldn't find a step-free route right now. Try a nearby station with working lifts, "
                "or an accessible drop-off point.")
    parts = []
    if f.get("exitName"):
        s = f"Use the lift at the {f['exitName']}"
        if f.get("liftsOut"):
            s += f", as the {' and '.join(f['liftsOut'])} lift is out of service"
        parts.append(s + ".")
    mins = f.get("minutesLonger", 0)
    avoided = list(f.get("avoided", []))
    if f.get("raining"):
        avoided.append("steep paths that are slippery in the rain")
    if mins > 0:
        s = f"{mins} min longer than the fastest route"
        if avoided:
            s += ", but it avoids " + ", ".join(avoided)
    else:
        s = "This is also the fastest route"
        if avoided:
            s += ", and it avoids " + ", ".join(avoided)
    parts.append(s + ".")
    return " ".join(parts)


TRANSIT_SYSTEM = ("Write a plain-English trip explanation for a person with mobility needs, in at most two short sentences. "
                  "Say how they get to the first station, which lifts they use, which services they take and any lift "
                  "problems. Use only the facts given. No greetings, no markdown.")


def template_transit(opt: dict) -> str:
    parts, rides = [], 0
    legs = opt["legs"]
    for i, leg in enumerate(legs):
        if leg["kind"] == "walk" and leg.get("source") == "reachable":
            last = i == len(legs) - 1 and parts
            s = ("then walk" if last else "walk") + f" {leg['minutes']} min"
            if not last:
                s += (" on a step-free path" if leg["stepFree"] else "") + f" to {leg['to']}"
            parts.append(s)
        elif leg["kind"] == "station" and any(p["type"] == "lift" for p in leg["path"]):
            parts.append("take the lift")
        elif leg["kind"] == "ride":
            n = leg["stops"]
            parts.append(f"{'change to' if rides else 'ride'} the {leg['label']} {n} stop{'' if n == 1 else 's'} "
                         f"to {leg['to']['name']}")
            rides += 1
    text = ", ".join(parts)
    text = text[:1].upper() + text[1:] + "."
    return f"{text} {opt['warnings'][0]}" if opt.get("warnings") else text


def explain_transit(opt: dict, client) -> str:
    if client is None:
        return template_transit(opt)
    facts = {"minutes": opt.get("minutes"), "liftAlerts": [a["text"] for a in opt.get("liftAlerts", [])],
             "legs": [{k: leg.get(k) for k in ("kind", "minutes", "to", "station", "label", "stops", "stepFree")}
                      | ({"path": [p["type"] for p in leg["path"]]} if leg["kind"] == "station" else {})
                      for leg in opt["legs"]]}
    try:
        r = client.messages.create(model=MODEL, max_tokens=1024, system=TRANSIT_SYSTEM,
                                   messages=[{"role": "user", "content": f"Facts: {facts}"}])
        text = next((b.text for b in r.content if b.type == "text"), "").strip()
        return text if r.stop_reason != "refusal" and text else template_transit(opt)
    except Exception:
        return template_transit(opt)
