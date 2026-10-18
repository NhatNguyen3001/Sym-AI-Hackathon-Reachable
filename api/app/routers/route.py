from functools import partial

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session

from app.agents import ago
from app.db import get_session
from app.errors import ApiError
from app.llm.explain import explain_transit, template_explanation, template_transit
from app.routing.graph import dist_m
from app.routing.profile import DEFAULT_PROFILE, Profile
from app.routing.router import CAMPUS_NOTE
from app.routing.valhalla import TOO_LONG, OutOfArea, RoutingUnavailable
from app.state import active_barriers, build_context, lift_rows
from app.transit.rank import rank
from app.transit.tfnsw import TransitUnavailable

router = APIRouter()
NEAR_ROUTE_M = 25
TRANSIT_NOTE = "Public transport options unavailable right now."
NO_TRANSIT_TRIP = "No step-free public transport trip found right now."
ROUTING_DOWN = "Route planning is unavailable right now. Please try again soon."


class RouteIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_: str = Field(alias="from")
    to: str
    profile: Profile = DEFAULT_PROFILE


def _near(b, routes) -> bool:
    return any(dist_m(b.lat, b.lng, lat, lng) <= NEAR_ROUTE_M
               for r in routes if r for lng, lat in r["geometry"]["coordinates"])


NOT_FOUND = "We couldn't find that place. Pick one from the list."


def leg_walk(st, start, end, profile, ctx) -> dict:
    """Walks to and from stations: the campus graph when both ends are on it, else the Sydney router. Never raises."""
    try:
        if st.campus.covers(start) and st.campus.covers(end):
            return st.campus.plan(start, end, profile, ctx)
        if st.settings.router == "campus":
            return {"ok": False}
        return st.router.plan(start, end, profile, ctx)
    except (OutOfArea, RoutingUnavailable):
        return {"ok": False}


def walk_option(r: dict, end) -> dict:
    acc = r["accessible"]
    return {"id": "walk", "wayId": "walk", "mode": "walk", "minutes": acc["minutes"], "summary": f"Walk or roll {acc['minutes']} min",
            "stepFree": acc["stepFree"], "interchanges": 0, "warnings": [], "liftAlerts": [], "stations": [],
            "legs": [{"kind": "walk", **acc, "steps": r["steps"], "source": "reachable", "to": end.name}],
            "unsure": sum(1 for s in r["steps"] if s["confidence"] == "Not sure")}


def _lift_alerts(session) -> list[dict]:
    """Active Transport for NSW lift alerts, for matching against a journey's stations."""
    out = []
    for b in active_barriers(session):
        s = b.sources[-1] if b.type == "lift_outage" and b.sources else {}
        if s.get("alertId"):
            out.append({"alertId": s["alertId"], "stopId": s.get("stopId"), "text": s.get("text", ""), "url": s.get("url")})
    return out


def _station_rows(session, st, opt: dict) -> list[dict]:
    """Lift rows for the stations a transit option uses (campus station: per exit)."""
    feed = st.lift_feed
    by_stop: dict = {}
    for b in active_barriers(session):
        if b.type == "lift_outage" and b.sources and b.status == "confirmed":
            by_stop.setdefault(b.sources[-1].get("stopId"), []).append(b)
    rows = []
    for s in opt.get("stations", []):
        if s["stopId"] and s["stopId"] == st.places.station_stop_id:
            rows += lift_rows(session, st.places, st.places.station_id, feed)
            continue
        out = by_stop.get(s["stopId"], [])
        rows.append({"exitId": None, "exit": f"{s['name']} lifts",
                     "status": "Out of service" if out else ("Working" if feed.fresh() else "Not sure"),
                     "source": feed.source(), "updated": ago(out[0].first_seen) if out else feed.updated(),
                     "lat": s.get("lat"), "lng": s.get("lng")})
    return rows


def _status(steps: list[dict], estimated: bool) -> str:
    if any(s["confidence"] == "Not sure" for s in steps):
        return "Some details not sure"
    return "Slopes estimated" if estimated else "Confirmed today"


@router.post("/route")
def plan_route(body: RouteIn, request: Request, tasks: BackgroundTasks, session: Session = Depends(get_session)):
    st = request.app.state
    start, end = st.resolver.get(body.from_), st.resolver.get(body.to)
    if not start or not end:
        raise ApiError(404, "place_not_found", NOT_FOUND)
    weather = st.weather.current(start.lat, start.lng)
    if start.id == end.id or dist_m(start.lat, start.lng, end.lat, end.lng) < 5:
        return {"ok": False, "reason": "Start and destination are the same place.",
                "suggestion": "Pick a different destination.", "fastest": None, "liftStatus": [], "weather": weather,
                "explanation": "", "options": []}
    ctx = build_context(session, weather["raining"])
    for p in (start, end):
        st.resolver.ensure_exits(p)
    note, walk_down = None, False
    try:
        # Campus trips use the campus graph: measured slopes and a hard slope limit (spec section 8).
        if st.campus.covers(start) and st.campus.covers(end):
            r = st.campus.plan(start, end, body.profile, ctx)
        else:
            r = st.router.plan(start, end, body.profile, ctx)
    except OutOfArea:
        raise ApiError(422, "out_of_area", "We only cover Greater Sydney for now.")
    except RoutingUnavailable:
        if st.campus.covers(start) and st.campus.covers(end):
            r, note = st.campus.plan(start, end, body.profile, ctx), CAMPUS_NOTE
        else:  # no Sydney walking route, but public transport may still get there
            r, walk_down = {"ok": False, "reason": ROUTING_DOWN, "suggestion": "", "fastest": None}, True
    lifts = [row for p in (start, end) if st.places.get(p.id) and p.kind == "station"
             for row in lift_rows(session, st.places, p.id, st.lift_feed)]
    for p in (start, end):
        if st.resolver.claim_save(p):
            tasks.add_task(st.resolver.save_quietly, [p])
    extra = {"note": note} if note else {}

    # Public transport options (cycle 3), for trips longer than TRANSIT_MIN_KM.
    transit, far = [], dist_m(start.lat, start.lng, end.lat, end.lng) > st.settings.transit_min_km * 1000
    if st.transit and far:
        try:
            transit = st.transit.plan(start, end, body.profile, ctx, _lift_alerts(session), walk=partial(leg_walk, st))
        except TransitUnavailable:
            extra["transitNote"] = TRANSIT_NOTE
    for o in transit:
        o["explanation"] = template_transit(o)
    options = rank(([walk_option(r, end)] if r["ok"] else []) + transit)
    # Each option carries the lift rows of the stations it uses; the page shows the chosen one's (spec §10.5).
    for o in options:
        if o["mode"] == "walk":
            o["liftStatus"] = lifts
        else:
            known = {row["exit"] for row in lifts}
            o["liftStatus"] = lifts + [row for row in _station_rows(session, st, o) if row["exit"] not in known]
    top = options[0] if options else None
    if top:
        lifts = top["liftStatus"]

    if not r["ok"] and not options:
        if walk_down:
            raise ApiError(503, "routing_unavailable", ROUTING_DOWN)
        if st.transit and far and "transitNote" not in extra and r["reason"] == TOO_LONG:
            r = {**r, "reason": NO_TRANSIT_TRIP}
        return {**r, **extra, "options": [], "liftStatus": lifts, "weather": weather,
                "explanation": template_explanation({"ok": False})}

    if not r["ok"]:  # too far to walk, but public transport works
        walks = [leg for leg in top["legs"] if leg["kind"] == "walk"]
        barriers = [{"id": b.id, "type": b.type, "title": b.title, "status": b.status, "lat": b.lat, "lng": b.lng}
                    for b in active_barriers(session) if b.type != "lift_outage" and _near(b, walks)]
        return {"ok": True, "accessible": None, "fastest": None, "minutesLonger": 0, "steps": [], "exitUsed": None,
                **extra, "options": options, "liftStatus": lifts, "barriers": barriers,
                "explanation": explain_transit(top, st.llm),
                "status": _status([s for leg in walks for s in leg["steps"]], any(leg.get("slopeEstimated") for leg in walks)),
                "weather": weather}

    acc = r["accessible"]
    fast = r.get("fastest") or acc
    avoided = []
    if acc["stepFree"] and not fast["stepFree"]:
        avoided.append("the stairs")
    if fast["maxSlope"] > body.profile.max_slope:
        avoided.append("a steep section")
    lifts_out = [st.places.exit_names[row["exitId"]] for row in lifts
                 if row["status"] == "Out of service" and row["exitId"] in st.places.exit_names]
    facts = {"ok": True, "minutes": acc["minutes"], "minutesLonger": r["minutesLonger"],
             "exitName": st.places.exit_names.get(r["exitUsed"]) if r.get("exitUsed") else None,
             "liftsOut": lifts_out, "raining": weather["raining"], "avoided": avoided}
    barriers = [{"id": b.id, "type": b.type, "title": b.title, "status": b.status, "lat": b.lat, "lng": b.lng}
                for b in active_barriers(session)
                if b.type != "lift_outage" and _near(b, (acc, fast, *r.get("alternatives", [])))]
    out = {k: v for k, v in r.items() if k != "edges"}
    # The page shows Claude's words only for public transport; a walk route's summary line comes from the template.
    explanation = explain_transit(top, st.llm) if top["mode"] == "transit" else template_explanation(facts)
    return {**out, **extra, "options": options, "liftStatus": lifts, "barriers": barriers, "explanation": explanation,
            "status": _status(r["steps"], acc.get("slopeEstimated")), "weather": weather}
