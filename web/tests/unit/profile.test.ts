import { beforeEach, expect, test } from "vitest";
import { addTrip, loadProfile, loadTrips, saveProfile } from "@/lib/profile";
import { profile as placeholder } from "@/lib/placeholder";

beforeEach(() => localStorage.clear());

test("defaults when empty", () => expect(loadProfile()).toEqual(placeholder));

test("defaults when corrupt", () => {
  localStorage.setItem("reachable.profile", "{nope");
  expect(loadProfile()).toEqual(placeholder);
});

test("merges old shapes with defaults", () => {
  localStorage.setItem("reachable.profile", JSON.stringify({ aid: "walker", avoid: { uneven: true } }));
  const p = loadProfile();
  expect(p.aid).toBe("walker");
  expect(p.avoid.uneven).toBe(true);
  expect(p.avoid.stairs).toBe(placeholder.avoid.stairs);
  expect(p.destination).toEqual(placeholder.destination);
});

test("ignores invalid values", () => {
  localStorage.setItem("reachable.profile", JSON.stringify({ aid: "rocket", maxSlope: 99 }));
  const p = loadProfile();
  expect(p.aid).toBe(placeholder.aid);
  expect(p.maxSlope).toBe(12);
});

test("round trip", () => {
  saveProfile({ ...placeholder, maxSlope: 8 });
  expect(loadProfile().maxSlope).toBe(8);
});

test("trips keep 3, newest first, deduped", () => {
  for (const to of ["a", "b", "c", "d", "b"]) addTrip({ fromId: "s", from: "S", toId: to, to, minutes: 5 });
  expect(loadTrips().map((t) => t.toId)).toEqual(["b", "d", "c"]);
});

test("trips survive corrupt storage", () => {
  localStorage.setItem("reachable.trips", "[[[");
  expect(loadTrips()).toEqual([]);
});
