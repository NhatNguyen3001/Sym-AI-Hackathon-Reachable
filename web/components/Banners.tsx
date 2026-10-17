import type { ReactNode } from "react";
import { CloudRain, Info, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import type { Weather } from "@/lib/types";

/** Shown only when the weather changes routing. */
export function WeatherBanner({ weather, className }: { weather: Weather | null | undefined; className?: string }) {
  return (
    <div role="status" className={className}>
      {weather?.raining && (
        <div className="flex gap-3 rounded-[14px] bg-warn-soft px-4 py-3 text-[15px] text-warn-ink">
          <CloudRain aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warn" />
          <p>
            <strong className="text-warn-strong">{weather.summary}</strong> Avoiding steep or smooth paths that get slippery.
          </p>
        </div>
      )}
    </div>
  );
}

export function InfoBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("flex gap-3 rounded-[14px] bg-primary-soft px-4 py-3 text-[15px] text-primary-hover", className)}>
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** Warnings the user should act on (no route, destination need not met). */
export function WarnBanner({ children, className, alert = false }: { children: ReactNode; className?: string; alert?: boolean }) {
  return (
    <div role={alert ? "alert" : undefined}
      className={cn("flex gap-3 rounded-[14px] bg-warn-soft px-4 py-3 text-[15px] text-warn-ink", className)}>
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warn" />
      <div>{children}</div>
    </div>
  );
}

export function SampleDataBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return <InfoBanner>Showing sample data. We can&apos;t reach the server right now.</InfoBanner>;
}
