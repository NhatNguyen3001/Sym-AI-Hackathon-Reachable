"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "cn";
import { CircleCheck, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { NeedsTicks } from "@/components/NeedsTicks";
import { Button } from "@/components/ui/button";
import { InfoBanner, SampleDataBanner, WarnBanner, WeatherBanner } from "@/components/Banners";
import { PlaceInput } from "@/components/PlaceInput";
import { RouteStep } from "@/components/Rows";
import { StatusBadge } from "@/components/StatusBadge";
import { RouteMap } from "@/components/map/RouteMap";
import { ApiError, getPlace, getRoute, getVenueCheck } from "@/lib/api";
import { useEvents } from "@/lib/events";
import { addTrip, loadProfile, rememberPlace, saveProfile } from "@/lib/profile";
import { profile as defaultProfile } from "@/lib/placeholder";
import { routeFeatures } from "@/lib/routeFeatures";
import { routeProgress } from "@/lib/routeProgress";
import { useUserLocation } from "@/lib/useUserLocation";
import type { Place, Profile, RouteOption, RouteResult, VenueCheck } from "@/lib/types";

interface LiveCard {
  title: string;
  status: string;
  text: string;
}

const findPlace = (id: string) => getPlace(id);

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [navigating, setNavigating] = useState(false);
  const { fix } = useUserLocation();

  const load = useCallback(async (p: Profile) => {
    try {
      const r = await getRoute(fromId, toId, p);
      setRoute(r.data);
      setSample(r.sample);
      setError(null);
      if (r.data.ok && r.data.accessible && !r.sample) {
        const [f, t] = await Promise.all([findPlace(fromId), findPlace(toId)]);
        if (f) rememberPlace(f);
        if (t) rememberPlace(t);
        addTrip({ fromId, from: f?.name ?? fromId, toId, to: t?.name ?? toId, minutes: r.data.accessible.minutes });
      }
    } catch (e) {
      setRoute(null);
      setError(e instanceof ApiError && e.code === "place_not_found"
        ? "We couldn't find that place. Pick one from the list."
        : e instanceof ApiError && e.status > 0 ? e.message : "We couldn't plan this route. Please try again.");
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
    setPicked(null);
    setNavigating(false);
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
  const alts = route?.ok ? route.alternatives ?? [] : [];
  const chosen = picked !== null && picked >= 0 ? alts[picked] : null;
  const active = chosen ?? acc;
  const activeSteps = chosen?.steps ?? (route?.ok ? route.steps : undefined);
  const others: RouteOption[] = route?.ok && acc
    ? (chosen
      ? [{ ...acc, summary: "Recommended route", steps: route.steps }, ...alts.filter((_, i) => i !== picked)]
      : alts)
    : [];
  const features = useMemo(
    () => routeFeatures(active?.geometry.coordinates, activeSteps, venue, to),
    [active, activeSteps, venue, to],
  );
  const routeLabel = chosen
    ? chosen.summary
    : route?.ok && /fastest route/i.test(route.explanation)
      ? "This is also the fastest route."
      : route?.ok && (route.minutesLonger ?? 0) > 0
        ? `${route.minutesLonger} min longer than the fastest`
        : "";
  const progress = routeProgress(active?.geometry.coordinates, fix?.lat ?? 0, fix?.lng ?? 0);
  const progressPct = Math.round(progress.fraction * 100);
  const minutesLeft = active ? Math.max(1, Math.ceil(active.minutes * (1 - progress.fraction))) : 0;

  function chooseRoute(which: "active" | number) {
    if (!route?.ok) return;
    if (which === "active") {
      setPicked(picked !== null && picked >= 0 ? picked : -1);
      setAnnounce("This route is selected.");
      return;
    }
    if (picked === null || picked < 0) {
      setPicked(which);
      setAnnounce(alts[which]?.summary ?? "Directions updated.");
      return;
    }
    if (which === 0) {
      setPicked(-1);
      setAnnounce("Directions switched to the recommended route.");
      return;
    }
    const original = alts.map((_, i) => i).filter((i) => i !== picked);
    const next = original[which - 1];
    if (next === undefined) return;
    setPicked(next);
    setAnnounce(alts[next]?.summary ?? "Directions updated.");
  }

  function saveFilter() {
    saveProfile(profile);
    setFiltersOpen(false);
    setSheetOpen(false);
    load(profile);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col lg:flex-row">
      <div className="relative min-h-0 flex-1 lg:order-2 lg:min-h-0">
        <button type="button" aria-expanded={searchOpen}
          aria-label={searchOpen ? "Hide search" : "Show search"}
          onClick={() => setSearchOpen((open) => !open)}
          className="absolute top-3 left-3 z-[700] hidden size-12 items-center justify-center rounded-[12px] border border-line-strong bg-surface text-ink shadow-lg lg:inline-flex">
          {searchOpen
            ? <PanelLeftClose aria-hidden="true" className="size-5" strokeWidth={2.4} />
            : <PanelLeftOpen aria-hidden="true" className="size-5" strokeWidth={2.4} />}
        </button>
        <RouteMap
          accessible={active}
          fastest={route?.ok ? route.fastest : null}
          alternatives={others}
          barriers={route?.barriers ?? []}
          routeLabel={routeLabel}
          marks={features.marks}
          slopes={features.spans}
          onPick={chooseRoute}
        />
        <WeatherBanner weather={route?.weather} className="absolute top-3 right-3 z-[600] max-w-[340px]" />
        <div aria-live="polite" className="absolute top-3 left-3 z-[600] max-w-[280px] lg:top-auto lg:bottom-6 lg:max-w-[380px]">
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

      <aside aria-label="Route details" className={cn(
        "absolute inset-x-3 bottom-20 z-[650] max-h-[58dvh] overflow-y-auto rounded-[22px] border border-line bg-surface px-4 py-3 shadow-lg",
        "lg:static lg:order-1 lg:bottom-auto lg:z-auto lg:h-full lg:max-h-full lg:max-w-[460px] lg:basis-[400px] lg:overflow-y-auto lg:rounded-none lg:border-0 lg:border-r lg:px-7 lg:py-6 lg:shadow-none",
        !searchOpen && "lg:hidden",
      )}>
        <h1 className="sr-only">Route and destination</h1>
        <button type="button" aria-expanded={sheetOpen}
          aria-label={sheetOpen ? "Hide route details" : "Show route details"}
          onClick={() => setSheetOpen((open) => !open)}
          className="mx-auto mb-2 flex h-8 w-16 items-center justify-center rounded-full lg:hidden">
          <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line-strong" />
        </button>
        {!sheetOpen && (
          <div className="lg:hidden">
            <p className="text-[16px] font-bold">{from?.name ?? "From"} to {to?.name ?? "To"}</p>
            {navigating && active ? (
              <div className="mt-2">
                <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct}
                  aria-label="Trip progress" className="h-3 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="mt-1 text-[15px] text-muted">
                  {fix ? `${progress.leftM} m left · about ${minutesLeft} min` : "Waiting for your location."}
                </p>
              </div>
            ) : active && (
              <p className="text-[15px] text-muted">
                {active.minutes} min · {active.stepFree ? "step-free" : "has steps"} · max slope {active.maxSlope}%
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button type="button" aria-label="Filter" onClick={() => { setSheetOpen(true); setFiltersOpen(true); }}
                className="inline-flex size-11 items-center justify-center rounded-full border border-line-strong text-ink">
                <SlidersHorizontal aria-hidden="true" className="size-5" strokeWidth={2.4} />
              </button>
              {picked !== null && !navigating && (
                <button type="button" onClick={() => setNavigating(true)}
                  className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-[15px] font-bold text-white">
                  Start
                </button>
              )}
            </div>
          </div>
        )}
        <div className={cn("space-y-4", !sheetOpen && "max-lg:hidden")}>
          <PlaceInput label="From" value={from} onChange={(p) => { setFrom(p); go(p, to); }} />
          <PlaceInput label="To" value={to} onChange={(p) => { setTo(p); go(from, p); }} />
          <div className="flex items-center gap-2">
            <button type="button" aria-expanded={filtersOpen} aria-label={filtersOpen ? "Hide filter" : "Filter"}
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn("inline-flex size-11 items-center justify-center rounded-full border",
                filtersOpen ? "border-primary bg-primary text-white" : "border-line-strong bg-surface text-ink")}>
              <SlidersHorizontal aria-hidden="true" className="size-5" strokeWidth={2.4} />
            </button>
            {picked !== null && !navigating && (
              <button type="button" onClick={() => setNavigating(true)}
                className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-[15px] font-bold text-white">
                Start
              </button>
            )}
          </div>
          {filtersOpen && (
            <NeedsTicks profile={profile} onChange={setProfile} />
          )}
        </div>

        <div className={cn("mt-5 space-y-4 border-t border-line pt-5", !sheetOpen && "max-lg:hidden")}>
          <SampleDataBanner show={sample} />
          {route?.note && <InfoBanner>{route.note}. Sydney-wide routing is unavailable right now.</InfoBanner>}
          {error && <WarnBanner alert>{error}</WarnBanner>}
          {route === null && !error && <p role="status" className="text-muted">Finding your route…</p>}

          {route && !route.ok && (
            <WarnBanner alert>
              <p className="font-bold text-warn-strong">{route.reason}</p>
              <p>{route.suggestion}</p>
            </WarnBanner>
          )}

          {active && (
            <section aria-labelledby="summary-h">
              <h2 id="summary-h" className="sr-only">Summary</h2>
              {navigating ? (
                <div>
                  <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct}
                    aria-label="Trip progress" className="h-3 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="mt-2 text-[15px] text-muted">
                    {fix ? `${progress.leftM} m left · about ${minutesLeft} min` : "Waiting for your location."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[32px] leading-none font-bold">{active.minutes} min</p>
                    <p className="mt-1 text-[15px] text-muted">
                      {active.distanceM} m · {active.stepFree ? "step-free" : "has steps"} ·{" "}
                      {active.slopeEstimated ? "slopes estimated" : `max slope ${active.maxSlope}%`}
                    </p>
                  </div>
                  {route?.status && !chosen && <StatusBadge label={route.status} />}
                </div>
              )}
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

          {route?.ok && route.slopeNote && <WarnBanner>{route.slopeNote}</WarnBanner>}

          {route?.ok && activeSteps && activeSteps.length > 0 && (
            <section aria-labelledby="steps-h">
              <h2 id="steps-h" className="text-[13px] font-bold tracking-wide text-muted uppercase">Step by step</h2>
              <ol>{activeSteps.map((s, i) => <RouteStep key={i} step={s} />)}</ol>
            </section>
          )}

          <Button type="button" size="lg" className="w-full" onClick={saveFilter}>
            Save filter
          </Button>
        </div>
      </aside>
    </div>
  );
}
