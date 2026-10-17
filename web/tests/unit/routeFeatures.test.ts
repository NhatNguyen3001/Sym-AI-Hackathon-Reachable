import { expect, test } from "vitest";
import { routeFeatures } from "@/lib/routeFeatures";
import type { Step } from "@/lib/types";

// An L-shaped path: 0.002° east, then 0.002° north (about 185 m and 222 m).
const L_SHAPE: [number, number][] = [[151.110, -33.775], [151.112, -33.775], [151.112, -33.773]];
const step = (icon: Step["icon"], lengthM: number): Step => ({ icon, label: `Step, ${lengthM} m`, confidence: "Likely", lengthM });

test("a slope highlight follows the path around a corner instead of cutting across", () => {
  const { spans } = routeFeatures(L_SHAPE, [step("check", 100), step("slope", 200), step("check", 107)], null, null);
  expect(spans).toHaveLength(1);
  const pts = spans[0].positions;
  expect(pts.length).toBeGreaterThan(2);
  expect(pts).toContainEqual([-33.775, 151.112]);           // the corner, as [lat, lng]
});

test("a slope on a straight piece is just its two ends", () => {
  const { spans } = routeFeatures(L_SHAPE, [step("slope", 50), step("check", 357)], null, null);
  expect(spans[0].positions).toHaveLength(2);
});
