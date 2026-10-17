"use client";
import { AID_LABELS, withAid } from "@/lib/profile";
import type { Aid, Profile } from "@/lib/types";
import { cn } from "cn";

const AIDS = Object.keys(AID_LABELS) as Aid[];
const SLOPES = [5, 8, 12];

const AVOID: { key: keyof Profile["avoid"]; label: string }[] = [
  { key: "stairs", label: "Stairs and steps" },
  { key: "kerbsNoRamp", label: "Kerbs without a ramp" },
  { key: "slipperyWhenWet", label: "Slippery paths when it rains" },
  { key: "uneven", label: "Gravel, grass and uneven ground" },
];

const DEST: { key: keyof Profile["destination"]; label: string }[] = [
  { key: "entrance", label: "Level or ramped entrance" },
  { key: "toilet", label: "Accessible toilet" },
  { key: "parking", label: "Accessible parking nearby" },
];

function Tick({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-left text-[14px] font-bold",
        on ? "border-primary bg-primary text-white" : "border-line-strong bg-surface text-ink",
      )}>
      <span aria-hidden="true" className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border text-[11px] leading-none",
        on ? "border-white bg-white text-primary" : "border-current",
      )}>{on ? "✓" : ""}</span>
      {label}
    </button>
  );
}

/** The same choices as My needs, as tick buttons for the map and the route. */
export function NeedsTicks({ profile, onChange }: { profile: Profile; onChange: (next: Profile) => void }) {
  const slopes = SLOPES.includes(profile.maxSlope) ? SLOPES : [...SLOPES, profile.maxSlope].sort((a, b) => a - b);
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-bold tracking-wide text-muted uppercase">How do you get around?</legend>
        <div className="flex flex-wrap gap-2">
          {AIDS.map((aid) => (
            <Tick key={aid} label={AID_LABELS[aid]} on={profile.aid === aid}
              onClick={() => onChange(withAid(profile, aid))} />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-bold tracking-wide text-muted uppercase">Steepest slope I can manage</legend>
        <div className="flex flex-wrap gap-2">
          {slopes.map((slope) => (
            <Tick key={slope} label={`Up to ${slope}%`} on={profile.maxSlope === slope}
              onClick={() => onChange({ ...profile, maxSlope: slope })} />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-bold tracking-wide text-muted uppercase">Avoid</legend>
        <div className="flex flex-wrap gap-2">
          {AVOID.map((item) => (
            <Tick key={item.key} label={item.label} on={profile.avoid[item.key]}
              onClick={() => onChange({ ...profile, avoid: { ...profile.avoid, [item.key]: !profile.avoid[item.key] } })} />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-bold tracking-wide text-muted uppercase">At my destination I need</legend>
        <div className="flex flex-wrap gap-2">
          {DEST.map((item) => (
            <Tick key={item.key} label={item.label} on={profile.destination[item.key]}
              onClick={() => onChange({
                ...profile,
                destination: { ...profile.destination, [item.key]: !profile.destination[item.key] },
              })} />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
