MODEL = "claude-sonnet-5-5"
SYSTEM = ("Write a plain-English route explanation for a person with mobility needs, in at most two short sentences. "
          "Say which station exit or lift to use and why, how many minutes longer than the fastest route it is, and what "
          "it avoids. Use only the facts given. No greetings, no markdown.")


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


def explain_route(facts: dict, client) -> str:
    if client is None or not facts.get("ok"):
        return template_explanation(facts)
    try:
        r = client.messages.create(model=MODEL, max_tokens=1024, system=SYSTEM,
                                   messages=[{"role": "user", "content": f"Facts: {facts}"}])
        text = next((b.text for b in r.content if b.type == "text"), "").strip()
        return text if r.stop_reason != "refusal" and text else template_explanation(facts)
    except Exception:
        return template_explanation(facts)
