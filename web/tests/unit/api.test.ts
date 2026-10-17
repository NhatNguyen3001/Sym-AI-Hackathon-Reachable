import { afterEach, expect, test, vi } from "vitest";
import { API_URL, ApiError, getPlace, getPlaces, getRoute, getUpdates, labelPhoto, parseProfile, searchPlaces, sendReport } from "@/lib/api";
import { profile } from "@/lib/placeholder";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("reads fall back to sample data when the API is down", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  const r = await getUpdates();
  expect(r.sample).toBe(true);
  expect(r.data.length).toBeGreaterThan(0);
});

test("reads fall back on a server error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "server_error", message: "x" } }, 500)));
  expect((await getUpdates("report")).sample).toBe(true);
});

test("sample updates respect the filter", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  const r = await getUpdates("transport");
  expect(r.data.every((i) => i.type === "transport")).toBe(true);
});

test("reads return live data and pass the filter", async () => {
  const f = vi.fn().mockResolvedValue(json([{ id: "1" }]));
  vi.stubGlobal("fetch", f);
  const r = await getUpdates("report");
  expect(r).toEqual({ data: [{ id: "1" }], sample: false });
  expect(String(f.mock.calls[0][0])).toContain("/updates?type=report");
});

test("writes throw ApiError when the API is down", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  await expect(sendReport({ photoUrl: null, lat: 0, lng: 0, userLabel: "blocked", note: "" })).rejects.toBeInstanceOf(ApiError);
  await expect(parseProfile("walker")).rejects.toMatchObject({ code: "network" });
});

test("write errors carry the server message", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "too_large", message: "Photos must be 10 MB or smaller." } }, 413)));
  await expect(labelPhoto(new File(["x"], "p.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({
    code: "too_large", status: 413, message: "Photos must be 10 MB or smaller.",
  });
});

test("unknown place is an error, not sample data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "place_not_found", message: "x" } }, 404)));
  await expect(getRoute("mq-station", "nowhere", profile)).rejects.toMatchObject({ code: "place_not_found" });
});

test("route falls back to the sample route when the API is down", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  const r = await getRoute("mq-station", "library", profile);
  expect(r.sample).toBe(true);
  expect(r.data.ok).toBe(true);
});

test("route falls back to sample only for the sample trip", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  expect((await getRoute("mq-station", "library", profile)).sample).toBe(true);
  await expect(getRoute("osm:N1", "library", profile)).rejects.toMatchObject({ code: "network" });
});

test("a 503 route is an error with the server message", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "routing_unavailable", message: "Route planning is unavailable right now. Please try again soon." } }, 503)));
  await expect(getRoute("osm:N1", "osm:N2", profile)).rejects.toMatchObject({ code: "routing_unavailable", status: 503 });
});

test("place search reports when it is limited", async () => {
  const res = new Response(JSON.stringify([{ id: "library" }]), { status: 200, headers: { "X-Search-Limited": "1" } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
  expect(await getPlaces("lib")).toMatchObject({ data: [{ id: "library" }], sample: false, limited: true });
});

test("getPlace returns null for an unknown place and the place otherwise", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "place_not_found", message: "x" } }, 404)));
  expect(await getPlace("osm:N404")).toBeNull();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ id: "osm:N1", name: "Town Hall", kind: "station", lat: 0, lng: 0 })));
  expect(await getPlace("osm:N1")).toMatchObject({ name: "Town Hall" });
});

test("the API URL defaults to 127.0.0.1 (localhost is ~0.2 s slower per request on Windows)", () => {
  expect(API_URL).toBe("http://127.0.0.1:8000");
});

test("identical place lookups at the same time share one request", async () => {
  const f = vi.fn().mockImplementation(() => Promise.resolve(json({ id: "library", name: "Waranara Library" })));
  vi.stubGlobal("fetch", f);
  const [a, b] = await Promise.all([getPlace("library"), getPlace("library")]);
  expect(a?.id).toBe("library");
  expect(b?.id).toBe("library");
  expect(f).toHaveBeenCalledTimes(1);
});

test("search shows known places first, then the full results", async () => {
  const f = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(json(url.includes("photon=0") ? [{ id: "library" }] : [{ id: "library" }, { id: "osm:N1" }])));
  vi.stubGlobal("fetch", f);
  const updates: { ids: string[]; pending: boolean }[] = [];
  const done = await searchPlaces("lib", (r) => updates.push({ ids: r.data.map((p) => p.id), pending: r.pending }));
  expect(updates).toEqual([{ ids: ["library"], pending: true }, { ids: ["library", "osm:N1"], pending: false }]);
  expect(done.data.map((p) => p.id)).toEqual(["library", "osm:N1"]);
});

test("a place found once isn't fetched again", async () => {
  const f = vi.fn().mockImplementation(() => Promise.resolve(json({ id: "globe-cafe", name: "Globe Café" })));
  vi.stubGlobal("fetch", f);
  await getPlace("globe-cafe");
  await getPlace("globe-cafe");
  expect(f).toHaveBeenCalledTimes(1);
});
