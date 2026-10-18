// Turn-by-turn guidance: where you are along the route, which step you're on, and what comes next.
import { haversine } from "./hazards";
import type { Leg, Step } from "./types";

type LngLat = [number, number];
export type LatLng = [number, number];

export type NavIcon = Step["icon"] | "ride";

export interface NavStep {
  label: string;
  /** Extra line under the label, e.g. the lifts to take inside a station before a ride. */
  detail?: string;
  icon: NavIcon;
  startM: number;
  endM: number;
}

export interface NavRoute {
  line: LatLng[];
  /** Metres walked at each point of `line`. */
  cum: number[];
  total: number;
  steps: NavStep[];
}

export interface NavFix {
  alongM: number;
  /** How far the person is from the route line. */
  offM: number;
  point: LatLng;
}

export interface NavProgress {
  index: number;
  current: NavStep;
  next: NavStep | null;
  /** Metres to the start of the next step (or to the end on the last step). */
  toNextM: number;
  remainingM: number;
  arrived: boolean;
}

/** Further from the line than this, the person has left the route. */
export const OFF_ROUTE_M = 35;
/** Closer to the end than this, the person has arrived. */
export const ARRIVED_M = 20;
/** A step starts this many metres early, so the instruction shows as you reach it. */
const STEP_LEAD_M = 8;

function addLine(nav: NavRoute, coords: LngLat[]) {
  for (const [lng, lat] of coords) {
    const last = nav.line[nav.line.length - 1];
    if (last && last[0] === lat && last[1] === lng) continue;
    if (last) nav.total += haversine(last[0], last[1], lat, lng);
    nav.line.push([lat, lng]);
    nav.cum.push(nav.total);
  }
}

/** Steps from the API, spread along the geometry in proportion to their lengths. */
function addSteps(nav: NavRoute, coords: LngLat[], steps: Step[], detail?: string): string | undefined {
  const start = nav.total;
  addLine(nav, coords);
  const length = nav.total - start;
  const stepTotal = steps.reduce((sum, s) => sum + s.lengthM, 0);
  let walked = 0;
  steps.forEach((s, i) => {
    const share = stepTotal > 0 ? s.lengthM / stepTotal : 1 / steps.length;
    const from = start + walked;
    walked += share * length;
    nav.steps.push({ label: s.label, icon: s.icon, startM: from, endM: start + walked, detail: i === 0 ? detail : undefined });
  });
  return steps.length ? undefined : detail;
}

function empty(): NavRoute {
  return { line: [], cum: [], total: 0, steps: [] };
}

function finish(nav: NavRoute, label: string): NavRoute {
  if (!nav.steps.length) nav.steps.push({ label, icon: "check", startM: 0, endM: nav.total });
  nav.steps[nav.steps.length - 1].endM = nav.total;
  return nav;
}

/** A walk or roll: the route line and its step-by-step list. */
export function navFromWalk(coords: LngLat[], steps: Step[] | undefined): NavRoute {
  const nav = empty();
  addSteps(nav, coords, steps ?? []);
  return finish(nav, "Follow the route");
}

/** A public transport trip: walks with their steps, then each ride as one step. Station paths (lifts, level
 *  paths) become the detail line of the step that follows them. */
export function navFromLegs(legs: Leg[]): NavRoute {
  const nav = empty();
  let pending: string | undefined;
  for (const leg of legs) {
    if (leg.kind === "station") {
      const path = leg.path.map((p) => p.label).join(", ");
      pending = path ? `At ${leg.station}: ${path}` : `Go through ${leg.station}`;
      continue;
    }
    if (leg.kind === "walk") {
      pending = addSteps(nav, leg.geometry.coordinates, leg.steps, pending);
      continue;
    }
    const startM = nav.total;
    addLine(nav, leg.geometry.coordinates.length ? leg.geometry.coordinates
      : [[leg.from.lng, leg.from.lat], [leg.to.lng, leg.to.lat]]);
    const stops = `${leg.stops} stop${leg.stops === 1 ? "" : "s"}`;
    nav.steps.push({ label: `${leg.label} towards ${leg.headsign}`, icon: "ride", startM, endM: nav.total,
      detail: pending ?? `${stops} to ${leg.to.name}` });
    pending = undefined;
  }
  if (pending) nav.steps.push({ label: pending, icon: "lift", startM: nav.total, endM: nav.total });
  return finish(nav, "Follow the route");
}

/** The nearest point on the route. Going backwards is penalised so a route that doubles back doesn't jump. */
export function locate(nav: NavRoute, lat: number, lng: number, hintM = 0): NavFix | null {
  if (nav.line.length < 2) return null;
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110540;
  let best: { score: number; fix: NavFix } | null = null;
  for (let i = 1; i < nav.line.length; i++) {
    const [aLat, aLng] = nav.line[i - 1];
    const [bLat, bLng] = nav.line[i];
    const ax = (aLng - lng) * kx, ay = (aLat - lat) * ky;
    const bx = (bLng - lng) * kx, by = (bLat - lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const px = ax + dx * t, py = ay + dy * t;
    const offM = Math.hypot(px, py);
    const alongM = nav.cum[i - 1] + (nav.cum[i] - nav.cum[i - 1]) * t;
    const score = offM + Math.max(0, hintM - alongM - 20) * 0.5;
    if (!best || score < best.score) {
      best = { score, fix: { alongM, offM, point: [aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t] } };
    }
  }
  return best?.fix ?? null;
}

/** Which step you're on at `alongM` metres, and how far to the next one. */
export function progressAt(nav: NavRoute, alongM: number): NavProgress {
  let index = 0;
  nav.steps.forEach((s, i) => {
    if (s.startM <= alongM + STEP_LEAD_M) index = i;
  });
  const next = nav.steps[index + 1] ?? null;
  const remainingM = Math.max(0, nav.total - alongM);
  return {
    index,
    current: nav.steps[index],
    next,
    toNextM: Math.max(0, (next ? next.startM : nav.total) - alongM),
    remainingM,
    arrived: remainingM <= ARRIVED_M,
  };
}

/** The point `metres` along the route (for previewing the walk). */
export function pointAlong(nav: NavRoute, metres: number): LatLng | null {
  if (!nav.line.length) return null;
  const m = Math.max(0, Math.min(nav.total, metres));
  for (let i = 1; i < nav.line.length; i++) {
    if (nav.cum[i] >= m) {
      const span = nav.cum[i] - nav.cum[i - 1];
      const t = span === 0 ? 0 : (m - nav.cum[i - 1]) / span;
      const [aLat, aLng] = nav.line[i - 1];
      const [bLat, bLng] = nav.line[i];
      return [aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t];
    }
  }
  return nav.line[nav.line.length - 1];
}

/** The part of the route already behind you, for drawing it greyed out. */
export function walkedLine(nav: NavRoute, fix: NavFix): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < nav.line.length && nav.cum[i] < fix.alongM; i++) out.push(nav.line[i]);
  if (out.length) out.push(fix.point);
  return out;
}

export type TurnDir = "left" | "right" | "slight left" | "slight right";

export interface Turn {
  atM: number;
  dir: TurnDir;
}

/** Corners sharper than this are announced; gentler bends in a footpath aren't. */
const TURN_DEG = 45;
/** Up to this, a turn is "keep left/right". */
const SLIGHT_DEG = 65;
/** How far before and after a corner the direction is measured, so small kinks in the footpath don't count. */
const TURN_ARM_M = 15;

function bearing(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * toRad) * Math.cos(b[0] * toRad);
  const x = Math.cos(a[0] * toRad) * Math.sin(b[0] * toRad)
    - Math.sin(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.cos((b[1] - a[1]) * toRad);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Where the route turns, and which way. Clockwise is right. */
export function turnsOf(nav: NavRoute): Turn[] {
  const found: { atM: number; delta: number }[] = [];
  for (let i = 1; i < nav.line.length - 1; i++) {
    const atM = nav.cum[i];
    if (atM < TURN_ARM_M || atM > nav.total - TURN_ARM_M) continue;
    const before = pointAlong(nav, atM - TURN_ARM_M);
    const after = pointAlong(nav, atM + TURN_ARM_M);
    if (!before || !after) continue;
    let delta = bearing(nav.line[i], after) - bearing(before, nav.line[i]);
    delta = ((delta + 540) % 360) - 180;
    if (Math.abs(delta) < TURN_DEG) continue;
    const last = found[found.length - 1];
    if (last && atM - last.atM < 20) {
      if (Math.abs(delta) > Math.abs(last.delta)) found[found.length - 1] = { atM, delta };
      continue;
    }
    found.push({ atM, delta });
  }
  // A route that doubles back is the line looping round a lift or a crossing in the map data, not a real U-turn.
  return found.filter(({ delta }) => Math.abs(delta) <= 150).map(({ atM, delta }) => {
    const side = delta > 0 ? "right" : "left";
    return { atM, dir: Math.abs(delta) < SLIGHT_DEG ? (`slight ${side}` as TurnDir) : side };
  });
}

/** The next turn ahead of `alongM`, if any. */
export function nextTurn(turns: Turn[], alongM: number): Turn | null {
  return turns.find((t) => t.atM > alongM) ?? null;
}

export function turnPhrase(dir: TurnDir): string {
  return dir.startsWith("slight") ? `Keep ${dir.replace("slight ", "")}` : `Turn ${dir}`;
}

/** Text for the screen reads well; aloud it needs whole words: "m" becomes "metres", "%" becomes "percent". */
export function speakable(text: string): string {
  return text
    .replace(/(\d+(?:\.\d+)?)\s?km\b/g, "$1 kilometres")
    .replace(/(\d+)\s?m\b/g, (_, n) => `${n} ${n === "1" ? "metre" : "metres"}`)
    .replace(/(\d+(?:\.\d+)?)\s?%/g, "$1 percent");
}

/** A step as an instruction to say: "Go straight on a flat footpath for 61 metres", "Use the lift at north exit". */
export function spokenStep(step: NavStep): string {
  const label = step.label;
  const length = label.match(/,\s*(\d+ m)$/)?.[1];
  const plain = label.replace(/,\s*\d+ m$/, "");
  let line: string;
  if (step.icon === "lift") line = /^lift/i.test(plain) ? `Use the ${plain.charAt(0).toLowerCase()}${plain.slice(1)}` : plain;
  else if (step.icon === "crossing" || /kerb ramp|crossing/i.test(plain)) line = `Cross using the ${plain.replace(/ at crossing$/i, "").toLowerCase()}`;
  else if (step.icon === "ride") line = `Take the ${plain}`;
  else if (step.icon === "slope") line = `${plain} ahead`;
  else if (step.icon === "check") line = `Go straight on the ${plain.toLowerCase()}`;
  else line = plain;
  const text = length ? `${line} for ${length}` : line;
  return speakable([text, step.detail].filter(Boolean).join(". "));
}

/** "40 m" under a kilometre, "1.2 km" above. Rounded so the number doesn't flicker as you move. */
export function distanceText(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  if (m >= 100) return `${Math.round(m / 10) * 10} m`;
  return `${Math.max(0, Math.round(m / 5) * 5)} m`;
}
