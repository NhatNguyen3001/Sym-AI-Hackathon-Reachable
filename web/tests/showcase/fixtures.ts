// Small hand-made recordings for the showcase e2e, served in place of /showcase/*.json (real recordings are only
// used with SHOWCASE_REAL=1). Built from the app's own sample data so they stay the right shape.
import { places, route as campusRoute, updates, venue } from "../../lib/placeholder";
import trips from "../../lib/showcase-trips.json";
import type { RouteResult, TripOption } from "../../lib/types";

export const RECORDED_ON = "19 Oct 2026";
const WHEN = `when recorded (${RECORDED_ON}, Sydney time)`;

const ends: Record<string, [string, string]> = {
  campus: ["mq-station", "library"],
  "lift-out": ["mq-station", "library"],
  "opera-house": ["mq-station", "tf:opera-house"],
  "art-gallery": ["tf:town-hall", "place:art-gallery"],
  bondi: ["tf:bondi-junction", "place:bondi-beach"],
};
const extra = {
  "tf:opera-house": { id: "tf:opera-house", name: "Sydney Opera House", kind: "venue" as const, lat: -33.8568, lng: 151.2153 },
  "tf:town-hall": { id: "tf:town-hall", name: "Town Hall Station", kind: "station" as const, lat: -33.8732, lng: 151.2066 },
  "place:art-gallery": { id: "place:art-gallery", name: "Art Gallery of New South Wales", kind: "venue" as const, lat: -33.8688, lng: 151.2173 },
  "tf:bondi-junction": { id: "tf:bondi-junction", name: "Bondi Junction Station", kind: "station" as const, lat: -33.8915, lng: 151.2477 },
  "place:bondi-beach": { id: "place:bondi-beach", name: "Bondi Beach", kind: "place" as const, lat: -33.8908, lng: 151.2743 },
};
const place = (id: string) => places.find((p) => p.id === id) ?? extra[id as keyof typeof extra];

const recorded: RouteResult = {
  ...campusRoute,
  liftStatus: campusRoute.liftStatus.map((l) => ({ ...l, updated: WHEN, lat: -33.7774, lng: 151.1184 })),
};

const line = (a: [number, number], b: [number, number]) => ({ type: "LineString" as const, coordinates: [a, b] });
const transit: TripOption = {
  id: "transit-0", mode: "transit", minutes: 52, leaveAt: "2026-10-19T09:14:00+11:00", arriveAt: "2026-10-19T10:06:00+11:00",
  summary: "Walk 4 min · Metro M1 · Walk 9 min", stepFree: true, interchanges: 0, warnings: [], liftAlerts: [],
  legs: [
    { kind: "walk", minutes: 4, distanceM: 260, geometry: line([151.1182, -33.7773], [151.1183, -33.7764]), steps: [], stepFree: true,
      maxSlope: 2, source: "reachable", to: "Macquarie University Station" },
    { kind: "ride", mode: "metro", label: "Metro M1", line: "M1", headsign: "Sydenham", from: { name: "Macquarie University Station",
      platform: "Platform 1", lat: -33.7764, lng: 151.1183 }, to: { name: "Gadigal Station", platform: "", lat: -33.8752, lng: 151.2068 },
      departAt: "2026-10-19T09:20:00+11:00", arriveAt: "2026-10-19T09:52:00+11:00", minutes: 32, stops: 9, wheelchairAccessible: true,
      geometry: line([151.1183, -33.7764], [151.2068, -33.8752]) },
    { kind: "walk", minutes: 9, distanceM: 640, geometry: line([151.2068, -33.8752], [151.2153, -33.8568]), steps: [], stepFree: true,
      maxSlope: 4, slopeEstimated: true, source: "reachable", to: "Sydney Opera House" },
  ],
};

export const FILES: Record<string, unknown> = {
  manifest: { recordedOn: RECORDED_ON, trips: trips.map((t) => ({ ...t, fromId: ends[t.id][0], toId: ends[t.id][1] })) },
  "map-places": [
    { id: "osm:1", placeId: "osm:1", name: "Accessible toilet", kind: "toilet", label: "Accessible toilet", lat: -33.7757, lng: 151.1136, source: "OpenStreetMap" },
    { id: "osm:2", placeId: "osm:2", name: "Accessible parking", kind: "parking", label: "Accessible parking", lat: -33.7745, lng: 151.1150, source: "OpenStreetMap" },
  ],
  "map-status": { lastRun: null, failed: [], snapshot: { takenOn: "2026-10-18" }, paused: true },
  updates: updates.map((u) => ({ ...u, time: WHEN })),
};
for (const t of trips) {
  const [from, to] = ends[t.id];
  // As the recorder writes it: the staged outage is credited to the example.
  const staged = { ...recorded, liftStatus: recorded.liftStatus.map((l) => (l.status === "Out of service" ? { ...l, source: "Example set up for this showcase" } : l)) };
  const route = t.id === "opera-house" ? { ...recorded, accessible: null, steps: [], options: [transit] } : t.staged ? staged : recorded;
  FILES[t.id] = { trip: { ...t, fromId: from, toId: to }, from: place(from), to: place(to), route,
    // As the recorder writes it: relative times rewritten.
    venue: { ...venue, id: to, checkedAgo: WHEN, checks: venue.checks.map((c) => ({ ...c, source: c.source.replace(/\d+ \w+ ago/, "when recorded") })) } };
}

export const TRIPS = (FILES.manifest as { trips: { id: string; fromId: string; toId: string; title: string }[] }).trips;
export const tripPath = (t: { id: string; fromId: string; toId: string }) =>
  `/route?from=${encodeURIComponent(t.fromId)}&to=${encodeURIComponent(t.toId)}&trip=${t.id}`;
