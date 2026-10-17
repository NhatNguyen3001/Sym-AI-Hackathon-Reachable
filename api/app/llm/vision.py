import base64
from typing import Literal
from pydantic import BaseModel

MODEL = "claude-sonnet-5-5"
LABELS = ["blocked", "stairs", "broken_ramp", "slippery", "narrow", "fine"]


class PhotoOut(BaseModel):
    label: Literal["blocked", "stairs", "broken_ramp", "slippery", "narrow", "fine"]
    description: str


PROMPT = ("This photo was sent by someone reporting a barrier on a footpath. Classify it as one of: blocked (fencing, "
          "construction or objects across the path), stairs, broken_ramp, slippery, narrow, fine (no barrier). "
          "description: one short sentence starting with 'Looks like', describing what you see.")


def label_photo(data: bytes, media_type: str, client) -> tuple[str | None, str]:
    """Returns (label, description); (None, "") when Claude is unavailable or unsure, so the user picks."""
    if client is None:
        return None, ""
    try:
        img = {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                           "data": base64.standard_b64encode(data).decode()}}
        r = client.messages.parse(model=MODEL, max_tokens=1024, output_format=PhotoOut,
                                  messages=[{"role": "user", "content": [img, {"type": "text", "text": PROMPT}]}])
        if r.stop_reason == "refusal" or r.parsed_output is None:
            return None, ""
        return r.parsed_output.label, r.parsed_output.description
    except Exception:
        return None, ""
