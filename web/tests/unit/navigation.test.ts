import { expect, test } from "vitest";
import {
  distanceText, locate, navFromLegs, navFromWalk, nextTurn, pointAlong, progressAt, speakable, spokenStep, turnPhrase, turnsOf,
  walkedLine,
} from "@/lib/navigation";
import type { Leg, Step } from "@/lib/types";

// A straight line due north on campus: 0.001° of latitude is about 111 m.
const LINE: [number, number][] = [[151.1135, -33.7770], [151.1135, -33.7760], [151.1135, -33.7750]];
const STEPS: Step[] = [
  { icon: "check", label: "Flat footpath, 111 m", confidence: "Confirmed", lengthM: 111 },
  { icon: "slope", label: "Gentle slope, up to 3%, 111 m", confidence: "Confirmed", lengthM: 111 },
];

test("steps are laid along the line in proportion to their lengths", () => {
  const nav = navFromWalk(LINE, STEPS);
  expect(nav.total).toBeGreaterThan(215);
  expect(nav.total).toBeLessThan(230);
  expect(nav.steps.map((s) => s.label)).toEqual(["Flat footpath, 111 m", "Gentle slope, up to 3%, 111 m"]);
  expect(nav.steps[1].startM).toBeCloseTo(nav.total / 2, 0);
  expect(nav.steps[1].endM).toBe(nav.total);
});

test("a position beside the route snaps onto it and says how far off it is", () => {
  const nav = navFromWalk(LINE, STEPS);
  const fix = locate(nav, -33.7765, 151.1136)!; // about 9 m east of the line, halfway up the first part
  expect(fix.offM).toBeGreaterThan(5);
  expect(fix.offM).toBeLessThan(15);
  expect(fix.alongM).toBeGreaterThan(50);
  expect(fix.alongM).toBeLessThan(60);
});

test("progress names the current step, the next one and the distance to it", () => {
  const nav = navFromWalk(LINE, STEPS);
  const start = progressAt(nav, 0);
  expect(start.current.label).toBe("Flat footpath, 111 m");
  expect(start.next?.label).toBe("Gentle slope, up to 3%, 111 m");
  expect(start.toNextM).toBeCloseTo(nav.total / 2, 0);
  expect(start.arrived).toBe(false);

  const later = progressAt(nav, nav.total / 2 + 1);
  expect(later.current.label).toBe("Gentle slope, up to 3%, 111 m");
  expect(later.next).toBeNull();
  expect(progressAt(nav, nav.total - 5).arrived).toBe(true);
});

test("a route with no steps still has one instruction", () => {
  const nav = navFromWalk(LINE, []);
  expect(progressAt(nav, 10).current.label).toBe("Follow the route");
});

test("a public transport trip becomes walk steps, then the ride with the station path as its detail", () => {
  const legs: Leg[] = [
    { kind: "walk", minutes: 2, distanceM: 111, geometry: { type: "LineString", coordinates: LINE.slice(0, 2) },
      steps: [STEPS[0]], stepFree: true, maxSlope: 0, source: "reachable", to: "Macquarie University Station" },
    { kind: "station", station: "Macquarie University Station", stopId: "211310", minutes: 3,
      path: [{ type: "lift", label: "Lift down to Platform 1" }], liftAlerts: [] },
    { kind: "ride", mode: "metro", label: "Metro M1", line: "M1", headsign: "Sydenham",
      from: { name: "Macquarie University", platform: "Platform 1", lat: -33.776, lng: 151.1135 },
      to: { name: "Central", platform: "Platform 2", lat: -33.775, lng: 151.1135 },
      departAt: "2026-10-18T09:08:00+11:00", arriveAt: "2026-10-18T09:37:00+11:00", minutes: 29, stops: 9,
      wheelchairAccessible: true, geometry: { type: "LineString", coordinates: LINE.slice(1) } },
  ];
  const nav = navFromLegs(legs);
  expect(nav.steps.map((s) => s.label)).toEqual(["Flat footpath, 111 m", "Metro M1 towards Sydenham"]);
  expect(nav.steps[1].icon).toBe("ride");
  expect(nav.steps[1].detail).toBe("At Macquarie University Station: Lift down to Platform 1");
});

test("corners become turns: north then east is a right turn, then north again is a left", () => {
  const zigzag: [number, number][] = [[151.1135, -33.7770], [151.1135, -33.7760], [151.1147, -33.7760], [151.1147, -33.7750]];
  const turns = turnsOf(navFromWalk(zigzag, []));
  expect(turns.map((t) => t.dir)).toEqual(["right", "left"]);
  expect(nextTurn(turns, 0)?.dir).toBe("right");
  expect(turnPhrase("right")).toBe("Turn right");
  expect(turnPhrase("slight left")).toBe("Keep left");
  expect(turnsOf(navFromWalk(LINE, []))).toEqual([]); // a straight line has none
});

test("steps are said as instructions, with whole words for units", () => {
  const say = (label: string, icon: Step["icon"] | "ride") => spokenStep({ label, icon, startM: 0, endM: 1 });
  expect(say("Flat footpath, 61 m", "check")).toBe("Go straight on the flat footpath for 61 metres");
  expect(say("Gentle slope, up to 3%, 92 m", "slope")).toBe("Gentle slope, up to 3 percent ahead for 92 metres");
  expect(say("Lift at north exit", "lift")).toBe("Use the lift at north exit");
  expect(say("Kerb ramp at crossing", "alert")).toBe("Cross using the kerb ramp");
  expect(say("Metro M1 towards Sydenham", "ride")).toBe("Take the Metro M1 towards Sydenham");
  expect(speakable("1 m, 1.5 km")).toBe("1 metre, 1.5 kilometres");
});

test("preview points, walked line and distance text", () => {
  const nav = navFromWalk(LINE, STEPS);
  const mid = pointAlong(nav, nav.total / 2)!;
  expect(mid[0]).toBeCloseTo(-33.776, 4);
  const fix = locate(nav, mid[0], mid[1])!;
  expect(walkedLine(nav, fix).length).toBeGreaterThanOrEqual(2);
  expect(distanceText(43)).toBe("45 m");
  expect(distanceText(437)).toBe("440 m");
  expect(distanceText(1530)).toBe("1.5 km");
});
