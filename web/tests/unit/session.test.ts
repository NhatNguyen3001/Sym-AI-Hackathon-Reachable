import { afterEach, expect, test, vi } from "vitest";
import { resetSessionForTests, sessionId } from "@/lib/session";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  resetSessionForTests();
});

test("each phone keeps the same session id", () => {
  const a = sessionId();
  expect(a).toMatch(/^[a-z0-9-]{16,64}$/);
  expect(sessionId()).toBe(a);
  expect(localStorage.getItem("reachable.session")).toBe(a);
});

test("a different phone (empty storage) gets a different id", () => {
  const a = sessionId();
  localStorage.clear();
  resetSessionForTests();
  expect(sessionId()).not.toBe(a);
});

test("storage that throws still gives an id for this visit", () => {
  const boom = () => { throw new DOMException("blocked", "SecurityError"); };
  vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, clear: () => {} });
  const a = sessionId();
  expect(a).toMatch(/^[a-z0-9-]{16,64}$/);
  expect(sessionId()).toBe(a);
});
