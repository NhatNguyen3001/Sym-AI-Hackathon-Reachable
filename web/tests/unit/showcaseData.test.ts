// The showcase build reads recorded files from the site itself and never calls the API.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { route as sampleRoute, places, profile, venue } from "@/lib/placeholder";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const trip = { id: "campus", title: "t", blurb: "b", needsText: "n", fromId: "mq-station", toId: "library", profile };
const FILES: Record<string, unknown> = {
  "/showcase/manifest.json": { recordedOn: "19 Oct 2026", trips: [trip] },
  "/showcase/campus.json": { trip, from: places[0], to: places[1], route: sampleRoute, venue },
  "/showcase/map-places.json": [
    { id: "in", placeId: "in", name: "In", kind: "toilet", label: "Toilet", lat: -33.776, lng: 151.115, source: "OSM" },
    { id: "out", placeId: "out", name: "Out", kind: "toilet", label: "Toilet", lat: -33.9, lng: 151.2, source: "OSM" },
  ],
  "/showcase/updates.json": [{ id: "u1", type: "transport", title: "Lift out", time: "When recorded" }, { id: "u2", type: "report", title: "R", time: "When recorded" }],
  "/showcase/map-status.json": { lastRun: null, failed: [], snapshot: { takenOn: "2026-10-18" }, paused: true },
};

let fetchMock: ReturnType<typeof vi.fn>;

async function load() {
  vi.resetModules();
  return import("@/lib/api");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SHOWCASE", "1");
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.startsWith("/showcase/")) throw new Error(`showcase called ${url}`);
    return url in FILES ? json(FILES[url]) : new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("a recorded trip comes from its file, not the API", async () => {
  const api = await load();
  const r = await api.getRoute("mq-station", "library", profile);
  expect(r).toEqual({ data: sampleRoute, sample: false });
  expect(fetchMock.mock.calls.every(([u]) => String(u).startsWith("/showcase/"))).toBe(true);
});

test("a trip that wasn't recorded says so", async () => {
  const api = await load();
  await expect(api.getRoute("x", "y", profile)).rejects.toMatchObject({ code: "not_in_showcase" });
});

test("a missing recording says it couldn't load", async () => {
  delete FILES["/showcase/campus.json"];
  try {
    const api = await load();
    await expect(api.getRoute("mq-station", "library", profile)).rejects.toMatchObject({ code: "showcase_missing" });
  } finally {
    FILES["/showcase/campus.json"] = { trip, from: places[0], to: places[1], route: sampleRoute, venue };
  }
});

test("places, venue, updates and map status are the recorded ones", async () => {
  const api = await load();
  expect(await api.getPlace("library")).toEqual(places[1]);
  expect((await api.getVenueCheck("library")).data).toEqual(venue);
  expect((await api.getUpdates("transport")).data.map((u) => u.id)).toEqual(["u1"]);
  expect((await api.getMapStatus()).data?.paused).toBe(true);
  expect((await api.getPlaces("waranara")).data.map((p) => p.id)).toEqual(["library"]);
});

test("map pins are filtered to the box", async () => {
  const api = await load();
  const r = await api.getMapPlaces([151.1, -33.78, 151.12, -33.77]);
  expect(r.data.map((p) => p.id)).toEqual(["in"]);
});

test("writes say reports work in the live app", async () => {
  const api = await load();
  await expect(api.sendReport({ photoUrl: null, lat: 0, lng: 0, userLabel: "blocked", note: "" })).rejects.toMatchObject({ code: "showcase" });
  await expect(api.runMapAgent("k")).rejects.toMatchObject({ code: "showcase" });
});

test("weather, amenities and agents need no request", async () => {
  const api = await load();
  await api.getWeather();
  await api.getAmenities();
  await api.getAgents();
  expect(fetchMock).not.toHaveBeenCalled();
});
