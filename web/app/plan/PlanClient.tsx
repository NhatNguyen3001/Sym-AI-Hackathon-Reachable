"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SampleDataBanner, WarnBanner, WeatherBanner } from "@/components/Banners";
import { NeedsChips } from "@/components/NeedsChips";
import { PlaceInput } from "@/components/PlaceInput";
import { Card } from "@/components/layout/Page";
import { getUpdates, getWeather } from "@/lib/api";
import { loadProfile, loadTrips } from "@/lib/profile";
import { places, profile as defaultProfile } from "@/lib/placeholder";
import type { Place, Profile, Trip, UpdateItem, Weather } from "@/lib/types";

const STATION = places[0];

export function PlanClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [from, setFrom] = useState<Place | null>(STATION);
  const [to, setTo] = useState<Place | null>(null);
  const [error, setError] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [changes, setChanges] = useState<UpdateItem[]>([]);
  const [sample, setSample] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setProfile(loadProfile());
    const t = loadTrips();
    setTrips(t);
    if (t[0]) setFrom({ id: t[0].fromId, name: t[0].from, kind: "place", lat: 0, lng: 0 });
    getWeather().then((r) => setWeather(r.data));
    getUpdates().then((r) => {
      setChanges(r.data.slice(0, 3));
      setSample(r.sample);
    });
  }, []);

  function useMyLocation() {
    setLocError(null);
    if (!("geolocation" in navigator)) {
      setLocError("Your browser can't share your location. Search for a place instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(5);
        const lng = pos.coords.longitude.toFixed(5);
        setFrom({ id: `coord:here:${lat},${lng}`, name: "Your location", kind: "place", lat: +lat, lng: +lng });
        setError(false);
        setLocating(false);
      },
      () => {
        setLocError("We couldn't get your location. Check location permission, or search for a place instead.");
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) {
      setError(true);
      return;
    }
    router.push(`/route?from=${encodeURIComponent(from.id)}&to=${encodeURIComponent(to.id)}`);
  }

  return (
    <div className="flex flex-wrap gap-6">
      <div className="min-w-0 flex-[1_1_520px] space-y-5">
        <div>
          <h1 className="text-[34px] leading-tight font-bold sm:text-[44px]">Find a route you can actually use</h1>
          <p className="mt-2 max-w-[640px] text-[18px] text-muted">
            We plan the walk or roll from the station, stop or drop-off point to the door, and check the place you&apos;re going.
          </p>
        </div>
        <form onSubmit={submit} noValidate>
          <Card className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <PlaceInput label="From" value={from} onChange={(p) => { setFrom(p); setError(false); }}
                  hint="Stations, bus stops and drop-off points come first." />
                <Button type="button" variant="link" className="min-h-11 px-0" onClick={useMyLocation} disabled={locating}>
                  {locating ? "Finding your location…" : "Use my location"}
                </Button>
                {locError && <p role="alert" className="text-[14px] text-warn-strong">{locError}</p>}
              </div>
              <PlaceInput label="To" value={to} onChange={(p) => { setTo(p); setError(false); }} placeholder="Search campus places" />
            </div>
            <NeedsChips profile={profile} label="Planning for:" />
            <WeatherBanner weather={weather} />
            {error && <WarnBanner alert>Pick a place from the list for From and To.</WarnBanner>}
            <Button type="submit" size="lg" className="min-h-[58px] w-full text-[18px]">Find a route I can use</Button>
          </Card>
        </form>
      </div>

      <div className="flex-[1_1_340px] space-y-5">
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[20px] font-bold">Changes near you</h2>
            <Link href="/live" className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">
              See all<span className="sr-only"> live updates</span>
            </Link>
          </div>
          <SampleDataBanner show={sample} />
          <ul className="mt-2">
            {changes.map((c) => (
              <li key={c.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
                <span aria-hidden="true" className={`mt-1.5 size-3 shrink-0 rounded-[3px] ${c.tone === "warn" ? "bg-warn" : "bg-primary"}`} />
                <div>
                  <p className="font-bold">{c.title}</p>
                  <p className="text-[14px] text-muted">{c.place} · {c.source} · {c.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-[20px] font-bold">Recent trips</h2>
          {trips.length === 0 ? (
            <p className="mt-2 text-muted">Your recent trips will show here.</p>
          ) : (
            <ul className="mt-2">
              {trips.map((t) => (
                <li key={`${t.fromId}-${t.toId}`} className="border-b border-line last:border-b-0">
                  <Link href={`/route?from=${t.fromId}&to=${t.toId}`}
                    className="flex min-h-11 items-center justify-between gap-3 py-2 text-ink hover:text-primary">
                    <span>{t.from} to {t.to}</span>
                    <span className="text-[14px] text-muted">{t.minutes} min</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
