import { CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { optionTimes, optionTitle } from "@/lib/trip";
import type { TripOption } from "@/lib/types";

/** "Ways to get there": one radio card per option. Nothing to choose with a single option. */
export function TripOptions({
  options, selected, onSelect,
}: {
  options: TripOption[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-bold tracking-wide text-muted uppercase">Ways to get there</legend>
      <div className="space-y-2">
        {options.map((o) => {
          const on = o.id === selected;
          const times = optionTimes(o);
          return (
            <label
              key={o.id}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-[14px] border bg-surface p-3.5",
                on ? "border-2 border-primary bg-primary-soft" : "border-line hover:bg-bg",
              )}
            >
              <input
                type="radio"
                name="trip-option"
                value={o.id}
                checked={on}
                onChange={() => onSelect(o.id)}
                className="mt-1 size-5 shrink-0 accent-primary"
              />
              <span className="flex-1">
                <span className="block text-[17px] font-bold">{optionTitle(o)}</span>
                {times && <span className="block text-[15px] text-muted">{times}</span>}
                <span className="block text-[15px] text-muted">{o.summary}</span>
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
          );
        })}
      </div>
    </fieldset>
  );
}
