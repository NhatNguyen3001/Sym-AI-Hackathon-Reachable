"use client";
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { WarnBanner } from "@/components/Banners";
import { FilterChips } from "@/components/FilterChips";
import { Card } from "@/components/layout/Page";
import { ApiError, parseProfile } from "@/lib/api";
import { AID_DEFAULTS, AID_LABELS, loadProfile, saveProfile } from "@/lib/profile";
import { profile as defaultProfile } from "@/lib/placeholder";
import type { Aid, Profile } from "@/lib/types";

const AID_OPTIONS = (Object.keys(AID_LABELS) as Aid[]).map((value) => ({ value, label: AID_LABELS[value] }));

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <label htmlFor={id} className="cursor-pointer text-[16px]">{label}</label>
    </div>
  );
}

export function NeedsClient() {
  const router = useRouter();
  const [p, setP] = useState<Profile>(defaultProfile);
  const [text, setText] = useState(defaultProfile.text);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadProfile();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setP(saved);
    setText(saved.text);
  }, []);

  async function fromText() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setStatus("");
    try {
      const parsed = await parseProfile(text);
      setP({ ...parsed, text });
      setStatus("Settings updated from your description. Check them below.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn't read that. Try again or set things below.");
    } finally {
      setBusy(false);
    }
  }

  function chooseAid(aid: Aid) {
    setP((cur) => ({ ...cur, aid, maxSlope: AID_DEFAULTS[aid].maxSlope, avoid: AID_DEFAULTS[aid].avoid }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    saveProfile({ ...p, text });
    router.push("/plan");
  }

  const setAvoid = (k: keyof Profile["avoid"]) => (v: boolean) => setP((c) => ({ ...c, avoid: { ...c.avoid, [k]: v } }));
  const setDest = (k: keyof Profile["destination"]) => (v: boolean) => setP((c) => ({ ...c, destination: { ...c.destination, [k]: v } }));

  return (
    <div className="flex flex-wrap gap-6">
      <div className="min-w-0 flex-[1_1_440px]">
        <Card className="space-y-4">
          <label htmlFor="needs-text" className="block text-[18px] font-bold">In your own words</label>
          <Textarea id="needs-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000}
            aria-describedby="needs-privacy" />
          <Button type="button" variant="secondary" onClick={fromText} disabled={busy || !text.trim()}>
            {busy ? "Reading your description…" : "Update my settings from this"}
          </Button>
          <p role="status" className="font-bold text-primary">{status}</p>
          {error && <WarnBanner alert>{error}</WarnBanner>}
          <p id="needs-privacy" className="text-[15px] text-muted">Saved on this device only. We don&apos;t share your needs with anyone.</p>
        </Card>
      </div>

      <form onSubmit={save} className="min-w-0 flex-[1_1_480px]">
        <Card className="space-y-7">
          <h2 className="text-[22px] font-bold">Your route settings</h2>

          <fieldset>
            <legend className="mb-3 text-[18px] font-bold">How do you get around?</legend>
            <FilterChips label="How do you get around?" options={AID_OPTIONS} value={p.aid} onChange={chooseAid} />
          </fieldset>

          <div>
            <p id="slope-label" className="text-[18px] font-bold">Steepest slope I can manage</p>
            <p aria-hidden="true" className="mt-1 text-[32px] leading-none font-bold text-primary">{p.maxSlope}%</p>
            <Slider className="mt-4" min={2} max={12} step={1} value={[p.maxSlope]}
              onValueChange={([v]) => setP((c) => ({ ...c, maxSlope: v }))}
              thumbProps={{ "aria-labelledby": "slope-label", "aria-valuetext": `${p.maxSlope} percent` }} />
            <div className="mt-2 flex justify-between text-[14px] text-muted" aria-hidden="true">
              <span>Almost flat</span><span>Steep</span>
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-[18px] font-bold">Avoid</legend>
            <Check label="Stairs and steps" checked={p.avoid.stairs} onChange={setAvoid("stairs")} />
            <Check label="Kerbs without a ramp" checked={p.avoid.kerbsNoRamp} onChange={setAvoid("kerbsNoRamp")} />
            <Check label="Slippery paths when it rains" checked={p.avoid.slipperyWhenWet} onChange={setAvoid("slipperyWhenWet")} />
            <Check label="Gravel, grass and uneven ground" checked={p.avoid.uneven} onChange={setAvoid("uneven")} />
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-[18px] font-bold">At my destination I need</legend>
            <Check label="Level or ramped entrance" checked={p.destination.entrance} onChange={setDest("entrance")} />
            <Check label="Accessible toilet" checked={p.destination.toilet} onChange={setDest("toilet")} />
            <Check label="Accessible parking nearby" checked={p.destination.parking} onChange={setDest("parking")} />
          </fieldset>

          <Button type="submit" size="lg" className="w-full">Save and plan a trip</Button>
        </Card>
      </form>
    </div>
  );
}
