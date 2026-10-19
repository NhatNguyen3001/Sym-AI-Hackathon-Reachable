<div align="center">
  <img src="web/public/brand/reachable-mark.png" width="140" alt="Reachable" />

  <h1>Reachable: from the stop to the door</h1>

  <p><i>A step-free trip planner for Greater Sydney. It plans the whole trip, including the walk or roll at each end, checks the station lifts are working, and tells you how hard each part is for <b>you</b>.</i></p>

  <p>
    <img src="https://img.shields.io/badge/Sym%20AI%20Open%202026-Macquarie%20University-A6192E" alt="Sym AI Open 2026">
    <a href="https://reachable-five.vercel.app"><img src="https://img.shields.io/badge/showcase-Vercel-000000" alt="Showcase"></a>
    <img src="https://img.shields.io/badge/python-3.11-blue" alt="Python">
    <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js 16">
    <img src="https://img.shields.io/badge/Claude-Sonnet%205.5-1E1E5D" alt="Claude Sonnet 5.5">
  </p>

  <p><b>Try it:</b> <a href="https://reachable-five.vercel.app">reachable-five.vercel.app</a> (five real trips recorded with the live app)</p>
</div>

---

## Why

Transport apps get you to the station. But every trip starts and ends with a short walk or roll, and that's where
trips fall apart: a lift that's out, stairs at the exit, a kerb with no ramp, a hill that's too steep. Reachable
plans that part too.

<p align="center">
  <img src="assets/screen-map.png" width="240" alt="Map with accessible places and roadworks across Sydney" />
  &nbsp;&nbsp;
  <img src="assets/screen-route.png" width="240" alt="A route: 10 min, no steps, a bit tiring in places" />
</p>

## What it does

- **Step-free routes across Greater Sydney**, joined to wheelchair-accessible public transport.
- **Live station lifts** from Transport for NSW. If a lift is out, the route uses another exit and says why.
- **Plain words, judged against you.** Not "4% grade" but "Easy slope", "A bit tiring" or "Hard, you may want help", based on how steep you can go.
- **Honest about what it knows.** Every detail says "Checked today", "Probably OK" or "We don't know", and where it came from.
- **A map of Sydney** with about 5,500 accessible toilets, parking spots, entrances and venues, plus roadworks that **Claude** has read and judged for people on foot or in a wheelchair.
- **Step-by-step guidance**, spoken aloud, plus barrier reports and live updates when lifts, barriers or weather change.

![Desktop: a route with station lifts and step-by-step trust labels](assets/desktop-route.png)

## How it works

![Architecture](assets/architecture.png)

- **Web app** (`web/`, Next.js): the map, route, guidance, live updates and report pages.
- **API** (`api/`, FastAPI): plans routes and checks lifts, barriers and weather.
  - Routes come from **Valhalla** for Sydney, plus a hand-measured campus map where slopes are exact.
  - Public transport and lift alerts come from **Transport for NSW**.
  - Data is stored in **Turso**.
- **Map agent**: when the owner runs it, it gathers places from OpenStreetMap and has Claude sort Live Traffic NSW roadworks into "blocks the path", "may affect" or "cars only".

Interactive diagrams: [architecture](assets/diagrams/architecture.html) · [one trip, step by step](assets/diagrams/workflow.html).

## Run it yourself

You need [Python 3.11+](https://www.python.org/downloads/) and [Node.js 20+](https://nodejs.org/). This runs the
Macquarie University campus with no Docker and no keys.

```bash
git clone https://github.com/NhatNguyen3001/Sym-AI-Hackathon-Reachable.git
cd Sym-AI-Hackathon-Reachable

# 1. API (first terminal)
cd api
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # macOS/Linux: .venv/bin/python
cp .env.example .env                                          # then set ROUTER=campus and PHOTON_URL= (empty)
.venv/Scripts/python -m uvicorn app.main:app --port 8000

# 2. Web (second terminal)
cd web
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000, or go straight to a trip:
http://localhost:3000/route?from=mq-station&to=library

**Want more?** Add these to `api/.env`:

| To get | Set |
|---|---|
| Routes anywhere in Sydney | `ROUTER=valhalla`, then run `api/scripts/build_sydney_extract.py` and `docker compose up -d valhalla` (needs Docker; first build takes about 10 minutes) |
| Public transport and live lifts | `TFNSW_API_KEY` (free from [opendata.transport.nsw.gov.au](https://opendata.transport.nsw.gov.au)) |
| Claude-checked roadworks | `ANTHROPIC_API_KEY` and an `ADMIN_KEY` of your own; then press **Update map now** on Live updates |
| A shared database | `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (otherwise a local SQLite file) |

**Tests:** `cd api && .venv/Scripts/python -m pytest` and `cd web && npm test && npm run e2e`.
Tests never call the real services.

## The public showcase

Keeping the routing engine online costs about US$85 a month, so
[reachable-five.vercel.app](https://reachable-five.vercel.app) is a **free recorded showcase**. It plays back five
real trips saved from the live app and makes no server calls. It never asks for your location, and shows times in
Sydney's time zone (AEDT/AEST).

- **Build it:** set `NEXT_PUBLIC_SHOWCASE=1` when building `web/`.
- **Re-record:** with the full stack running, run `api/scripts/record_showcase.py`.
- **Run it live for an event:** `deploy/` starts the full backend on AWS on demand, about US$0.12 an hour, with an auto-stop after 9 hours. See [`deploy/README.md`](deploy/README.md).

## Limitations

- **The public link is a recording.** To plan your own trips, run it yourself (above).
- **Slopes are only measured on campus.** Elsewhere they're estimates, and the app says so.
- **Kerb ramps are often unknown.** Open map data rarely has them, so the app says "We don't know".
- **Venue details are community data** from OpenStreetMap, so they show as "Probably OK", not checked.
- **Sydney only**, and not yet tested with the people it's for. That's the next step we'd most like to take.
- **Photo reports are switched off** for now.

## Built with

FastAPI · Next.js · Valhalla · Transport for NSW Open Data · OpenStreetMap · Claude (Anthropic) · Turso · Photon ·
Open-Meteo · Leaflet · Vercel · AWS

Map data © OpenStreetMap contributors (ODbL). Built for the Sym AI Open 2026 at Macquarie University. AI coding
assistants (Claude Code) were used under team review.
