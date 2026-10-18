import { expect, test } from "vitest";
import { freshnessLine } from "@/lib/freshness";
import type { MapStatus } from "@/lib/types";

const base: MapStatus = {
  lastRun: null, running: false, places: 0, roadworks: 0, checked: 0, failed: [], snapshot: null, paused: false,
};
// 18 Oct 2026, 11:00 am in Sydney (AEDT, UTC+11)
const NOW = new Date("2026-10-18T00:00:00Z");

test("nothing gathered yet says nothing", () => {
  expect(freshnessLine(base, NOW)).toBe("");
});

test("updated today shows the Sydney time", () => {
  expect(freshnessLine({ ...base, places: 10, lastRun: "2026-10-17T22:42:00+00:00" }, NOW))
    .toBe("Places and roadworks updated today, 9:42 am");
});

test("an earlier day shows the date", () => {
  expect(freshnessLine({ ...base, places: 10, lastRun: "2026-10-16T22:42:00+00:00" }, NOW))
    .toBe("Places and roadworks updated on 17 Oct");
});

test("the saved copy says so, with its date", () => {
  expect(freshnessLine({ ...base, places: 5539, snapshot: { takenOn: "2026-10-18" } }, NOW))
    .toBe("OpenStreetMap places from 18 Oct (saved copy)");
});

test("a run that couldn't reach OpenStreetMap says so", () => {
  expect(freshnessLine({ ...base, places: 10, lastRun: "2026-10-17T22:42:00+00:00", failed: ["osm"] }, NOW))
    .toBe("Places and roadworks updated today, 9:42 am; couldn't reach OpenStreetMap last time");
});
