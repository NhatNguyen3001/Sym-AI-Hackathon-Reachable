"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { tripHref, type ShowcaseManifest } from "@/lib/showcase";
import { loadManifest } from "@/lib/showcaseData";

export const GITHUB_URL = "https://github.com/NhatNguyen3001/Sym-AI-Hackathon-Reachable";

/** The showcase's front door: what Reachable is, and the five recorded trips to pick from. */
export function ShowcasePicker({ current, note, className }: { current?: string | null; note?: string; className?: string }) {
  const [manifest, setManifest] = useState<ShowcaseManifest | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadManifest().then((m) => live && setManifest(m));
    return () => {
      live = false;
    };
  }, []);

  return (
    <section aria-labelledby="showcase-title" className={className}>
      <h2 id="showcase-title" className="text-[18px] leading-snug font-bold">Pick a trip</h2>
      <p className="mt-1 text-[15px] text-muted">
        Reachable plans step-free trips in Sydney, Australia. These are real trips recorded with the live app
        {manifest?.recordedOn ? ` on ${manifest.recordedOn}` : ""}.
      </p>
      {note && <p role="status" className="mt-2 text-[15px] font-bold">{note}</p>}
      {manifest === null && <p role="status" className="mt-2 text-[15px] font-bold">This example couldn&apos;t load.</p>}
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
        To plan any trip yourself, <a href={GITHUB_URL} className="font-bold text-primary underline">run it live from GitHub</a>.
      </p>
    </section>
  );
}
