import { Bus, Footprints, MoveVertical, Ship, TrainFront, TramFront, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RouteStep } from "./Rows";
import { legTitle, rideDetail } from "@/lib/trip";
import type { Leg, Profile } from "@/lib/types";

const RIDE_ICONS: Record<string, LucideIcon> = { train: TrainFront, metro: TrainFront, lightrail: TramFront, ferry: Ship };

function LegIcon({ leg }: { leg: Leg }) {
  const Icon = leg.kind === "walk" ? Footprints : leg.kind === "station" ? MoveVertical : RIDE_ICONS[leg.mode] ?? Bus;
  return (
    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-primary-soft text-primary">
      <Icon className="size-5" strokeWidth={2.4} />
    </span>
  );
}

/** A public transport trip, leg by leg: our walks (with their steps), station paths, and rides. */
export function LegTimeline({ legs, profile }: { legs: Leg[]; profile?: Profile }) {
  return (
    <ol className="mt-2 space-y-4">
      {legs.map((leg, i) => (
        <li key={i} className="flex gap-3">
          <LegIcon leg={leg} />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold">{legTitle(leg)}</p>
            {leg.kind === "walk" && leg.steps.length > 0 && (
              <ol>{leg.steps.map((s, k) => <RouteStep key={k} step={s} profile={profile} />)}</ol>
            )}
            {leg.kind === "station" && (
              <>
                <p className="text-[15px] text-muted">
                  {leg.path.map((p) => p.label).join(", ") || "Path inside the station"} · {leg.minutes} min · from Transport for NSW
                </p>
                {leg.liftAlerts.map((a) => (
                  <p key={a.text} className="mt-1 flex items-start gap-1.5 text-[15px] text-warn-strong">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {a.text}.{" "}
                      {a.url && <a className="font-bold underline underline-offset-4" href={a.url}>Details from Transport for NSW</a>}
                    </span>
                  </p>
                ))}
              </>
            )}
            {leg.kind === "ride" && (
              <p className="text-[15px] text-muted">{rideDetail(leg)} · to {leg.to.name}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
