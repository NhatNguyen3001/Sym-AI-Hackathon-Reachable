# Reachable

*From the stop to the door.* An accessible door-to-door trip planner for Macquarie University, built for the Sym AI Open 2026.

- `api/` — FastAPI: real campus routing (OpenStreetMap footpaths, slope, stairs, station lifts, barriers, rain), Claude for needs parsing, route explanations and photo labels, live updates over Server-Sent Events.
- `web/` — Next.js + Tailwind + shadcn/ui + react-leaflet: the six pages in `.claude/docs/reachable-web-ui-spec.md`.
- Design docs: `.claude/docs/`, spec and plan: `docs/superpowers/`.

## Run it locally

Prerequisites: Python 3.11, Node 20+.

```bash
# API (http://localhost:8000)
cd api
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt     # macOS/Linux: .venv/bin/pip
cp .env.example .env                                   # add ANTHROPIC_API_KEY (optional)
.venv/Scripts/python -m uvicorn app.main:app --reload

# Web (http://localhost:3000)
cd web
npm install
npm run dev
```

Without `ANTHROPIC_API_KEY` everything still works: needs parsing and route explanations fall back to rules, and photo reports ask the user to pick the barrier type.

## Demo controls

The lift outage and rain are simulated for the demo (labelled "demo data" in the app):

```bash
curl -X POST localhost:8000/demo/lifts/north   # toggle the north exit lift
curl -X POST localhost:8000/demo/lifts/south   # toggle the south exit lift (out at start)
curl -X POST localhost:8000/demo/rain          # toggle rain
curl -X POST localhost:8000/agents/updates/run # log an Updates agent run
```

Open `/route?from=mq-station&to=library` and toggle a lift: the page updates without a reload.

To start from fresh demo data, stop the API and delete `api/reachable.db`.

## Tests

```bash
cd api && .venv/Scripts/python -m pytest
cd web && npm test          # unit
cd web && npm run e2e       # accessibility (axe) + live reroute, starts both servers
```

## Sydney-wide routing (Valhalla)

Trips anywhere in Greater Sydney are routed by a local [Valhalla](https://github.com/valhalla/valhalla) container; place search uses [Photon](https://photon.komoot.io). Campus trips always use the campus graph below.

Prerequisites: Docker Desktop running.

```bash
# 1. Download the Australia extract (~970 MB, once) and clip it to Greater Sydney (~85 MB)
api/.venv/Scripts/python api/scripts/build_sydney_extract.py

# 2. Build and serve the routing tiles (first start builds tiles + elevation, about 10 minutes)
docker compose up -d valhalla
curl localhost:8002/status        # ready when this returns JSON
```

API settings (env or `api/.env`):

| Setting | Default | |
|---|---|---|
| `ROUTER` | `valhalla` | `campus` = campus graph only (no Docker needed) |
| `VALHALLA_URL` | `http://localhost:8002` | |
| `PHOTON_URL` | `https://photon.komoot.io` | empty disables address search |
| `COVERAGE_BBOX` | `149.97,-34.33,151.63,-32.99` | Greater Sydney |
| `MAX_LEG_KM` | `10` | longest walk/roll |

If Valhalla is down, campus trips still work and other trips return a clear "Route planning is unavailable" message.

**Slopes outside campus are estimates.** Valhalla's elevation data is too coarse for a trustworthy slope limit at footpath scale, so Sydney routes prefer flatter paths and say their slopes are estimated. On campus the slope limit is enforced with measured data.

Tests against the live stack (with the container running):

```bash
cd api && .venv/Scripts/python -m pytest -m valhalla          # live routing tests (skipped when Docker is down)
cd web && E2E_VALHALLA=1 npx playwright test sydney            # browser test: search Sydney + route
```

To refresh the map: run the extract script again, then `docker compose down && docker compose up -d valhalla` (delete `valhalla/custom_files/valhalla_tiles*` first to force a rebuild).

## Campus graph

`api/data/graph.graphml` is prebuilt and committed. To rebuild it: `cd api && .venv/Scripts/python scripts/build_graph.py`.
Station exits and hand-measured slopes live in `api/data/overrides.json`; the elevation grid is cached in `api/data/elevation_grid.json`.

## Deploy (not done yet)

`api/Dockerfile` builds the API image. For Turso, add `sqlalchemy-libsql` to `api/requirements.txt` (it has no Windows wheel, so it is left out for local development) and set `DATABASE_URL=sqlite+libsql://<db>.turso.io?secure=true&authToken=...`.
