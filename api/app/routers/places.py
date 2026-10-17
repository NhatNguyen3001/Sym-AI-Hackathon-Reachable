from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/places")
def search_places(request: Request, q: str = ""):
    return [p.public() for p in request.app.state.places.search(q)]
