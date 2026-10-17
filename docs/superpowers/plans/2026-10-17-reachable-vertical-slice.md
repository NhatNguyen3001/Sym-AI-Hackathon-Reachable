# Reachable Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A locally runnable Reachable: six accessible Next.js pages over a FastAPI backend with real Macquarie University campus routing, Claude-powered parsing/explanations/photo labels (with rule fallbacks), and live rerouting over SSE.

**Architecture:** Monorepo with `api/` (FastAPI + NetworkX over a committed OSMnx graph, SQLModel on SQLite/Turso, in-process SSE broadcaster) and `web/` (Next.js App Router + Tailwind v4 + shadcn/ui + react-leaflet). The web app talks to the API only through `web/lib/api.ts`.

**Tech Stack:** Python 3.11, FastAPI 0.143, osmnx 2.1.1, networkx 3.6, sqlmodel 0.0.48, anthropic 1.15, sse-starlette 3.5, Pillow, pytest 9 · Node 26, Next.js 16, React 19, Tailwind 4, shadcn 4, react-leaflet 5, Vitest, Playwright + @axe-core/playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-reachable-vertical-slice-design.md` (read it together with `.claude/docs/reachable-web-ui-spec.md`).

## Global Constraints

- UI spec §3 accessibility rules are hard requirements: visible labels, fieldset/legend for groups, 2px `primary` focus ring with 2px offset, `role="status"`/`aria-live="polite"` for status, map `role="region" aria-label="Route map"`, 390 px with no horizontal scroll, `prefers-reduced-motion`, unique `<title>` per page.
- Colours only from the UI spec §1 token table; no new colours, gradients, emoji or decorative shadows. Never colour alone.
- Font Atkinson Hyperlegible 400/700; nothing below 13 px; touch targets ≥ 44 px, primary buttons 56 px, inputs 48–52 px.
- All JSON over the wire is camelCase. Errors: `{ "error": { "code", "message" } }`.
- Reports never store a user ID. Seeded stand-ins for real feeds say "(demo data)" in their source label.
- Claude models: `claude-haiku-5-5` (profile parse), `claude-sonnet-5-5` (explanation, photo label). 15 s timeout; every call has a rule-based fallback; app fully works with no `ANTHROPIC_API_KEY`.
- Never commit keys. `.env` files are gitignored.
- Walking/rolling speed default 1.0 m/s (`REACHABLE_SPEED_MPS`).

## Review Focus

1. **Place names the router can't resolve** (typed free text in From/To instead of a picked suggestion) → API returns 404 `place_not_found`, page shows "We couldn't find that place. Pick one from the list." — test in Task 7 (`test_route_unknown_place`) and Task 12 (route page error state).
2. **Every station exit out of service** → `{ok:false}` with suggestion, `/route` shows the warning banner, not a crash or blank map — test in Task 3 (`test_all_exits_out_returns_no_route`) and Task 7.
3. **API down while browsing** → read pages render sample data with the "Showing sample data" banner; report submit shows an alert — test in Task 10 (`api.test.ts`).
4. **Non-image or huge upload** → 415 / 413 with a readable message, no server crash — test in Task 8 (`test_label_rejects_non_image`, `test_label_rejects_large`).
5. **Corrupt or missing localStorage** (private mode, old shape) → defaults load, no crash — test in Task 10 (`profile.test.ts`).

---

## File map

```
api/
  requirements.txt, requirements-dev.txt, pytest.ini, .env.example, Dockerfile
  app/__init__.py
  app/config.py          Settings (env)
  app/main.py            create_app(), startup, routers, error handlers
  app/errors.py          ApiError + handler
  app/db.py              engine, init_db(), get_session
  app/models.py          Barrier, Report, Venue, AgentRun
  app/seed.py            seed(session)
  app/events.py          Broadcaster (publish / subscribe)
  app/weather.py         WeatherService
  app/checker.py         check_report(session, report, graph)
  app/feed.py            build_updates(session, weather, type)
  app/agents.py          log_run(), agent_cards()
  app/llm/__init__.py
  app/llm/client.py      get_client()
  app/llm/profile.py     parse_profile(text) + rule fallback
  app/llm/explain.py     explain_route(facts) + template fallback
  app/llm/vision.py      label_photo(bytes, media_type) + fallback
  app/routing/__init__.py
  app/routing/profile.py Profile, Avoid, Destination (pydantic, camelCase)
  app/routing/cost.py    edge_cost(), Context
  app/routing/graph.py   load_graph(), edge_id(), nearest_edge()
  app/routing/places.py  Places (load places.json, search, resolve)
  app/routing/route.py   find_routes()
  app/routing/steps.py   group_steps()
  app/routers/*.py       health, places, profile, route, venue, reports, updates, agents, weather, stations, events, demo
  data/graph.graphml, data/overrides.json, data/places.json
  scripts/build_graph.py
  tests/conftest.py, tests/fixtures.py, tests/test_*.py
web/
  app/layout.tsx, app/globals.css, app/page.tsx, app/{plan,route,report,live,needs}/page.tsx
  components/layout/{AppHeader,LandingHeader,Footer}.tsx
  components/map/MapView.tsx, components/map/RouteMap.tsx (dynamic wrapper)
  components/{StatusBadge,WeatherBanner,InfoBanner,FilterChips,NeedsChips,RouteStep,VenueCheckRow,AgentCard,UpdateRow,PlaceInput}.tsx
  components/ui/*        shadcn
  lib/{api,placeholder,profile,events,types}.ts
  tests/unit/*.test.ts, tests/e2e/*.spec.ts, vitest.config.ts, playwright.config.ts
```

---

### Task 1: API scaffold and health check

**Files:**
- Create: `api/requirements.txt`, `api/requirements-dev.txt`, `api/pytest.ini`, `api/.env.example`, `api/app/__init__.py`, `api/app/config.py`, `api/app/errors.py`, `api/app/main.py`, `api/app/routers/__init__.py`, `api/app/routers/health.py`, `api/tests/conftest.py`, `api/tests/test_health.py`, root `.gitignore`

**Interfaces:**
- Produces: `create_app(settings: Settings | None = None) -> FastAPI`; `Settings` fields `database_url`, `anthropic_api_key`, `cors_origins: list[str]`, `speed_mps: float`, `graph_path`, `places_path`, `uploads_dir`, `seed: bool`; `ApiError(status, code, message)`; pytest fixture `client` (TestClient on temp DB).

- [ ] **Step 1: Files**

`api/requirements.txt`:
```
fastapi==0.143.3
uvicorn[standard]
osmnx==2.1.1
networkx==3.6.1
scikit-learn
sqlmodel==0.0.48
sqlalchemy-libsql==0.2.0
anthropic==1.15.0
sse-starlette==3.5.0
pillow
python-multipart
httpx
pydantic-settings
```
`api/requirements-dev.txt`: `-r requirements.txt` + `pytest==9.1.1`.
`api/pytest.ini`: `[pytest]\ntestpaths = tests\naddopts = -q`.
`api/.env.example`: `ANTHROPIC_API_KEY=`, `DATABASE_URL=sqlite:///./reachable.db`, `CORS_ORIGINS=http://localhost:3000`.
Root `.gitignore`: `api/.venv/`, `**/__pycache__/`, `api/uploads/`, `api/*.db`, `.env`, `api/.env`, `web/node_modules/`, `web/.next/`, `web/test-results/`, `web/playwright-report/`, `scratch/`.

`api/app/config.py`:
```python
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
    uploads_dir: Path = API_DIR / "uploads"
    seed: bool = True
```
`api/app/errors.py`:
```python
from fastapi import Request
from fastapi.responses import JSONResponse

class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message

async def api_error_handler(_: Request, exc: ApiError):
    return JSONResponse({"error": {"code": exc.code, "message": exc.message}}, status_code=exc.status)
```

- [ ] **Step 2: Failing test** `api/tests/test_health.py`:
```python
def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"ok": True}
```
`api/tests/conftest.py` (graph loading is added in Task 7; for now settings only):
```python
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app

@pytest.fixture
def settings(tmp_path):
    return Settings(database_url=f"sqlite:///{tmp_path/'t.db'}", anthropic_api_key="", uploads_dir=tmp_path/"uploads")

@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c
```
- [ ] **Step 3:** `cd api && .venv/Scripts/pip install -r requirements-dev.txt && .venv/Scripts/python -m pytest` → FAIL (no `app.main`).
- [ ] **Step 4: Implement** `api/app/routers/health.py` (`router = APIRouter()`, `GET /health → {"ok": True}`) and `api/app/main.py`:
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import Settings
from app.errors import ApiError, api_error_handler
from app.routers import health

def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        yield

    app = FastAPI(title="Reachable API", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])
    app.add_exception_handler(ApiError, api_error_handler)
    app.include_router(health.router)
    return app

app = create_app()
```
- [ ] **Step 5:** pytest → PASS. Commit `feat(api): scaffold FastAPI app with health check`.

---

### Task 2: Profile model and edge cost function

**Files:** Create `api/app/routing/__init__.py`, `api/app/routing/profile.py`, `api/app/routing/cost.py`, `api/tests/test_cost.py`

**Interfaces:**
- Produces: `Profile(aid: str, max_slope: int, avoid: Avoid, destination: Destination, text: str)` with camelCase aliases (`maxSlope`, `kerbsNoRamp`, `slipperyWhenWet`); `DEFAULT_PROFILE`; `Context(raining: bool = False, barriers: dict[str, str] = {}, lift_out_exits: set[str] = set())`; `edge_cost(edge_key: str, data: dict, profile: Profile, ctx: Context) -> float` (math.inf = blocked). Edge data keys used: `length` (float m), `highway`, `kind` (`lift`|`steps`|`path`, overrides only), `exit_id`, `grade_abs` (fraction), `surface`, `kerb`, `crossing`.

- [ ] **Step 1: profile.py**
```python
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class Avoid(Camel):
    stairs: bool = True
    kerbs_no_ramp: bool = True
    slippery_when_wet: bool = True
    uneven: bool = False

class Destination(Camel):
    entrance: bool = True
    toilet: bool = True
    parking: bool = False

class Profile(Camel):
    aid: str = "manual_wheelchair"
    max_slope: int = Field(5, ge=2, le=12)
    avoid: Avoid = Avoid()
    destination: Destination = Destination()
    text: str = ""

DEFAULT_PROFILE = Profile(text="I use a manual wheelchair. Nothing steeper than 5%, and I need an accessible toilet where I'm going.")
```
- [ ] **Step 2: Failing tests** `api/tests/test_cost.py`:
```python
import math
from app.routing.cost import Context, edge_cost
from app.routing.profile import Profile, Avoid

P = Profile(max_slope=5)
def e(**kw): return {"length": 100.0, "highway": "footway", "grade_abs": 0.0, **kw}

def test_flat_edge_costs_its_length():
    assert edge_cost("a", e(), P, Context()) == 100.0

def test_steps_blocked_when_avoiding_stairs():
    assert edge_cost("a", e(highway="steps"), P, Context()) == math.inf
    assert edge_cost("a", e(kind="steps"), P, Context()) == math.inf

def test_steps_allowed_when_not_avoiding():
    p = Profile(avoid=Avoid(stairs=False))
    assert edge_cost("a", e(highway="steps"), p, Context()) == 100.0

def test_lift_edge_blocked_when_exit_out():
    d = e(kind="lift", exit_id="south")
    assert edge_cost("a", d, P, Context(lift_out_exits={"south"})) == math.inf
    assert edge_cost("a", d, P, Context()) == 100.0

def test_too_steep_blocked():
    assert edge_cost("a", e(grade_abs=0.06), P, Context()) == math.inf

def test_slope_penalty():
    # 4% of max 5% -> 1 + 0.8*2 = 2.6
    assert math.isclose(edge_cost("a", e(grade_abs=0.04), P, Context()), 260.0)

def test_rain_slippery_penalty():
    d = e(grade_abs=0.04, surface="paving_stones")
    dry = edge_cost("a", d, P, Context())
    assert math.isclose(edge_cost("a", d, P, Context(raining=True)), dry * 3)

def test_rain_no_penalty_below_3pct():
    d = e(grade_abs=0.02, surface="paving_stones")
    assert edge_cost("a", d, P, Context(raining=True)) == edge_cost("a", d, P, Context())

def test_raised_kerb_blocked():
    assert edge_cost("a", e(kerb="raised"), P, Context()) == math.inf
    assert edge_cost("a", e(kerb="lowered"), P, Context()) == 100.0

def test_uneven_penalty_only_when_avoiding():
    assert edge_cost("a", e(surface="gravel"), P, Context()) == 100.0
    p = Profile(avoid=Avoid(uneven=True))
    assert edge_cost("a", e(surface="gravel"), p, Context()) == 400.0

def test_barriers():
    assert edge_cost("a", e(), P, Context(barriers={"a": "confirmed"})) == math.inf
    assert edge_cost("a", e(), P, Context(barriers={"a": "needs_checking"})) == 500.0
    assert edge_cost("a", e(), P, Context(barriers={"a": "resolved"})) == 100.0

def test_list_valued_tags_are_handled():
    assert edge_cost("a", e(highway=["steps", "footway"]), P, Context()) == math.inf
```
- [ ] **Step 3:** run `pytest tests/test_cost.py` → FAIL (import).
- [ ] **Step 4: Implement** `api/app/routing/cost.py`:
```python
import math
from dataclasses import dataclass, field
from app.routing.profile import Profile

SLIPPERY = {"tiles", "metal", "paving_stones", "grass", "wood"}
UNEVEN = {"gravel", "grass", "dirt", "ground", "unpaved", "fine_gravel"}
RAISED_KERBS = {"raised", "yes", "regular", "rolled"}

@dataclass
class Context:
    raining: bool = False
    barriers: dict[str, str] = field(default_factory=dict)
    lift_out_exits: set[str] = field(default_factory=set)

def tag_set(value) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, (list, tuple, set)):
        return {str(v) for v in value}
    return {str(value)}

def is_steps(data: dict) -> bool:
    return data.get("kind") == "steps" or "steps" in tag_set(data.get("highway"))

def edge_cost(edge_key: str, data: dict, profile: Profile, ctx: Context) -> float:
    cost = float(data.get("length", 0.0))
    if is_steps(data) and profile.avoid.stairs:
        return math.inf
    if data.get("kind") == "lift" and data.get("exit_id") in ctx.lift_out_exits:
        return math.inf
    slope = float(data.get("grade_abs", 0.0) or 0.0) * 100
    if slope > profile.max_slope:
        return math.inf
    cost *= 1 + (slope / profile.max_slope) * 2
    surfaces = tag_set(data.get("surface"))
    if ctx.raining and profile.avoid.slippery_when_wet and surfaces & SLIPPERY and slope > 3:
        cost *= 3
    if profile.avoid.kerbs_no_ramp and tag_set(data.get("kerb")) & RAISED_KERBS:
        return math.inf
    if profile.avoid.uneven and surfaces & UNEVEN:
        cost *= 4
    status = ctx.barriers.get(edge_key)
    if status == "confirmed":
        return math.inf
    if status == "needs_checking":
        cost *= 5
    return cost
```
- [ ] **Step 5:** pytest → PASS. Commit `feat(api): edge cost function for accessible routing`.

---

### Task 3: Route builder and step grouping (fixture graph)

**Files:** Create `api/app/routing/graph.py`, `api/app/routing/steps.py`, `api/app/routing/route.py`, `api/tests/fixtures.py`, `api/tests/test_route.py`

**Interfaces:**
- Consumes: `edge_cost`, `Context`, `Profile` (Task 2).
- Produces:
  - `graph.edge_id(u, v, k) -> str` = `f"{u}-{v}-{k}"`; `load_graph(path) -> nx.MultiDiGraph`; `nearest_edge(G, lat, lng) -> str`.
  - `Place(id, name, kind, lat, lng, node: int | None, exits: list[str])` (defined in `places.py`, Task 4; tests construct it directly).
  - `steps.group_steps(G, path_edges: list[tuple[u,v,k]], ctx) -> list[dict]` → items `{icon, label, confidence, lengthM}`.
  - `route.find_routes(G, start: Place, end: Place, profile, ctx, speed_mps) -> dict` returning either
    `{"ok": True, "accessible": RouteOut, "fastest": RouteOut, "minutesLonger": int, "steps": [...], "exitUsed": str | None, "edges": [edge ids]}` where `RouteOut = {"geometry": GeoJSON LineString, "distanceM": int, "minutes": int, "maxSlope": int, "stepFree": bool}`
    or `{"ok": False, "reason": str, "suggestion": str, "fastest": RouteOut | None}`.
  - Station exits: graph has a node per exit (`exit_id` attr) joined to a station platform node by an edge with `kind` = `lift` or `steps` and `exit_id`. A station Place has `node` = platform node.

- [ ] **Step 1: Fixture** `api/tests/fixtures.py` — a small graph:
```python
import networkx as nx
from app.routing.places import Place

def add(G, u, v, length, **kw):
    G.add_edge(u, v, 0, length=length, **kw); G.add_edge(v, u, 0, length=length, **kw)

def fixture_graph():
    """
    P (platform) --lift(north)--> N --100--> A --100--> L (library)
    P --lift(south)--> S --60 steps--> L ; S --150 flat--> B --150--> L
    N --40 steep 8%--> L (shortcut, too steep for 5%)
    """
    G = nx.MultiDiGraph()
    coords = {"P": (0, 0), "N": (0.001, 0), "S": (-0.001, 0), "A": (0.001, 0.001), "B": (-0.001, 0.002), "L": (0, 0.003)}
    for n, (lat, lng) in coords.items():
        G.add_node(n, y=lat, x=lng)
    add(G, "P", "N", 20, kind="lift", exit_id="north")
    add(G, "P", "S", 20, kind="lift", exit_id="south")
    add(G, "N", "A", 100, highway="footway", grade_abs=0.0)
    add(G, "A", "L", 100, highway="footway", grade_abs=0.02, surface="paving_stones")  # cost 180
    add(G, "S", "L", 60, highway="steps")
    add(G, "S", "B", 150, highway="footway", grade_abs=0.0)
    add(G, "B", "L", 150, highway="footway", grade_abs=0.0)
    add(G, "N", "L", 40, highway="footway", grade_abs=0.08)
    return G

STATION = Place(id="mq-station", name="Macquarie University station", kind="station", lat=0, lng=0, node="P", exits=["north", "south"])
LIBRARY = Place(id="library", name="Waranara Library", kind="venue", lat=0, lng=0.003, node="L", exits=[])
```
- [ ] **Step 2: Failing tests** `api/tests/test_route.py`:
```python
from app.routing.cost import Context
from app.routing.profile import Profile, Avoid
from app.routing.route import find_routes
from tests.fixtures import fixture_graph, STATION, LIBRARY

G = fixture_graph()
P = Profile(max_slope=5)

def run(ctx=Context(), profile=P):
    return find_routes(G, STATION, LIBRARY, profile, ctx, speed_mps=1.0)

def test_accessible_avoids_steps_and_steep():
    r = run()
    assert r["ok"] and r["accessible"]["stepFree"]
    assert r["accessible"]["maxSlope"] <= 5
    assert r["exitUsed"] == "north"           # cost 20+100+180 = 300 beats S-B-L = 320

def test_fastest_is_length_only():
    r = run()
    assert r["fastest"]["distanceM"] == 60     # P-N-L: 20 + 40 (steep shortcut)
    assert r["minutesLonger"] >= 1

def test_lift_outage_switches_exit():
    r = run(Context(lift_out_exits={"north"}))
    assert r["ok"] and r["exitUsed"] == "south"
    assert r["accessible"]["distanceM"] == 320

def test_all_exits_out_returns_no_route():
    r = run(Context(lift_out_exits={"north", "south"}))
    assert r["ok"] is False
    assert "nearby station" in r["suggestion"]

def test_confirmed_barrier_blocks_needs_checking_penalises():
    blocked = run(Context(barriers={"A-L-0": "confirmed"}))
    assert blocked["exitUsed"] == "south"
    warned = run(Context(barriers={"A-L-0": "needs_checking"}))
    assert warned["exitUsed"] == "south"       # 180*5 = 900 > 320

def test_needs_checking_on_route_marks_step_not_sure():
    r = run(Context(lift_out_exits={"north"}, barriers={"B-L-0": "needs_checking"}))
    assert r["ok"] and any(s["confidence"] == "Not sure" for s in r["steps"])

def test_steps_allowed_profile_uses_steps():
    r = run(profile=Profile(max_slope=5, avoid=Avoid(stairs=False)))
    assert r["exitUsed"] == "south" and r["accessible"]["stepFree"] is False   # P-S-L 80

def test_geometry_is_lnglat_linestring():
    g = run()["accessible"]["geometry"]
    assert g["type"] == "LineString" and g["coordinates"][0] == [0, 0]

def test_step_grouping_labels():
    steps = run()["steps"]
    labels = [s["label"] for s in steps]
    assert labels[0] == "Lift at north exit"
    assert "Flat footpath, 100 m" in labels
    assert "Gentle slope, 2%, 100 m" in labels
```
- [ ] **Step 3:** pytest → FAIL.
- [ ] **Step 4: Implement**

`api/app/routing/graph.py`:
```python
import math
import networkx as nx
import osmnx as ox

def edge_id(u, v, k) -> str:
    return f"{u}-{v}-{k}"

def load_graph(path) -> nx.MultiDiGraph:
    G = ox.load_graphml(path, edge_dtypes={"grade_abs": float, "length": float, "slope_measured": lambda s: s == "True"})
    return G

def _dist_m(lat1, lng1, lat2, lng2) -> float:
    kx = 111_320 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot((lat2 - lat1) * 110_540, (lng2 - lng1) * kx)

def nearest_edge(G, lat: float, lng: float) -> tuple[str, float]:
    """Nearest edge by midpoint distance. Returns (edge_id, metres). Fine for a campus-sized graph."""
    best, best_d = None, math.inf
    for u, v, k in G.edges(keys=True):
        mu, mv = G.nodes[u], G.nodes[v]
        d = _dist_m(lat, lng, (mu["y"] + mv["y"]) / 2, (mu["x"] + mv["x"]) / 2)
        if d < best_d:
            best, best_d = edge_id(u, v, k), d
    return best, best_d
```
`api/app/routing/steps.py`:
```python
from app.routing.cost import is_steps, tag_set
from app.routing.graph import edge_id

EXIT_NAMES = {}  # filled by places loader: exit_id -> "north exit"

def kind_of(d: dict) -> str:
    if d.get("kind") == "lift":
        return "lift"
    if is_steps(d):
        return "steps"
    if "crossing" in tag_set(d.get("footway")) or d.get("crossing"):
        return "crossing"
    return "slope" if float(d.get("grade_abs", 0) or 0) * 100 >= 2 else "flat"

def group_steps(G, path_edges, ctx) -> list[dict]:
    groups: list[dict] = []
    for u, v, k in path_edges:
        d = G.edges[u, v, k]
        kind = kind_of(d)
        slope = round(float(d.get("grade_abs", 0) or 0) * 100)
        eid = edge_id(u, v, k)
        unsure = ctx.barriers.get(eid) == "needs_checking" or (kind == "crossing" and d.get("kerb") is None)
        measured = bool(d.get("slope_measured"))
        last = groups[-1] if groups else None
        if last and last["kind"] == kind and kind in ("flat", "slope", "steps") and (kind != "slope" or last["slope"] == slope):
            last["length"] += float(d["length"]); last["unsure"] |= unsure; last["measured"] |= measured
        else:
            groups.append({"kind": kind, "slope": slope, "length": float(d["length"]), "unsure": unsure,
                           "measured": measured, "exit": d.get("exit_id")})
    out = []
    for g in groups:
        m = round(g["length"])
        label = {
            "flat": f"Flat footpath, {m} m",
            "slope": f"Gentle slope, {g['slope']}%, {m} m",
            "steps": f"Steps, {m} m",
            "lift": f"Lift at {EXIT_NAMES.get(g['exit'], (g['exit'] or '') + ' exit')}",
            "crossing": "Kerb ramp at crossing",
        }[g["kind"]]
        icon = {"flat": "check", "slope": "slope", "steps": "alert", "lift": "lift", "crossing": "crossing"}[g["kind"]]
        conf = "Not sure" if g["unsure"] else ("Measured" if g["measured"] else "Confirmed")
        if g["unsure"]:
            icon = "alert"
        out.append({"icon": icon, "label": label, "confidence": conf, "lengthM": m})
    return out
```
`api/app/routing/route.py`:
```python
import math
import networkx as nx
from app.routing.cost import Context, edge_cost, is_steps
from app.routing.graph import edge_id
from app.routing.steps import group_steps

SUGGESTION = "Try a nearby station with working lifts, or an accessible drop-off point."

def _best_edge(G, u, v, weight_fn):
    best_k, best_w = None, math.inf
    for k, d in G.get_edge_data(u, v).items():
        w = weight_fn(u, v, k, d)
        if w < best_w:
            best_k, best_w = k, w
    return best_k, best_w

def _path(G, src, dst, weight_fn):
    def w(u, v, data):  # data: {key: attrs}
        best = min(weight_fn(u, v, k, d) for k, d in data.items())
        return None if best == math.inf else best
    try:
        nodes = nx.dijkstra_path(G, src, dst, weight=w)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None
    return [(u, v, _best_edge(G, u, v, weight_fn)[0]) for u, v in zip(nodes, nodes[1:])]

def _summary(G, edges, speed_mps):
    coords = [[G.nodes[edges[0][0]]["x"], G.nodes[edges[0][0]]["y"]]]
    for u, v, k in edges:
        geom = G.edges[u, v, k].get("geometry")
        if geom is not None:
            pts = [list(p) for p in geom.coords][1:]
            coords.extend(pts)
        else:
            coords.append([G.nodes[v]["x"], G.nodes[v]["y"]])
    dist = sum(float(G.edges[e]["length"]) for e in edges)
    max_slope = max((float(G.edges[e].get("grade_abs", 0) or 0) * 100 for e in edges), default=0)
    return {"geometry": {"type": "LineString", "coordinates": coords}, "distanceM": round(dist),
            "minutes": max(1, math.ceil(dist / speed_mps / 60)), "maxSlope": round(max_slope),
            "stepFree": not any(is_steps(G.edges[e]) for e in edges)}

def find_routes(G, start, end, profile, ctx: Context, speed_mps: float) -> dict:
    acc_w = lambda u, v, k, d: edge_cost(edge_id(u, v, k), d, profile, ctx)
    len_w = lambda u, v, k, d: float(d.get("length", 0))
    fast = _path(G, start.node, end.node, len_w)
    fastest = _summary(G, fast, speed_mps) if fast else None
    acc = _path(G, start.node, end.node, acc_w)
    if not acc:
        reason = "No step-free route right now."
        if start.exits and set(start.exits) <= ctx.lift_out_exits:
            reason = f"Every lift at {start.name} is out of service."
        return {"ok": False, "reason": reason, "suggestion": SUGGESTION, "fastest": fastest}
    accessible = _summary(G, acc, speed_mps)
    exit_used = next((G.edges[e].get("exit_id") for e in acc if G.edges[e].get("exit_id")), None)
    return {"ok": True, "accessible": accessible, "fastest": fastest or accessible,
            "minutesLonger": max(0, accessible["minutes"] - (fastest or accessible)["minutes"]),
            "steps": group_steps(G, acc, ctx), "exitUsed": exit_used,
            "edges": [edge_id(*e) for e in acc]}
```
Note: stations are start points (platform node) or end points; the virtual platform node + exit edges give multi-exit choice without a separate multi-source search. `Place` is imported from `app.routing.places` (Task 4) — create a minimal `places.py` now with the `Place` dataclass:
```python
from dataclasses import dataclass, field
@dataclass
class Place:
    id: str; name: str; kind: str; lat: float; lng: float
    node: object = None
    exits: list[str] = field(default_factory=list)
```
- [ ] **Step 5:** pytest → PASS. Commit `feat(api): accessible and fastest route builder with step grouping`.

---

### Task 4: Real campus graph, overrides and places

**Files:** Create `api/scripts/build_graph.py`, `api/data/overrides.json`, `api/data/places.json`, `api/data/graph.graphml` (generated); extend `api/app/routing/places.py`; Test `api/tests/test_campus_graph.py`

**Interfaces:**
- Consumes: `load_graph`, `find_routes`, `Place`.
- Produces: `Places(path, G)` with `.search(q: str, limit=8) -> list[Place]` (stations first, then case-insensitive prefix, then substring), `.get(id) -> Place | None`, `.exit_names: dict[exit_id, str]`, `.station_exits(place_id) -> list[dict]` (`{exitId, name, lat, lng, via}`). Real OSM ids from probing: station entrances node 951237975 (north exit, -33.777161, 151.118078) and 951237986 (south exit, -33.777433, 151.118452); Waranara Library node area (-33.775688, 151.113509).

- [ ] **Step 1: overrides.json**
```json
{
  "station": {"id": "mq-station", "name": "Macquarie University station", "platform": {"lat": -33.77735, "lng": 151.11825}},
  "exits": [
    {"id": "north", "name": "North exit", "osmNode": 951237975, "via": "lift"},
    {"id": "south", "name": "South exit", "osmNode": 951237986, "via": "lift"}
  ],
  "slopes": [],
  "edges": []
}
```
`slopes` entries are `{"u": int, "v": int, "gradePct": float, "source": str}`; filled in Step 3 after inspecting the graph.

- [ ] **Step 2: build_graph.py**
```python
"""Build api/data/graph.graphml from OpenStreetMap + Open-Meteo elevation. Run once; commit output.
Usage: python scripts/build_graph.py"""
import json, time, math
from pathlib import Path
import httpx, networkx as nx, osmnx as ox

DATA = Path(__file__).resolve().parent.parent / "data"
CENTER = (-33.7765, 151.1160)
ox.settings.useful_tags_way = list(ox.settings.useful_tags_way) + ["surface", "kerb", "incline", "wheelchair", "width", "footway", "crossing"]
ox.settings.useful_tags_node = list(ox.settings.useful_tags_node) + ["kerb", "crossing"]

def elevations(G):
    nodes = list(G.nodes)
    out = {}
    for i in range(0, len(nodes), 100):
        chunk = nodes[i:i + 100]
        lat = ",".join(f"{G.nodes[n]['y']:.6f}" for n in chunk)
        lng = ",".join(f"{G.nodes[n]['x']:.6f}" for n in chunk)
        for attempt in range(5):
            r = httpx.get("https://api.open-meteo.com/v1/elevation", params={"latitude": lat, "longitude": lng}, timeout=30)
            if r.status_code == 200:
                break
            time.sleep(2 ** attempt)
        r.raise_for_status()
        out.update(zip(chunk, r.json()["elevation"]))
    return out

def main():
    G = ox.graph_from_point(CENTER, dist=700, network_type="walk", simplify=False, retain_all=False)
    nx.set_node_attributes(G, elevations(G), "elevation")
    G = ox.add_edge_grades(G, add_absolute=True)
    ov = json.loads((DATA / "overrides.json").read_text())
    # kerb tags live on nodes in OSM: copy a node's kerb tag onto edges that touch it
    for u, v, k, d in G.edges(keys=True, data=True):
        kerb = G.nodes[v].get("kerb") or G.nodes[u].get("kerb")
        if kerb: d["kerb"] = kerb
        d["slope_measured"] = False
    for s in ov["slopes"]:
        for a, b in ((s["u"], s["v"]), (s["v"], s["u"])):
            if G.has_edge(a, b):
                for d in G.get_edge_data(a, b).values():
                    d["grade_abs"] = s["gradePct"] / 100; d["slope_measured"] = True
    st = ov["station"]
    G.add_node(st["id"], y=st["platform"]["lat"], x=st["platform"]["lng"], station=st["id"])
    for ex in ov["exits"]:
        n = ex["osmNode"]
        assert n in G, f"exit node {n} missing from graph"
        attrs = dict(length=20.0, kind=ex["via"], exit_id=ex["id"], grade_abs=0.0, slope_measured=False)
        if ex["via"] == "steps": attrs["highway"] = "steps"
        G.add_edge(st["id"], n, 0, **attrs); G.add_edge(n, st["id"], 0, **attrs)
        G.nodes[n]["exit_id"] = ex["id"]
    for e in ov["edges"]:
        attrs = {k: v for k, v in e.items() if k not in ("u", "v")}
        G.add_edge(e["u"], e["v"], 0, **attrs); G.add_edge(e["v"], e["u"], 0, **attrs)
    ox.save_graphml(G, DATA / "graph.graphml")
    print("saved", len(G), "nodes", G.number_of_edges(), "edges")

if __name__ == "__main__":
    main()
```
- [ ] **Step 3: Run and inspect.** `cd api && .venv/Scripts/python scripts/build_graph.py`. Then compute the accessible route station→Library with a script (`find_routes` + default profile) and print the steepest edges on it and on Wally's Walk (`name` contains "Wally"). If Open-Meteo's 90 m DEM gives implausible slopes (>15 % on footpaths that are ramps/flat), add `slopes` overrides with `source: "Hand-measured (demo data)"` for those edges, set a demo-critical Wally's Walk segment to its known steepness (~6 %), and rebuild. Record the chosen edge ids in `overrides.json`.
- [ ] **Step 4: places.json** — real names, with OSM-checked coordinates (retry Overpass with backoff to list `amenity=cafe|restaurant|toilets` names within 700 m; pick 3 venues near the Library):
```json
[
  {"id": "mq-station", "name": "Macquarie University station", "kind": "station", "lat": -33.77735, "lng": 151.11825, "node": "mq-station"},
  {"id": "library", "name": "Waranara Library", "kind": "venue", "lat": -33.775688, "lng": 151.113509},
  {"id": "<venue-2-slug>", "name": "<real café from OSM>", "kind": "venue", "lat": 0, "lng": 0},
  {"id": "<venue-3-slug>", "name": "<real building/venue from OSM>", "kind": "venue", "lat": 0, "lng": 0}
]
```
(The executor fills the two venue rows from the Overpass result; nodes for non-station places are resolved at load time with nearest node.)
- [ ] **Step 5: Places class** in `places.py`: loads JSON, resolves `node` via nearest node (reuse `_dist_m` over `G.nodes`) for rows without one, sets `exits` for the station from overrides, fills `steps.EXIT_NAMES` (`"north" → "north exit"`), implements `search`, `get`, `station_exits`.
- [ ] **Step 6: Failing → passing test** `api/tests/test_campus_graph.py`:
```python
from pathlib import Path
from app.config import Settings
from app.routing.cost import Context
from app.routing.graph import load_graph
from app.routing.places import Places
from app.routing.profile import DEFAULT_PROFILE
from app.routing.route import find_routes

S = Settings()
G = load_graph(S.graph_path)
PL = Places(S.places_path, G)

def test_demo_trip_step_free_via_north_when_south_out():
    r = find_routes(G, PL.get("mq-station"), PL.get("library"), DEFAULT_PROFILE, Context(lift_out_exits={"south"}), 1.0)
    assert r["ok"] and r["accessible"]["stepFree"] and r["exitUsed"] == "north"
    assert 300 < r["accessible"]["distanceM"] < 1200

def test_demo_trip_no_route_when_both_out():
    r = find_routes(G, PL.get("mq-station"), PL.get("library"), DEFAULT_PROFILE, Context(lift_out_exits={"north", "south"}), 1.0)
    assert r["ok"] is False

def test_places_search_stations_first():
    res = PL.search("mac")
    assert res[0].kind == "station"
```
- [ ] **Step 7:** pytest → PASS. Commit `feat(api): campus graph build script, overrides and places` (include `graph.graphml`).

---

### Task 5: Database, seed data, events broadcaster, weather

**Files:** Create `api/app/db.py`, `api/app/models.py`, `api/app/seed.py`, `api/app/events.py`, `api/app/weather.py`, `api/app/agents.py`; Tests `api/tests/test_db_seed.py`, `api/tests/test_events.py`, `api/tests/test_weather.py`

**Interfaces:**
- Produces:
  - `models.Barrier`, `Report`, `Venue`, `AgentRun` (SQLModel, table=True) with fields per spec §3.1; JSON columns via `sa_column=Column(JSON)`; ids `str` default `uuid4().hex`; timestamps UTC `datetime`.
  - `db.make_engine(url)`, `db.init_db(engine)`, dependency `get_session(request)`.
  - `seed.seed(session, G, places)` idempotent (no-op if any Barrier exists).
  - `events.Broadcaster` with `async publish(event: str, data: dict)`, `subscribe() -> AsyncIterator[dict]` (per-subscriber `asyncio.Queue`, maxsize 100, drops when full).
  - `weather.WeatherService(http_get=httpx.get)` with `.current() -> dict {raining, summary, until, source}` (10 min cache; Open-Meteo `current=precipitation,rain,weather_code` at -33.7765,151.1160; raining = precipitation > 0.1 or code in 51..67/80..82), `.set_override(bool | None)`, `.toggle_override() -> dict`.
  - `agents.log_run(session, agent, summary, status="done") -> AgentRun`; `agents.agent_cards(session) -> list[dict]` (`{name, status, tone, desc}`; `Running` if a run with status `running` in last 5 min, `N in queue` for pending reports > 0 for report checker, else `Idle`; desc includes "Last check N min ago" for updates agent).

- [ ] **Step 1: Failing tests**
```python
# test_db_seed.py
from sqlmodel import Session, select
from app.db import make_engine, init_db
from app.models import Barrier, Venue, AgentRun
from app.seed import seed
from tests.test_campus_graph import G, PL

def test_seed_is_idempotent(tmp_path):
    eng = make_engine(f"sqlite:///{tmp_path/'s.db'}"); init_db(eng)
    with Session(eng) as s:
        seed(s, G, PL); seed(s, G, PL)
        lifts = s.exec(select(Barrier).where(Barrier.type == "lift_outage")).all()
        assert len(lifts) == 1 and lifts[0].exit_id == "south" and lifts[0].status == "confirmed"
        assert all("(demo data)" in src["label"] for b in s.exec(select(Barrier)).all() for src in b.sources if src["kind"] != "user")
        assert s.get(Venue, "library") is not None
        assert len(s.exec(select(AgentRun)).all()) >= 4
        assert all(b.edge_id for b in s.exec(select(Barrier)).all() if b.type != "lift_outage")

# test_events.py
import asyncio
from app.events import Broadcaster

def test_publish_reaches_subscriber():
    async def go():
        b = Broadcaster(); it = b.subscribe()
        task = asyncio.create_task(it.__anext__())
        await asyncio.sleep(0)
        await b.publish("lift_changed", {"exitId": "south"})
        return await asyncio.wait_for(task, 1)
    assert asyncio.run(go()) == {"event": "lift_changed", "data": {"exitId": "south"}}

# test_weather.py
from app.weather import WeatherService
class R:
    def __init__(self, j): self._j = j; self.status_code = 200
    def json(self): return self._j
    def raise_for_status(self): pass

def test_rain_detected_and_cached():
    calls = []
    def get(url, params, timeout): calls.append(1); return R({"current": {"precipitation": 0.4, "weather_code": 61}})
    w = WeatherService(http_get=get)
    assert w.current()["raining"] is True and w.current()["raining"] is True
    assert len(calls) == 1

def test_override_and_failure():
    def boom(*a, **k): raise OSError("offline")
    w = WeatherService(http_get=boom)
    assert w.current()["raining"] is False
    assert w.toggle_override()["raining"] is True
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** Key code:

`api/app/models.py`:
```python
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field

def now(): return datetime.now(timezone.utc)
def uid(): return uuid4().hex

class Barrier(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    type: str
    title: str
    place: str
    lat: float
    lng: float
    edge_id: str | None = None
    exit_id: str | None = None
    status: str = "needs_checking"
    confidence: float = 0.4
    sources: list = Field(default_factory=list, sa_column=Column(JSON))
    update_type: str = "report"
    first_seen: datetime = Field(default_factory=now)
    last_confirmed: datetime = Field(default_factory=now)

class Report(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    photo_url: str | None = None
    ai_label: str | None = None
    user_label: str
    note: str = ""
    lat: float
    lng: float
    status: str = "pending"
    barrier_id: str | None = None
    created_at: datetime = Field(default_factory=now)

class Venue(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    address: str = ""
    lat: float
    lng: float
    entrance: str = "unknown"
    toilet: str = "unknown"
    parking: str = "unknown"
    step_free_inside: str = "unknown"
    confidence: dict = Field(default_factory=dict, sa_column=Column(JSON))
    sources: list = Field(default_factory=list, sa_column=Column(JSON))
    checked_at: datetime = Field(default_factory=now)
    checked_by: str = "Sym agent"

class AgentRun(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    agent: str
    started_at: datetime = Field(default_factory=now)
    finished_at: datetime | None = None
    status: str = "done"
    summary: str = ""
```
SQLite returns naive datetimes: everywhere a stored datetime is compared, normalise with `dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt` (helper `aware(dt)` in `models.py`).

`api/app/db.py`:
```python
from fastapi import Request
from sqlmodel import SQLModel, Session, create_engine

def make_engine(url: str):
    args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=args)

def init_db(engine): SQLModel.metadata.create_all(engine)

def get_session(request: Request):
    with Session(request.app.state.engine) as s:
        yield s
```
`api/app/events.py`:
```python
import asyncio

class Broadcaster:
    def __init__(self): self._subs: set[asyncio.Queue] = set()
    async def publish(self, event: str, data: dict):
        for q in list(self._subs):
            if not q.full(): q.put_nowait({"event": event, "data": data})
    async def subscribe(self):
        q: asyncio.Queue = asyncio.Queue(maxsize=100); self._subs.add(q)
        try:
            while True: yield await q.get()
        finally: self._subs.discard(q)
```
`seed.py`: inserts (with `nearest_edge` for `edge_id`), times relative to now:
- lift outage south: `type="lift_outage", title="Lift out of service", place="Macquarie University station, south exit", exit_id="south", status="confirmed", confidence=0.95, update_type="transport", sources=[{"kind":"feed","label":"Transport for NSW lift alert (demo data)","url":None,"seen_at":<1h ago>}]`, first_seen 1 h ago.
- roadworks (off-route, on a service road ~300 m north of the Library — pick coordinates in Task 4 inspection): `type="blocked", title="Footpath works, detour in place", update_type="roadworks", status="confirmed"`, source "Live Traffic NSW (demo data)", 2 h ago.
- `"Kerb ramp may be damaged"` `type="broken_ramp", status="needs_checking"`, place = a real crossing street name near the route, source `{"kind":"user","label":"One user report, no photo yet"}`, 25 min ago.
- `"Ramp repaired"` near the Library, `status="resolved"`, source user "Confirmed by 3 users", today.
- Venues: `library` (entrance/toilet/parking/step_free_inside = yes; confidence all confirmed; sources: "Macquarie University accessibility page (demo data)", "2 reviews (demo data)"; checked 2 min ago) and the two venues from places.json (first: entrance yes confirmed, step_free_inside yes likely, toilet unknown not_sure, sources "Venue website (demo data)", "User photo, 3 days ago (demo data)", parking no; second: all likely).
- Agent runs: updates "Checked lift alerts and weather" 3 min ago; report_checker, venue, route one each 1 h ago.

`agents.py` card descriptions (copy from UI spec §6 `agents`).
- [ ] **Step 4:** pytest → PASS. Commit `feat(api): database models, seed data, SSE broadcaster, weather`.

---

### Task 6: Claude calls with rule fallbacks

**Files:** Create `api/app/llm/__init__.py`, `client.py`, `profile.py`, `explain.py`, `vision.py`; Test `api/tests/test_llm.py`

**Interfaces:**
- Produces:
  - `client.get_client(api_key: str) -> anthropic.Anthropic | None` (None if key empty).
  - `parse_profile(text: str, client) -> Profile` — Claude `messages.parse(model="claude-haiku-5-5", output_format=ProfileOut)`; any exception, refusal, or `client is None` → `rule_parse(text)`.
  - `explain_route(facts: dict, client) -> str` — facts: `{minutes, minutesLonger, exitUsed, exitName, liftsOut: [names], raining, avoided: [str], ok}`; fallback `template_explanation(facts)`.
  - `label_photo(data: bytes, media_type: str, client) -> tuple[str | None, str]` — returns `(label in LABELS or None, description)`; fallback `(None, "")`.
  - `LABELS = ["blocked", "stairs", "broken_ramp", "slippery", "narrow", "fine"]`.

- [ ] **Step 1: Failing tests**
```python
from app.llm.profile import rule_parse, parse_profile
from app.llm.explain import template_explanation, explain_route
from app.llm.vision import label_photo

def test_rule_parse_manual_wheelchair_slope_toilet():
    p = rule_parse("I use a manual wheelchair. Nothing steeper than 5%, and I need an accessible toilet.")
    assert p.aid == "manual_wheelchair" and p.max_slope == 5 and p.destination.toilet and p.avoid.stairs

def test_rule_parse_power_chair_and_pram():
    assert rule_parse("power wheelchair").aid == "power_wheelchair"
    assert rule_parse("pushing a pram").aid == "pram"
    assert rule_parse("I walk with a cane, stairs are ok").avoid.stairs is False

def test_rule_parse_clamps_slope():
    assert rule_parse("wheelchair, max 30%").max_slope == 12

def test_no_client_uses_fallback():
    assert parse_profile("walker", None).aid == "walker"
    assert label_photo(b"x", "image/jpeg", None) == (None, "")

class Boom:
    class messages:
        @staticmethod
        def parse(**kw): raise RuntimeError("down")
        @staticmethod
        def create(**kw): raise RuntimeError("down")
    def with_options(self, **kw): return self

def test_client_errors_fall_back():
    assert parse_profile("walker", Boom()).aid == "walker"
    assert "north exit" in explain_route({"ok": True, "minutesLonger": 4, "exitName": "north exit", "liftsOut": ["south exit"], "raining": False, "avoided": []}, Boom())

def test_template_mentions_outage_and_minutes():
    t = template_explanation({"ok": True, "minutesLonger": 4, "exitName": "north exit", "liftsOut": ["south exit"], "raining": True, "avoided": ["stairs near the Library"]})
    assert t.startswith("Use the lift at the north exit, as the south exit lift is out of service.")
    assert "4 min longer than the fastest route" in t and "slippery" in t
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**

`client.py`:
```python
import anthropic
TIMEOUT = 15.0
def get_client(api_key: str):
    return anthropic.Anthropic(api_key=api_key, timeout=TIMEOUT, max_retries=1) if api_key else None
```
`profile.py`:
```python
import re
from typing import Literal
from pydantic import BaseModel
from app.routing.profile import Profile, Avoid, Destination

AIDS = {"manual_wheelchair": 5, "power_wheelchair": 8, "walker": 6, "cane": 8, "pram": 8}

class ProfileOut(BaseModel):
    aid: Literal["manual_wheelchair", "power_wheelchair", "walker", "cane", "pram"]
    max_slope: int
    avoid_stairs: bool
    avoid_kerbs_no_ramp: bool
    avoid_slippery_when_wet: bool
    avoid_uneven: bool
    need_entrance: bool
    need_toilet: bool
    need_parking: bool

SYSTEM = ("You turn a person's plain-English description of their mobility needs into route settings. "
          "aid must be one of the allowed values; pick the closest. max_slope is the steepest slope in percent they "
          "can manage (2-12); if not stated use: manual_wheelchair 5, power_wheelchair 8, walker 6, cane 8, pram 8. "
          "Wheeled aids avoid stairs unless the person says otherwise. Only set destination needs they mention, "
          "except a level entrance, which wheeled aids always need.")

def rule_parse(text: str) -> Profile:
    t = text.lower()
    aid = ("power_wheelchair" if re.search(r"power|electric", t) and "chair" in t else
           "manual_wheelchair" if "wheelchair" in t or "chair" in t else
           "walker" if re.search(r"walker|frame|rollator", t) else
           "cane" if re.search(r"cane|crutch|stick", t) else
           "pram" if re.search(r"pram|stroller|buggy", t) else "manual_wheelchair")
    m = re.search(r"(\d{1,2})\s*%", t)
    slope = max(2, min(12, int(m.group(1)))) if m else AIDS[aid]
    stairs_ok = re.search(r"stairs (are )?(ok|fine)|can (do|manage) stairs", t)
    wheeled = aid in ("manual_wheelchair", "power_wheelchair", "pram", "walker")
    return Profile(aid=aid, max_slope=slope, text=text,
                   avoid=Avoid(stairs=not stairs_ok and (wheeled or "stairs" in t), kerbs_no_ramp=wheeled or "kerb" in t,
                               slippery_when_wet=True, uneven=bool(re.search(r"gravel|grass|uneven", t))),
                   destination=Destination(entrance=wheeled or "entrance" in t, toilet="toilet" in t, parking="parking" in t))

def parse_profile(text: str, client) -> Profile:
    if client is None:
        return rule_parse(text)
    try:
        r = client.messages.parse(model="claude-haiku-5-5", max_tokens=1024, system=SYSTEM,
                                  messages=[{"role": "user", "content": text}], output_format=ProfileOut)
        if r.stop_reason == "refusal" or r.parsed_output is None:
            return rule_parse(text)
        o = r.parsed_output
        return Profile(aid=o.aid, max_slope=max(2, min(12, o.max_slope)), text=text,
                       avoid=Avoid(stairs=o.avoid_stairs, kerbs_no_ramp=o.avoid_kerbs_no_ramp,
                                   slippery_when_wet=o.avoid_slippery_when_wet, uneven=o.avoid_uneven),
                       destination=Destination(entrance=o.need_entrance, toilet=o.need_toilet, parking=o.need_parking))
    except Exception:
        return rule_parse(text)
```
`explain.py`:
```python
SYSTEM = ("Write a plain-English route explanation for a person with mobility needs, in at most two short sentences. "
          "Say which station exit or lift to use and why, how many minutes longer than the fastest route it is, and what it avoids. "
          "Use only the facts given. No greetings, no markdown.")

def template_explanation(f: dict) -> str:
    if not f.get("ok"):
        return "We couldn't find a step-free route right now. Try a nearby station with working lifts, or an accessible drop-off point."
    parts = []
    if f.get("exitName"):
        s = f"Use the lift at the {f['exitName']}"
        if f.get("liftsOut"):
            s += f", as the {' and '.join(f['liftsOut'])} lift is out of service"
        parts.append(s + ".")
    mins = f.get("minutesLonger", 0)
    s = f"{mins} min longer than the fastest route" if mins > 0 else "This is also the fastest route"
    avoided = list(f.get("avoided", []))
    if f.get("raining"):
        avoided.append("steep paths that are slippery in the rain")
    if avoided:
        s += (", but it avoids " if mins > 0 else " and it avoids ") + ", ".join(avoided)
    parts.append(s + ".")
    return " ".join(parts)

def explain_route(facts: dict, client) -> str:
    if client is None or not facts.get("ok"):
        return template_explanation(facts)
    try:
        r = client.messages.create(model="claude-sonnet-5-5", max_tokens=1024, system=SYSTEM,
                                   messages=[{"role": "user", "content": f"Facts: {facts}"}])
        text = next((b.text for b in r.content if b.type == "text"), "").strip()
        return text if r.stop_reason != "refusal" and text else template_explanation(facts)
    except Exception:
        return template_explanation(facts)
```
`vision.py`:
```python
import base64
from typing import Literal
from pydantic import BaseModel

LABELS = ["blocked", "stairs", "broken_ramp", "slippery", "narrow", "fine"]

class PhotoOut(BaseModel):
    label: Literal["blocked", "stairs", "broken_ramp", "slippery", "narrow", "fine"]
    description: str

PROMPT = ("This photo was sent by someone reporting a barrier on a footpath. Classify it as one of: blocked (fencing, "
          "construction, objects across the path), stairs, broken_ramp, slippery, narrow, fine (no barrier). "
          "description: one short sentence, starting with 'Looks like', describing what you see.")

def label_photo(data: bytes, media_type: str, client):
    if client is None:
        return None, ""
    try:
        img = {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": base64.standard_b64encode(data).decode()}}
        r = client.messages.parse(model="claude-sonnet-5-5", max_tokens=1024,
                                  messages=[{"role": "user", "content": [img, {"type": "text", "text": PROMPT}]}],
                                  output_format=PhotoOut)
        if r.stop_reason == "refusal" or r.parsed_output is None:
            return None, ""
        return r.parsed_output.label, r.parsed_output.description
    except Exception:
        return None, ""
```
- [ ] **Step 4:** pytest → PASS. Commit `feat(api): Claude profile parsing, explanations and photo labels with fallbacks`.

---

### Task 7: Read endpoints, route endpoint, SSE and demo toggles

**Files:** Modify `api/app/main.py`, `api/tests/conftest.py`; Create `api/app/feed.py`, `api/app/routers/{places,profile,route,venue,updates,agents,weather,stations,events,demo}.py`, `api/app/state.py`; Test `api/tests/test_api.py`

**Interfaces:**
- Consumes: everything above.
- Produces: `app.state` holds `settings, engine, graph (G), places, weather, broadcaster, llm (client or None)`. Helper `state.build_context(session, weather) -> Context` (active barriers with `edge_id` → status; `lift_out_exits` from confirmed `lift_outage` barriers). `feed.build_updates(session, weather_dict, type) -> list[dict]` items `{id, type, title, place, time ("10 min ago"), source, status ("Confirmed"/"Needs checking"/"Resolved"/"Active"/"Updated"), tone ("warn"|"primary")}`; `feed.ago(dt) -> str`. API shapes per spec §3.5.

- [ ] **Step 1: conftest** — load the real graph once per session (module-level cache) and pass into `create_app(settings, graph=G, places=PL)`; client fixture overrides `app.state.llm = None`.
- [ ] **Step 2: Failing tests** `api/tests/test_api.py`:
```python
def body(**kw):
    return {"from": "mq-station", "to": "library", "profile": {"aid": "manual_wheelchair", "maxSlope": 5}, **kw}

def test_places_search(client):
    r = client.get("/places", params={"q": "mac"}).json()
    assert r[0]["id"] == "mq-station"

def test_route_demo_trip(client):
    r = client.post("/route", json=body()).json()
    assert r["ok"] and r["exitUsed"] == "north"
    lifts = {l["exitId"]: l["status"] for l in r["liftStatus"]}
    assert lifts == {"north": "Working", "south": "Out of service"}
    assert r["explanation"].startswith("Use the lift at the north exit")
    assert r["status"] in ("Confirmed today", "Some details not sure")

def test_route_unknown_place(client):
    r = client.post("/route", json=body(to="nowhere"))
    assert r.status_code == 404 and r.json()["error"]["code"] == "place_not_found"

def test_demo_lift_toggle_changes_route(client):
    assert client.post("/demo/lifts/north").json()["status"] == "Out of service"
    r = client.post("/route", json=body()).json()
    assert r["ok"] is False and "nearby station" in r["suggestion"]
    client.post("/demo/lifts/south")  # south back to working
    assert client.post("/route", json=body()).json()["exitUsed"] == "south"

def test_rain_toggle(client):
    w = client.post("/demo/rain").json()
    assert w["raining"] is True
    assert client.get("/weather").json()["raining"] is True

def test_updates_filter(client):
    all_items = client.get("/updates").json()
    assert len(all_items) >= 5
    t = client.get("/updates", params={"type": "transport"}).json()
    assert t and all(i["type"] == "transport" for i in t)

def test_agents_status(client):
    names = [a["name"] for a in client.get("/agents/status").json()]
    assert names == ["Updates agent", "Report checker", "Venue agent", "Route agent"]

def test_venue_check(client):
    v = client.get("/venue/library/check").json()
    assert [c["field"] for c in v["checks"]] == ["Level entrance", "Step-free inside", "Accessible toilet"]
    assert v["sourceCount"] >= 2
    assert client.get("/venue/nope/check").status_code == 404

def test_station_lifts(client):
    rows = client.get("/stations/mq-station/lifts").json()
    assert {r["exitId"] for r in rows} == {"north", "south"}

def test_profile_parse(client):
    p = client.post("/profile/parse", json={"text": "power wheelchair, need parking"}).json()
    assert p["aid"] == "power_wheelchair" and p["destination"]["parking"] is True and "maxSlope" in p

def test_updates_run_logs(client):
    assert client.post("/agents/updates/run").json()["ok"] is True
```
- [ ] **Step 3:** run → FAIL.
- [ ] **Step 4: Implement.**
  - `main.create_app(settings=None, graph=None, places=None)`: lifespan creates engine + `init_db`, loads graph/places if not given, creates `WeatherService`, `Broadcaster`, `get_client(settings.anthropic_api_key)`, seeds if `settings.seed`, mounts `StaticFiles` at `/uploads` (mkdir first), includes all routers. Generic `Exception` handler → 500 `{"error":{"code":"server_error","message":"Something went wrong on our side."}}`.
  - `/route` (`RouteRequest` with alias `from` → `from_`, `to`, `profile: Profile = DEFAULT_PROFILE`): resolve places (404 `place_not_found`), `ctx = build_context(...)`, `ctx.raining = weather["raining"]`, `find_routes(...)`, lift status from `station_exits` of the station end(s) + outage barriers (`source` "Transport for NSW (demo data)", `updated` = `ago(barrier.first_seen)` or "just now"), barriers within 25 m of either route's coordinates (sequence of points; `_dist_m`) with `{id, type, title, status, lat, lng}`, explanation via `explain_route` with facts (`exitName = places.exit_names[exitUsed]`, `liftsOut` names of out exits at the station, `avoided`: `["stairs"]` if the fastest route has steps and accessible does not, `"a steep section"` if fastest maxSlope > profile.maxSlope), `status` = "Some details not sure" if any step is Not sure else "Confirmed today", `weather` dict. On `ok:false` return `{ok, reason, suggestion, fastest, liftStatus, weather, explanation}`. Log a `route` agent run with summary "Planned <from> to <to>".
  - `/stations/{id}/lifts` same lift-status helper; 404 if not a station.
  - `/venue/{id}/check`: map fields to `checks` rows: `("Level entrance", entrance)`, `("Step-free inside", step_free_inside)`, `("Accessible toilet", toilet)`; status from confidence + value: yes+confirmed → "Confirmed", yes+likely → "Likely", unknown/no → "Not found"; `source` per field from `sources` (seed stores a `field` key per source; join labels, or "Not mentioned in any source"); return `{id, name, checks, checkedBy, checkedAgo, sourceCount, sources}`.
  - `/demo/lifts/{exitId}`: toggle a `lift_outage` barrier for that exit (create confirmed or set resolved/confirmed), publish `lift_changed`, return `{exitId, status}`. 404 for unknown exit.
  - `/demo/rain`: `weather.toggle_override()`, publish `weather_changed`.
  - `/events`: `EventSourceResponse` (sse-starlette) iterating `broadcaster.subscribe()`, yielding `{"event": e["event"], "data": json.dumps(e["data"])}`; ping every 15 s.
  - `/agents/updates/run`: log `updates` run summary f"Checked lift alerts and weather. {n} lift outage(s) active.", publish `agent_run`, return `{ok: True, summary}`.
  - `feed.build_updates`: barriers → items (`type` = `update_type`; status map confirmed→"Confirmed", needs_checking→"Needs checking", resolved→"Resolved"; tone `primary` if resolved else `warn`; source = joined source labels), venues → `{type:"venue", title:"Entrance details updated", status:"Updated", tone:"primary"}`, weather when raining → `{type:"weather", title: summary, place:"Macquarie Park", status:"Active", tone:"warn", source:"Open-Meteo forecast"}`. Sort newest first; filter by type unless `all`/None.
- [ ] **Step 5:** pytest → PASS. Commit `feat(api): route, places, feed, venue, lifts, weather, SSE and demo endpoints`.

---

### Task 8: Reports and the report checker

**Files:** Create `api/app/checker.py`, `api/app/routers/reports.py`; Tests `api/tests/test_checker.py`, `api/tests/test_reports.py`

**Interfaces:**
- Consumes: models, `nearest_edge`, `_dist_m`, `log_run`, broadcaster.
- Produces: `checker.decide(report, nearby_active: list[Barrier], nearby_reports: int, roadworks_near: bool) -> tuple[str, str | None]` returning `(report_status, action)` where action ∈ `resolve`, `confirm`, `needs_checking`, `None`; `checker.check_report(session, report_id, G, broadcaster)` async (applies decision, logs `report_checker` run, publishes `barrier_changed`). Endpoints `POST /reports/label` (multipart `photo`) → `{photoUrl, aiLabel, aiText}`; `POST /reports` JSON → report dict `{id, status:"pending", ...}` and schedules `check_report` via `BackgroundTasks`.

- [ ] **Step 1: Failing tests**
```python
# test_checker.py
from app.checker import decide
from app.models import Report, Barrier
def rep(ai, user): return Report(ai_label=ai, user_label=user, lat=0, lng=0, photo_url="/uploads/x.jpg")
B = Barrier(type="blocked", title="t", place="p", lat=0, lng=0, status="confirmed")

def test_fine_with_barrier_resolves(): assert decide(rep("fine", "fine"), [B], 0, False) == ("confirmed", "resolve")
def test_fine_without_barrier_rejected(): assert decide(rep("fine", "fine"), [], 0, False) == ("rejected", None)
def test_agree_and_nearby_confirms(): assert decide(rep("blocked", "blocked"), [B], 0, False) == ("confirmed", "confirm")
def test_agree_and_roadworks_confirms(): assert decide(rep("blocked", "blocked"), [], 0, True) == ("confirmed", "confirm")
def test_agree_and_other_report_confirms(): assert decide(rep("stairs", "stairs"), [], 1, False) == ("confirmed", "confirm")
def test_disagree_needs_checking(): assert decide(rep("stairs", "blocked"), [B], 0, True) == ("needs_checking", "needs_checking")
def test_no_ai_label_needs_checking(): assert decide(rep(None, "blocked"), [], 0, True) == ("needs_checking", "needs_checking")

# test_reports.py
import io
from PIL import Image
def jpeg():
    b = io.BytesIO(); Image.new("RGB", (40, 30), "orange").save(b, "JPEG"); return b.getvalue()

def test_label_upload(client):
    r = client.post("/reports/label", files={"photo": ("p.jpg", jpeg(), "image/jpeg")}).json()
    assert r["photoUrl"].startswith("/uploads/") and r["aiLabel"] is None
    assert client.get(r["photoUrl"]).status_code == 200

def test_label_rejects_non_image(client):
    r = client.post("/reports/label", files={"photo": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 415 and r.json()["error"]["code"] == "not_an_image"

def test_label_rejects_large(client):
    r = client.post("/reports/label", files={"photo": ("p.jpg", b"0" * (10 * 1024 * 1024 + 1), "image/jpeg")})
    assert r.status_code == 413

def test_report_near_roadworks_confirms_and_reroutes(client):
    # seeded roadworks barrier location (exposed for tests via /updates is not enough; use the DB through the app)
    rw = next(i for i in client.get("/updates", params={"type": "roadworks"}).json())
    lat, lng = rw["lat"], rw["lng"]
    up = client.post("/reports/label", files={"photo": ("p.jpg", jpeg(), "image/jpeg")}).json()
    # aiLabel is None without Claude -> needs_checking
    r = client.post("/reports", json={"photoUrl": up["photoUrl"], "lat": lat, "lng": lng, "userLabel": "blocked", "note": ""})
    assert r.status_code == 200 and r.json()["status"] == "pending"
    items = client.get("/updates", params={"type": "report"}).json()
    assert any(i["status"] == "Needs checking" for i in items)

def test_report_has_no_user_fields(client):
    r = client.post("/reports", json={"photoUrl": None, "lat": -33.776, "lng": 151.115, "userLabel": "stairs", "note": "x"}).json()
    assert set(r) == {"id", "photoUrl", "aiLabel", "userLabel", "note", "lat", "lng", "status", "barrierId", "createdAt"}

def test_report_bad_label(client):
    assert client.post("/reports", json={"lat": 0, "lng": 0, "userLabel": "aliens"}).status_code == 422
```
(Feed items include `lat`/`lng` — add those fields in `feed.build_updates` for barrier items; venue/weather items carry their own coords or null.)
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - `decide`:
```python
def decide(report, nearby_active, nearby_reports, roadworks_near):
    if report.user_label == "fine":
        return ("confirmed", "resolve") if nearby_active else ("rejected", None)
    agree = report.ai_label is not None and report.ai_label == report.user_label
    if agree and (nearby_active or nearby_reports > 0 or roadworks_near):
        return ("confirmed", "confirm")
    return ("needs_checking", "needs_checking")
```
  - `check_report`: load report; `nearby_active` = barriers with status != resolved, type != lift_outage, within 30 m; `nearby_reports` = other reports within 30 m in last 24 h; `roadworks_near` = any active `update_type == "roadworks"` barrier within 100 m. Apply: `resolve` → nearest barrier status `resolved`; `confirm` → update nearest active barrier (or create) with status confirmed, confidence 0.85, add source `{"kind":"user","label":"User photo, matched to a roadworks notice" if roadworks_near else "User photo, matched to nearby reports"}`; `needs_checking` → create barrier status needs_checking, confidence 0.4, title from label map (`blocked`→"Footpath blocked", `stairs`→"Stairs on the path", `broken_ramp`→"Kerb ramp may be damaged", `slippery`→"Slippery path", `narrow`→"Path too narrow"), place = nearest edge `name` or "Near your location". Set `report.barrier_id`, `report.status`. Log run summary ("Matched to a roadworks notice. Routes updated." / "Needs checking: no other source yet." / "Marked as fixed."). Publish `barrier_changed` with `{barrierId, status, title, reportId, summary}` and `report_created`.
  - `/reports/label`: check `content_type.startswith("image/")` else 415 `not_an_image`; read ≤ 10 MB + 1, if larger 413 `too_large` ("Photos must be 10 MB or smaller."); open with Pillow (fail → 415), `ImageOps.exif_transpose`, convert RGB, `thumbnail((1600,1600))`, save JPEG q=85 to `uploads/<uuid>.jpg` (no EXIF); `label_photo(jpeg_bytes, "image/jpeg", app.state.llm)`; return `{photoUrl, aiLabel, aiText}`.
  - `/reports`: `ReportIn(photoUrl: str | None, lat: float, lng: float, userLabel: Literal[...LABELS], note: str = "")` → save Report, schedule `check_report`, return camelCase report dict.
- [ ] **Step 4:** pytest → PASS. Commit `feat(api): barrier reports with photo upload and report checker`.

---

### Task 9: API Dockerfile and run instructions

**Files:** Create `api/Dockerfile`, `api/.dockerignore`; Modify `README.md`

- [ ] **Step 1:** Dockerfile per tech-stack §8 (python:3.11-slim, `pip install -r requirements.txt`, copy app + data, `CMD uvicorn app.main:app --host 0.0.0.0 --port 8000`). `.dockerignore`: `.venv`, `uploads`, `*.db`, `tests`, `__pycache__`.
- [ ] **Step 2:** README: prerequisites, `cd api && python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt && .venv/Scripts/uvicorn app.main:app --reload`, `cd web && npm install && npm run dev`, env vars, demo controls (`POST /demo/lifts/south`, `POST /demo/rain`), tests.
- [ ] **Step 3:** Verify: `docker build -t reachable-api api` succeeds (if Docker daemon is not running, record that and skip). Run uvicorn locally and `curl localhost:8000/health`.
- [ ] **Step 4:** Commit `chore(api): Dockerfile and run instructions`.

---

### Task 10: Web scaffold, tokens, shared components, lib layer

**Files:** Create `web/` via create-next-app; `web/app/layout.tsx`, `web/app/globals.css`, `web/lib/{types,placeholder,api,profile,events}.ts`, `web/components/{StatusBadge,WeatherBanner,InfoBanner,FilterChips,NeedsChips,RouteStep,VenueCheckRow,AgentCard,UpdateRow,PlaceInput}.tsx`, `web/components/layout/{AppHeader,LandingHeader,Footer}.tsx`, `web/vitest.config.ts`, `web/tests/unit/{profile,api}.test.ts`

**Interfaces:**
- Produces (TypeScript, `lib/types.ts`):
```ts
export type Aid = "manual_wheelchair" | "power_wheelchair" | "walker" | "cane" | "pram";
export interface Profile { aid: Aid; maxSlope: number; avoid: { stairs: boolean; kerbsNoRamp: boolean; slipperyWhenWet: boolean; uneven: boolean }; destination: { entrance: boolean; toilet: boolean; parking: boolean }; text: string }
export interface Place { id: string; name: string; kind: "station" | "venue" | "place"; lat: number; lng: number }
export interface RouteOut { geometry: { type: "LineString"; coordinates: [number, number][] }; distanceM: number; minutes: number; maxSlope: number; stepFree: boolean }
export interface Step { icon: "check" | "slope" | "alert" | "lift" | "crossing"; label: string; confidence: string; lengthM: number }
export interface LiftRow { exitId: string; exit: string; status: "Working" | "Out of service"; source: string; updated: string }
export interface Weather { raining: boolean; summary: string; until: string | null; source: string }
export interface MapBarrier { id: string; type: string; title: string; status: string; lat: number; lng: number }
export interface RouteResult { ok: boolean; accessible?: RouteOut; fastest?: RouteOut | null; minutesLonger?: number; steps?: Step[]; exitUsed?: string | null; liftStatus: LiftRow[]; barriers?: MapBarrier[]; explanation: string; status?: string; weather: Weather; reason?: string; suggestion?: string }
export interface VenueCheck { id: string; name: string; checks: { field: string; status: string; source: string }[]; checkedBy: string; checkedAgo: string; sourceCount: number; sources: { label: string; url: string | null }[] }
export interface UpdateItem { id: string; type: "report" | "roadworks" | "transport" | "weather" | "venue"; title: string; place: string; time: string; source: string; status: string; tone: "warn" | "primary"; lat?: number | null; lng?: number | null }
export interface AgentCardData { name: string; status: string; tone: "primary" | "warn" | "muted"; desc: string }
export interface Fetched<T> { data: T; sample: boolean }
```
  `lib/api.ts`: `API_URL`, `class ApiError extends Error { code; status }`, reads returning `Fetched<T>` with placeholder fallback on network error/5xx: `getPlaces(q)`, `getRoute(from, to, profile)` (POST but treated as read: fallback to placeholder route), `getVenueCheck(id)`, `getUpdates(type?)`, `getAgents()`, `getWeather()`; writes throwing `ApiError`: `parseProfile(text)`, `labelPhoto(file)`, `sendReport(body)`, `demoToggleLift(exitId)`. 404 on route throws `ApiError` (not a fallback).
  `lib/profile.ts`: `loadProfile(): Profile`, `saveProfile(p)`, `loadTrips(): Trip[]`, `addTrip(t)` (max 3, dedupe by from+to), `AID_DEFAULTS`.
  `lib/events.ts`: `useEvents(handler: (event: string, data: any) => void, events: string[])`.
  Components (props): `StatusBadge({label})` (tone derived from label per UI spec §2), `WeatherBanner({weather})` (renders nothing if not raining), `InfoBanner({children})`, `FilterChips({legend, options:{value,label}[], value, onChange, multiple?: false})`, `NeedsChips({profile, label="Your needs:"})`, `RouteStep({step})`, `VenueCheckRow({check})`, `AgentCard({agent})`, `UpdateRow({item, compact?})`, `PlaceInput({id, label, value: Place|null, onChange})` (combobox: `<input role="combobox" aria-expanded aria-controls aria-autocomplete="list">` + `<ul role="listbox">` options, arrow keys/Enter/Escape, calls `getPlaces`).

- [ ] **Step 1: Scaffold.**
```bash
npx create-next-app@16.4.2 web --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
cd web && npx shadcn@4.22.0 init -d && npx shadcn@4.22.0 add button input textarea checkbox slider dialog badge label
npm i leaflet@1.9.4 react-leaflet@5.0.0 qrcode.react lucide-react && npm i -D @types/leaflet vitest @vitejs/plugin-react jsdom @testing-library/react @playwright/test @axe-core/playwright
```
Add scripts: `"test": "vitest run"`, `"e2e": "playwright test"`.
- [ ] **Step 2: Tokens** in `app/globals.css` — replace the shadcn colour block with the spec tokens (Tailwind v4):
```css
@import "tailwindcss";
@theme {
  --color-bg: #F4F5F1; --color-surface: #FFFFFF; --color-ink: #15201B; --color-muted: #4A5550;
  --color-line: #D5D9D3; --color-line-strong: #9AA39D; --color-map-bg: #E7EAE3;
  --color-primary: #1D4FA8; --color-primary-hover: #163C80; --color-primary-soft: #E6EDF9;
  --color-warn: #A84A00; --color-warn-strong: #8A3D00; --color-warn-soft: #FCEBDD; --color-warn-ink: #6E3000;
  --color-fastest: #6B746F;
  --font-sans: var(--font-atkinson), system-ui, sans-serif;
  --radius-card: 18px;
}
html { background: var(--color-bg); color: var(--color-ink); }
body { font-size: 17px; line-height: 1.5; }
:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
```
Map shadcn's semantic variables (`--primary`, `--background`, `--foreground`, `--border`, `--ring`, `--input`) to these tokens so shadcn components use them. Remove any dark-mode block (spec has one light theme).
- [ ] **Step 3: Layout** `app/layout.tsx`: `Atkinson_Hyperlegible({ weight: ["400","700"], subsets: ["latin"], variable: "--font-atkinson" })`, `<html lang="en-AU">`, `metadata.title.template = "%s · Reachable"`, a "Skip to main content" link as first child (visible on focus) targeting `#main`.
- [ ] **Step 4: Placeholder + types + profile + api + events** as above. `placeholder.ts` = UI spec §6 data with real names (venue = first café from places.json, street = the crossing street used in seed).
- [ ] **Step 5: Failing unit tests**
```ts
// tests/unit/profile.test.ts
import { beforeEach, expect, test } from "vitest";
import { loadProfile, saveProfile, addTrip, loadTrips } from "@/lib/profile";
import { profile as placeholder } from "@/lib/placeholder";
beforeEach(() => localStorage.clear());
test("defaults when empty", () => expect(loadProfile()).toEqual(placeholder));
test("defaults when corrupt", () => { localStorage.setItem("reachable.profile", "{nope"); expect(loadProfile()).toEqual(placeholder); });
test("merges old shapes with defaults", () => { localStorage.setItem("reachable.profile", JSON.stringify({ aid: "walker" })); const p = loadProfile(); expect(p.aid).toBe("walker"); expect(p.avoid.stairs).toBe(placeholder.avoid.stairs); });
test("round trip", () => { saveProfile({ ...placeholder, maxSlope: 8 }); expect(loadProfile().maxSlope).toBe(8); });
test("trips keep 3, newest first, deduped", () => { for (const to of ["a", "b", "c", "d", "b"]) addTrip({ fromId: "s", from: "S", toId: to, to, minutes: 5 }); expect(loadTrips().map(t => t.toId)).toEqual(["b", "d", "c"]); });

// tests/unit/api.test.ts
import { afterEach, expect, test, vi } from "vitest";
import { getUpdates, sendReport, getRoute, ApiError } from "@/lib/api";
import { profile } from "@/lib/placeholder";
afterEach(() => vi.unstubAllGlobals());
test("reads fall back to sample data when the API is down", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  const r = await getUpdates(); expect(r.sample).toBe(true); expect(r.data.length).toBeGreaterThan(0);
});
test("reads return live data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: "1" }]), { status: 200 })));
  expect((await getUpdates()).sample).toBe(false);
});
test("writes throw ApiError when the API is down", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  await expect(sendReport({ photoUrl: null, lat: 0, lng: 0, userLabel: "blocked", note: "" })).rejects.toBeInstanceOf(ApiError);
});
test("unknown place is an error, not sample data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "place_not_found", message: "x" } }), { status: 404 })));
  await expect(getRoute("a", "nowhere", profile)).rejects.toMatchObject({ code: "place_not_found" });
});
```
`vitest.config.ts`: jsdom environment, `@` alias to project root, include `tests/unit/**`.
- [ ] **Step 6:** `npm test` → FAIL then implement → PASS.
- [ ] **Step 7: Shared components and headers** per UI spec §2 (AppHeader: logo square `bg-primary` with Lucide `Waves`-style icon + "Reachable" linking to `/`; `<nav aria-label="Main">` links with `aria-current="page"` using `usePathname`; "Report a barrier" secondary-button link; wraps with `flex-wrap`). `npm run build` passes.
- [ ] **Step 8:** Commit `feat(web): Next.js scaffold, design tokens, shared components and API layer`.

---

### Task 11: MapView and `/route` page

**Files:** Create `web/components/map/MapView.tsx`, `web/components/map/RouteMap.tsx`, `web/app/route/page.tsx`, `web/app/route/RouteClient.tsx`

**Interfaces:**
- Consumes: `getRoute`, `getVenueCheck`, `useEvents`, `loadProfile`, `addTrip`, components from Task 10.
- Produces: `MapView({ accessible?: RouteOut, fastest?: RouteOut | null, barriers: MapBarrier[], weather })` default export (client-only); `RouteMap` = `dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="bg-map-bg ..." /> })`.

- [ ] **Step 1: MapView** — `MapContainer` (zoomControl false, `scrollWheelZoom`), `TileLayer` OSM with attribution, `Polyline` fastest (`color #6B746F`, weight 6, `dashArray "10 10"`), `Polyline` accessible (`#1D4FA8`, weight 8), start `CircleMarker` (white fill, blue 4 px ring), end `CircleMarker` (blue fill), barriers as `Marker` with `L.divIcon` (32 px orange `#A84A00` rounded square, white inline SVG icon: stairs/fence/alert by type; `title` + `alt` text = barrier title), `fitBounds` to the routes; legend card top-left (Your route / Fastest route / Barrier, each with a drawn line/square + text); custom zoom buttons bottom-right (48 px, `aria-label="Zoom in"/"Zoom out"`) via `useMap()`. Container `role="region" aria-label="Route map"`. `import "leaflet/dist/leaflet.css"`. Weather overlay is rendered by the page, not the map.
- [ ] **Step 2: Route page** — `page.tsx` exports `metadata = { title: "Route and destination" }` and renders `<Suspense><RouteClient/></Suspense>`. `RouteClient` (client):
  - reads `from`/`to` from `useSearchParams` (defaults `mq-station`/`library`); `PlaceInput`s for From/To — changing either `router.replace` with new params (re-routes).
  - fetches `getRoute(from, to, loadProfile())` and `getVenueCheck(to)`; shows sample banner if `sample`; on `ApiError` code `place_not_found` shows `role="alert"` "We couldn't find that place. Pick one from the list."
  - left panel per UI spec §5.2: `NeedsChips`, summary (32 px minutes, muted "850 m · step-free · max slope 4%", `StatusBadge status`), station lift rows (blue `CheckCircle` + "Working" badge or orange `AlertTriangle` + "Out of service" badge, muted "Transport for NSW (demo data), updated 4 min ago"), warning banner if `!ok` (reason + suggestion), explanation box (`bg-bg`), "Route details" `<h2>` + `<ol>` of `RouteStep`, Destination check (small caps label, three `VenueCheckRow`, muted line + "How we know" Dialog listing sources), destination-need warning when `profile.destination.toilet` and toilet check is "Not found" ("This place may not meet your need for an accessible toilet."), buttons "Other places that fit" (secondary, links to `/plan`) and "Send to my phone" (Dialog with `QRCodeSVG` of `window.location.href` + "Copy link" button with `role="status"` "Link copied").
  - map area: `RouteMap`, `WeatherBanner` overlay top-right, live barrier card bottom-left inside an `aria-live="polite"` region.
  - `useEvents` on `barrier_changed`, `lift_changed`, `weather_changed`: re-fetch route; for `barrier_changed` with status confirmed set the live card (title + `StatusBadge` + "Reported with a photo just now. Our agent matched it to a roadworks notice. Your route now goes around it." using the event summary); for `lift_changed` set a polite status message "Lift status changed. Your route has been updated."
  - `addTrip` after a successful route.
  - layout: `flex flex-col lg:flex-row`, panel `lg:basis-[380px] lg:max-w-[460px] border-r`, map `min-h-[560px] flex-1`.
- [ ] **Step 3: Verify** with API running: `npm run dev`, open `/route?from=mq-station&to=library` in the browser; route draws; `curl -X POST localhost:8000/demo/lifts/north` → page shows no-route banner without reload; toggle again → route returns. Check 390 px width has no horizontal scroll.
- [ ] **Step 4:** Commit `feat(web): route and destination page with live map`.

---

### Task 12: `/report` page

**Files:** Create `web/app/report/page.tsx`, `web/app/report/ReportClient.tsx`, `web/components/map/PinPicker.tsx`

- [ ] **Step 1:** Implement per UI spec §5.3:
  - Upload zone (260 px, dashed `line-strong`, `bg-map-bg`): visually-hidden `<input type="file" accept="image/*" capture="environment" id="photo">` with a visible `<label htmlFor="photo">` styled as the "Upload a photo" button (Camera icon). On change: preview via `URL.createObjectURL`, call `labelPhoto(file)`.
  - "AI check" card: `role="status"`; states: idle ("Add a photo and we'll check what it shows."), loading ("Checking your photo…"), result (bold `aiText` or "We couldn't tell what this shows. Pick the closest option below."), error (`role="alert"` with API message).
  - `<fieldset><legend>Is this right? Change it if not.</legend>` + `FilterChips` single-select (Blocked path=blocked, Stairs=stairs, Broken ramp=broken_ramp, Slippery=slippery, Too narrow=narrow, Path is fine now=fine), preselect `aiLabel`.
  - `<label for="note">Anything else?</label>` + Textarea.
  - Location: on mount `navigator.geolocation.getCurrentPosition` (fallback Library forecourt coords with text "Using the Library forecourt. Change it if you're somewhere else."); muted coordinates/place line; "Change location" button toggles `PinPicker` (client-only Leaflet map; click sets pin; also keyboard-usable "Use map centre" button).
  - "Send report" primary button (disabled until a label is chosen, with `aria-describedby` hint) → `sendReport` → success `role="status"` "Thanks. Your report is in. A Sym agent is checking it now." + link "See it on Live updates" (`/live`); failure → `role="alert"`.
  - Right column "What happens next": `<ol>` 3 steps + privacy note.
- [ ] **Step 2: Verify** in browser with API running: upload a JPEG, see label state, send, success message; `/updates?type=report` contains the new item.
- [ ] **Step 3:** Commit `feat(web): report a barrier page`.

---

### Task 13: `/plan`, `/needs`, `/live` pages

**Files:** Create `web/app/plan/{page,PlanClient}.tsx`, `web/app/needs/{page,NeedsClient}.tsx`, `web/app/live/{page,LiveClient}.tsx`

- [ ] **Step 1: `/plan`** per UI spec §5.1: H1 44 px "Find a route you can actually use" + subtext; card with `PlaceInput` From (default Macquarie University station, or last trip's start) and To (default empty) side by side (`sm:grid-cols-2`); `NeedsChips label="Planning for:"` + "Change" link; `WeatherBanner`; 58 px full-width primary button "Find a route I can use" → validates both places picked (else inline `role="alert"` "Pick a place from the list for From and To.") → `router.push('/route?from=..&to=..')`. Side: "Changes near you" (3 from `getUpdates()`, "See all" link), "Recent trips" (`loadTrips()`, each a link "A to B · 12 min"; empty: "Your recent trips will show here."). Title "Plan a trip".
- [ ] **Step 2: `/needs`** per UI spec §5.5: textarea (5 rows, label "In your own words", default `profile.text`), secondary button "Update my settings from this" → `parseProfile` → fills form, `role="status"` "Settings updated from your description. Check them below."; error → alert. Right: fieldset "How do you get around?" single-select chips (sets `AID_DEFAULTS`), shadcn Slider labelled "Steepest slope I can manage" (2–12, step 1, `aria-valuetext="5 percent"`), value shown 32 px `text-primary`, end labels; fieldset "Avoid" (4 shadcn Checkboxes with labels); fieldset "At my destination I need" (3 checkboxes); "Save and plan a trip" → `saveProfile` → `/plan`. Title "My needs".
- [ ] **Step 3: `/live`** per UI spec §5.4: `FilterChips` (All, User reports=report, Roadworks, Transport, Weather, Venues) controlling `getUpdates(type)`; card list of `UpdateRow`; empty state "Nothing in this category right now."; `useEvents` on `barrier_changed`, `lift_changed`, `weather_changed`, `report_created` → refetch and announce "New update: <title>" in a polite live region. Right: "Sym agents" + "The team keeping the map up to date" + four `AgentCard`s from `getAgents()`, refetch on `agent_run`. Title "Live updates".
- [ ] **Step 4: Verify** each page in the browser at 1440 and 390 px; keyboard-only pass (Tab through, chips toggle with Space/Enter, combobox arrows).
- [ ] **Step 5:** Commit `feat(web): plan, needs and live updates pages`.

---

### Task 14: Landing page `/`

**Files:** Create/replace `web/app/page.tsx`, `web/components/layout/LandingHeader.tsx`, `web/components/layout/Footer.tsx`

- [ ] **Step 1:** Implement UI spec §5.0 exactly (copy verbatim): LandingHeader (logo; "How it works" `#how`, "Live updates", primary "Plan a trip"); hero two columns (eyebrow "Step-free, from the stop to the door", H1 52 px, subtext from spec, buttons) + comparison card "Same trip, two answers" (orange stairs-icon row "Fastest route, 8 min" / "Uses the south exit stairs", blue check row "Reachable route, 12 min" / "North exit lift is working, step-free path, entrance checked", caption "Macquarie University station to the Library, manual wheelchair"); problem band (3 cards + "Around 750,000 Australians use mobility aids."); `<section id="how">` 3 numbered steps (40 px blue circles; `<ol>`); "Built to stay up to date" 3 cards; live preview (server component fetching `GET /updates` with 3 s timeout, falling back to placeholder, first 3 rows via `UpdateRow`, "See all updates" link); final CTA band (primary bg, white H2, white button with primary text — check contrast); Footer. `metadata.title = { absolute: "Reachable · Step-free, from the stop to the door" }`.
- [ ] **Step 2: Verify** in browser at 1440/390 px. Commit `feat(web): landing page`.

---

### Task 15: Accessibility and end-to-end tests

**Files:** Create `web/playwright.config.ts`, `web/tests/e2e/a11y.spec.ts`, `web/tests/e2e/live-reroute.spec.ts`

- [ ] **Step 1: Config** — `webServer` entries: API (`cd ../api && .venv/Scripts/python -m uvicorn app.main:app --port 8000`, env `DATABASE_URL=sqlite:///./e2e.db`, `ANTHROPIC_API_KEY=`) with url `http://localhost:8000/health`, and web (`npm run build && npm run start -- -p 3100`) with url `http://localhost:3100`; `use.baseURL = http://localhost:3100`; projects `desktop` (1440×900) and `mobile` (390×844); delete `api/e2e.db` in `globalSetup` so the seed is fresh.
- [ ] **Step 2: Tests**
```ts
// a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const pages = ["/", "/plan", "/route?from=mq-station&to=library", "/report", "/live", "/needs"];
for (const path of pages) {
  test(`a11y ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target).join(", ")}`)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await expect(page).toHaveTitle(/Reachable/);
  });
}
test("titles are unique", async ({ page }) => {
  const titles = new Set<string>();
  for (const p of pages) { await page.goto(p); titles.add(await page.title()); }
  expect(titles.size).toBe(pages.length);
});

// live-reroute.spec.ts
import { test, expect, request } from "@playwright/test";
test("lift outage reroutes without reload", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=library");
  await expect(page.getByText("South exit lift")).toBeVisible();
  await expect(page.getByText("Out of service").first()).toBeVisible();
  const api = await request.newContext({ baseURL: "http://localhost:8000" });
  await api.post("/demo/lifts/north");
  await expect(page.getByText(/nearby station/)).toBeVisible({ timeout: 10_000 });
  await api.post("/demo/lifts/north");
  await expect(page.getByText(/nearby station/)).toBeHidden({ timeout: 10_000 });
});
```
(The reroute test runs only in the `desktop` project to avoid two projects toggling the same server state concurrently: `test.skip(({ }, info) => info.project.name !== "desktop")`; config `workers: 1`.)
- [ ] **Step 3:** `npx playwright install chromium && npm run e2e`. Fix every violation in the components (not by disabling rules). Re-run until green.
- [ ] **Step 4:** Commit `test(web): axe accessibility and live reroute e2e tests`.

---

### Task 16: Final verification

- [ ] **Step 1:** `cd api && .venv/Scripts/python -m pytest` → all pass. `cd web && npm test && npm run build && npm run e2e` → all pass. `npm run lint` clean.
- [ ] **Step 2:** Manual demo run: start both apps; `/needs` → describe needs → save → `/plan` → station to Library → `/route` shows north-exit route, south lift out; `/report` upload → `/live` shows the report; `POST /demo/rain` → weather banner on `/plan` and `/route`.
- [ ] **Step 3:** Update `.claude/memory/project-status.md` with stage + next step; commit `docs: update project status`.
