import { SHOWCASE } from "./showcase";
import type { MapStatus } from "./types";

const TZ = "Australia/Sydney";

function sydneyDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function dayMonth(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, day: "numeric", month: "short" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")}`;
}

function clock(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase().replace(/\./g, "")}`;
}

/** The small "when was the map updated" line on the map and Live updates (spec section 5). */
export function freshnessLine(s: MapStatus, now: Date): string {
  let line = "";
  if (s.lastRun && SHOWCASE) {
    // Seen long after it was recorded, from anywhere: the full date and whose clock, never "today".
    const run = new Date(s.lastRun);
    line = `Places and roadworks updated ${dayMonth(run)} ${sydneyDay(run).slice(0, 4)}, ${clock(run)} (Sydney time)`;
  } else if (s.lastRun) {
    const run = new Date(s.lastRun);
    line = sydneyDay(run) === sydneyDay(now)
      ? `Places and roadworks updated today, ${clock(run)}`
      : `Places and roadworks updated on ${dayMonth(run)}`;
  } else if (s.snapshot && s.places > 0) {
    line = `OpenStreetMap places from ${dayMonth(new Date(`${s.snapshot.takenOn}T12:00:00+11:00`))} (saved copy)`;
  }
  if (line && s.failed.includes("osm")) line += "; couldn't reach OpenStreetMap last time";
  return line;
}
