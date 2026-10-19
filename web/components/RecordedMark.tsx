import { History } from "lucide-react";
import { cn } from "cn";

/** Says plainly that what's shown was recorded, and when (in the trust labels' style: a mark with its own shape). */
export function RecordedMark({ recordedOn, staged, className }: { recordedOn?: string | null; staged?: string; className?: string }) {
  return (
    <p className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-bold text-ink", className)}>
      <span className="inline-flex items-center gap-1">
        <History aria-hidden="true" className="size-4" strokeWidth={2.4} />
        Recorded example{recordedOn ? ` · ${recordedOn}` : ""}
      </span>
      {staged && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn-ink">{staged}</span>}
    </p>
  );
}
