"use client";
// Guidance while you go: the step you're on, what comes next, and how long is left. Spoken aloud unless muted.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpFromLine, Check, CircleAlert, Flag, MoveVertical, Navigation, TrainFront, TrendingUp, Volume2, VolumeX,
} from "lucide-react";
import {
  distanceText, nextTurn, spokenStep, turnPhrase, turnsOf, type NavIcon, type NavRoute,
} from "@/lib/navigation";
import { readStored, writeStored } from "@/lib/storage";
import { timeOfDay } from "@/lib/trip";
import type { Guidance } from "@/lib/useGuidance";
import type { LocationStatus } from "@/lib/useUserLocation";

const ICONS: Record<NavIcon, typeof Check> = {
  check: Navigation, slope: TrendingUp, alert: CircleAlert, lift: MoveVertical, crossing: ArrowUpFromLine, ride: TrainFront,
};
const VOICE_KEY = "reachable.voice";
/** A turn is announced from this far away. */
const TURN_WARN_M = 30;

/** Queued, so a turn said right after a new step doesn't cut it off. */
function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.resume(); // Chrome can leave speech paused (e.g. after the tab was hidden)
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-AU";
  window.speechSynthesis.speak(u);
}

/** Keeps the screen on while guiding, where the browser allows it. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    navigator.wakeLock.request("screen").then((l) => {
      if (done) l.release();
      else lock = l;
    }).catch(() => {});
    return () => {
      done = true;
      lock?.release().catch(() => {});
    };
  }, [on]);
}

export function NavigationPanel({
  nav, guide, destination, minutes, arriveAt, locationStatus, previewing, onPreview, onReplan, onEnd,
}: {
  nav: NavRoute;
  guide: Guidance;
  destination: string;
  /** Whole-trip minutes, for the time left. */
  minutes: number;
  /** Public transport trips have a timetable arrival; walks are worked out from the distance left. */
  arriveAt?: string;
  locationStatus: LocationStatus;
  previewing: boolean;
  onPreview: (on: boolean) => void;
  onReplan: () => void;
  onEnd: () => void;
}) {
  const [voice, setVoice] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const spoken = useRef<Set<string>>(new Set());
  const p = guide.progress;
  useWakeLock(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the voice setting is only readable after mount
    setVoice(readStored(VOICE_KEY) !== "off");
    if ("speechSynthesis" in window) window.speechSynthesis.cancel(); // a fresh start, not a queue left from before
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  // Said once each: the step you're on (as an instruction), then each turn as you get close to it.
  const turns = useMemo(() => turnsOf(nav), [nav]);
  const along = p && guide.fix ? guide.fix.alongM : null;
  const turn = along === null ? null : nextTurn(turns, along);
  const turnIn = turn && along !== null ? turn.atM - along : null;
  const stepKey = !p ? "" : p.arrived ? "arrived" : `step-${p.index}`;
  const stepText = !p ? "" : p.arrived ? `You have arrived at ${destination}.` : spokenStep(p.current);
  const near = turn && turnIn !== null && turnIn <= TURN_WARN_M && !p?.arrived;
  const turnKey = near ? `turn-${Math.round(turn.atM)}` : "";
  const turnText = near
    ? turnIn <= 8
      ? `${turnPhrase(turn.dir)} now.`
      : `In ${Math.max(5, Math.round(turnIn / 5) * 5)} metres, ${turnPhrase(turn.dir).toLowerCase()}.`
    : "";
  useEffect(() => {
    spoken.current = new Set();
  }, [nav]);
  // Two cues, each said once: the step first, so a turn coming up at the same moment never hides it.
  useEffect(() => {
    for (const [key, text] of [[stepKey, stepText], [turnKey, turnText]]) {
      if (!key || spoken.current.has(key)) continue;
      spoken.current.add(key);
      if (voice) speak(text);
    }
  }, [stepKey, stepText, turnKey, turnText, voice]);
  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  function toggleVoice() {
    const next = !voice;
    setVoice(next);
    writeStored(VOICE_KEY, next ? "on" : "off");
    if (!next && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (next && stepText) speak(stepText); // say where you are, so you hear the voice is back
  }

  const left = p ? p.remainingM : nav.total;
  const minsLeft = arriveAt
    ? Math.max(0, Math.round((new Date(arriveAt).getTime() - now) / 60000))
    : Math.max(0, Math.ceil(minutes * (nav.total > 0 ? left / nav.total : 1)));
  const eta = arriveAt ?? new Date(now + minsLeft * 60000).toISOString();
  const Icon = p ? ICONS[p.current.icon] ?? Navigation : Navigation;
  const NextIcon = p?.next ? ICONS[p.next.icon] ?? Navigation : Flag;

  let waiting: string | null = null;
  if (!previewing && !guide.position) {
    waiting = locationStatus === "pending"
      ? "Finding your location…"
      : "Location is off. Turn it on to follow your route, or preview the walk.";
  } else if (guide.farFromRoute) {
    waiting = `You're ${distanceText(guide.fix?.offM ?? 0)} from this route. Get to the start, or preview the walk.`;
  }

  return (
    <>
      <section aria-label="Directions" aria-live="polite"
        className="absolute top-3 right-3 left-[4.5rem] z-[700] lg:left-1/2 lg:w-[480px] lg:-translate-x-1/2">
        {p?.arrived ? (
          <div className="rounded-[18px] bg-[#1d4fa8] p-4 text-white shadow-lg">
            <div className="flex items-center gap-3">
              <Flag aria-hidden="true" className="size-8 shrink-0" strokeWidth={2.4} />
              <div>
                <p className="text-[22px] leading-tight font-bold">You&apos;ve arrived</p>
                <p className="text-[16px]">{destination}</p>
              </div>
            </div>
            <button type="button" onClick={onEnd}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-white px-5 text-[16px] font-bold text-[#1d4fa8]">
              Done
            </button>
          </div>
        ) : waiting ? (
          <div className="rounded-[18px] bg-[#15201b] p-4 text-white shadow-lg">
            <p className="text-[17px] font-bold">{waiting}</p>
            {!previewing && (
              <button type="button" onClick={() => onPreview(true)}
                className="mt-3 inline-flex min-h-12 items-center rounded-full bg-white px-5 text-[16px] font-bold text-ink">
                Preview the walk
              </button>
            )}
          </div>
        ) : p && (
          <div className="overflow-hidden rounded-[18px] shadow-lg">
            <div className="flex items-start gap-3 bg-[#1d4fa8] p-4 text-white">
              <Icon aria-hidden="true" className="mt-0.5 size-8 shrink-0" strokeWidth={2.4} />
              <div className="min-w-0">
                <p className="text-[22px] leading-tight font-bold">{p.current.label}</p>
                {p.current.detail && <p className="mt-1 text-[16px]">{p.current.detail}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3 bg-[#15306b] px-4 py-2.5 text-white">
              <NextIcon aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.4} />
              <p className="text-[16px]">
                <span className="font-bold">In {distanceText(p.toNextM)}</span>
                {": "}{p.next ? p.next.label : `arrive at ${destination}`}
              </p>
            </div>
            {guide.offRoute && (
              <div role="alert" className="bg-warn-soft px-4 py-3 text-warn-ink">
                <p className="font-bold text-warn-strong">You&apos;re off the route</p>
                <p className="text-[15px]">Head back to the blue line, or plan again from where you are.</p>
                <button type="button" onClick={onReplan}
                  className="mt-2 inline-flex min-h-11 items-center rounded-full bg-[#8a3d00] px-4 text-[15px] font-bold text-white">
                  Plan again from here
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section aria-label="Trip progress"
        className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[700] rounded-[22px] border border-line bg-surface px-4 py-3 shadow-lg lg:left-1/2 lg:w-[480px] lg:-translate-x-1/2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[24px] leading-tight font-bold">{minsLeft} min</p>
            <p className="text-[15px] text-muted">
              {distanceText(left)} · arrive {timeOfDay(eta)}{previewing ? " · preview" : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={toggleVoice} aria-pressed={voice} aria-label={voice ? "Mute voice" : "Turn voice on"}
              className="inline-flex size-12 items-center justify-center rounded-full border border-line-strong text-ink">
              {voice ? <Volume2 aria-hidden="true" className="size-5" strokeWidth={2.4} /> : <VolumeX aria-hidden="true" className="size-5" strokeWidth={2.4} />}
            </button>
            {previewing && (
              <button type="button" onClick={() => onPreview(false)}
                className="inline-flex min-h-12 items-center rounded-full border border-line-strong px-4 text-[15px] font-bold text-ink">
                Stop preview
              </button>
            )}
            <button type="button" onClick={onEnd}
              className="inline-flex min-h-12 items-center rounded-full bg-[#e11d48] px-5 text-[16px] font-bold text-white">
              End
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
