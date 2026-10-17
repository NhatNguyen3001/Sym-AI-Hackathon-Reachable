from fastapi import APIRouter, BackgroundTasks, Request, Response

from app.errors import ApiError


router = APIRouter()


@router.get("/places")
def search_places(request: Request, response: Response, tasks: BackgroundTasks, q: str = "", photon: bool = True):
    """photon=0: known places only, instantly (the web shows these while the full search runs)."""
    resolver = request.app.state.resolver
    places, limited = resolver.search(q, photon=photon)  # writes nothing: a Turso write would pause the API
    if limited:
        response.headers["X-Search-Limited"] = "1"
    return [p.public() for p in places]


@router.get("/places/{place_id}")
def get_place(place_id: str, request: Request, tasks: BackgroundTasks):
    resolver = request.app.state.resolver
    p = resolver.get(place_id)
    if p is None:
        raise ApiError(404, "place_not_found", "We couldn't find that place. Pick one from the list.")
    if resolver.claim_save(p):  # someone is using this searched place: keep it for shared links and restarts
        tasks.add_task(resolver.save_quietly, [p])
    return p.public()
