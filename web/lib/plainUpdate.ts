import type { UpdateItem, UpdateType } from "./types";

const KIND: Record<UpdateType, string> = {
  report: "Report from a traveller",
  roadworks: "Road or path works",
  transport: "Station lift",
  weather: "Weather",
  venue: "Building access",
};

const STATUS: Record<string, string> = {
  Confirmed: "In effect",
  "Needs checking": "Someone reported this",
  Resolved: "Cleared",
  Active: "Happening now",
  Updated: "Refreshed",
};

export interface PlainUpdate {
  kind: string;
  statusLabel: string;
  effect: string;
  sources: string[];
  demo: boolean;
}

/** Plain-language reading of a live update, for someone who is not a developer. */
export function explainUpdate(item: UpdateItem): PlainUpdate {
  const demo = /demo data/i.test(item.source);
  const sources = item.source
    .split(";")
    .map((part) => part.replace(/\s*\(demo data\)/gi, "").trim())
    .filter(Boolean);
  return {
    kind: KIND[item.type] ?? "Update",
    statusLabel: STATUS[item.status] ?? item.status,
    effect: effectOf(item),
    sources: sources.length ? sources : ["Source not recorded"],
    demo,
  };
}

function effectOf(item: UpdateItem): string {
  const title = item.title.toLowerCase();
  if (item.status === "Resolved") {
    return "This has been cleared. People should be able to get through here again.";
  }
  if (item.type === "transport" || title.includes("lift")) {
    return "This lift cannot be used. Anyone who needs a step-free exit has to use another one.";
  }
  if (item.type === "roadworks" || /works|fencing|blocked|detour|closure/.test(title)) {
    return "The usual path is blocked or diverted. A step-free route should go around it.";
  }
  if (item.type === "weather" || title.includes("rain")) {
    return "Paths may be wet and slippery. A route can prefer a drier way while this lasts.";
  }
  if (/ramp|kerb|curb/.test(title)) {
    return "A ramp or kerb may be hard or impossible to use. Treat this as uncertain until it is checked.";
  }
  if (item.type === "venue") {
    return "This is about getting into the building, not the footpath outside.";
  }
  if (item.status === "Needs checking") {
    return "Someone reported a problem. It is not confirmed yet, so it is not treated as certain.";
  }
  return "This may change whether a step-free route can use this place.";
}
