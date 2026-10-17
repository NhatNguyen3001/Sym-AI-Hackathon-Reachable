import { CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { groupWays, optionTitle, showsCards, timeOfDay } from "@/lib/trip";
import type { TripOption } from "@/lib/types";

/** "Ways to get there": one radio card per way to travel, with "Leave at" chips for its departures.
 *  The chosen card is the summary (time, how, step-free, the chosen departure's lift warnings). */
export function TripOptions({
  options, selected, onSelect,
}: {
  options: TripOption[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  if (!showsCards(options)) return null;
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-bold tracking-wide text-muted uppercase">Ways to get there</legend>
      <div className="space-y-2">
        {groupWays(options).map((g) => {
          const chosen = g.options.find((o) => o.id === selected);
          const o = chosen ?? g.options[0];
          const on = !!chosen;
          return (
            <div key={g.wayId}
              className={cn("rounded-[14px] border bg-surface", on ? "border-2 border-primary bg-primary-soft" : "border-line")}>
              <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 p-3.5", !on && "hover:bg-bg rounded-[14px]")}>
                <input type="radio" name="trip-way" value={o.id} checked={on} onChange={() => onSelect(o.id)}
                  className="mt-1 size-5 shrink-0 accent-primary" />
                <span className="flex-1">
                  <span className="block text-[17px] font-bold">{optionTitle(o)}</span>
                  <span className="block text-[15px] text-muted">
                    {o.mode === "walk" ? `Any time · ${o.summary}` : o.summary}
                  </span>
                  {o.stepFree && (
                    <span className="mt-1 flex items-center gap-1.5 text-[14px] font-bold text-primary">
                      <CircleCheck aria-hidden="true" className="size-4" /> Step-free
                    </span>
                  )}
                  {o.warnings[0] && (
                    <span className="mt-1 flex items-start gap-1.5 text-[14px] text-warn-strong">
                      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> {o.warnings[0]}
                    </span>
                  )}
                </span>
              </label>
              {o.mode === "transit" && o.leaveAt && (
                <div role="group" aria-label={`Leave at, ${optionTitle(o)}`}
                  className="flex flex-wrap items-center gap-2 px-3.5 pb-3.5 pl-11">
                  <span aria-hidden="true" className="text-[14px] text-muted">Leave at</span>
                  {g.options.map((d) => {
                    const time = d.leaveAt ? timeOfDay(d.leaveAt) : "";
                    const alert = d.liftAlerts.length > 0;
                    const pressed = d.id === selected;
                    return (
                      <button key={d.id} type="button" aria-pressed={pressed}
                        aria-label={`Leave at ${time}${alert ? ", lift alert" : ""}`}
                        onClick={() => onSelect(d.id)}
                        className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[15px] font-bold",
                          pressed ? "border-primary bg-primary text-white" : "border-line-strong bg-surface text-ink hover:bg-bg")}>
                        {time}
                        {alert && <TriangleAlert aria-hidden="true" className={cn("size-4", pressed ? "text-white" : "text-warn")} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
