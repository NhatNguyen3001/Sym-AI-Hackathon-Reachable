from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session

from app.agents import log_run
from app.db import get_session
from app.errors import ApiError
from app.llm.explain import explain_route
from app.routing.graph import dist_m
from app.routing.profile import DEFAULT_PROFILE, Profile
from app.routing.router import CAMPUS_NOTE
from app.routing.valhalla import OutOfArea, RoutingUnavailable
from app.state import active_barriers, build_context, lift_rows

router = APIRouter()
NEAR_ROUTE_M = 25


class RouteIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_: str = Field(alias="from")
    to: str
    profile: Profile = DEFAULT_PROFILE


def _near(b, routes) -> bool:
    return any(dist_m(b.lat, b.lng, lat, lng) <= NEAR_ROUTE_M
               for r in routes if r for lng, lat in r["geometry"]["coordinates"])


NOT_FOUND = "We couldn't find that place. Pick one from the list."


@router.post("/route")
def plan_route(body: RouteIn, request: Request, session: Session = Depends(get_session)):
    st = request.app.state
    start, end = st.resolver.get(body.from_), st.resolver.get(body.to)
    if not start or not end:
        raise ApiError(404, "place_not_found", NOT_FOUND)
    weather = st.weather.current(start.lat, start.lng)
    if start.id == end.id or dist_m(start.lat, start.lng, end.lat, end.lng) < 5:
        return {"ok": False, "reason": "Start and destination are the same place.",
                "suggestion": "Pick a different destination.", "fastest": None, "liftStatus": [], "weather": weather,
                "explanation": ""}
    ctx = build_context(session, weather["raining"])
    for p in (start, end):
        st.resolver.ensure_exits(p)
    note = None
    try:
        # Campus trips use the campus graph: measured slopes and a hard slope limit (spec section 8).
        if st.campus.covers(start) and st.campus.covers(end):
            r = st.campus.plan(start, end, body.profile, ctx)
        else:
            r = st.router.plan(start, end, body.profile, ctx)
    except OutOfArea:
        raise ApiError(422, "out_of_area", "We only cover Greater Sydney for now.")
    except RoutingUnavailable:
        if not (st.campus.covers(start) and st.campus.covers(end)):
            raise ApiError(503, "routing_unavailable", "Route planning is unavailable right now. Please try again soon.")
        r, note = st.campus.plan(start, end, body.profile, ctx), CAMPUS_NOTE
    lifts = [row for p in (start, end) if st.places.get(p.id) and p.kind == "station"
             for row in lift_rows(session, st.places, p.id)]
    lifts_out = [st.places.exit_names[row["exitId"]] for row in lifts if row["status"] == "Out of service"]
    log_run(session, "route", f"Planned {start.name} to {end.name}.")
    extra = {"note": note} if note else {}
    if not r["ok"]:
        return {**r, **extra, "liftStatus": lifts, "weather": weather, "explanation": explain_route({"ok": False}, None)}
    acc = r["accessible"]
    fast = r.get("fastest") or acc
    avoided = []
    if acc["stepFree"] and not fast["stepFree"]:
        avoided.append("the stairs")
    if fast["maxSlope"] > body.profile.max_slope:
        avoided.append("a steep section")
    facts = {"ok": True, "minutes": acc["minutes"], "minutesLonger": r["minutesLonger"],
             "exitName": st.places.exit_names.get(r["exitUsed"]) if r.get("exitUsed") else None,
             "liftsOut": lifts_out, "raining": weather["raining"], "avoided": avoided}
    barriers = [{"id": b.id, "type": b.type, "title": b.title, "status": b.status, "lat": b.lat, "lng": b.lng}
                for b in active_barriers(session) if b.type != "lift_outage" and _near(b, (acc, fast))]
    if any(s["confidence"] == "Not sure" for s in r["steps"]):
        status = "Some details not sure"
    elif acc.get("slopeEstimated"):
        status = "Slopes estimated"
    else:
        status = "Confirmed today"
    out = {k: v for k, v in r.items() if k != "edges"}
    return {**out, **extra, "liftStatus": lifts, "barriers": barriers, "explanation": explain_route(facts, st.llm),
            "status": status, "weather": weather}
