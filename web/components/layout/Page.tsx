import type { ReactNode } from "react";
import { AppShell } from "./AppShell";

/** Standard app page: sidebar or bottom bar, then a centred column. */
export function AppPage({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-8 pb-10 sm:px-7">{children}</div>
    </AppShell>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-[32px] leading-tight font-bold sm:text-[36px]">{title}</h1>
      {sub && <p className="mt-2 max-w-[680px] text-[18px] text-muted">{sub}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[18px] border border-line bg-surface p-5 sm:p-6 ${className}`}>{children}</section>;
}
