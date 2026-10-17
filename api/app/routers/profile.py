from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.llm.profile import parse_profile

router = APIRouter()


class ParseIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("/profile/parse")
def parse(body: ParseIn, request: Request):
    return parse_profile(body.text, request.app.state.llm).model_dump(by_alias=True)
