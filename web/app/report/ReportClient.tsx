"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WarnBanner } from "@/components/Banners";
import { FilterChips, type ChipOption } from "@/components/FilterChips";
import { Card } from "@/components/layout/Page";
import { ApiError, labelPhoto, sendReport } from "@/lib/api";
import type { BarrierLabel } from "@/lib/types";

const PinPicker = dynamic(() => import("@/components/map/PinPicker"), { ssr: false });

const LABELS: ChipOption<BarrierLabel>[] = [
  { value: "blocked", label: "Blocked path" },
  { value: "stairs", label: "Stairs" },
  { value: "broken_ramp", label: "Broken ramp" },
  { value: "slippery", label: "Slippery" },
  { value: "narrow", label: "Too narrow" },
  { value: "fine", label: "Path is fine now" },
];
// Library forecourt: used when the device location isn't available.
const FALLBACK = { lat: -33.77575, lng: 151.1137 };

type Check = { state: "idle" } | { state: "loading" } | { state: "done"; text: string } | { state: "error"; message: string };

export function ReportClient() {
  const [preview, setPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [label, setLabel] = useState<BarrierLabel | null>(null);
  const [note, setNote] = useState("");
  const [loc, setLoc] = useState(FALLBACK);
  const [locNote, setLocNote] = useState("Finding your location…");
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability is only known after mount
      setLocNote("Using the Library forecourt. Change it if you're somewhere else.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocNote("Using your current location.");
      },
      () => setLocNote("Using the Library forecourt. Change it if you're somewhere else."),
      { timeout: 8000 },
    );
  }, []);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setPhotoUrl(null);
    setSent(false);
    setCheck({ state: "loading" });
    try {
      const r = await labelPhoto(file);
      setPhotoUrl(r.photoUrl);
      setCheck({ state: "done", text: r.aiText });
      if (r.aiLabel) setLabel(r.aiLabel);
    } catch (e) {
      setCheck({ state: "error", message: e instanceof ApiError ? e.message : "We couldn't check that photo." });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label) return;
    setSending(true);
    setSendError(null);
    try {
      await sendReport({ photoUrl, lat: loc.lat, lng: loc.lng, userLabel: label, note });
      setSent(true);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "We couldn't send your report. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-6">
      <form onSubmit={onSubmit} className="min-w-0 flex-[1_1_520px] space-y-5" aria-describedby="privacy-note">
        <Card>
          <div className="flex h-[260px] flex-col items-center justify-center gap-3 overflow-hidden rounded-[14px] border-2 border-dashed border-line-strong bg-map-bg p-4 text-center">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={preview} alt="Your photo of the barrier" className="max-h-[170px] rounded-[10px] object-contain" />
            ) : (
              <Camera aria-hidden="true" className="size-10 text-muted" />
            )}
            <input id="photo" type="file" accept="image/*" capture="environment" className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])} />
            <label htmlFor="photo"
              className="inline-flex min-h-12 cursor-pointer items-center rounded-[12px] border border-primary bg-primary px-5 font-bold text-white hover:bg-primary-hover [input:focus-visible+&]:outline-2 [input:focus-visible+&]:outline-offset-2 [input:focus-visible+&]:outline-primary">
              {preview ? "Use a different photo" : "Upload a photo"}
            </label>
          </div>

          <div className="mt-5 rounded-[14px] bg-bg p-4">
            <p className="text-[13px] font-bold tracking-wide text-muted uppercase">AI check</p>
            <div role="status" className="mt-1">
              {check.state === "idle" && <p className="text-muted">Add a photo and we&apos;ll check what it shows.</p>}
              {check.state === "loading" && <p className="font-bold">Checking your photo…</p>}
              {check.state === "done" && (
                <p className="font-bold">{check.text || "We couldn't tell what this shows. Pick the closest option below."}</p>
              )}
            </div>
            {check.state === "error" && <p role="alert" className="mt-1 font-bold text-warn-strong">{check.message}</p>}
            <p className="mt-1 text-[14px] text-muted">{locNote}</p>
          </div>
        </Card>

        <Card>
          <fieldset>
            <legend className="mb-3 text-[18px] font-bold">Is this right? Change it if not.</legend>
            <FilterChips label="Type of barrier" options={LABELS} value={label} onChange={(v) => { setLabel(v); setSent(false); }} />
          </fieldset>

          <div className="mt-6">
            <label htmlFor="note" className="mb-1.5 block text-[16px] font-bold">Anything else? <span className="font-normal text-muted">(optional)</span></label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
          </div>

          <div className="mt-6">
            <p className="text-[16px] font-bold">Location</p>
            <p className="text-[15px] text-muted">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</p>
            <Button type="button" variant="link" className="min-h-11 px-0" aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
              {picking ? "Done choosing location" : "Change location"}
            </Button>
            {picking && (
              <PinPicker lat={loc.lat} lng={loc.lng} onPick={(lat, lng) => {
                setLoc({ lat, lng });
                setLocNote("Using the spot you picked on the map.");
              }} />
            )}
          </div>

          <div className="mt-6 space-y-3">
            <Button type="submit" size="lg" className="w-full" disabled={!label || sending || sent} aria-describedby={!label ? "send-hint" : undefined}>
              {sending ? "Sending…" : "Send report"}
            </Button>
            {!label && <p id="send-hint" className="text-[14px] text-muted">Pick what the barrier is first.</p>}
            <div role="status">
              {sent && (
                <p className="rounded-[14px] bg-primary-soft px-4 py-3 text-primary-hover">
                  <strong>Thanks. Your report is in.</strong> We&apos;re checking it against other reports and notices nearby.{" "}
                  <Link href="/live" className="font-bold underline underline-offset-4">See it on Live updates</Link>
                </p>
              )}
            </div>
            {sendError && <WarnBanner alert>{sendError}</WarnBanner>}
          </div>
        </Card>
      </form>

      <aside aria-labelledby="next-h" className="flex-[1_1_340px]">
        <Card>
          <h2 id="next-h" className="text-[20px] font-bold">What happens next</h2>
          <ol className="mt-4 space-y-4">
            {[
              ["AI reads your photo", "It suggests what the barrier is. You can change it."],
              ["We double-check it", "We check it against other reports and notices nearby before it changes the map."],
              ["The map updates for everyone", "Routes that pass this spot change straight away."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">{i + 1}</span>
                <div>
                  <p className="font-bold">{t}</p>
                  <p className="text-[15px] text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ol>
          <p id="privacy-note" className="mt-6 rounded-[14px] bg-bg p-4 text-[15px] text-muted">
            We save the barrier and its location, not who reported it or where you&apos;ve been.
          </p>
        </Card>
      </aside>
    </div>
  );
}
