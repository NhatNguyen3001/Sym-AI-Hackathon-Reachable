# Reachable

*From the stop to the door.* An accessible door-to-door trip planner for Sydney, starting at Macquarie University, built for the Sym AI Open 2026.

- `api/` — FastAPI: real campus routing (OpenStreetMap footpaths, slope, stairs, station lifts, barriers, rain), Sydney-wide walking routes (Valhalla), public transport trips and live lift alerts (Transport for NSW), an owner-run **map agent** that gathers accessible places across Sydney (OpenStreetMap) and has **Claude** decide which roadworks affect people walking (Live Traffic NSW), Claude for public transport explanations and photo labels, live updates over Server-Sent Events. Data in local SQLite or Turso.
- `web/` — Next.js + Tailwind + shadcn/ui + react-leaflet: the map with pins across Sydney (`/`; needs are set with filter chips there), route (`/route`), report a barrier (`/report`), live updates (`/live`) and privacy (`/privacy`).
- The UI spec, design mockups, specs and plans are kept outside the repo (`.claude/`, `docs/` are gitignored); ask the team for them.

## Quick start: campus only, no Docker

Everything for the Macquarie University campus runs with just Python and Node. No Docker, no API keys.

**You need:** [Git](https://git-scm.com/), [Python 3.11+](https://www.python.org/downloads/) (tick "Add Python to PATH" on Windows), [Node.js 20+](https://nodejs.org/).

```bash
git clone https://github.com/NhatNguyen3001/Sym-AI-Hackathon-Reachable.git
cd Sym-AI-Hackathon-Reachable
```

**1. API** (first terminal, from the repo folder)

Windows (PowerShell):
```powershell
cd api
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
copy .env.example .env
```
macOS / Linux:
```bash
cd api
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
cp .env.example .env
```

Open `api/.env` and change these two lines so everything stays on campus:
```
ROUTER=campus
PHOTON_URL=
```
(`ROUTER=campus` uses the built-in campus map instead of Sydney-wide Valhalla; an empty `PHOTON_URL` limits search to campus places.)
Leave `TFNSW_API_KEY` and `TURSO_DATABASE_URL` empty: you get walk/roll routes only, a local SQLite database, and station lifts shown as "Not sure" (there is no live lift data without the key).

**Windows: "No such file or directory … Long Path" during `pip install`?** The folder path is too long for Windows (one of the packages has very long file names). Clone the repo somewhere short, for example `C:\dev\Sym-AI-Hackathon-Reachable`, delete `api\.venv` and install again, or turn on Windows long paths (PowerShell as Administrator: `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`, then restart).

Start it (leave this terminal running):
```bash
.venv\Scripts\python -m uvicorn app.main:app --port 8000 --no-access-log     # Windows
.venv/bin/python -m uvicorn app.main:app --port 8000 --no-access-log         # macOS / Linux
```
Check: http://127.0.0.1:8000/health shows `{"ok":true,...}`. The web app talks to the API at `127.0.0.1`, not `localhost`: on Windows `localhost` tries IPv6 first and adds about 0.2 s to every request.

**2. Web** (second terminal, from the repo folder)
```bash
cd web
npm install
copy .env.example .env.local     # Windows   (macOS / Linux: cp .env.example .env.local)
npm run dev
```

**3. Open** http://localhost:3000, or go straight to the demo trip: http://localhost:3000/route?from=mq-station&to=library

Without `ANTHROPIC_API_KEY` everything still works: public transport explanations use a template, photo reports ask the user to pick the barrier type, and the map agent adds no roadworks (it never guesses them). To try Claude, put a key in `api/.env` and restart the API.

**First start:** the API loads the saved copy of about 5,500 accessible places across Sydney (`api/data/osm_places_snapshot.json`) into the database, so the map is full from the start. This happens once, only while the places table is empty.

**Working on the UI:** pages are in `web/app/<page>/`, shared pieces in `web/components/`, colours and fonts in `web/app/globals.css` (design tokens: use these, don't add new colours). The page reloads as you save. Before pushing UI changes, run the checks (the browser tests also check accessibility with axe):
```bash
cd web
npm test && npm run lint && npx tsc --noEmit
npx playwright install chromium   # first time only
npm run e2e                        # starts its own API and web server on ports 8100/3100
```

**Fresh demo data:** stop the API and delete `api/reachable.db`; it is recreated and re-seeded on the next start.

## Demo controls

Lift status is live from Transport for NSW (see below), so there is no lift toggle any more. Rain can still be simulated:

```bash
curl -X POST localhost:8000/demo/rain          # toggle rain
curl -X POST localhost:8000/agents/updates/run # check Transport for NSW lift alerts now
```

When a real lift alert changes, an open `/route` page updates without a reload.

To start from fresh demo data, stop the API and delete `api/reachable.db`.

## Tests

```bash
cd api && .venv/Scripts/python -m pytest
cd web && npm test          # unit
cd web && npm run e2e       # accessibility (axe), live reroute, transit options; starts the API, web and a mock Transport for NSW
```

The e2e run never uses your keys or Turso: it starts its own API on a temporary SQLite file and a mock Transport for NSW server (`web/tests/e2e/tfnsw-mock.mjs`). For the map it seeds about 40 fixed places and one roadwork (`SEED_MAP_PLACES`), swaps in a map agent that calls nothing real (`MAP_AGENT_FAKE`) and uses a test-only owner key. The API tests blank every key from `api/.env` too.

## Public transport and live lifts (Transport for NSW)

1. Get a free API key at [opendata.transport.nsw.gov.au](https://opendata.transport.nsw.gov.au) (an application with the Trip Planner APIs).
2. Put it in `api/.env`: `TFNSW_API_KEY=<your key>` and restart the API.

What changes:
- **Live lifts.** Every 5 minutes (`LIFT_POLL_SECONDS`) the API reads current lift alerts. Macquarie University station exits are matched exactly by the broken lift's OpenStreetMap id; other stations show on `/live` and on trips through them.
- **Public transport trips.** Trips longer than 1 km (`TRANSIT_MIN_KM`) also get wheelchair-accessible journeys from the Trip Planner. The walks to and from the stations are our own accessible routes (stairs, slopes, barriers); the rides and the paths inside stations (lifts, level paths) come from Transport for NSW. Up to 3 options, best first; a lift alert on your platform removes that option when another exists.

Live tests (use your key, read only): `cd api && .venv/Scripts/python -m pytest -m tfnsw`.

## Database: local SQLite or Turso

By default the API uses `api/reachable.db` (SQLite). To use [Turso](https://turso.tech) instead, set in `api/.env`:

```
TURSO_DATABASE_URL=libsql://<db>-<org>.turso.io
TURSO_AUTH_TOKEN=<token>
```

On the first start the API creates the tables (`agentrun`, `barrier`, `mapplace`, `placecache`, `report`, `venue`) and seeds the demo data. `/health` says which database is in use (`"db": "turso"` or `"sqlite"`). Clear `TURSO_DATABASE_URL` to go back to local SQLite. Live check (read only): `pytest -m turso`.

**Local copy (embedded replica).** With Turso, the API keeps a local copy of the database in `api/turso-replica.db` (gitignored; `TURSO_REPLICA_PATH`). Reads come from the copy, so they never wait on the network; writes go straight to Turso and show up locally at once. The copy syncs every 15 s (`TURSO_SYNC_SECONDS`), at a moment when no request is running. If Turso can't be reached at start-up, the API starts from the last copy, read-only (reports say "Couldn't save your report right now. Please try again.") until Turso is back. With no copy yet it refuses to start and says why.

Why the care about writes: the `libsql` driver holds Python's global lock during network calls, so every Turso round trip pauses the whole API (a write about 0.6 s, a sync 0.1-0.3 s). That's why searches write nothing, routes aren't logged, and the lift checker writes only when something changed.

## Map pins across Sydney (map agent)

The map shows accessible toilets, step-free entrances, accessible parking and wheelchair-accessible places across
Greater Sydney from OpenStreetMap, plus the Live Traffic NSW roadworks and events that affect people walking or using
a wheelchair. **Claude decides** which roadworks matter ("blocks the path", "may affect", or car-only and dropped)
and writes one plain sentence for each. Zoomed out, pins join into soft blue number bubbles that split as you zoom in.

On the map:
- **A place pin** opens a small popup (what it is, how far, the source) with a **Go here** button; only that button
  plans a route. The route page's destination check says "Likely" for what OpenStreetMap says (it's community data).
- **A problem pin** (roadworks, lift out, slope, broken ramp) opens a card with where, when it was checked, the source
  and, for roadworks, Claude's sentence. "Not there" / "Still there" only change this device.
- Pins open with Enter or Space too. The map opens on your location when it's in Sydney and accurate (within 1 km),
  otherwise on campus; it never jumps to the middle of all the pins.

The agent runs **only when the owner asks** (no schedule):
1. Set `ADMIN_KEY=<a long random key of your own>` in `api/.env` and restart the API.
2. On **Live updates**, open **Owner**, enter the key once (it stays in that browser only, never in a URL) and press
   **Update map now**. A run takes about 5 minutes (OpenStreetMap is often busy and is retried; Claude gets up to 2
   minutes per batch of 25 notices) and saves everything in one write. The map and Live updates say when it last ran.
   You can keep using the app while it runs.
3. To freeze the map (for a demo), set `MAP_AGENT_PAUSED=true` and restart: the button shows "Map updates are paused".

Roadworks need `TFNSW_API_KEY` (same key as public transport) and `ANTHROPIC_API_KEY`; without Claude the agent keeps
the roadworks it has and adds none. If the map has never been updated, it shows the saved OpenStreetMap copy in
`api/data/osm_places_snapshot.json` (dated; "© OpenStreetMap contributors, ODbL"). Refresh that copy with
`cd api && PYTHONPATH=. .venv/Scripts/python scripts/build_osm_snapshot.py`.

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

`api/Dockerfile` builds the API image. Set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `TFNSW_API_KEY`, `ANTHROPIC_API_KEY` and `ADMIN_KEY` as secrets on the host.

- **Run the API as a long-running server with a writable disk** (AWS App Runner, Render, Fly.io, Railway and similar), not as serverless functions: it keeps the local Turso copy and runs the lift checker in the background. The disk doesn't have to survive restarts; the copy is rebuilt from Turso on start.
- **Set `NEXT_PUBLIC_API_URL` to the API's public address before `npm run build`.** Next.js bakes it into the web app at build time (local development uses `http://127.0.0.1:8000`).
- **Run one API instance for now.** Search results are kept in that server's memory until someone opens one (to avoid a Turso write per search), and live updates are sent from that server. A second instance behind a load balancer could answer a search but not the follow-up, and wouldn't share live updates.
- **Known gap:** uploaded photos are saved in `api/uploads/` on the server's disk, so a host that wipes the disk loses them. Move them to object storage (for example S3 or R2) before a real launch.
