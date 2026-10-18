from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=API_DIR / ".env", extra="ignore")
    database_url: str = f"sqlite:///{API_DIR / 'reachable.db'}"
    # Turso (libsql). When the URL is set the API uses Turso instead of DATABASE_URL.
    turso_database_url: str = ""
    turso_auth_token: str = ""
    # Local copy of Turso (embedded replica): reads are local, writes go to Turso, synced every few seconds.
    turso_replica_path: Path = API_DIR / "turso-replica.db"
    turso_sync_seconds: int = 15
    anthropic_api_key: str = ""
    cors_origins: list[str] = ["http://localhost:3000"]
    speed_mps: float = 1.0
    graph_path: Path = API_DIR / "data" / "graph.graphml"
    places_path: Path = API_DIR / "data" / "places.json"
    overrides_path: Path = API_DIR / "data" / "overrides.json"
    uploads_dir: Path = API_DIR / "uploads"
    seed: bool = True
    # Sydney-wide routing and search (cycle 2)
    router: str = "valhalla"  # "valhalla" or "campus"
    valhalla_url: str = "http://localhost:8002"
    photon_url: str = "https://photon.komoot.io"  # empty string disables Photon
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    coverage_bbox: str = "149.97,-34.33,151.63,-32.99"  # west,south,east,north
    max_leg_km: float = 10
    # Transport for NSW (cycle 3): public transport trips and live lift alerts. Empty key turns both off.
    tfnsw_api_key: str = ""
    tfnsw_url: str = "https://api.transport.nsw.gov.au"
    transit_min_km: float = 1
    lift_poll_seconds: int = 300  # 0 = no background polling (tests poll on demand)
    # Map agent (cycle 5): owner-only, on demand. Empty ADMIN_KEY turns the run button off.
    admin_key: str = ""
    map_agent_paused: bool = False
    # Dated OpenStreetMap places, loaded only when the map has never been updated. Empty string: none.
    osm_snapshot_path: str = str(API_DIR / "data" / "osm_places_snapshot.json")
    # Browser tests only: fixed map places, and a map agent that calls nothing real.
    seed_map_places: bool = False
    map_agent_fake: bool = False
    # Demo (cycle 7): each phone (X-Session) keeps its own reports and rain toggle, in memory, never saved.
    demo_sandbox: bool = False
    # Photo reports are parked (2026-10-18): off means no photo is accepted or stored. Reports without photos work.
    photo_uploads: bool = False
