import { afterEach, expect, test, vi } from "vitest";
import { ApiError, getRoute, getUpdates, labelPhoto, parseProfile, sendReport } from "@/lib/api";
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
