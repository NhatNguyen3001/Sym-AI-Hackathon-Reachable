import re
from typing import Literal
from pydantic import BaseModel
from app.routing.profile import Profile, Avoid, Destination

AID_SLOPES = {"manual_wheelchair": 5, "power_wheelchair": 8, "walker": 6, "cane": 8, "pram": 8}
MODEL = "claude-haiku-5-5"


class ProfileOut(BaseModel):
    aid: Literal["manual_wheelchair", "power_wheelchair", "walker", "cane", "pram"]
    max_slope: int
    avoid_stairs: bool
    avoid_kerbs_no_ramp: bool
    avoid_slippery_when_wet: bool
    avoid_uneven: bool
    need_entrance: bool
    need_toilet: bool
    need_parking: bool


SYSTEM = ("You turn a person's plain-English description of their mobility needs into route settings. "
          "aid must be one of the allowed values; pick the closest. max_slope is the steepest slope in percent they "
          "can manage (2-12); if not stated use: manual_wheelchair 5, power_wheelchair 8, walker 6, cane 8, pram 8. "
          "Wheeled aids avoid stairs and kerbs without a ramp unless the person says otherwise. Avoid slippery paths "
          "when wet unless they say it doesn't matter. Only set destination needs they mention, except a level "
          "entrance, which wheeled aids always need.")


def _clamp(slope: int) -> int:
    return max(2, min(12, slope))


def rule_parse(text: str) -> Profile:
    t = text.lower()
    if re.search(r"power|electric", t) and "chair" in t:
        aid = "power_wheelchair"
    elif "chair" in t:
        aid = "manual_wheelchair"
    elif re.search(r"walker|frame|rollator", t):
        aid = "walker"
    elif re.search(r"cane|crutch|stick", t):
        aid = "cane"
    elif re.search(r"pram|stroller|buggy", t):
        aid = "pram"
    else:
        aid = "manual_wheelchair"
    m = re.search(r"(\d{1,2})\s*%", t)
    slope = _clamp(int(m.group(1))) if m else AID_SLOPES[aid]
    stairs_ok = re.search(r"stairs (are )?(ok|fine)|can (do|manage) stairs", t)
    wheeled = aid in ("manual_wheelchair", "power_wheelchair", "pram", "walker")
    return Profile(
        aid=aid, max_slope=slope, text=text,
        avoid=Avoid(stairs=not stairs_ok and (wheeled or "stairs" in t), kerbs_no_ramp=wheeled or "kerb" in t,
                    slippery_when_wet=True, uneven=bool(re.search(r"gravel|grass|uneven", t))),
        destination=Destination(entrance=wheeled or "entrance" in t, toilet="toilet" in t, parking="parking" in t))


def parse_profile(text: str, client) -> Profile:
    if client is None:
        return rule_parse(text)
    try:
        r = client.messages.parse(model=MODEL, max_tokens=1024, system=SYSTEM,
                                  messages=[{"role": "user", "content": text}], output_format=ProfileOut)
        if r.stop_reason == "refusal" or r.parsed_output is None:
            return rule_parse(text)
        o = r.parsed_output
        return Profile(aid=o.aid, max_slope=_clamp(o.max_slope), text=text,
                       avoid=Avoid(stairs=o.avoid_stairs, kerbs_no_ramp=o.avoid_kerbs_no_ramp,
                                   slippery_when_wet=o.avoid_slippery_when_wet, uneven=o.avoid_uneven),
                       destination=Destination(entrance=o.need_entrance, toilet=o.need_toilet, parking=o.need_parking))
    except Exception:
        return rule_parse(text)
