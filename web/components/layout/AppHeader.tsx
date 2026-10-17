"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { LogoImage } from "@/components/brand/LogoImage";

const NAV = [
  { href: "/", label: "Map" },
  { href: "/live", label: "Live updates" },
];

export function Logo() {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center">
      <LogoImage className="h-auto w-[148px]" />
    </Link>
  );
}

export function AppHeader() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-7">
        <Logo />
        <nav aria-label="Main">
          <ul className="flex flex-wrap gap-1">
            {NAV.map((n) => {
              const current = path === n.href || (n.href === "/" && path.startsWith("/route"));
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={path === n.href ? "page" : undefined}
                    className={cn("inline-flex min-h-11 items-center rounded-[12px] px-3.5 text-[16px]",
                      current ? "bg-primary-soft font-bold text-primary-hover" : "text-ink hover:bg-bg")}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <Link
          href="/report"
          aria-current={path === "/report" ? "page" : undefined}
          className={cn("inline-flex min-h-12 items-center rounded-[12px] border border-line-strong px-4 text-[16px] font-bold",
            path === "/report" ? "bg-primary-soft text-primary-hover" : "bg-surface text-ink hover:bg-bg")}
        >
          Report a barrier
        </Link>
      </div>
    </header>
  );
}
