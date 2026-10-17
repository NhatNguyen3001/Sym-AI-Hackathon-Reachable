import Link from "next/link";
import { AID_LABELS } from "@/lib/profile";
import type { Profile } from "@/lib/types";

export function needsSummary(p: Profile): string[] {
  const out = [AID_LABELS[p.aid], `Max slope ${p.maxSlope}%`];
  if (p.avoid.stairs) out.push("No stairs");
  if (p.destination.toilet) out.push("Accessible toilet");
  if (p.destination.parking) out.push("Accessible parking");
  return out;
}

export function NeedsChips({ profile, label = "Your needs:" }: { profile: Profile; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[15px]">
      <span className="text-muted">{label}</span>
      <ul className="contents">
        {needsSummary(profile).map((n) => (
          <li key={n} className="rounded-[8px] border border-line bg-bg px-2.5 py-1 text-ink">{n}</li>
        ))}
      </ul>
      <Link href="/needs" className="inline-flex min-h-11 items-center px-1 font-bold text-primary underline underline-offset-4">
        Change<span className="sr-only"> my needs</span>
      </Link>
    </div>
  );
}
