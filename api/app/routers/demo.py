"""Demo control: flip rain on and off so the weather reroute can be shown on stage. Lift status is live (TfNSW)."""
from fastapi import APIRouter, Request

from app.sandbox import current_box, current_session

router = APIRouter(prefix="/demo")


@router.post("/rain")
async def toggle_rain(request: Request):
    weather = request.app.state.weather
    box = current_box()
    if box is not None:  # sandbox: rain only on this phone
        box.rain = not weather.current()["raining"]
        w = weather.current()
        await request.app.state.broadcaster.publish("weather_changed", w, session=current_session.get())
        return w
    w = weather.toggle_override()
    await request.app.state.broadcaster.publish("weather_changed", w)
    return w
