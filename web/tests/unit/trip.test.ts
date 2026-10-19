import { expect, test, vi } from "vitest";
import { legTitle, optionTimes, optionTitle, rideDetail, selectOption, timeOfDay, zoneName } from "@/lib/trip";
import type { RideLeg, TripOption } from "@/lib/types";

const geometry = { type: "LineString" as const, coordinates: [] as [number, number][] };
const ride: RideLeg = {
  kind: "ride", mode: "metro", label: "Metro M1", line: "M1", headsign: "Tallawong",
  from: { name: "Gadigal Station", platform: "Platform 2", lat: 0, lng: 0 }, to: { name: "Chatswood Station", platform: "", lat: 0, lng: 0 },
  departAt: "2026-10-17T06:12:00+00:00", arriveAt: "2026-10-17T06:24:00+00:00", minutes: 12, stops: 5, wheelchairAccessible: true, geometry,
};
const transit: TripOption = {
  id: "transit-0", mode: "transit", minutes: 24, leaveAt: "2026-10-17T06:05:00+00:00", arriveAt: "2026-10-17T06:29:00+00:00",
  summary: "Walk 7 min · Metro M1 · Walk 3 min", stepFree: true, interchanges: 0, warnings: [], liftAlerts: [],
  legs: [{ kind: "walk", minutes: 7, distanceM: 480, geometry, steps: [], stepFree: true, maxSlope: 2, source: "reachable", to: "Gadigal Station" }, ride],
};
const walk: TripOption = { ...transit, id: "walk", mode: "walk", minutes: 6, leaveAt: undefined, arriveAt: undefined, summary: "Walk or roll 6 min", legs: [] };

test("times are shown in Sydney time", () => {
  expect(timeOfDay("2026-10-17T06:05:00+00:00")).toBe("5:05 pm");
});

test("option titles and times", () => {
  expect(optionTitle(transit)).toBe("24 min · Metro M1");
  expect(optionTitle(walk)).toBe("6 min · Walk or roll");
  expect(optionTimes(transit)).toBe("Leave 5:05 pm, arrive 5:29 pm");
  expect(optionTimes(walk)).toBe("");
});

test("leg titles and ride details", () => {
  expect(legTitle(transit.legs[0])).toBe("Walk 7 min to Gadigal Station");
  expect(legTitle(ride)).toBe("Metro M1 towards Tallawong");
  expect(legTitle({ kind: "station", station: "Gadigal Station", stopId: "200066", minutes: 6, path: [], liftAlerts: [] })).toBe("At Gadigal Station");
  expect(rideDetail(ride)).toBe("Platform 2 · departs 5:12 pm · 5 stops · wheelchair accessible");
});

test("select falls back to the first option", () => {
  expect(selectOption([walk, transit], "transit-0")?.id).toBe("transit-0");
  expect(selectOption([walk, transit], "nope")?.id).toBe("walk");
  expect(selectOption(undefined, "x")).toBeUndefined();
});

test("options group into ways, keeping the API's order", async () => {
  const { groupWays } = await import("@/lib/trip");
  const t = (id: string, wayId: string): TripOption => ({ ...transit, id, wayId });
  const groups = groupWays([{ ...walk, wayId: "walk" }, t("transit-0", "way-a"), t("transit-1", "way-a"), t("transit-2", "way-a")]);
  expect(groups.map((g) => [g.wayId, g.options.map((o) => o.id)])).toEqual([
    ["walk", ["walk"]], ["way-a", ["transit-0", "transit-1", "transit-2"]],
  ]);
});

test("the showcase labels departure times with the Sydney time zone (AEDT)", async () => {
  vi.stubEnv("NEXT_PUBLIC_SHOWCASE", "1");
  vi.resetModules();
  try {
    const t = await import("@/lib/trip");
    expect(t.optionTimes(transit)).toBe("Leave 5:05 pm, arrive 5:29 pm AEDT");
    expect(t.rideDetail(ride)).toBe("Platform 2 · departs 5:12 pm AEDT · 5 stops · wheelchair accessible");
  } finally {
    vi.unstubAllEnvs();
  }
});

test("the zone name follows daylight saving", () => {
  expect(zoneName("2026-10-19T05:05:00Z")).toBe("AEDT");
  expect(zoneName("2026-07-01T02:00:00Z")).toBe("AEST");
});
