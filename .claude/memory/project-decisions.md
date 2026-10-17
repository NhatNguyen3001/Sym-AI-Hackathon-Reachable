---
name: project-decisions
description: Brainstorming decisions for Reachable that override the original tech-stack doc
metadata:
  type: project
---

- Scope: vertical slice = all 6 pages + FastAPI real campus routing + Claude (parse, explain, photo label).
- **No Supabase.** User chose **Turso** (libSQL): SQLite file locally, Turso when deployed, via SQLModel + `DATABASE_URL`.
- Realtime = FastAPI **SSE** (`/events`). Photos = local `api/uploads/`.
- Lift status: seeded outage + `POST /demo/lifts/{exitId}` toggle. No TfNSW key yet.
- Report checker: simple plain-Python rules, no LangGraph this cycle.
- Graph: real OSMnx graph built once and committed + Open-Meteo elevation + `overrides.json`.
- Deploy out of scope; local only. Only key available: ANTHROPIC_API_KEY.

**Why:** user's answers during the 2026-10-17 brainstorm.
**How to apply:** follow these over `.claude/docs/reachable-tech-stack.md` where they conflict. See [[project-status]].
