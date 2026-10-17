from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/weather")
def weather(request: Request):
    return request.app.state.weather.current()
