// The user's needs and recent trips live on this device only (localStorage), never on the server.
import { profile as DEFAULT_PROFILE } from "./placeholder";
import type { Aid, Profile, Trip } from "./types";

const PROFILE_KEY = "reachable.profile";
const TRIPS_KEY = "reachable.trips";
const AIDS: Aid[] = ["manual_wheelchair", "power_wheelchair", "walker", "cane", "pram"];

/** Sensible defaults when someone picks how they get around. */
export const AID_DEFAULTS: Record<Aid, Pick<Profile, "maxSlope"> & { avoid: Profile["avoid"] }> = {
  manual_wheelchair: { maxSlope: 5, avoid: { stairs: true, kerbsNoRamp: true, slipperyWhenWet: true, uneven: true } },
  power_wheelchair: { maxSlope: 8, avoid: { stairs: true, kerbsNoRamp: true, slipperyWhenWet: true, uneven: false } },
  walker: { maxSlope: 6, avoid: { stairs: true, kerbsNoRamp: true, slipperyWhenWet: true, uneven: true } },
  cane: { maxSlope: 8, avoid: { stairs: false, kerbsNoRamp: false, slipperyWhenWet: true, uneven: true } },
  pram: { maxSlope: 8, avoid: { stairs: true, kerbsNoRamp: true, slipperyWhenWet: false, uneven: false } },
};

export const AID_LABELS: Record<Aid, string> = {
  manual_wheelchair: "Manual wheelchair",
  power_wheelchair: "Power wheelchair",
  walker: "Walker or frame",
  cane: "Cane or crutches",
  pram: "Pram or stroller",
};

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: the app still works, it just won't remember.
  }
}

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

export function loadProfile(): Profile {
  const p = read(PROFILE_KEY) as Partial<Profile> | null;
  if (!p || typeof p !== "object") return DEFAULT_PROFILE;
  const d = DEFAULT_PROFILE;
  const slope = typeof p.maxSlope === "number" ? Math.min(12, Math.max(2, Math.round(p.maxSlope))) : d.maxSlope;
  return {
    aid: AIDS.includes(p.aid as Aid) ? (p.aid as Aid) : d.aid,
    maxSlope: slope,
    avoid: {
      stairs: bool(p.avoid?.stairs, d.avoid.stairs),
      kerbsNoRamp: bool(p.avoid?.kerbsNoRamp, d.avoid.kerbsNoRamp),
      slipperyWhenWet: bool(p.avoid?.slipperyWhenWet, d.avoid.slipperyWhenWet),
      uneven: bool(p.avoid?.uneven, d.avoid.uneven),
    },
    destination: {
      entrance: bool(p.destination?.entrance, d.destination.entrance),
      toilet: bool(p.destination?.toilet, d.destination.toilet),
      parking: bool(p.destination?.parking, d.destination.parking),
    },
    text: typeof p.text === "string" ? p.text : d.text,
  };
}

export function saveProfile(p: Profile) {
  write(PROFILE_KEY, p);
}

export function loadTrips(): Trip[] {
  const t = read(TRIPS_KEY);
  return Array.isArray(t) ? t.filter((x) => x && typeof x.toId === "string" && typeof x.fromId === "string").slice(0, 3) : [];
}

export function addTrip(trip: Trip) {
  const rest = loadTrips().filter((t) => !(t.fromId === trip.fromId && t.toId === trip.toId));
  write(TRIPS_KEY, [trip, ...rest].slice(0, 3));
}
