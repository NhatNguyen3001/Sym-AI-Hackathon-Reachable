from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session

from app.agents import log_run
from app.db import get_session
from app.errors import ApiError
from app.llm.explain import explain_route
from app.routing.graph import dist_m
from app.routing.profile import DEFAULT_PROFILE, Profile
from app.routing.route import find_routes
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


@router.post("/route")
def plan_route(body: RouteIn, request: Request, session: Session = Depends(get_session)):
    st = request.app.state
    start, end = st.places.get(body.from_), st.places.get(body.to)
    if not start or not end:
        raise ApiError(404, "place_not_found", "We couldn't find that place. Pick one from the list.")
    weather = st.weather.current()
    ctx = build_context(session, weather["raining"])
    r = find_routes(st.graph, start, end, body.profile, ctx, st.settings.speed_mps, st.places.exit_names)
    lifts = [row for p in (start, end) if p.kind == "station" for row in lift_rows(session, st.places, p.id)]
    lifts_out = [st.places.exit_names[row["exitId"]] for row in lifts if row["status"] == "Out of service"]
    log_run(session, "route", f"Planned {start.name} to {end.name}.")
    if not r["ok"]:
        return {**r, "liftStatus": lifts, "weather": weather, "explanation": explain_route({"ok": False}, None)}
    acc, fast = r["accessible"], r["fastest"]
    avoided = []
    if acc["stepFree"] and not fast["stepFree"]:
        avoided.append("the stairs")
    if fast["maxSlope"] > body.profile.max_slope:
        avoided.append("a steep section")
    facts = {"ok": True, "minutes": acc["minutes"], "minutesLonger": r["minutesLonger"],
             "exitName": st.places.exit_names.get(r["exitUsed"]) if r["exitUsed"] else None,
             "liftsOut": lifts_out, "raining": weather["raining"], "avoided": avoided}
    barriers = [{"id": b.id, "type": b.type, "title": b.title, "status": b.status, "lat": b.lat, "lng": b.lng}
                for b in active_barriers(session) if b.type != "lift_outage" and _near(b, (acc, fast))]
    status = "Some details not sure" if any(s["confidence"] == "Not sure" for s in r["steps"]) else "Confirmed today"
    out = {k: v for k, v in r.items() if k != "edges"}
    return {**out, "liftStatus": lifts, "barriers": barriers, "explanation": explain_route(facts, st.llm),
            "status": status, "weather": weather}
