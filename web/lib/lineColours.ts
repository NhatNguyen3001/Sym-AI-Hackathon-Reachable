// Line colours from the Transport for NSW network maps, so a ride looks like the line people know.
import type { RideLeg } from "./types";

const LINES: Record<string, string> = {
  T1: "#F99D1C", // North Shore & Western: yellow
  T2: "#0098CD", // Leppington & Inner West: blue
  T3: "#F37021", // Liverpool & Inner West: orange
  T4: "#005AA3", // Eastern Suburbs & Illawarra
  T5: "#C4258F", // Cumberland
  T6: "#7D3F21", // Lidcombe & Bankstown: brown
  T7: "#6F818E", // Olympic Park: grey
  T8: "#00954C", // Airport & South
  T9: "#D11F2F", // Northern: red
  BMT: "#F99D1C", // Blue Mountains
  CCN: "#D11F2F", // Central Coast & Newcastle
  HUN: "#833134", // Hunter
  SCO: "#005AA3", // South Coast
  SHL: "#00954C", // Southern Highlands
  M1: "#168388", // Metro North West & Bankstown
  L1: "#BE1622",
  L2: "#DD1E25",
  L3: "#781140",
};

/** Buses, coaches and anything we don't know a colour for. */
export const DEFAULT_RIDE_COLOUR = "#15201B";

export function lineColour(leg: Pick<RideLeg, "line">): string {
  return LINES[leg.line.trim().toUpperCase()] ?? DEFAULT_RIDE_COLOUR;
}
