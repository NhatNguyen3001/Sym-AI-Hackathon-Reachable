# Sydney-wide Routing and Place Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route accessible walk/roll trips and search places anywhere in Greater Sydney, using self-hosted Valhalla and Photon, without changing the API's response shapes.

**Architecture:** A `Router` protocol with two implementations (`CampusRouter` wrapping cycle 1's NetworkX `find_routes`, and `ValhallaRouter`). A `PlaceResolver` replaces direct use of `Places`, merging known places, Photon results, a `places_cache` table and `coord:` ids. Valhalla runs from `docker-compose.yml` on a Greater Sydney extract.

**Tech Stack:** Valhalla (`ghcr.io/valhalla/valhalla-scripted`), osmium-tool (Docker), Photon public API, Overpass API, httpx, FastAPI/SQLModel (existing), Next.js (existing).

**Spec:** `docs/superpowers/specs/2026-10-17-sydney-routing-design.md`

## Global Constraints

- API response shapes from cycle 1 stay compatible; new fields only added (`note`, `detail`).
- Coverage bbox `149.97,-34.33,151.63,-32.99` (W,S,E,N); `MAX_LEG_KM=10`.
- Valhalla pedestrian options: `type` wheelchair when avoiding stairs else foot; `step_penalty 3600` when avoiding stairs; `use_hills 0.0` when raining+avoid slippery, else `0.1`.
- Slope check up to 4 reroute rounds; needs-checking detour kept if time ≤ 1.5×; barrier near-route distance 15 m; exclusion square 6 m.
- Error codes/messages exactly as spec §6.
- All cycle 1 tests keep passing with `ROUTER=campus` in test settings. Unit tests never touch the network.
- Photon requests send `User-Agent: Reachable/0.2 (hackathon demo)`.

## Review Focus

1. **Valhalla up but slow/hung** (first-build warming, overloaded) → client timeout 10 s → `RoutingUnavailable` → 503 or campus fallback; never a hung request. Test in Task 3 (`test_timeout_is_unavailable`).
2. **Photon returns features with no name** (addresses, unnamed POIs) → named from housenumber+street or skipped; never a blank suggestion. Test in Task 6 (`test_unnamed_feature_uses_address`).
3. **Shared link with an `osm:` id after the cache was cleared** → 404 `place_not_found`, page shows the readable alert. Test in Task 6 (`test_unknown_osm_id_404`).
4. **Start and end the same place / identical coordinates** → `ok:true` zero-length route or a clear `ok:false`, never a 500. Test in Task 4 (`test_same_start_and_end`).
5. **Malformed `coord:` ids** (`coord:abc`, out of range) → 404/422, not 500. Test in Task 6 (`test_bad_coord_id`).

---

## File map

```
docker-compose.yml
valhalla/.gitignore                       (ignore everything except .gitignore)
api/scripts/build_sydney_extract.py
api/scripts/record_valhalla_fixtures.py
api/app/config.py                         + router, valhalla_url, photon_url, coverage_bbox, max_leg_km, overpass_url
api/app/routing/geo.py                    decode_polyline6, square_around, segment_polygon, in_bbox, point_line_distance_m
api/app/routing/valhalla.py               ValhallaClient, ValhallaRouter, RoutingUnavailable, OutOfArea
api/app/routing/router.py                 Router protocol, CampusRouter, get_router
api/app/routing/cost.py                   Context + barrier_points
api/app/state.py                          build_context fills barrier_points
api/app/places/__init__.py, photon.py, resolver.py, overpass.py
api/app/models.py                         + PlaceCache
api/app/weather.py                        current(lat=None, lng=None)
api/app/routers/route.py, places.py, venue.py, stations.py, demo.py   use resolver/router
api/tests/fixtures/valhalla/*.json
api/tests/test_geo.py, test_valhalla_router.py, test_router_select.py, test_places_resolver.py, test_valhalla_live.py
web/lib/api.ts, web/components/PlaceInput.tsx, web/app/plan/PlanClient.tsx, web/app/route/RouteClient.tsx, web/lib/types.ts
web/tests/unit/api.test.ts, web/tests/e2e/sydney.spec.ts
README.md
```

---

### Task 1: Greater Sydney extract and Valhalla container

**Files:** Create `docker-compose.yml`, `valhalla/.gitignore`, `api/scripts/build_sydney_extract.py`.

- [ ] **Step 1:** `docker-compose.yml`:
```yaml
services:
  valhalla:
    image: ghcr.io/valhalla/valhalla-scripted:latest
    ports: ["8002:8002"]
    volumes: ["./valhalla/custom_files:/custom_files"]
    environment:
      use_tiles_ignore_pbf: "True"
      build_elevation: "True"
      build_admins: "False"
      build_time_zones: "False"
      server_threads: "4"
    restart: unless-stopped
```
`valhalla/.gitignore`: `*` and `!.gitignore`.
- [ ] **Step 2:** `build_sydney_extract.py`: stream-download `https://download.geofabrik.de/australia-oceania/australia-latest.osm.pbf` to `valhalla/custom_files/source/australia-latest.osm.pbf` if missing (progress every 50 MB); then `docker run --rm -v <custom_files>:/data stefda/osmium-tool osmium extract -b 149.97,-34.33,151.63,-32.99 /data/source/australia-latest.osm.pbf -o /data/greater-sydney.osm.pbf --overwrite`; move the source out of `custom_files` root scanning (keep in `source/`, which Valhalla ignores since it only reads `*.pbf` at the root). Print the output size.
- [ ] **Step 3:** Run it. Expected: `greater-sydney.osm.pbf` a few hundred MB. Then `docker compose up -d valhalla`; poll `curl -s localhost:8002/status` until it returns JSON (tile + elevation build may take 30+ min; run as background with a Monitor).
- [ ] **Step 4:** Smoke: `POST localhost:8002/route` Town Hall station (-33.8732,151.2066) → State Library (-33.8661,151.2129) with `costing: pedestrian, type: wheelchair` returns a trip. `trace_attributes` on its shape returns edges with `max_upward_grade`.
- [ ] **Step 5:** Commit `chore: Greater Sydney extract script and Valhalla compose service`.

### Task 2: Geo helpers

**Files:** `api/app/routing/geo.py`, `api/tests/test_geo.py`.

**Produces:** `decode_polyline6(s) -> list[tuple[lat,lng]]`; `square_around(lat,lng,half_m=3) -> list[[lng,lat]]` (closed ring, 5 points); `segment_polygon(a,b,half_width_m=3) -> ring`; `in_bbox(lat,lng,bbox) -> bool`; `parse_bbox("w,s,e,n") -> tuple`; `point_line_distance_m(lat,lng,coords_latlng) -> float`.

- [ ] **Step 1: Failing tests**
```python
from app.routing.geo import decode_polyline6, square_around, segment_polygon, in_bbox, parse_bbox, point_line_distance_m

def test_decode_polyline6_known_value():
    # encoded with precision 6 for [(38.5,-120.2),(40.7,-120.95),(43.252,-126.453)]
    assert decode_polyline6("_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI") == [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]

def test_square_is_closed_ring_about_6m():
    ring = square_around(-33.87, 151.21, half_m=3)
    assert len(ring) == 5 and ring[0] == ring[-1]
    from app.routing.graph import dist_m
    (lng0, lat0), (lng2, lat2) = ring[0], ring[2]
    assert 7 < dist_m(lat0, lng0, lat2, lng2) < 10  # diagonal of a 6 m square ≈ 8.5 m

def test_segment_polygon_closed_and_covers_endpoints():
    ring = segment_polygon((-33.87, 151.21), (-33.871, 151.211))
    assert ring[0] == ring[-1] and len(ring) == 5

def test_bbox():
    b = parse_bbox("149.97,-34.33,151.63,-32.99")
    assert in_bbox(-33.87, 151.21, b) and not in_bbox(-37.81, 144.96, b)

def test_point_line_distance():
    line = [(-33.87, 151.20), (-33.87, 151.22)]
    assert point_line_distance_m(-33.87, 151.21, line) < 1
    assert 100 < point_line_distance_m(-33.869, 151.21, line) < 120
```
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (equirectangular local projection, same constants as `graph.dist_m`). **Step 4:** PASS. **Step 5:** commit `feat(api): geo helpers for Valhalla routing`.

### Task 3: Valhalla client and router algorithm

**Files:** `api/app/routing/valhalla.py`, `api/app/routing/cost.py` (Context gains `barrier_points: list[tuple[float,float,str]]`), `api/scripts/record_valhalla_fixtures.py`, `api/tests/fixtures/valhalla/*.json`, `api/tests/test_valhalla_router.py`.

**Produces:**
- `class RoutingUnavailable(Exception)`, `class OutOfArea(Exception)`.
- `ValhallaClient(base_url, http=httpx.Client(timeout=10))` with `.route(body) -> dict` and `.trace(body) -> dict`; HTTP 400 with Valhalla error codes 442/171/170 → `NoPath`; connect/timeout/5xx → `RoutingUnavailable`.
- `ValhallaRouter(client, bbox, max_leg_km, speed_mps, exit_names)` with `.plan(start: Place, end: Place, profile, ctx) -> dict` (cycle 1 route dict shape incl. `ok`, `accessible`, `fastest`, `minutesLonger`, `steps`, `exitUsed`; or `ok:false` with `reason`, `suggestion`).
- `Place.exit_points: list[dict]` (`{id, name, lat, lng, via}`), set by the resolver (Task 6); MQ station gets its overrides exits with coordinates.

- [ ] **Step 1: Recording script** `record_valhalla_fixtures.py`: posts the three spec trips (accessible + fastest + trace) to the live container and saves each response to `tests/fixtures/valhalla/<name>.json`. Run it (needs Task 1).
- [ ] **Step 2: Failing tests** with a `FakeClient` whose `route(body)` returns scripted responses (built from a helper `fake_trip(points, time_s, length_km)` that encodes polyline6) and whose `trace(body)` returns scripted edges; plus one parsing test on a recorded fixture:
  - `test_out_of_area_raises`
  - `test_too_long_leg_is_ok_false`
  - `test_picks_fastest_working_exit` (two exits, north 300 s, south 200 s, south out → north)
  - `test_all_exits_out_ok_false`
  - `test_confirmed_barrier_sent_as_exclusion` (body `exclude_polygons` has a 5-point ring near the barrier)
  - `test_steep_edge_triggers_reroute_with_exclusion` (first trace has 8% edge with limit 5; second request includes its segment polygon; second trace OK → ok:true)
  - `test_gives_up_after_four_rounds`
  - `test_needs_checking_detour_kept_within_1_5x` / `test_needs_checking_detour_refused_above_1_5x_marks_not_sure`
  - `test_wheelchair_options` (type wheelchair, step_penalty 3600, use_hills 0.1; raining → 0.0)
  - `test_no_path_is_ok_false`
  - `test_timeout_is_unavailable` (client raises httpx.TimeoutException → RoutingUnavailable)
  - `test_steps_and_confidence_mapping` (edge uses: steps/pedestrian_crossing/footway; grades → "Gentle slope, up to N%" Measured; crossing Likely; near needs-checking Not sure)
  - `test_recorded_town_hall_fixture_maps_to_route_shape` (accessible.geometry LineString with ≥ 2 coords, distanceM > 0, stepFree bool)
- [ ] **Step 3:** run → FAIL. **Step 4:** implement per spec §3. Step grouping: reuse `steps.group_steps` logic by mapping each trace edge to a dict `{length (m), grade_abs, kind, ...}` and calling a shared `group_edge_dicts(edges, unsure_flags, measured=True)` extracted from `group_steps` (refactor `group_steps` to call it; cycle 1 tests stay green). **Step 5:** PASS (full suite). **Step 6:** commit `feat(api): Valhalla router with hard slope check and barrier exclusions`.

### Task 4: Router selection and /route integration

**Files:** `api/app/routing/router.py`, `api/app/config.py`, `api/app/state.py`, `api/app/routers/route.py`, `api/app/main.py`, `api/tests/conftest.py` (`router="campus"`), `api/tests/test_router_select.py`.

**Produces:** `Router` protocol `.plan(start, end, profile, ctx) -> dict`; `CampusRouter(G, speed, exit_names, campus_bbox)` with `.covers(place) -> bool`; `get_router(settings, G, places) -> Router`. `/route` adds `note` when the campus fallback is used; maps `OutOfArea` → 422 `out_of_area`, `RoutingUnavailable` (no fallback) → 503 `routing_unavailable`.

- [ ] **Step 1: Failing tests** (`create_app(settings, router=FakeRouter)` injection):
  - `test_valhalla_down_on_campus_falls_back_with_note`
  - `test_valhalla_down_off_campus_503` (coord: place in the CBD)
  - `test_out_of_area_422` (coord: Melbourne)
  - `test_same_start_and_end` (campus router, from=to=library → 200, `ok` True with 0–1 min or ok False with reason; no 500)
  - existing `test_api.py` still green.
- [ ] **Step 2–4:** implement; `build_context` also fills `barrier_points` from active non-lift barriers. **Step 5:** commit `feat(api): router selection with campus fallback`.

### Task 5: Weather by location

**Files:** `api/app/weather.py`, `api/tests/test_weather.py`, `api/app/routers/route.py`.

- [ ] Failing test `test_weather_cached_per_rounded_location` (two calls at -33.87/151.21 and -33.871/151.209 → one HTTP call; -33.77/151.11 → second call; request params carry the rounded coords). Implement `current(lat=None, lng=None)`; `/route` passes the start point. Commit `feat(api): weather near the trip start`.

### Task 6: Photon search, places cache, coord ids, station exits

**Files:** `api/app/places/{__init__,photon,overpass,resolver}.py`, `api/app/models.py` (PlaceCache), `api/app/routers/places.py`, `route.py`, `venue.py`, `stations.py`, `demo.py`, `api/app/routing/places.py` (Place gets `detail`, `exit_points`), `api/tests/test_places_resolver.py`.

**Produces:** `PhotonClient(base_url, http)` `.search(q, bbox, limit=8) -> list[Place]` (raises `SearchUnavailable`); `OverpassClient(url, http)` `.station_exits(lat, lng, radius_m=300) -> list[dict]`; `PlaceResolver(known: Places, photon, overpass, session_factory, bbox)` with `.search(q) -> (list[Place], limited: bool)`, `.get(id) -> Place | None` (raises `BadPlaceId` for malformed coord ids), `.ensure_exits(place)`. `/places` returns the list and sets `X-Search-Limited: 1` when limited (expose header via CORS `expose_headers`).

- [ ] **Step 1: Failing tests** with fake HTTP:
  - `test_photon_mapping_station_first` (features: a cafe, a `railway=station`; station ranked first; ids `osm:N…`/`osm:W…`)
  - `test_unnamed_feature_uses_address` (no name, housenumber+street → "12 George Street"; no name and no street → skipped)
  - `test_results_cached_and_resolvable` (search then `get("osm:N1")` from a new resolver/session)
  - `test_known_places_merged_and_deduped`
  - `test_photon_down_returns_known_and_limited`
  - `test_short_query_skips_photon`
  - `test_coord_id` (`coord:-33.87,151.21` → place "Pinned location"; `coord:here:-33.87,151.21` → "Your location")
  - `test_bad_coord_id` (`coord:abc` → BadPlaceId; endpoint → 404 `place_not_found`)
  - `test_unknown_osm_id_404` (endpoint)
  - `test_station_exits_from_overpass_cached` (one Overpass call; exits stored in cache row; second `ensure_exits` no call); Overpass failure → `[]`.
- [ ] **Step 2–4:** implement; MQ station keeps overrides exits (resolver fills `exit_points` from `overrides.json` + graph node coords). **Step 5:** commit `feat(api): Sydney place search with Photon, places cache and coord ids`.

### Task 7: Web changes

**Files:** `web/lib/types.ts` (Place.detail?), `web/lib/api.ts`, `web/components/PlaceInput.tsx`, `web/app/plan/PlanClient.tsx`, `web/app/route/RouteClient.tsx`, `web/tests/unit/api.test.ts`.

- [ ] **Step 1: Failing unit tests:**
  - `route falls back to sample only for the sample trip` (network error with `mq-station`→`library` → sample; with `osm:N1`→`library` → throws `ApiError` code `network`)
  - `503 route is an error` (status 503 → throws with server message)
  - `searchPlaces reports limited` (header `X-Search-Limited: 1` → `{data, limited: true}`)
- [ ] **Step 2–4:** implement `getRoute` rule; `getPlaces` returns `{data, sample, limited}`; PlaceInput: 250 ms debounce (timer ref), skip <2 chars (show known places on focus with empty query), `detail` line, limited message in the listbox footer (`role="status"`); `/plan` "Use my location" button (geolocation → `coord:here:<lat>,<lng>` place named "Your location"; denial → alert); `/route` shows `note` in `InfoBanner`. Lint, types, unit tests green; existing Playwright suite green.
- [ ] **Step 5:** commit `feat(web): Sydney-wide search, use my location, honest route errors`.

### Task 8: Live tests, Docker e2e, docs, final verification

**Files:** `api/tests/test_valhalla_live.py`, `api/pytest.ini` (marker), `web/tests/e2e/sydney.spec.ts`, `web/playwright.config.ts` (env `ROUTER=campus`, `PHOTON_URL=` for the default run), `README.md`.

- [ ] Live tests per spec §7, skipped when `GET {VALHALLA_URL}/status` fails.
- [ ] `sydney.spec.ts` skipped unless env `E2E_VALHALLA=1`; when set, the API web server runs with `ROUTER=valhalla` and Photon on.
- [ ] README: Sydney setup (extract script, compose up, status check, env vars).
- [ ] Run everything: api pytest (+ live with Docker up), web vitest/lint/tsc, Playwright default run, Playwright with `E2E_VALHALLA=1`, manual Central → Town Hall check. Update memory. Commit `test: Sydney live tests and docs`.
