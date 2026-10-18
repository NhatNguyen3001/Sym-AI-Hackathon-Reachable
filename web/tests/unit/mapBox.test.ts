import { expect, test } from "vitest";
import { placesBox, SYDNEY_BOX } from "@/lib/mapBox";

const view = { west: 151.10, south: -33.78, east: 151.12, north: -33.77 };

test("at street level, the view plus a margin", () => {
  const [w, s, e, n] = placesBox(view, 16);
  expect(w).toBeCloseTo(151.096);
  expect(e).toBeCloseTo(151.124);
  expect(s).toBeCloseTo(-33.782);
  expect(n).toBeCloseTo(-33.768);
});

test("zoomed out, all of Sydney at once", () => {
  expect(placesBox(view, 12)).toEqual(SYDNEY_BOX);
  expect(placesBox(view, 9)).toEqual(SYDNEY_BOX);
});
