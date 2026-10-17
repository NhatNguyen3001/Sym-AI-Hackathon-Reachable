from datetime import timedelta
from sqlmodel import Session, select, func

from app.models import AgentRun, Report, aware, now

CARDS = [
    ("updates", "Updates agent", "Watching roadworks, transport, weather and council notices."),
    ("report_checker", "Report checker", "Rechecks every user report against other sources before it changes the map."),
    ("venue", "Venue agent", "Checks entrances, toilets and parking when someone picks a destination."),
    ("route", "Route agent", "Turns your needs into a route and explains it in plain English."),
]


def log_run(session: Session, agent: str, summary: str, status: str = "done") -> AgentRun:
    run = AgentRun(agent=agent, summary=summary, status=status, finished_at=None if status == "running" else now())
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


def ago(dt) -> str:
    mins = int((now() - aware(dt)).total_seconds() // 60)
    if mins < 1:
        return "just now"
    if mins < 60:
        return f"{mins} min ago"
    hours = mins // 60
    if hours < 24:
        return f"{hours} hr ago" if hours == 1 else f"{hours} hrs ago"
    return "Today" if hours < 48 else f"{hours // 24} days ago"


def agent_cards(session: Session) -> list[dict]:
    pending = session.exec(select(func.count()).select_from(Report).where(Report.status == "pending")).one()
    cards = []
    for key, name, desc in CARDS:
        last = session.exec(select(AgentRun).where(AgentRun.agent == key).order_by(AgentRun.started_at.desc())).first()
        running = last is not None and last.status == "running" and now() - aware(last.started_at) < timedelta(minutes=5)
        if key == "report_checker" and pending:
            status, tone = f"{pending} in queue", "warn"
        elif running or (key == "updates" and last and now() - aware(last.started_at) < timedelta(minutes=5)):
            status, tone = "Running", "primary"
        else:
            status, tone = "Idle", "muted"
        if key == "updates" and last:
            desc = f"{desc} Last check {ago(last.started_at)}."
        cards.append({"name": name, "status": status, "tone": tone, "desc": desc})
    return cards
