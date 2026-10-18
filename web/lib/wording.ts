// Plain wording (cycle 6): how hard a stretch is for *you*, and whether to trust what we say. The API keeps its
// codes ("Likely", "Out of service", slope %); this is the one place they become words people use.
import type { Profile, Step } from "./types";

export type Difficulty = "flat" | "easy" | "tiring" | "hard" | "too-steep" | "unknown";

/** How hard a slope is against your own limit. `known`: we have a real slope for it (never "easy" otherwise). */
export function difficulty(slope: number | null | undefined, limit: number, known: boolean): Difficulty {
  if (!known || slope === null || slope === undefined) return "unknown";
  if (slope <= 0) return "flat";
  if (slope <= limit * 0.5) return "easy";
  if (slope <= limit * 0.8) return "tiring";
  if (slope <= limit) return "hard";
  return "too-steep";
}

const DIFFICULTY: Record<Difficulty, string> = {
  flat: "Flat path",
  easy: "Easy slope",
  tiring: "A bit tiring",
  hard: "Hard, you may want help",
  "too-steep": "Too steep for you",
  unknown: "Path, hills not measured",
};

export const difficultyText = (d: Difficulty) => DIFFICULTY[d];

/** "about 60 m", "a few metres", "about 1.2 km": rounded, because nobody walks 61 m on purpose. */
export function aboutMetres(m: number): string {
  if (m < 20) return "a few metres";
  if (m >= 1000) return `about ${(m / 1000).toFixed(1)} km`;
  return `about ${Math.round(m / 10) * 10} m`;
}

/** A route step as people say it, for this person. Older API answers (no `kind`) keep their label. */
export function stepText(step: Step, profile: Profile): string {
  const unsure = step.confidence === "Not sure";
  switch (step.kind) {
    case "slope": {
      const d = difficulty(step.slope, profile.maxSlope, step.slope !== null && step.slope !== undefined);
      return `${difficultyText(d)} · ${aboutMetres(step.lengthM)}`;
    }
    case "flat":
      return `${difficultyText("flat")} · ${aboutMetres(step.lengthM)}`;
    case "path":
      return `${difficultyText("unknown")} · ${aboutMetres(step.lengthM)}`;
    case "steps":
      return `Steps · ${aboutMetres(step.lengthM)}`;
    case "crossing":
      return unsure ? "Crossing, kerb ramp not confirmed" : "Crossing with a kerb ramp";
    case "lift": {
      const where = step.label.replace(/^Lift at /i, "");
      return `Use the lift at the ${where}`;
    }
    default:
      return step.label;
  }
}

export type TrustMark = "tick" | "ruler" | "half" | "dotted" | "question" | "dash";

/** Whether to trust it: words plus a mark with its own shape (never colour alone). */
export function trust(code: string): { text: string; mark: TrustMark } {
  switch (code) {
    case "Confirmed":
    case "Confirmed today":
      return { text: "Checked today", mark: "tick" };
    case "Measured":
      return { text: "Measured", mark: "ruler" };
    case "Likely":
      return { text: "Probably OK", mark: "half" };
    case "Needs checking":
      return { text: "Someone reported this", mark: "dotted" };
    case "Not sure":
      return { text: "We don't know", mark: "question" };
    default:
      return { text: "No information yet", mark: "dash" };
  }
}

/** Lift status as people say it. */
export function liftText(status: string): string {
  if (status === "Out of service") return "Not working";
  if (status === "Not sure") return "We haven't heard today";
  return status;
}

/** "How steep can you go?" by feel; each choice is a slope limit the router already uses. */
export const FEEL_CHOICES = [
  { label: "Gentle only", maxSlope: 5 },
  { label: "Some hills", maxSlope: 8 },
  { label: "Most hills", maxSlope: 12 },
] as const;

/** The choice that fits a stored limit (a custom 6 shows as "Some hills"). */
export function feelChoice(maxSlope: number): (typeof FEEL_CHOICES)[number]["label"] {
  if (maxSlope <= 5) return "Gentle only";
  if (maxSlope <= 8) return "Some hills";
  return "Most hills";
}

const SAY: Record<Difficulty, string> = {
  flat: "Go straight",
  easy: "Easy slope ahead",
  tiring: "A tiring slope ahead",
  hard: "A hard slope ahead, you may want help",
  "too-steep": "A slope too steep for you ahead",
  unknown: "Go straight",
};

/** Aloud, distances need whole words: "about 60 metres". */
const sayMetres = (m: number) => aboutMetres(m).replace(/ km$/, " kilometres").replace(/ m$/, " metres");

/** The same step as a spoken sentence (guidance voice). */
export function spokenText(step: Step, profile: Profile): string {
  const unsure = step.confidence === "Not sure";
  switch (step.kind) {
    case "flat":
      return `Go straight for ${sayMetres(step.lengthM)}`;
    case "slope": {
      const d = difficulty(step.slope, profile.maxSlope, step.slope !== null && step.slope !== undefined);
      return d === "flat" || d === "unknown" ? `Go straight for ${sayMetres(step.lengthM)}` : `${SAY[d]}, for ${sayMetres(step.lengthM)}`;
    }
    case "path":
      return `Go straight for ${sayMetres(step.lengthM)}. Hills here aren't measured`;
    case "steps":
      return `Steps ahead, for ${sayMetres(step.lengthM)}`;
    case "crossing":
      return unsure ? "Crossing ahead. The kerb ramp is not confirmed, check before you cross" : "Cross using the kerb ramp";
    case "lift":
      return stepText(step, profile);
    default:
      return step.label;
  }
}

/** A whole route's trust badge: how many things we couldn't check, rather than "Some details not sure". */
export function routeTrust(status: string, steps: Step[]): string {
  if (status === "Some details not sure") {
    const n = steps.filter((s) => s.confidence === "Not sure").length;
    if (n === 0) return "Some things we couldn't check";
    return `${n} thing${n === 1 ? "" : "s"} we couldn't check`;
  }
  if (status === "Slopes estimated") return "Hills not measured";
  if (status === "Confirmed today") return "Checked today";
  return status;
}

/** The trust code to show next to a lift: we know it's working or not, unless we haven't heard. */
export const liftTrust = (status: string) => (status === "Not sure" ? "Not sure" : "Confirmed");

const FIELDS: Record<string, string> = {
  "Level entrance": "Entrance without steps",
  "Step-free inside": "No steps inside",
};

/** A destination check line in plain words (the API's field names stay as codes the route page matches on). */
export const fieldText = (field: string) => FIELDS[field] ?? field;

/** A whole route's hills in a few words: "easy all the way", "one hard bit", "hills not measured". */
export function hillsSummary(steps: Step[], profile: Profile): string {
  const walked = steps.filter((s) => s.kind === "flat" || s.kind === "slope" || s.kind === "path");
  if (!walked.length || walked.some((s) => s.kind === "path")) return "hills not measured";
  const levels = walked.map((s) => (s.kind === "flat" ? "flat" : difficulty(s.slope, profile.maxSlope, s.slope != null)));
  const hard = levels.filter((d) => d === "hard" || d === "too-steep").length;
  if (hard === 1) return "one hard bit";
  if (hard > 1) return `${hard} hard bits`;
  if (levels.includes("tiring")) return "a bit tiring in places";
  return "easy all the way";
}
