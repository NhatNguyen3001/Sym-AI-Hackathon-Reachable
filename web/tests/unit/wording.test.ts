import { expect, test } from "vitest";
import {
  aboutMetres, difficulty, difficultyText, feelChoice, FEEL_CHOICES, liftText, routeTrust, spokenText, stepText, trust,
} from "@/lib/wording";
import { profile as base } from "@/lib/placeholder";
import type { Profile, Step } from "@/lib/types";

const withLimit = (maxSlope: number): Profile => ({ ...base, maxSlope });

test("how hard a slope is depends on your own limit", () => {
  // limit 5 (gentle only)
  expect(difficulty(2, 5, true)).toBe("easy");
  expect(difficulty(2.5, 5, true)).toBe("easy");
  expect(difficulty(3.5, 5, true)).toBe("tiring");
  expect(difficulty(5, 5, true)).toBe("hard");
  expect(difficulty(6, 5, true)).toBe("too-steep");
  // the same 6% for someone who manages most hills
  expect(difficulty(6, 8, true)).toBe("tiring");
  expect(difficulty(6, 12, true)).toBe("easy");
  expect(difficulty(0, 5, true)).toBe("flat");
});

test("a slope we didn't measure is never called easy", () => {
  expect(difficulty(2, 5, false)).toBe("unknown");
  expect(difficulty(null, 5, true)).toBe("unknown");
  expect(difficultyText("unknown")).toBe("Path, hills not measured");
});

test("difficulty words", () => {
  expect(difficultyText("flat")).toBe("Flat path");
  expect(difficultyText("easy")).toBe("Easy slope");
  expect(difficultyText("tiring")).toBe("A bit tiring");
  expect(difficultyText("hard")).toBe("Hard, you may want help");
  expect(difficultyText("too-steep")).toBe("Too steep for you");
});

const step = (s: Partial<Step>): Step => ({ icon: "check", label: "", confidence: "Confirmed", lengthM: 90, ...s });

test("steps in plain words, for this person", () => {
  expect(stepText(step({ kind: "slope", slope: 3, measured: true, lengthM: 92 }), withLimit(8))).toBe("Easy slope · about 90 m");
  expect(stepText(step({ kind: "slope", slope: 4, measured: true, lengthM: 40 }), withLimit(5))).toBe("A bit tiring · about 40 m");
  expect(stepText(step({ kind: "flat", lengthM: 61 }), withLimit(5))).toBe("Flat path · about 60 m");
  expect(stepText(step({ kind: "path", measured: false, lengthM: 330 }), withLimit(5))).toBe("Path, hills not measured · about 330 m");
  expect(stepText(step({ kind: "crossing", icon: "crossing", label: "Kerb ramp at crossing" }), withLimit(5))).toBe("Crossing with a kerb ramp");
  expect(stepText(step({ kind: "crossing", icon: "alert", confidence: "Not sure", label: "Kerb ramp at crossing" }), withLimit(5)))
    .toBe("Crossing, kerb ramp not confirmed");
  expect(stepText(step({ kind: "lift", icon: "lift", label: "Lift at north exit" }), withLimit(5))).toBe("Use the lift at the north exit");
  expect(stepText(step({ kind: "steps", label: "Steps, 12 m", lengthM: 12 }), withLimit(5))).toBe("Steps · a few metres");
});

test("a step from an older API (no facts) keeps its label", () => {
  expect(stepText(step({ label: "Gentle slope, up to 3%, 92 m" }), withLimit(5))).toBe("Gentle slope, up to 3%, 92 m");
});

test("trust words, each with its own mark", () => {
  expect(trust("Confirmed")).toEqual({ text: "Checked today", mark: "tick" });
  expect(trust("Confirmed today")).toEqual({ text: "Checked today", mark: "tick" });
  expect(trust("Measured")).toEqual({ text: "Measured", mark: "ruler" });
  expect(trust("Likely")).toEqual({ text: "Probably OK", mark: "half" });
  expect(trust("Needs checking")).toEqual({ text: "Someone reported this", mark: "dotted" });
  expect(trust("Not sure")).toEqual({ text: "We don't know", mark: "question" });
  expect(trust("Not checked")).toEqual({ text: "No information yet", mark: "dash" });
  expect(trust("Not found")).toEqual({ text: "No information yet", mark: "dash" });
  expect(new Set(["tick", "ruler", "half", "dotted", "question", "dash"]).size).toBe(6);
});

test("lift words", () => {
  expect(liftText("Out of service")).toBe("Not working");
  expect(liftText("Not sure")).toBe("We haven't heard today");
  expect(liftText("Working")).toBe("Working");
});

test("rounded distances", () => {
  expect(aboutMetres(61)).toBe("about 60 m");
  expect(aboutMetres(330)).toBe("about 330 m");
  expect(aboutMetres(12)).toBe("a few metres");
  expect(aboutMetres(1240)).toBe("about 1.2 km");
});

test("how steep can you go, by feel", () => {
  expect(FEEL_CHOICES.map((c) => [c.label, c.maxSlope])).toEqual([["Gentle only", 5], ["Some hills", 8], ["Most hills", 12]]);
  expect(feelChoice(5)).toBe("Gentle only");
  expect(feelChoice(6)).toBe("Some hills");
  expect(feelChoice(12)).toBe("Most hills");
});

test("spoken steps use the same words, as whole sentences", () => {
  expect(spokenText(step({ kind: "flat", lengthM: 61 }), withLimit(5))).toBe("Go straight for about 60 metres");
  expect(spokenText(step({ kind: "slope", slope: 2, lengthM: 92 }), withLimit(5))).toBe("Easy slope ahead, for about 90 metres");
  expect(spokenText(step({ kind: "slope", slope: 3, lengthM: 92 }), withLimit(5))).toBe("A tiring slope ahead, for about 90 metres");
  expect(spokenText(step({ kind: "slope", slope: 5, lengthM: 40 }), withLimit(5)))
    .toBe("A hard slope ahead, you may want help, for about 40 metres");
  expect(spokenText(step({ kind: "path", lengthM: 330 }), withLimit(5)))
    .toBe("Go straight for about 330 metres. Hills here aren't measured");
  expect(spokenText(step({ kind: "crossing", confidence: "Not sure", label: "Kerb ramp at crossing" }), withLimit(5)))
    .toBe("Crossing ahead. The kerb ramp is not confirmed, check before you cross");
  expect(spokenText(step({ kind: "lift", label: "Lift at north exit" }), withLimit(5))).toBe("Use the lift at the north exit");
});

test("a route's trust badge in plain words", () => {
  const steps = [step({ confidence: "Not sure" }), step({ confidence: "Confirmed" }), step({ confidence: "Not sure" })];
  expect(routeTrust("Some details not sure", steps)).toBe("2 things we couldn't check");
  expect(routeTrust("Some details not sure", [step({ confidence: "Not sure" })])).toBe("1 thing we couldn't check");
  expect(routeTrust("Slopes estimated", [])).toBe("Hills not measured");
  expect(routeTrust("Confirmed today", [])).toBe("Checked today");
});
