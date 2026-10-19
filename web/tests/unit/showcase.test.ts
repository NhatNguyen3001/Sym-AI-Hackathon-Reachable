import { expect, test } from "vitest";
import { SHOWCASE, SHOWCASE_TRIPS, showcaseFile, tripFor, type ShowcaseManifest } from "@/lib/showcase";

const manifest: ShowcaseManifest = {
  recordedOn: "19 Oct 2026",
  trips: SHOWCASE_TRIPS.map((t, i) => ({ ...t, fromId: i < 2 ? "mq-station" : `from-${i}`, toId: i < 2 ? "library" : `to-${i}` })),
};

test("off unless the build turns it on", () => expect(SHOWCASE).toBe(false));

test("five trips, each with its own needs", () => {
  expect(SHOWCASE_TRIPS.map((t) => t.id)).toEqual(["campus", "lift-out", "opera-house", "art-gallery", "bondi"]);
  expect(SHOWCASE_TRIPS.map((t) => t.profile.aid)).toEqual(["manual_wheelchair", "manual_wheelchair", "power_wheelchair", "walker", "pram"]);
  expect(SHOWCASE_TRIPS.map((t) => t.profile.maxSlope)).toEqual([5, 5, 8, 8, 8]);
  expect(SHOWCASE_TRIPS.find((t) => t.id === "lift-out")?.staged).toContain("Example");
});

test("finds the trip for a from/to pair", () => {
  expect(tripFor(manifest, "mq-station", "library")?.id).toBe("campus");
  expect(tripFor(manifest, "from-2", "to-2")?.id).toBe("opera-house");
  expect(tripFor(manifest, "x", "y")).toBeNull();
  expect(tripFor(manifest, null, "library")).toBeNull();
});

test("recordings are files on the site itself", () => expect(showcaseFile("campus")).toBe("/showcase/campus.json"));

test("the trip id picks between trips with the same places", () => {
  expect(tripFor(manifest, "mq-station", "library", "lift-out")?.id).toBe("lift-out");
  expect(tripFor(manifest, "mq-station", "library", "nope")?.id).toBe("campus");
});
