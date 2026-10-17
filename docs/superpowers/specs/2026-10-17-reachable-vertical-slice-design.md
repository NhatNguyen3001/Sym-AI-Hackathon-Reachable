# Reachable: Vertical Slice Design

*Date: 2026-10-17. Status: approved in brainstorming, pending written-spec review.*

Source documents: `.claude/docs/reachable-overview.md`, `.claude/docs/reachable-tech-stack.md`, `.claude/docs/reachable-web-ui-spec.md`, mockups in `.claude/design/`. Where this spec is silent, those documents apply. Where the UI spec and the mockups disagree, the UI spec wins.

---

## 1. Goal and scope

Build a locally runnable, end-to-end slice of Reachable for the Sym AI Open 2026 demo trip (Macquarie University Metro station to the Library):

- All six web pages (`/`, `/plan`, `/route`, `/report`, `/live`, `/needs`) to the UI spec, including its accessibility requirements (UI spec §3).
- A FastAPI backend with **real campus routing** (OpenStreetMap footpaths, stairs, slope, kerbs, station exit lifts, barriers, rain).
- Claude for plain-English needs parsing, route explanations and barrier photo labelling, each with a deterministic rule-based fallback.
- The demo moment: a barrier report or a lift outage changes an open route page live.

### Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Scope | Vertical slice: UI + routing + Claude. Full LangGraph agents next cycle. |
| Database | **SQLite locally, Turso (libSQL) when deployed**, via SQLModel/SQLAlchemy; switch with `DATABASE_URL`. Replaces Supabase. |
| Realtime | **Server-Sent Events** from FastAPI (`GET /events`). Replaces Supabase Realtime. |
| Photos | Local `api/uploads/` folder served by FastAPI. S3 later behind the same function. |
| Lift status | Seeded outage rows + demo toggle endpoint. TfNSW GTFS-RT adapter next cycle (no key yet). |
| Report checker | Simple plain-Python checker (no LangGraph, no Tavily). |
| Venue check | Seeded venue data with sources. Venue agent next cycle. |
| Graph source | Real OSMnx graph built once and committed, elevation from Open-Meteo, hand overrides for station exits and demo-critical slopes. |
| Deploy | Out of scope. End state: both apps run locally; a Dockerfile exists for the API. |
| Keys available | `ANTHROPIC_API_KEY` only. |

### Out of scope (this cycle)

LangGraph, LangSmith, Tavily, Playwright scraping, APScheduler, TfNSW and Live Traffic NSW feeds, Turso/Vercel/App Runner deployment, S3, user accounts.

---

## 2. Architecture

```
/                         monorepo
  web/                    Next.js (App Router, TypeScript) + Tailwind v4 + shadcn/ui + react-leaflet
  api/                    FastAPI, Python 3.11, venv + requirements.txt
    app/
      main.py             FastAPI app, CORS, routers, startup (load graph, init DB, seed)
      config.py           settings from env (DATABASE_URL, ANTHROPIC_API_KEY, CORS origins, speed)
      db.py               engine + session
      models.py           SQLModel tables
      seed.py             demo data
      events.py           in-process SSE broadcaster
      weather.py          Open-Meteo client, 10-minute cache, demo rain override
      checker.py          simple Report checker
      llm/                profile parse, route explanation, photo label (+ fallbacks)
      routing/            graph load, cost function, route builder, step grouping, places
      routers/            one module per API area
    data/graph.graphml    prebuilt campus graph (committed)
    data/overrides.json   station exits, lift/stairs edges, measured slopes
    data/places.json      named campus places for autocomplete and from/to
    scripts/build_graph.py
    uploads/              photos (gitignored)
    tests/
    Dockerfile
  docs/superpowers/       specs and plans
```

### Data flow

- **Plan a trip:** browser → `POST /route` → router reads active barriers and current weather → computes accessible and fastest routes on the in-memory graph → Claude writes the explanation (fallback: template) → returns GeoJSON, summary, steps, lift status, explanation.
- **Report a barrier:** browser uploads photo → `POST /reports/label` returns the AI label (Claude vision; fallback: no label, user picks) → user confirms → `POST /reports` saves the report as `pending` → checker runs as a FastAPI background task → may create or confirm a barrier → broadcasts SSE `barrier_changed` → every open `/route` page re-fetches and shows the live barrier card.
- **Demo toggles:** `POST /demo/lifts/{exit_id}` flips a lift outage; `POST /demo/rain` flips rain. Both broadcast SSE events the same way.

### Models

- Profile parsing: `claude-haiku-5-5`.
- Route explanation and photo labelling: `claude-sonnet-5-5`.
- Every call has a timeout (15 s) and a rule-based fallback. Without `ANTHROPIC_API_KEY` the app runs fully on fallbacks.

---

## 3. Backend

### 3.1 Tables (SQLModel)

**`barriers`**: `id` (uuid str), `type` (`stairs|blocked|broken_ramp|slippery|narrow|steep|lift_outage`), `title`, `place`, `lat`, `lng`, `edge_id` (str `"u-v-key"`, set by backend), `exit_id` (nullable, for lift outages), `status` (`confirmed|needs_checking|resolved`), `confidence` (float 0..1), `sources` (JSON list of `{kind, label, url, seen_at}`), `first_seen`, `last_confirmed`, `update_type` (`report|roadworks|transport|weather|venue`, for the feed).

**`reports`**: `id`, `photo_url`, `ai_label`, `user_label`, `note`, `lat`, `lng`, `status` (`pending|confirmed|rejected|needs_checking`), `barrier_id` (nullable), `created_at`. No user ID, by design.

**`venues`**: `id` (slug), `name`, `address`, `lat`, `lng`, `entrance`, `toilet`, `parking`, `step_free_inside` (`yes|no|unknown`), `confidence` (JSON per field: `confirmed|likely|not_sure`), `sources` (JSON list), `checked_at`, `checked_by`.

**`agent_runs`**: `id`, `agent` (`route|venue|updates|report_checker`), `started_at`, `finished_at`, `status` (`running|done|error`), `summary`.

Weather is not stored; it comes from `weather.py`.

The `/updates` feed is built at read time from barriers, venues (by `checked_at`) and the current weather, newest first, filtered by `type` (`report`, `roadworks`, `transport`, `weather`, `venue`; `all` or missing = everything).

### 3.2 Seed data (`seed.py`, idempotent, runs at startup if tables are empty)

Matches UI spec §6, with real campus names:

- Lift outage, Macquarie University station south exit, `confirmed`, source "Transport for NSW lift alert (demo data)".
- "Footpath works, detour in place" roadworks barrier, `confirmed`, source "Live Traffic NSW (demo data)" — placed off the demo route so it shows in the feed without blocking it.
- "Kerb ramp may be damaged", `needs_checking`, one user report.
- "Ramp repaired", near the Library, `resolved`.
- "Entrance details updated" venue feed item.
- Venues: Library (all yes, confirmed), Campus Hub café (entrance confirmed, step-free inside likely, toilet unknown/not found), plus one more real venue. Each with 2–4 sources.
- Agent runs: one recent run per agent so `/agents/status` has content.

All seeded external-feed items carry "(demo data)" in their source label, so the demo is honest about what is simulated.

### 3.3 Graph build (`scripts/build_graph.py`, run once, output committed)

1. `ox.graph_from_bbox` (or `graph_from_point`, 900 m around the station-to-Library midpoint) with `network_type="walk"`, retaining tags `highway`, `surface`, `kerb`, `width`, `incline`, `wheelchair`.
2. Elevation per node from the Open-Meteo elevation API (batched, 100 coordinates per request); `ox.add_edge_grades` → `grade_abs`.
3. Apply `overrides.json`:
   - `slopes`: list of `{u, v, grade_pct, source}` → sets `grade_abs`, marks `slope_measured=true`.
   - `exits`: station exit nodes `{id, name, lat, lng, via: "lift"|"stairs", connect_to_node}`. Each exit gets two edges: exit → platform node (`kind=lift` or `kind=steps`) and exit → nearest street node (`kind=path`).
   - `edges`: manual footpaths or steps if OSM is missing key segments.
4. Keep the graph unprojected (lat/lng); save `data/graph.graphml`.

If OSM data for the demo route is patchy, fix it in `overrides.json`, not in code.

### 3.4 Routing (`routing/`, pure functions, unit-tested)

**Profile** (shared with the frontend, camelCase in JSON):
`{ aid, maxSlope (2..12), avoid: {stairs, kerbsNoRamp, slipperyWhenWet, uneven}, destination: {entrance, toilet, parking}, text }`

**Context**: `{ raining: bool, barriers_by_edge: {edge_id: status}, lift_out_exits: set[exit_id] }`

**Edge cost** (`cost(edge, profile, ctx) -> float`, `inf` = blocked), matching tech-stack §4:

```
cost = length_m
if edge is steps and profile.avoid.stairs:               inf
if edge.kind == lift and edge.exit_id in lift_out_exits: inf
slope = grade_abs * 100
if slope > profile.maxSlope:                              inf
else:                                                     cost *= 1 + (slope / maxSlope) * 2
if raining and profile.avoid.slipperyWhenWet
   and surface in SLIPPERY and slope > 3:                 cost *= 3
if kerb in {raised, yes} and no ramp and avoid.kerbsNoRamp: inf
if avoid.uneven and surface in UNEVEN:                    cost *= 4
barrier status confirmed:                                 inf
barrier status needs_checking:                            cost *= 5
SLIPPERY = {tiles, metal, paving_stones, grass, wood}
UNEVEN   = {gravel, grass, dirt, ground, unpaved, fine_gravel}
```

**Route builder** (`find_routes(from_place, to_place, profile, ctx)`):

- Resolves places to graph nodes. If `from_place` is a station, every exit of that station is a candidate start (multi-source Dijkstra via a virtual source node), so a lift outage at one exit makes the router choose another exit automatically.
- Accessible route: Dijkstra with `cost`. Fastest route: Dijkstra with length only (ignores profile and barriers, but uses all station exits).
- Per route: GeoJSON `LineString` (lng, lat), `distanceM`, `minutes = ceil(distanceM / speed / 60)` with `speed` default 1.0 m/s (config), `maxSlope` (integer %), `stepFree` (bool).
- Steps: consecutive edges grouped by kind (`flat` <2%, `slope` 2–max, `lift`, `steps`, `crossing`), e.g. "Flat footpath, 300 m", "Gentle slope, 4%, 120 m", "Lift at north exit", "Kerb ramp at crossing". Confidence: `Measured` if slope from override; `Not sure` if a needs-checking barrier is on the group, or a crossing's kerb tag is missing; else `Confirmed`.
- Lift status: for a station trip, every exit with a lift: `{exitId, exit, status: "Working"|"Out of service", source, updated}`.
- Barriers on or near (≤25 m) either route are returned for the map markers.
- No accessible route → `{ ok: false, reason, suggestion }`. `suggestion` = "Try a nearby station with working lifts, or an accessible drop-off point."

### 3.5 API

All JSON is camelCase. Errors: `{ "error": { "code", "message" } }` with matching HTTP status.

| Method | Path | Body / params | Returns |
|---|---|---|---|
| GET | `/health` | | `{ ok: true }` |
| GET | `/places` | `?q=` | `[{ id, name, kind (station|venue|place), lat, lng }]`, prefix/substring match, stations first |
| POST | `/profile/parse` | `{ text }` | Profile JSON (Claude; fallback keyword parser) |
| POST | `/route` | `{ from, to, profile }` (place ids) | `{ ok, accessible, fastest, minutesLonger, liftStatus[], steps[], barriers[], explanation, status, weather }` or `{ ok:false, reason, suggestion }` |
| GET | `/venue/{id}/check` | | Venue fields, confidence, sources, checkedAgo |
| POST | `/reports/label` | multipart photo | `{ photoUrl, aiLabel, aiText }` |
| POST | `/reports` | `{ photoUrl, lat, lng, userLabel, note }` | Report with `status: "pending"`; checker runs in background |
| GET | `/updates` | `?type=` | Feed items `{ id, type, title, place, time, source, status, tone }` |
| GET | `/agents/status` | | 4 agent cards `{ name, status, tone, desc }` derived from `agent_runs` |
| POST | `/agents/updates/run` | | Re-reads weather and lift state, logs a run, broadcasts `updates_run` |
| GET | `/weather` | | `{ raining, summary, until, source }` |
| GET | `/stations/{id}/lifts` | | Lift rows as in route `liftStatus` |
| GET | `/events` | | SSE stream: `barrier_changed`, `lift_changed`, `weather_changed`, `report_created`, `agent_run` |
| POST | `/demo/lifts/{exitId}` | | Toggles outage; returns new status |
| POST | `/demo/rain` | | Toggles rain override; returns weather |

`userLabel` / `aiLabel` values: `blocked`, `stairs`, `broken_ramp`, `slippery`, `narrow`, `fine`.

### 3.6 Report checker (`checker.py`)

Runs after `POST /reports`, logs an `agent_runs` row (`report_checker`), then:

| Condition | Result |
|---|---|
| `userLabel == fine` and an active barrier within 30 m | that barrier → `resolved`; report → `confirmed` |
| `userLabel == fine`, nothing nearby | report → `rejected` |
| `aiLabel == userLabel` and (another active barrier/report within 30 m **or** a seeded roadworks notice within 100 m) | create or update barrier → `confirmed`, confidence 0.85; report → `confirmed` |
| otherwise | create barrier → `needs_checking`, confidence 0.4; report → `needs_checking` |

Every barrier change snaps to the nearest graph edge and broadcasts `barrier_changed`. The summary text matches the UI copy, e.g. "Matched to a roadworks notice. Routes updated."

### 3.7 Claude usage (`llm/`)

- `parse_profile(text)`: Haiku, tool-use JSON output into the Profile schema. Fallback: keyword rules (wheelchair/walker/cane/pram/"power", "%"-number for slope, "toilet", "parking", "stairs", "kerb").
- `explain_route(summary)`: Sonnet, ≤ 2 sentences in the UI spec's voice, given minutes, exits used, lifts out, barriers avoided, rain. Fallback: template ("Use the lift at the north exit, as the south exit lift is out of service. 4 min longer than the fastest route, but it avoids …").
- `label_photo(image_bytes)`: Sonnet vision, returns one of the label values + a one-line description. Fallback: `aiLabel=null`, user picks.

---

## 4. Frontend

- File structure per UI spec §7. Tokens (UI spec §1) as Tailwind v4 `@theme` colours in `app/globals.css`; Atkinson Hyperlegible via `next/font/google`; `<html lang="en-AU">`.
- Interactive widgets from shadcn/ui: Button, Input, Textarea, Checkbox, Slider, Dialog, Badge, Label. Chips are `<button aria-pressed>` in `FilterChips`.
- `lib/api.ts`: the only fetch layer, base `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`). Read calls fall back to `lib/placeholder.ts` (UI spec §6 data, real names) if the API is unreachable, and return `{ data, sample: true }` so pages show an `InfoBanner` "Showing sample data. We can't reach the server right now." Write calls throw a typed error that pages show in a `role="alert"` banner.
- `lib/profile.ts`: localStorage profile (default = placeholder profile) and recent trips (max 3), both wrapped in try/catch.
- `lib/events.ts`: `useEvents(handler)` hook over `EventSource(`${API}/events`)`, auto-reconnect.
- `/plan` navigates to `/route?from=<id>&to=<id>`; `/route` reads the query, calls `POST /route`, and re-fetches on `barrier_changed`, `lift_changed` and `weather_changed`. A changed route shows the live barrier card (bottom-left of map) announced via `aria-live="polite"`.
- `MapView` (client-only, `dynamic(..., { ssr: false })`): OSM tiles, accessible route solid `primary` weight 8, fastest dashed `fastest` weight 6, start white circle blue ring, end solid blue circle, barrier orange rounded-square `divIcon` with white Lucide icon, legend card top-left, 48 px zoom buttons bottom-right with `aria-label`, container `role="region" aria-label="Route map"`. No animated drawing when `prefers-reduced-motion`.
- "Send to my phone": Dialog with a QR code (`qrcode.react`) of the current URL and a "Copy link" button.
- "How we know": Dialog listing venue sources.
- Each page sets a unique `<title>` via `metadata`.
- `/live`: `FilterChips` filter `GET /updates?type=`; new SSE events prepend items, announced politely.
- `/needs`: parse → fill form; aid chips set defaults (manual wheelchair 5 %, power wheelchair 8 %, walker 6 %, cane 8 %, pram 8 %; stairs avoided for all wheeled aids); save → `/plan`.
- `/report`: upload (`accept="image/*" capture="environment"`) → preview → "Checking your photo…" → AI result → chips preselected → location (device geolocation; "Change location" opens a small map to drop a pin; default Library forecourt if denied) → "Send report" → `role="status"` success with link to `/live`.

---

## 5. Error handling

- API: typed error JSON; unhandled exceptions → 500 with a generic message, logged.
- Claude calls: 15 s timeout, any exception → fallback, noted in the agent run summary.
- Uploads: images only (`image/*`), max 10 MB, re-encoded to JPEG with Pillow (strips EXIF location metadata).
- Unknown place ids → 404 `place_not_found`. No route → 200 `{ ok:false }` (a normal answer, not an error).
- Frontend: sample-data banner for reads, alert banner for failed writes, SSE reconnects silently.

---

## 6. Testing and definition of done

**API (pytest, TDD):**
- Cost function: one test per rule.
- Routing on a small fixture graph (built in the test): avoids stairs; respects max slope; lift outage switches station exit; confirmed barrier blocks, needs-checking only penalises; rain penalty; no-route result; step grouping and confidence.
- Checker decision table, one test per row.
- Fallback profile parser and explanation template.
- Endpoint tests with `TestClient` on the real committed graph and a temp SQLite DB, Claude mocked: `/route` demo trip returns a step-free route via the north exit (south lift seeded as out); toggling the north exit outage too returns `ok:false` with a suggestion; restoring the south lift makes the router use whichever exit is cheaper; `/reports` flow creates a barrier and emits an event.

**Web:**
- Vitest: `profile.ts`, `api.ts` fallback behaviour.
- Playwright + `@axe-core/playwright`: every page at 1440 px and 390 px, zero axe violations, no horizontal scroll (`scrollWidth <= clientWidth`).
- One end-to-end test against the running API: open `/route` for the demo trip, `POST /demo/lifts/<exit>`, assert the summary/lift row updates without reload.

**Done when:** both test suites pass, there are no axe violations, and the demo trip works end to end locally with `npm run dev` + `uvicorn`.
