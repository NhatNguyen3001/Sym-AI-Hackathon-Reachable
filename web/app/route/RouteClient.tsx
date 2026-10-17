"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { SampleDataBanner, WarnBanner, WeatherBanner } from "@/components/Banners";
import { NeedsChips } from "@/components/NeedsChips";
import { PlaceInput } from "@/components/PlaceInput";
import { RouteStep, VenueCheckRow } from "@/components/Rows";
import { StatusBadge } from "@/components/StatusBadge";
import { RouteMap } from "@/components/map/RouteMap";
import { ApiError, getPlaces, getRoute, getVenueCheck } from "@/lib/api";
import { useEvents } from "@/lib/events";
import { addTrip, loadProfile } from "@/lib/profile";
import { profile as defaultProfile } from "@/lib/placeholder";
import type { Place, Profile, RouteResult, VenueCheck } from "@/lib/types";

interface LiveCard {
  title: string;
  status: string;
  text: string;
}

async function findPlace(id: string): Promise<Place | null> {
  const { data } = await getPlaces("");
  return data.find((p) => p.id === id) ?? null;
}

export function RouteClient() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromId = params.get("from") ?? "mq-station";
  const toId = params.get("to") ?? "library";

  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [venue, setVenue] = useState<VenueCheck | null>(null);
  const [sample, setSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveCard | null>(null);
  const [announce, setAnnounce] = useState("");
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const load = useCallback(async (p: Profile) => {
    try {
      const r = await getRoute(fromId, toId, p);
      setRoute(r.data);
      setSample(r.sample);
      setError(null);
      if (r.data.ok && r.data.accessible && !r.sample) {
        const [f, t] = await Promise.all([findPlace(fromId), findPlace(toId)]);
        addTrip({ fromId, from: f?.name ?? fromId, toId, to: t?.name ?? toId, minutes: r.data.accessible.minutes });
      }
    } catch (e) {
      setRoute(null);
      setError(e instanceof ApiError && e.code === "place_not_found"
        ? "We couldn't find that place. Pick one from the list."
        : "We couldn't plan this route. Please try again.");
    }
    try {
      setVenue((await getVenueCheck(toId)).data);
    } catch {
      setVenue(null);
    }
  }, [fromId, toId]);

  useEffect(() => {
    const p = loadProfile();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setProfile(p);
    setShareUrl(window.location.href);
    load(p);
    findPlace(fromId).then(setFrom);
    findPlace(toId).then(setTo);
  }, [load, fromId, toId]);

  useEvents(["barrier_changed", "lift_changed", "weather_changed"], (event, data) => {
    load(profile);
    if (event === "barrier_changed" && data.status === "confirmed") {
      setLive({
        title: String(data.title ?? "New barrier"),
        status: "Confirmed",
        text: `Reported with a photo just now. ${String(data.summary ?? "")} Your route now goes around it.`.replace(/\s+/g, " "),
      });
    } else if (event === "lift_changed") {
      setAnnounce(`Lift status changed: ${data.exitId} exit lift is ${String(data.status).toLowerCase()}. Your route has been updated.`);
    } else if (event === "weather_changed") {
      setAnnounce("Weather changed. Your route has been updated.");
    }
  });

  function go(nextFrom: Place | null, nextTo: Place | null) {
    if (nextFrom && nextTo) router.replace(`${pathname}?from=${nextFrom.id}&to=${nextTo.id}`);
  }

  const acc = route?.ok ? route.accessible : undefined;
  const toilet = venue?.checks.find((c) => c.field === "Accessible toilet");
  const entrance = venue?.checks.find((c) => c.field === "Level entrance");
  const unmet: string[] = [];
  if (profile.destination.toilet && toilet?.status === "Not found") unmet.push("an accessible toilet");
  if (profile.destination.entrance && entrance?.status === "Not found") unmet.push("a level or ramped entrance");

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside aria-label="Route details" className="w-full border-line bg-surface px-4 py-6 sm:px-7 lg:max-w-[460px] lg:basis-[400px] lg:border-r">
        <h1 className="sr-only">Route and destination</h1>
        <div className="space-y-4">
          <PlaceInput label="From" value={from} onChange={(p) => { setFrom(p); go(p, to); }} />
          <PlaceInput label="To" value={to} onChange={(p) => { setTo(p); go(from, p); }} />
          <NeedsChips profile={profile} />
        </div>

        <div className="mt-5 space-y-4 border-t border-line pt-5">
          <SampleDataBanner show={sample} />
          {error && <WarnBanner alert>{error}</WarnBanner>}
          {route === null && !error && <p role="status" className="text-muted">Finding your route…</p>}

          {route && !route.ok && (
            <WarnBanner alert>
              <p className="font-bold text-warn-strong">{route.reason}</p>
              <p>{route.suggestion}</p>
            </WarnBanner>
          )}

          {acc && (
            <section aria-labelledby="summary-h">
              <h2 id="summary-h" className="sr-only">Summary</h2>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[32px] leading-none font-bold">{acc.minutes} min</p>
                  <p className="mt-1 text-[15px] text-muted">
                    {acc.distanceM} m · {acc.stepFree ? "step-free" : "has steps"} · max slope {acc.maxSlope}%
                  </p>
                </div>
                {route?.status && <StatusBadge label={route.status} />}
              </div>
            </section>
          )}

          {route && route.liftStatus.length > 0 && (
            <section aria-labelledby="lifts-h">
              <h2 id="lifts-h" className="mb-1 text-[13px] font-bold tracking-wide text-muted uppercase">Station lifts</h2>
              <ul>
                {route.liftStatus.map((l) => (
                  <li key={l.exitId} className="flex items-start gap-3 border-b border-line py-2.5 last:border-b-0">
                    {l.status === "Working"
                      ? <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                      : <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warn" />}
                    <div className="flex-1">
                      <p className="text-[16px]">{l.exit}: {l.status}</p>
                      <p className="text-[14px] text-muted">{l.source}, updated {l.updated}</p>
                    </div>
                    <StatusBadge label={l.status === "Working" ? "Confirmed" : "Out of service"} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {route?.ok && route.explanation && (
            <p className="rounded-[14px] bg-bg px-4 py-3 text-[16px]">{route.explanation}</p>
          )}

          {route?.ok && route.steps && (
            <section aria-labelledby="steps-h">
              <h2 id="steps-h" className="text-[13px] font-bold tracking-wide text-muted uppercase">Step by step</h2>
              <ol>{route.steps.map((s, i) => <RouteStep key={i} step={s} />)}</ol>
            </section>
          )}

          {venue && (
            <section aria-labelledby="dest-h">
              <h2 id="dest-h" className="text-[13px] font-bold tracking-wide text-muted uppercase">Destination check: {venue.name}</h2>
              <ul>{venue.checks.map((c) => <VenueCheckRow key={c.field} check={c} />)}</ul>
              <p className="mt-2 text-[14px] text-muted">
                {venue.sourceCount > 0
                  ? <>Checked by a {venue.checkedBy} {venue.checkedAgo}, using {venue.sourceCount} sources. </>
                  : <>No one has checked this place yet. </>}
                {venue.sourceCount > 0 && (
                  <Dialog>
                    <DialogTrigger className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">
                      How we know
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>How we know about {venue.name}</DialogTitle>
                        <DialogDescription>Each detail shows where it came from. Newer sources count more.</DialogDescription>
                      </DialogHeader>
                      <ul className="list-disc space-y-1 pl-5">
                        {venue.sources.map((s) => (
                          <li key={s.label}>{s.url ? <a className="text-primary underline" href={s.url}>{s.label}</a> : s.label}</li>
                        ))}
                      </ul>
                    </DialogContent>
                  </Dialog>
                )}
              </p>
            </section>
          )}

          {unmet.length > 0 && (
            <WarnBanner>This place may not meet your need for {unmet.join(" or ")}.</WarnBanner>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <Button asChild variant="secondary" size="lg" className="flex-1">
              <Link href="/plan">Other places that fit</Link>
            </Button>
            <Dialog onOpenChange={() => setCopied(false)}>
              <DialogTrigger asChild>
                <Button size="lg" className="flex-1">Send to my phone</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send this route to your phone</DialogTitle>
                  <DialogDescription>Scan the code with your phone camera, or copy the link.</DialogDescription>
                </DialogHeader>
                <div className="flex justify-center">
                  {shareUrl && <QRCodeSVG value={shareUrl} size={200} title="QR code for this route" />}
                </div>
                <Button variant="secondary" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}>
                  Copy link
                </Button>
                <p role="status" className="text-center text-[15px] text-primary">{copied ? "Link copied" : ""}</p>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </aside>

      <div className="relative min-h-[560px] flex-1 lg:sticky lg:top-0 lg:h-screen">
        <RouteMap accessible={acc} fastest={route?.ok ? route.fastest : null} barriers={route?.barriers ?? []} />
        <WeatherBanner weather={route?.weather} className="absolute top-3 right-3 z-[600] max-w-[340px]" />
        <div aria-live="polite" className="absolute bottom-6 left-3 z-[600] max-w-[380px]">
          {live && (
            <div className="rounded-[14px] border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-bold">{live.title}</p>
                <StatusBadge label={live.status} />
              </div>
              <p className="mt-1 text-[15px] text-muted">{live.text}</p>
            </div>
          )}
        </div>
        <p role="status" className="sr-only">{announce}</p>
      </div>
    </div>
  );
}
