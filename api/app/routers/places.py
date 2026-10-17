from fastapi import APIRouter, Request, Response

router = APIRouter()


@router.get("/places")
def search_places(request: Request, response: Response, q: str = ""):
    places, limited = request.app.state.resolver.search(q)
    if limited:
        response.headers["X-Search-Limited"] = "1"
    return [p.public() for p in places]
