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

## Campus graph

`api/data/graph.graphml` is prebuilt and committed. To rebuild it: `cd api && .venv/Scripts/python scripts/build_graph.py`.
Station exits and hand-measured slopes live in `api/data/overrides.json`; the elevation grid is cached in `api/data/elevation_grid.json`.

## Deploy (not done yet)

`api/Dockerfile` builds the API image. For Turso, add `sqlalchemy-libsql` to `api/requirements.txt` (it has no Windows wheel, so it is left out for local development) and set `DATABASE_URL=sqlite+libsql://<db>.turso.io?secure=true&authToken=...`.
