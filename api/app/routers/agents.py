from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from app.agents import agent_cards, log_run
from app.db import get_session

router = APIRouter()


@router.get("/agents/status")
def status(request: Request, session: Session = Depends(get_session)):
    return agent_cards(session, request.app.state.lift_feed)


@router.post("/agents/updates/run")
async def run_updates(request: Request, session: Session = Depends(get_session)):
    st = request.app.state
    if st.lift_poller:
        summary = await st.lift_poller.run_once()  # logs its own run
    else:
        summary = "Live lift alerts are off. Checked the weather."
        log_run(session, "updates", summary)
    await st.broadcaster.publish("agent_run", {"agent": "updates", "summary": summary})
    return {"ok": True, "summary": summary}
