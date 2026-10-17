from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=API_DIR / ".env", extra="ignore")
    database_url: str = f"sqlite:///{API_DIR / 'reachable.db'}"
    anthropic_api_key: str = ""
    cors_origins: list[str] = ["http://localhost:3000"]
    speed_mps: float = 1.0
    graph_path: Path = API_DIR / "data" / "graph.graphml"
    places_path: Path = API_DIR / "data" / "places.json"
    overrides_path: Path = API_DIR / "data" / "overrides.json"
    uploads_dir: Path = API_DIR / "uploads"
    seed: bool = True
