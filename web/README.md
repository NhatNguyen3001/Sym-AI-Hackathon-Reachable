# Reachable web app

Next.js 16 + Tailwind v4 + shadcn/ui + react-leaflet. Setup and the whole project are described in the
[main README](../README.md); this page is for working on the web app.

## Run

```bash
npm install
copy .env.example .env.local     # Windows   (macOS / Linux: cp .env.example .env.local)
npm run dev                      # http://localhost:3000, talks to the API at NEXT_PUBLIC_API_URL (127.0.0.1:8000)
```

## Pages

| Path | What it is |
|---|---|
| `/` | The map: search a destination, needs filter chips, pins across Sydney (number bubbles when zoomed out), problem cards, place popups with **Go here**, and when the map was last updated |
| `/route` | A step-free route or public transport trip, with steps, lift status, warnings and the destination check |
| `/report` | Report a barrier with a photo |
| `/live` | Live updates (lifts, roadworks, reports, weather), when the map was updated, and the owner-only **Update map now** button |
| `/privacy` | What Reachable keeps, as questions you open |

`/plan` and `/needs` are old addresses that redirect to the map.

## Where things are

- `app/<page>/` — pages. `components/` — shared pieces; `components/map/` — the maps (`ExploreMap`, `MapView`,
  `ClusterLayer` for bubbles). `lib/` — API client (`api.ts`), types, storage, live events, small helpers.
- Colours and fonts: `app/globals.css` (design tokens: use these, don't add new colours).

## Checks (run before pushing)

```bash
npm test && npm run lint && npx tsc --noEmit
npx playwright install chromium   # first time only
npm run e2e                        # own API + web on ports 8100/3100, mock Transport for NSW; axe accessibility checks
```

`next build` type-checks the test files too.
