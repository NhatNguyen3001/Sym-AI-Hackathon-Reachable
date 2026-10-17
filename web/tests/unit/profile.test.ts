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

test("choosing an aid applies its slope and avoid defaults", async () => {
  const { withAid } = await import("@/lib/profile");
  const cane = { ...placeholder, aid: "cane" as const, maxSlope: 8, avoid: { ...placeholder.avoid, stairs: false } };
  const chair = withAid(cane, "manual_wheelchair");
  expect(chair.aid).toBe("manual_wheelchair");
  expect(chair.avoid.stairs).toBe(true);
  expect(chair.maxSlope).toBe(5);
  expect(chair.destination).toEqual(cane.destination);
});
