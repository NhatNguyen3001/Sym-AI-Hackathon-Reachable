---
name: project-cycle2-sydney
description: Cycle 2 (brainstorming 2026-10-17) — expanding Reachable from Macquarie campus to all of Greater Sydney
metadata:
  type: project
---

Goal (user): a real product covering all of Sydney, eventually full door-to-door incl. transit.

Decomposed into sub-projects, built in order A → B → C → D:
- **A** Sydney-wide walk/roll routing  ← this cycle
- **B** Sydney place search            ← this cycle (bundled with A)
- **C** every station's exits + lifts + live outages (needs TfNSW key)
- **D** transit legs via TfNSW Trip Planner, joined to accessible first/last legs (needs TfNSW key)

Decisions so far:
- Routing engine: **Valhalla** (user chose over our tiled NetworkX engine). Hard max-slope kept by
  route → `trace_attributes` grade check → exclude steep edges → reroute. Rain/surface and kerbs are approximations.
- Place search: **Photon** (public photon.komoot.io for dev, self-host later), behind existing `/places`.
- Runs locally via **Docker Desktop** + `docker-compose.yml` (valhalla-scripted image, port 8002, build_elevation).
- Coverage: **Greater Sydney** — Geofabrik Australia pbf (970 MB) clipped with osmium to ~149.97–151.63 E, -34.33 to -32.99.
- API endpoints/response shapes unchanged; campus NetworkX router kept as offline fallback (`ROUTER=valhalla|campus`).
- Section 1 (architecture) and Section 2 (route algorithm: exits per station, wheelchair route, grade check+reroute up to 4x, needs-checking detour <=1.5x, fastest foot route, confidence Measured/Likely/Not sure/Confirmed, 10 km cap, Greater Sydney only) approved 2026-10-17. Section 3 (Photon+known places, places_cache table, coord: ids, use-my-location, weather near trip start, errors 503 routing_unavailable / 422 out_of_area / 10 km cap, web stops showing sample route for non-sample trips, recorded-fixture unit tests + @valhalla live tests) approved. Spec written+committed: docs/superpowers/specs/2026-10-17-sydney-routing-design.md. Next: user reviews spec → writing-plans → inline execution.

**Why:** user answers in the cycle 2 brainstorm.
**How to apply:** follow these over cycle 1 choices where they conflict. See [[project-status]], [[project-decisions]].
