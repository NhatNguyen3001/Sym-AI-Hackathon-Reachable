"""Demo control: flip rain on and off so the weather reroute can be shown on stage. Lift status is live (TfNSW)."""
from fastapi import APIRouter, Request

router = APIRouter(prefix="/demo")


@router.post("/rain")
async def toggle_rain(request: Request):
    w = request.app.state.weather.toggle_override()
    await request.app.state.broadcaster.publish("weather_changed", w)
    return w
