import type { Leg, RideLeg, TripOption } from "./types";

const TIME = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Sydney" });

/** "5:05 pm" in Sydney time. Some ICU builds put a narrow no-break space before "pm"; normalise it. */
export const timeOfDay = (iso: string) => TIME.format(new Date(iso)).replace(/\s/g, " ").toLowerCase();

export function optionTitle(o: TripOption): string {
  const firstRide = o.legs.find((l): l is RideLeg => l.kind === "ride");
  return `${o.minutes} min · ${o.mode === "walk" || !firstRide ? "Walk or roll" : firstRide.label}`;
}

export const optionTimes = (o: TripOption) =>
  o.leaveAt && o.arriveAt ? `Leave ${timeOfDay(o.leaveAt)}, arrive ${timeOfDay(o.arriveAt)}` : "";

export function legTitle(leg: Leg): string {
  if (leg.kind === "walk") return `Walk ${leg.minutes} min to ${leg.to}`;
  if (leg.kind === "station") return `At ${leg.station}`;
  return `${leg.label} towards ${leg.headsign}`;
}

export function rideDetail(leg: RideLeg): string {
  const parts = [leg.from.platform, `departs ${timeOfDay(leg.departAt)}`, `${leg.stops} stop${leg.stops === 1 ? "" : "s"}`];
  if (leg.wheelchairAccessible) parts.push("wheelchair accessible");
  return parts.filter(Boolean).join(" · ");
}

/** The option with this id, or the best one. */
export const selectOption = (options: TripOption[] | undefined, id: string | null) =>
  options?.find((o) => o.id === id) ?? options?.[0];

export interface WayGroup {
  wayId: string;
  options: TripOption[];
}

/** One group per way, in the API's order (best way first; departures in leaving order). */
export function groupWays(options: TripOption[]): WayGroup[] {
  const groups: WayGroup[] = [];
  for (const o of options) {
    const wayId = o.wayId ?? o.id;
    const g = groups.find((x) => x.wayId === wayId);
    if (g) g.options.push(o);
    else groups.push({ wayId, options: [o] });
  }
  return groups;
}

/** Cards are worth showing when there's a choice: more than one way, or more than one departure. */
export const showsCards = (options: TripOption[] | undefined) =>
  !!options && (groupWays(options).length > 1 || options.length > 1);
