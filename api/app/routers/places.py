from fastapi import APIRouter, Request, Response

from app.errors import ApiError

router = APIRouter()


@router.get("/places")
def search_places(request: Request, response: Response, q: str = ""):
    places, limited = request.app.state.resolver.search(q)
    if limited:
        response.headers["X-Search-Limited"] = "1"
    return [p.public() for p in places]


@router.get("/places/{place_id}")
def get_place(place_id: str, request: Request):
    p = request.app.state.resolver.get(place_id)
    if p is None:
        raise ApiError(404, "place_not_found", "We couldn't find that place. Pick one from the list.")
    return p.public()
