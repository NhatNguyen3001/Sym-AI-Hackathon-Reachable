from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from app.agents import agent_cards, log_run
from app.db import get_session
from app.state import build_context

router = APIRouter()


@router.get("/agents/status")
def status(session: Session = Depends(get_session)):
    return agent_cards(session)


@router.post("/agents/updates/run")
async def run_updates(request: Request, session: Session = Depends(get_session)):
    st = request.app.state
    weather = st.weather.current()
    n = len(build_context(session, weather["raining"]).lift_out_exits)
    plural = "" if n == 1 else "s"
    summary = f"Checked lift alerts and weather. {n} lift outage{plural} active."
    log_run(session, "updates", summary)
    await st.broadcaster.publish("agent_run", {"agent": "updates", "summary": summary})
    return {"ok": True, "summary": summary}
