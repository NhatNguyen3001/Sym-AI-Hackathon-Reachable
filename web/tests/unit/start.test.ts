import { afterEach, expect, test, vi } from "vitest";
import { startPlaceId } from "@/lib/start";
import { readStored, writeStored } from "@/lib/storage";

afterEach(() => vi.unstubAllGlobals());

test("start from your location only inside Greater Sydney", () => {
  expect(startPlaceId({ lat: -33.87, lng: 151.21 })).toBe("coord:here:-33.87000,151.21000");
  expect(startPlaceId({ lat: -37.81, lng: 144.96 })).toBeNull(); // Melbourne: the person types a start
  expect(startPlaceId(null)).toBeNull();
});

test("storage that throws (private mode, blocked site data) never breaks the page", () => {
  const boom = () => { throw new DOMException("blocked", "SecurityError"); };
  vi.stubGlobal("localStorage", { getItem: boom, setItem: boom });
  expect(readStored("k")).toBeNull();
  expect(() => writeStored("k", "v")).not.toThrow();
});
