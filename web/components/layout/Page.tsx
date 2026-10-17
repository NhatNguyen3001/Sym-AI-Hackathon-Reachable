import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";

/** Standard app page: header + centred container (max 1240px, 28px sides, 16px on phones, 40px top). */
export function AppPage({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-10 pb-16 sm:px-7">{children}</main>
    </>
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
