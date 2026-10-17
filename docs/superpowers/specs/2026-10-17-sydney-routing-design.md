# Reachable: Sydney-wide Routing and Place Search (Cycle 2) Design

*Date: 2026-10-17. Status: approved in brainstorming, pending written-spec review.*

Builds on `docs/superpowers/specs/2026-10-17-reachable-vertical-slice-design.md` (cycle 1). Everything not changed here stays as cycle 1 built it.

---

## 1. Goal and scope

Make Reachable plan accessible walk/roll routes and search places **anywhere in Greater Sydney**, not just the Macquarie University campus.

The user's goal is a real product with full door-to-door trips including transit. That is split into four sub-projects:

| # | Sub-project | Cycle |
|---|---|---|
| **A** | Sydney-wide walk/roll routing | **this cycle** |
| **B** | Sydney place search | **this cycle** |
| C | Every station's exits, lifts and live lift outages (TfNSW key) | later |
| D | Transit legs via TfNSW Trip Planner, joined to accessible first/last legs (TfNSW key) | later |

### Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Routing engine | **Valhalla**, self-hosted in Docker (`ghcr.io/valhalla/valhalla-scripted`, port 8002), with elevation |
| Hard max slope | Kept: route → per-edge grade check (`trace_attributes`) → exclude too-steep edges → reroute |
| Coverage | **Greater Sydney**: Geofabrik Australia extract clipped to 149.97–151.63 E, −34.33 to −32.99 |
| Place search | **Photon** (public `photon.komoot.io` now, self-hosted later), behind the existing `/places` endpoint |
| Runtime | Docker Desktop locally, via `docker-compose.yml`. Cloud hosting is the deploy cycle. |
| Fallback | Cycle 1 campus NetworkX router stays as the offline fallback and the deterministic test router |

### Out of scope (this cycle)

Transit legs (D); exits/lifts for stations other than OSM entrance points (C); live lift outages for other stations (C); TfNSW keys; venue checks for arbitrary places (Venue agent cycle); self-hosting Photon; cloud deployment; Sydney-wide seeded barriers.

---

## 2. Architecture

```
web (Next.js) ──> api (FastAPI) ──┬──> valhalla (Docker :8002)   Greater Sydney tiles + elevation
                                  ├──> photon   (https://photon.komoot.io; configurable)
                                  └──> SQLite/Turso              (barriers, reports, venues, agent_runs, places_cache)
```

### New and changed files

```
docker-compose.yml                 valhalla service, ./valhalla/custom_files mounted, build_elevation=True
valhalla/custom_files/             greater-sydney.osm.pbf + built tiles (gitignored)
api/scripts/build_sydney_extract.py  download Australia pbf once, clip with osmium (run via Docker), write the pbf
api/app/routing/router.py          Router protocol + get_router(settings) choosing valhalla | campus
api/app/routing/campus.py          adapter wrapping the cycle 1 find_routes (unchanged behaviour)
api/app/routing/valhalla.py        ValhallaClient (HTTP) + ValhallaRouter (algorithm in §3)
api/app/routing/geo.py             polygons around points/segments, polyline6 decode, bbox checks
api/app/places/photon.py           PhotonClient
api/app/places/resolver.py         PlaceResolver: known places + Photon + places_cache + coord: ids
api/app/models.py                  + PlaceCache table
api/app/weather.py                 weather keyed by location (rounded to 0.1°)
api/app/routers/route.py, places.py  use Router / PlaceResolver
web/lib/api.ts                     route fallback only for the sample trip; debounce-friendly search
web/components/PlaceInput.tsx      250 ms debounce, 2-char minimum, "Search is limited right now"
web/app/plan/PlanClient.tsx        "Use my location" for From
```

### Settings (env)

| Setting | Default | Meaning |
|---|---|---|
| `ROUTER` | `valhalla` | `valhalla` or `campus` |
| `VALHALLA_URL` | `http://localhost:8002` | |
| `PHOTON_URL` | `https://photon.komoot.io` | empty string disables Photon |
| `COVERAGE_BBOX` | `149.97,-34.33,151.63,-32.99` | west,south,east,north |
| `MAX_LEG_KM` | `10` | longest single walk/roll |

The Photon client sends a descriptive `User-Agent` (`Reachable/0.2 (hackathon demo)`) per Photon's fair-use policy.

---

## 3. ValhallaRouter algorithm

Input: start and end `Place` (each with lat/lng, kind, optional exits), `Profile`, `Context` (raining, active barriers with lat/lng and status, out-of-service exit ids).

1. **Coverage check.** Both points inside `COVERAGE_BBOX`, else raise `OutOfArea`. Straight-line distance > `MAX_LEG_KM` → `{ok:false, reason:"This trip is too long to walk or roll. Transit routing is coming soon.", suggestion}`.
2. **Start/end candidates.** For a station place: one candidate per exit whose lift is not out of service. Exits come from the place's known exits (Macquarie University: `overrides.json`), else from OSM `railway=subway_entrance|train_station_entrance` nodes within 300 m, fetched once with one Overpass API query and stored in `places_cache.exits` (Overpass failure → no exits, not an error). No exits known → the station's own point. All exits out → `{ok:false}` with the cycle 1 reason/suggestion. Until sub-project C, only Macquarie University has lift data: OSM-derived exits are all treated as usable, and no "Lift at …" step is added for them (we don't know whether they have a lift).
3. **Accessible route** for each start×end candidate pair (at most 3×3), Valhalla `/route`:
   - `costing: "pedestrian"`, `costing_options.pedestrian`: `type: "wheelchair"` if `avoid.stairs` else `foot`; `step_penalty: 3600` if `avoid.stairs`; `use_hills: 0.0` if raining and `avoid.slipperyWhenWet`, else `0.1`; `max_distance: MAX_LEG_KM*1000`.
   - `exclude_polygons`: a 6 m square around every **confirmed** barrier (excluding `lift_outage`).
   - Keep the pair with the lowest `summary.time`.
4. **Hard slope check.** `trace_attributes` (`shape_match: "edge_walk"`, the route's shape) with `filters` for `edge.length, edge.use, edge.surface, edge.max_upward_grade, edge.max_downward_grade, edge.begin_shape_index, edge.end_shape_index, edge.names`. Any edge with `max(|up|,|down|) > profile.maxSlope` → add a polygon around that edge's segment to the exclusions and reroute. Up to 4 rounds; still too steep → `{ok:false, reason:"No step-free route within your slope limit.", suggestion}`.
5. **Needs-checking barriers.** If the route passes within 15 m of a `needs_checking` barrier, reroute with that barrier excluded too. Keep the detour if its time ≤ 1.5× the original; otherwise keep the original and mark the step that passes it "Not sure".
6. **Fastest route.** `/route` with `type: "foot"`, default options, no exclusions, from the station's own point (or first candidate).
7. **Response** in the cycle 1 shape: `accessible`/`fastest` (`geometry` LineString lng/lat from polyline6, `distanceM`, `minutes` from `summary.time` scaled to `speed_mps`, `maxSlope`, `stepFree`), `minutesLonger`, `exitUsed`, `steps`.
   - Step grouping reuses the cycle 1 rules (merge consecutive same kind, absorb <10 m runs). Kinds from `edge.use`: `steps` → steps, `elevator` → lift, `pedestrian_crossing` → crossing, else flat/slope by grade.
   - Confidence: slope groups → **Measured** (elevation data); crossings → **Likely**; groups within 15 m of a needs-checking barrier → **Not sure**; else **Confirmed**.
   - Station start/end through a known lift exit (`via: "lift"` in `overrides.json`): prepend/append "Lift at <exit name>" (Confirmed).
8. **Errors.** Valhalla HTTP error 442/171 ("no path") → `{ok:false}`. Connection/timeout → `RoutingUnavailable`.

Router selection in `/route`: `ROUTER=campus` → campus router. `ROUTER=valhalla` → Valhalla; on `RoutingUnavailable`, if both places are inside the campus graph's bounds, use the campus router and add `"note": "Using the offline campus map"`; otherwise HTTP 503.

---

## 4. Place search and resolution

### `/places?q=`

1. Known places (cycle 1 `places.json`) matching `q` (accent-insensitive).
2. If `len(q) >= 2` and Photon enabled: `GET {PHOTON_URL}/api?q=&limit=8&lang=en&bbox=<COVERAGE_BBOX>` (3 s timeout). Map each feature to `Place(id="osm:<N|W|R><osm_id>", name=<name, or housenumber+street>, kind="station" if osm_key in {railway, public_transport} and value in {station, stop, halt, platform, stop_position} else "venue" if name else "place", lat, lng, label=<name, suburb>)`. Upsert each into `places_cache`.
3. Merge, de-duplicate by id, stations first, then known places, then Photon order. At most 8.
4. Photon failure → known places only, response header `X-Search-Limited: 1` and the web shows "Search is limited right now."

`Place` gains an optional `detail` field (suburb/city) for the second line in suggestions.

### Resolving ids in `/route` and `/venue`

- Known id → known place.
- `osm:…` → `places_cache` row; missing → 404 `place_not_found`.
- `coord:<lat>,<lng>` → a `place` named "Your location" (or "Pinned location"), validated numbers.

### `places_cache` table

`id` (pk), `name`, `kind`, `lat`, `lng`, `detail`, `exits` (JSON, nullable), `seen_at`.

---

## 5. Other changes

- **Weather** `current(lat, lng)`: cache per (lat, lng rounded to 0.1°). `/route` uses the start point; `/weather` and `/updates` keep the campus point.
- **Venue check** for places without a `venues` row stays "Not checked yet" (cycle 1 behaviour).
- **Web**
  - `getRoute` falls back to the sample route only when `from=mq-station&to=library`; any other failure throws `ApiError` and the route page shows the alert (503 text from the API).
  - `PlaceInput`: 250 ms debounce, no request under 2 characters, second line shows `detail`, shows "Search is limited right now." when the API says so.
  - `/plan`: "Use my location" button next to From → `coord:` id (geolocation; on denial a `role="alert"` message).
  - `/route` shows the `note` (offline campus map) in an `InfoBanner`.
- **Docker**: `docker-compose.yml` with the `valhalla` service (`tile_urls` unset, `use_tiles_ignore_pbf=True`, `build_elevation=True`, `build_admins=False`, `build_time_zones=False`, `server_threads=4`), volume `./valhalla/custom_files:/custom_files`, port `8002:8002`.
- **Extract script** `api/scripts/build_sydney_extract.py`: download `australia-latest.osm.pbf` to `valhalla/custom_files/source/` (skip if present), run `docker run --rm -v <dir>:/data <osmium image> osmium extract -b <bbox> ... -o greater-sydney.osm.pbf --overwrite`, print size. README documents: run the script, `docker compose up valhalla` (first build takes a while), check `curl localhost:8002/status`.

---

## 6. Error handling summary

| Situation | Response |
|---|---|
| Valhalla unreachable, both places on campus | campus router + `note: "Using the offline campus map"` |
| Valhalla unreachable, otherwise | 503 `routing_unavailable`: "Route planning is unavailable right now. Please try again soon." |
| Place outside Greater Sydney | 422 `out_of_area`: "We only cover Greater Sydney for now." |
| Leg longer than 10 km | 200 `ok:false`, "This trip is too long to walk or roll. Transit routing is coming soon." |
| No path / slope limit not met after 4 rounds | 200 `ok:false` with reason and the nearby-station suggestion |
| Photon down | known places only + "Search is limited right now." |
| Unknown or expired place id | 404 `place_not_found` |

---

## 7. Testing and definition of done

**API unit tests (always run, no network):**
- `ValhallaRouter` with a fake `ValhallaClient` replaying JSON fixtures recorded once from the local container (`api/tests/fixtures/valhalla/*.json`, recorded by `api/scripts/record_valhalla_fixtures.py`): exit choice with an outage; slope check excludes a steep edge and reroutes; gives up after 4 rounds; confirmed barrier becomes an exclusion polygon; needs-checking detour kept at ≤1.5× and refused above; 10 km cap; out-of-area; mapping to geometry, steps and confidence; no-path error → `ok:false`; connection error → `RoutingUnavailable`.
- `geo` helpers: polyline6 decode, square/segment polygons, bbox.
- `PhotonClient` + `PlaceResolver` with a fake HTTP client: mapping, station ranking, cache upsert, `coord:` ids, Photon failure → limited flag.
- `/route` router selection: campus fallback with note; 503 when off-campus; 422 out of area.
- All cycle 1 tests keep passing (`ROUTER=campus` in the test settings).

**Live tests (`@pytest.mark.valhalla`, skipped unless `VALHALLA_URL/status` answers):** Town Hall station → State Library of NSW; Parramatta station → Westfield Parramatta; Macquarie University station → Waranara Library (south lift out → north exit). Each returns `ok:true`, step-free, max slope ≤ profile limit.

**Web:** vitest for the sample-route rule and search behaviour; Playwright suite stays green with `ROUTER=campus`, Photon disabled; one Playwright test skipped unless Valhalla is up: search "Town Hall", pick it, route to "State Library", see a route summary.

**Done when:** all always-on suites pass; with Docker up, the live tests and the Docker-only Playwright test pass; and a manual trip (Central station → Sydney Town Hall) works on the real map.
