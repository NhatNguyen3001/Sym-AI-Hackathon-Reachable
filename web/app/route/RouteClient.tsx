"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "cn";
import { ChevronLeft, ChevronRight, CircleCheck, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { NeedsTicks } from "@/components/NeedsTicks";
import { Button } from "@/components/ui/button";
import { InfoBanner, SampleDataBanner, WarnBanner, WeatherBanner } from "@/components/Banners";
import { PlaceInput } from "@/components/PlaceInput";
import { LegTimeline } from "@/components/LegTimeline";
import { NavigationPanel } from "@/components/NavigationPanel";
import { RouteSkeleton } from "@/components/RouteSkeleton";
import { RouteStep, VenueCheckRow } from "@/components/Rows";
import { StatusBadge } from "@/components/StatusBadge";
import { TrustBadge } from "@/components/TrustBadge";
import { TripOptions } from "@/components/TripOptions";
import { RouteMap } from "@/components/map/RouteMap";
import { RecordedMark } from "@/components/RecordedMark";
import { ShowcasePicker } from "@/components/ShowcasePicker";
import { ApiError, getPlace, getRoute, getShowcaseRecording, getVenueCheck } from "@/lib/api";
import { SHOWCASE, type ShowcaseTrip } from "@/lib/showcase";
import { loadManifest } from "@/lib/showcaseData";
import { useEvents } from "@/lib/events";
import { addTrip, loadProfile, rememberPlace, saveProfile } from "@/lib/profile";
import { profile as defaultProfile } from "@/lib/placeholder";
import { navFromLegs, navFromWalk, type NavRoute } from "@/lib/navigation";
import { routeFeatures } from "@/lib/routeFeatures";
import { hillsSummary, liftText, liftTrust, routeTrust } from "@/lib/wording";
import { useGuidance } from "@/lib/useGuidance";
import { useUserLocation } from "@/lib/useUserLocation";
import { optionTimes, selectOption, showsCards } from "@/lib/trip";
import type { LiftRow, Place, Profile, RouteOption, RouteResult, VenueCheck } from "@/lib/types";

interface LiveCard {
  title: string;
  status: string;
  text: string;
}

const findPlace = (id: string) => getPlace(id);
const liftKey = (l: LiftRow) => l.exitId ?? l.exit;
const NO_ROUTES: RouteOption[] = [];

function TryAgain({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="mt-2 inline-flex min-h-11 items-center rounded-full border border-current px-4 text-[15px] font-bold disabled:opacity-60">
      {busy ? "Trying again…" : "Try again"}
    </button>
  );
}

export function RouteClient() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // No "from" when location is off: the person types where they're starting.
  const fromId = params.get("from");
  const toId = params.get("to") ?? "library";
  const urlOption = params.get("option");
  // Showcase: which recorded trip (two share the campus places).
  const tripId = params.get("trip");
  const [showcaseTrip, setShowcaseTrip] = useState<ShowcaseTrip | null>(null);
  const [recordedOn, setRecordedOn] = useState<string | null>(null);
  const [showcaseNote, setShowcaseNote] = useState<string | null>(null);

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
  // Way to get there (walk or a public transport trip). Applies at once; the URL catches up for Back and sharing.
  const [pickedOption, setPickedOption] = useState<string | null>(null);
  const [liftOpen, setLiftOpen] = useState<string | null>(null);
  const [liftAnswers, setLiftAnswers] = useState<Record<string, "working" | "broken">>({});
  const [navigating, setNavigating] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // While guiding, a failed re-plan (no signal underground) keeps the last route and says so, never a bare map.
  const guiding = useRef(false);
  const [navProblem, setNavProblem] = useState<string | null>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const backToStart = useRef(false);
  const { fix: userFix, status: locationStatus } = useUserLocation();

  /** Open the details (desktop side panel, phone sheet) so a problem with the trip is seen. */
  function showDetails() {
    setSearchOpen(true);
    setSheetOpen(true);
  }

  const load = useCallback(async (p: Profile, fresh = false) => {
    if (!fromId) return;
    try {
      const r = await getRoute(fromId, toId, p, { fresh, trip: tripId });
      // While guiding, an answer we can't use (no route, or the offline sample) never replaces the route being followed.
      if (guiding.current && (!r.data.ok || r.sample)) {
        setNavProblem("Couldn't update your route just now.");
        return;
      }
      setNavProblem(null);
      setRoute(r.data);
      setPicked(null); // a reloaded route (live update, new filter) may have different alternatives
      if (!r.data.ok) showDetails(); // "no step-free route" must never hide in a closed panel
      setSample(r.sample);
      setError(null);
      const minutes = r.data.options?.[0]?.minutes ?? r.data.accessible?.minutes;
      if (r.data.ok && minutes && !r.sample && !SHOWCASE) {
        const [f, t] = await Promise.all([findPlace(fromId), findPlace(toId)]);
        if (f) rememberPlace(f);
        if (t) rememberPlace(t);
        addTrip({ fromId, from: f?.name ?? fromId, toId, to: t?.name ?? toId, minutes });
      }
    } catch (e) {
      if (SHOWCASE && e instanceof ApiError) {
        // Not a recorded trip (an old link) or a recording that didn't load: offer the recorded trips instead.
        setRoute(null);
        setShowcaseNote(e.message);
        return;
      }
      if (guiding.current) {
        setNavProblem("Couldn't update your route just now.");
        return;
      }
      setRoute(null);
      showDetails();
      setError(e instanceof ApiError && e.code === "place_not_found"
        ? "We couldn't find that place. Pick one from the list."
        : e instanceof ApiError && e.status > 0 ? e.message : "We couldn't plan this route. Please try again.");
    }
    try {
      setVenue((await getVenueCheck(toId)).data);
    } catch {
      setVenue(null);
    }
  }, [fromId, toId, tripId]);

  useEffect(() => {
    if (!SHOWCASE) return;
    // Each recorded trip was planned for one set of needs: use those, never the visitor's saved profile.
    let current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new trip link clears the last trip's note
    setShowcaseNote(null);
    loadManifest().then((m) => current && setRecordedOn(m?.recordedOn ?? null));
    if (!fromId) {
      setShowcaseNote("Pick one of these trips.");
      return;
    }
    getShowcaseRecording(fromId, toId, tripId).then((r) => {
      if (!current) return;
      setShowcaseTrip(r.trip);
      setProfile(r.trip.profile);
      setFrom(r.from);
      setTo(r.to);
      setRoute(null);
      showDetails();
      load(r.trip.profile);
    }, (e: unknown) => current && setShowcaseNote(e instanceof ApiError ? e.message : "This example couldn't load."));
    return () => {
      current = false;
    };
  }, [load, fromId, toId, tripId]);

  useEffect(() => {
    if (SHOWCASE) return;
    const p = loadProfile();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setProfile(p);
    setPicked(null);
    setPickedOption(null);
    if (!guiding.current) {
      setRoute(null);   // a new trip: show placeholders, not the previous trip
      showDetails();    // open the panel straight away so there's something to see while the route loads
    }
    load(p);
    if (fromId) findPlace(fromId).then(setFrom);
    findPlace(toId).then(setTo);
  }, [load, fromId, toId]);

  useEvents(["barrier_changed", "lift_changed", "weather_changed"], (event, data) => {
    load(profile, true);   // re-plan after the change, not with a request that started before it
    if (event === "barrier_changed" && data.status === "confirmed") {
      setLive({
        title: String(data.title ?? "New barrier"),
        status: "Confirmed",
        text: `Reported with a photo just now. ${String(data.summary ?? "")} Your route now goes around it.`.replace(/\s+/g, " "),
      });
    } else if (event === "lift_changed") {
      setAnnounce(`Lift status changed at ${String(data.station ?? "a station")}: ${String(data.status).toLowerCase()}. Your route has been updated.`);
    } else if (event === "weather_changed") {
      setAnnounce("Weather changed. Your route has been updated.");
    }
  });

  function go(nextFrom: Place | null, nextTo: Place | null) {
    if (nextFrom && nextTo) router.replace(`${pathname}?from=${nextFrom.id}&to=${nextTo.id}`);
  }

  function chooseOption(id: string) {
    setPickedOption(id);
    router.replace(`${pathname}?from=${fromId}&to=${toId}${tripId ? `&trip=${tripId}` : ""}&option=${id}`, { scroll: false });
  }

  const ends = useMemo(() => ({
    from: from ? [from.lat, from.lng] as [number, number] : undefined,
    to: to ? [to.lat, to.lng] as [number, number] : undefined,
  }), [from, to]);
  const options = route?.ok ? route.options : undefined;
  const selected = selectOption(options, pickedOption ?? urlOption);
  const transit = selected?.mode === "transit" ? selected : undefined;
  const cards = showsCards(options);   // with cards, the chosen card is the summary
  const allLifts = useMemo(() => selected?.liftStatus ?? route?.liftStatus ?? [], [selected, route]);
  const liftRows = useMemo(() => allLifts
    .filter((l) => typeof l.lat === "number" && typeof l.lng === "number"), [allLifts]);
  const lift = liftRows.find((l) => liftKey(l) === liftOpen) ?? null;
  const explanation = transit && selected !== options?.[0] ? selected?.explanation : route?.explanation;
  const acc = route?.ok && !transit ? route.accessible ?? undefined : undefined;
  // Memoised so the map only refits when the route itself changes, not on every render.
  const alts = useMemo(() => (route?.ok && !transit ? route.alternatives ?? [] : []), [route, transit]);
  const chosen = picked !== null && picked >= 0 ? alts[picked] ?? null : null;
  const active = chosen ?? acc;
  const activeSteps = chosen?.steps ?? (route?.ok ? route.steps : undefined);
  const others: RouteOption[] = useMemo(() => (route?.ok && acc
    ? (chosen
      ? [{ ...acc, summary: "Recommended route", steps: route.steps }, ...alts.filter((_, i) => i !== picked)]
      : alts)
    : []), [route, acc, chosen, alts, picked]);
  const features = useMemo(
    () => routeFeatures(active?.geometry.coordinates, activeSteps, venue, to),
    [active, activeSteps, venue, to],
  );
  const navRoute = useMemo(() => {
    if (transit) return navFromLegs(transit.legs, profile);
    return active ? navFromWalk(active.geometry.coordinates, activeSteps, profile) : null;
  }, [transit, active, activeSteps, profile]);
  // Keep guiding on the last good route if a re-plan leaves none for a moment.
  const [heldNav, setHeldNav] = useState<NavRoute | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remember the last route that could be guided
    if (navRoute) setHeldNav(navRoute);
  }, [navRoute]);
  const shownNav = navigating ? navRoute ?? heldNav : navRoute;
  const guide = useGuidance(shownNav, navigating, userFix, previewing);
  // The recommended way counts as chosen: Start is there as soon as a route is.
  const canStart = !!route?.ok && !!navRoute;

  function startNav() {
    guiding.current = true;
    setNavProblem(null);
    setNavigating(true);
    setPreviewing(false);
    setSheetOpen(false);
    setSearchOpen(false);
    setLiftOpen(null);
    if (SHOWCASE) setPreviewing(true);   // no GPS in the showcase: the steps play as a preview
  }

  function endNav() {
    guiding.current = false;
    setNavProblem(null);
    setNavigating(false);
    setPreviewing(false);
    setSearchOpen(true);
    backToStart.current = true;
  }

  // After End, focus goes back to Start (it was hidden while guiding).
  useEffect(() => {
    if (!navigating && backToStart.current) {
      backToStart.current = false;
      startButton.current?.focus();
    }
  }, [navigating]);

  function replanFromHere() {
    if (!userFix) return;
    const here = `coord:here:${userFix.lat.toFixed(5)},${userFix.lng.toFixed(5)}`;
    router.replace(`${pathname}?from=${encodeURIComponent(here)}&to=${encodeURIComponent(toId)}`);
  }

  const routeLabel = chosen
    ? chosen.summary
    : route?.ok && /fastest route/i.test(route.explanation)
      ? "This is also the fastest route."
      : route?.ok && (route.minutesLonger ?? 0) > 0
        ? `${route.minutesLonger} min longer than the fastest`
        : "";

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

  const toilet = venue?.checks.find((c) => c.field === "Accessible toilet");
  const entrance = venue?.checks.find((c) => c.field === "Level entrance");
  const unmet: string[] = [];
  if (profile.destination.toilet && toilet?.status === "Not found") unmet.push("an accessible toilet");
  if (profile.destination.entrance && entrance?.status === "Not found") unmet.push("a level or ramped entrance");

  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);

  /** Transport for NSW is sometimes slow for a moment: ask again with a fresh request. */
  async function retry() {
    setRetrying(true);
    try {
      await load(profile, true);
    } finally {
      setRetrying(false);
    }
  }

  async function saveFilter() {
    saveProfile(profile);
    setFiltersOpen(false);
    setSheetOpen(false);
    setSaving(true);
    try {
      await load(profile);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col lg:flex-row">
      <div className="relative min-h-0 flex-1 lg:order-2 lg:min-h-0">
        {/* Round handle on the panel's edge (desktop), like the sidebar's. 44 px to tap, 28 px to see. */}
        <button type="button" aria-expanded={searchOpen}
          aria-label={searchOpen ? "Hide route details" : "Show route details"}
          onClick={() => setSearchOpen((open) => !open)}
          className={cn("group absolute top-3 -left-[22px] z-[700] hidden size-11 items-center justify-center",
            !navigating && "lg:inline-flex")}>
          <span aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-full border border-line-strong bg-surface text-ink shadow-sm group-hover:bg-bg group-focus-visible:outline-2 group-focus-visible:outline-primary">
            {searchOpen ? <ChevronLeft className="size-4" strokeWidth={2.6} /> : <ChevronRight className="size-4" strokeWidth={2.6} />}
          </span>
        </button>
        <RouteMap
          ends={ends}
          accessible={active}
          fastest={route?.ok && !transit && !navigating ? route.fastest : null}
          alternatives={navigating ? NO_ROUTES : others}
          barriers={route?.barriers ?? []}
          routeLabel={routeLabel}
          marks={features.marks}
          slopes={features.spans}
          onPick={chooseRoute}
          legs={transit?.legs}
          lifts={liftRows}
          selectedLift={liftOpen}
          onLift={(key) => setLiftOpen(key)}
          follow={navigating && !guide.farFromRoute ? guide.position : null}
          walked={guide.walked}
          previewPoint={navigating && previewing ? guide.position : null}
        />
        {navigating && shownNav && (
          <NavigationPanel nav={shownNav} guide={guide} destination={to?.name ?? "your destination"}
            minutes={transit?.minutes ?? active?.minutes ?? 0} arriveAt={transit?.arriveAt}
            locationStatus={locationStatus} previewing={previewing} onPreview={setPreviewing}
            onReplan={replanFromHere} onEnd={endNav} problem={navProblem} />
        )}
        {lift && !navigating && (
          <article aria-labelledby="lift-h"
            className="absolute inset-x-3 top-[4.5rem] z-[700] rounded-[18px] bg-[#15201b] p-4 text-white shadow-lg lg:right-3 lg:left-auto lg:w-[360px]">
            <p className="text-[14px] font-bold tracking-wide text-[#ffd7a8] uppercase">Station lift</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div>
                <h2 id="lift-h" className="text-[22px] leading-tight font-bold">{lift.exit}</h2>
                <p className="text-[18px] font-bold">{lift.status}</p>
              </div>
              <button type="button" onClick={() => setLiftOpen(null)}
                className="inline-flex min-h-11 items-center rounded-[12px] px-2 text-[15px] font-bold text-white underline">
                Close
              </button>
            </div>
            <p className="mt-1 text-[14px] text-[#d5ddd8]">{lift.source}, {SHOWCASE ? lift.updated : `updated ${lift.updated}`}</p>
            {liftAnswers[liftKey(lift)] ? (
              <p role="status" className="mt-3 text-[15px]">
                Thanks. You said this lift is {liftAnswers[liftKey(lift)] === "working" ? "working" : "not working"}. That stays on this device.
              </p>
            ) : (
              <>
                <p className="mt-3 text-[16px] font-bold">
                  {lift.status === "Out of service" ? "Is this lift still out of service?" : "Is this lift working?"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setLiftAnswers((a) => ({ ...a, [liftKey(lift)]: "broken" }))}
                    className="inline-flex min-h-12 items-center rounded-full bg-[#e11d48] px-4 font-bold text-white">
                    Not working
                  </button>
                  <button type="button" onClick={() => setLiftAnswers((a) => ({ ...a, [liftKey(lift)]: "working" }))}
                    className="inline-flex min-h-12 items-center rounded-full bg-[#1d4fa8] px-4 font-bold text-white">
                    Working
                  </button>
                </div>
              </>
            )}
          </article>
        )}
        <WeatherBanner weather={route?.weather} className="absolute top-3 right-3 z-[600] max-w-[340px]" />
        <div aria-live="polite" className="absolute top-3 left-[4.5rem] z-[600] max-w-[280px] lg:top-auto lg:bottom-6 lg:left-3 lg:max-w-[380px]">
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
        "absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[650] overflow-y-auto rounded-[22px] border border-line bg-surface px-4 py-3 shadow-lg",
        sheetOpen && "max-h-[58dvh]",
        "lg:static lg:order-1 lg:bottom-auto lg:z-auto lg:h-full lg:max-h-full lg:max-w-[460px] lg:basis-[400px] lg:overflow-y-auto lg:rounded-none lg:border-0 lg:border-r lg:px-7 lg:py-6 lg:shadow-none",
        !searchOpen && "lg:hidden",
        navigating && "hidden",
      )}>
        <h1 className="sr-only">Route and destination</h1>
        <button type="button" aria-expanded={sheetOpen}
          aria-label={sheetOpen ? "Hide route details" : "Show route details"}
          onClick={() => setSheetOpen((open) => !open)}
          className="mx-auto mb-1 flex h-8 w-16 items-center justify-center rounded-full lg:hidden">
          <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line-strong" />
        </button>
        {/* Collapsed on a phone, the sheet keeps just From, To, the filter and Start (about a third of the screen).
            Typing in a box opens it, so the suggestions have room. */}
        <div className={cn("space-y-4", !sheetOpen && "max-lg:space-y-2")}
          onFocusCapture={() => setSheetOpen(true)}
          onPointerDownCapture={(e) => { if ((e.target as HTMLElement).tagName === "INPUT") setSheetOpen(true); }}>
          {SHOWCASE ? (
            <div className="space-y-1">
              {showcaseTrip && <p className="text-[18px] leading-snug font-bold">{from?.name ?? "…"} to {to?.name ?? "…"}</p>}
              {showcaseTrip && <p className="text-[15px] text-muted">Planned for: {showcaseTrip.needsText.toLowerCase()}</p>}
              {showcaseTrip && <RecordedMark recordedOn={recordedOn} staged={showcaseTrip.staged} />}
            </div>
          ) : (
            <>
              <PlaceInput label="From" compact={!sheetOpen} value={from} onChange={(p) => { setFrom(p); go(p, to); }} />
              <PlaceInput label="To" compact={!sheetOpen} value={to} onChange={(p) => { setTo(p); go(from, p); }} />
            </>
          )}
          <div className="flex items-center gap-2">
            {!SHOWCASE && <button type="button" aria-expanded={filtersOpen} aria-label={filtersOpen ? "Hide filter" : "Filter"}
              onClick={() => { setSheetOpen(true); setFiltersOpen((open) => !open); }}
              className={cn("inline-flex size-11 items-center justify-center rounded-full border",
                filtersOpen ? "border-primary bg-primary text-white" : "border-line-strong bg-surface text-ink")}>
              <SlidersHorizontal aria-hidden="true" className="size-5" strokeWidth={2.4} />
            </button>}
            {canStart && (showcaseNote === null) && (
              <button ref={startButton} type="button" onClick={startNav}
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
          {SHOWCASE && showcaseNote !== null && <ShowcasePicker current={tripId} note={showcaseNote} />}
          <SampleDataBanner show={sample} />
          {route?.note && <InfoBanner>{route.note}. Sydney-wide routing is unavailable right now.</InfoBanner>}
          {route?.transitNote && (
            <InfoBanner>
              <p>{route.transitNote}</p>
              <TryAgain busy={retrying} onClick={retry} />
            </InfoBanner>
          )}
          {error && (
            <WarnBanner alert>
              <p>{error}</p>
              <TryAgain busy={retrying} onClick={retry} />
            </WarnBanner>
          )}
          {!fromId && !SHOWCASE && <InfoBanner>Type where you&apos;re starting from to see a route.</InfoBanner>}
          {fromId && route === null && !error && showcaseNote === null && <RouteSkeleton from={from?.name} to={to?.name} />}

          {route && !route.ok && (
            <WarnBanner alert>
              <p className="font-bold text-warn-strong">{route.reason}</p>
              <p>{route.suggestion}</p>
            </WarnBanner>
          )}

          {options && <TripOptions options={options} selected={selected?.id} onSelect={chooseOption} status={route?.status}
            profile={profile} />}

          {transit && !cards && (
            <section aria-labelledby="summary-h">
              <h2 id="summary-h" className="sr-only">Summary</h2>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[32px] leading-none font-bold">{transit.minutes} min</p>
                  <p className="mt-1 text-[15px] text-muted">
                    {optionTimes(transit)} · {transit.stepFree ? "no steps" : "has steps"}
                  </p>
                </div>
                {route?.status && <StatusBadge label={routeTrust(route.status, transit.legs.flatMap((l) => (l.kind === "walk" ? l.steps : [])))} />}
              </div>
            </section>
          )}

          {active && !cards && (
            <section aria-labelledby="summary-h">
              <h2 id="summary-h" className="sr-only">Summary</h2>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[32px] leading-none font-bold">{active.minutes} min</p>
                  <p className="mt-1 text-[15px] text-muted">
                    {active.stepFree ? "no steps" : "has steps"} ·{" "}
                    {active.slopeEstimated ? "hills not measured" : hillsSummary(activeSteps ?? [], profile)}
                  </p>
                </div>
                {route?.status && !chosen && <StatusBadge label={routeTrust(route.status, activeSteps ?? [])} />}
              </div>
              {/* The numbers, for anyone who wants them (a carer, an expert): out of the way by default. */}
              <button type="button" aria-expanded={showNumbers} onClick={() => setShowNumbers((v) => !v)}
                className="mt-2 inline-flex min-h-11 items-center text-[15px] font-bold text-primary underline underline-offset-4">
                Details
              </button>
              {showNumbers && (
                <p className="text-[15px] text-muted">
                  {active.slopeEstimated ? "Hills not measured" : `Steepest bit ${active.maxSlope}%`} · {active.distanceM} m
                </p>
              )}
            </section>
          )}

          {/* Lift status as text too (the map pins aren't enough for a screen reader). */}
          {route && allLifts.length > 0 && (
            <section aria-labelledby="lifts-h">
              <h2 id="lifts-h" className="mb-1 text-[13px] font-bold tracking-wide text-muted uppercase">Station lifts</h2>
              <ul>
                {allLifts.map((l) => (
                  <li key={liftKey(l)} className="flex items-start gap-3 border-b border-line py-2.5 last:border-b-0">
                    {l.status === "Working"
                      ? <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                      : <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warn" />}
                    <div className="flex-1">
                      <p className="text-[16px]">{l.exit}: {liftText(l.status)}</p>
                      <p className="text-[14px] text-muted">{l.source}, updated {l.updated}</p>
                    </div>
                    <TrustBadge code={liftTrust(l.status)} className="mt-0.5" />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {route?.ok && route.slopeNote && <WarnBanner>{route.slopeNote}</WarnBanner>}

          {transit && explanation && (
            <p className="rounded-[14px] bg-bg px-4 py-3 text-[16px]">{explanation}</p>
          )}

          {transit && (
            <section aria-labelledby="steps-h">
              <h2 id="steps-h" className="text-[13px] font-bold tracking-wide text-muted uppercase">Step by step</h2>
              <LegTimeline legs={transit.legs} profile={profile} />
            </section>
          )}

          {!transit && route?.ok && activeSteps && activeSteps.length > 0 && (
            <section aria-labelledby="steps-h">
              <h2 id="steps-h" className="text-[13px] font-bold tracking-wide text-muted uppercase">Step by step</h2>
              <ol>{activeSteps.map((s, i) => <RouteStep key={i} step={s} profile={profile} />)}</ol>
            </section>
          )}

          {unmet.length > 0 && (
            <WarnBanner>This place may not meet your need for {unmet.join(" or ")}.</WarnBanner>
          )}

          {venue && (
            <section aria-labelledby="dest-h">
              <h2 id="dest-h" className="text-[13px] font-bold tracking-wide text-muted uppercase">Destination check: {venue.name}</h2>
              <ul>{venue.checks.map((c) => <VenueCheckRow key={c.field} check={c} />)}</ul>
              <p className="mt-1 text-[14px] text-muted">
                {venue.sourceCount > 0 ? `Checked ${venue.checkedAgo}, using ${venue.sourceCount} sources.` : "No one has checked this place yet."}
              </p>
            </section>
          )}

          <Button type="button" size="lg" className="w-full" onClick={saveFilter} disabled={saving}>
            {saving ? "Saving…" : "Save filter"}
          </Button>
        </div>
      </aside>
    </div>
  );
}
