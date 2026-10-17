from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
def health(request: Request):
    return {"ok": True, "db": request.app.state.db_kind}
