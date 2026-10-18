import json
from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

router = APIRouter()


@router.get("/events")
async def events(request: Request):
    async def stream():
        session = (request.query_params.get("session") or "")[:64] or None
        async for e in request.app.state.broadcaster.subscribe(session):
            yield {"event": e["event"], "data": json.dumps(e["data"])}
    return EventSourceResponse(stream(), ping=15)
