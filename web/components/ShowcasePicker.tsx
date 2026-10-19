"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { GITHUB_URL, tripHref, type ShowcaseManifest } from "@/lib/showcase";
import { loadManifest } from "@/lib/showcaseData";

/** The showcase's front door: what Reachable is, and the five recorded trips to pick from. Folds away to show the map. */
export function ShowcasePicker({ current, note, className }: { current?: string | null; note?: string; className?: string }) {
  const [manifest, setManifest] = useState<ShowcaseManifest | null | undefined>(undefined);
  const [open, setOpen] = useState(true);
  const body = useId();
  useEffect(() => {
    let live = true;
    loadManifest().then((m) => live && setManifest(m));
    return () => {
      live = false;
    };
  }, []);

  return (
    <section aria-label="Pick a trip" className={className}>
      <h2>
        <button type="button" aria-expanded={open} aria-controls={body} onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[12px] text-left text-[18px] leading-snug font-bold">
          Pick a trip
          <ChevronDown aria-hidden="true" className={cn("size-5 shrink-0 text-muted transition-transform motion-reduce:transition-none", !open && "-rotate-90")}
            strokeWidth={2.4} />
        </button>
      </h2>
      {note && <p role="status" className="mt-1 text-[15px] font-bold">{note}</p>}
      <div id={body} hidden={!open}>
        <p className="mt-1 text-[15px] text-muted">
          Reachable plans step-free trips in Sydney, Australia. These are real trips recorded with the live app
          {manifest?.recordedOn ? ` on ${manifest.recordedOn}` : ""}.
        </p>
        {manifest === null && !note && <p role="status" className="mt-2 text-[15px] font-bold">This example couldn&apos;t load.</p>}
        {manifest && (
          <ul className="mt-3 flex flex-col gap-2">
            {manifest.trips.map((t) => (
              <li key={t.id}>
                <Link href={tripHref(t)} aria-current={t.id === current ? "page" : undefined}
                  className={cn("flex min-h-12 items-center gap-2 rounded-[14px] border px-3 py-2",
                    t.id === current ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong")}>
                  <span className="flex-1">
                    <span className="block text-[16px] leading-snug font-bold">{t.title}</span>
                    <span className="block text-[14px] text-muted">{t.needsText}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted" strokeWidth={2.4} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[14px] text-muted">
          Want to plan your own trips? Reachable&apos;s{" "}
          <a href={GITHUB_URL} className="font-bold text-primary underline">code on GitHub</a> has the steps to run the full app.
        </p>
      </div>
    </section>
  );
}
