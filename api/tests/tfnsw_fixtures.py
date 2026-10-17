import json
from pathlib import Path

DIR = Path(__file__).parent / "fixtures" / "tfnsw"


def load(name: str) -> dict:
    return json.loads((DIR / f"{name}.json").read_text(encoding="utf-8"))
