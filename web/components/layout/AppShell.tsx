"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, CircleHelp, Map as MapIcon, Menu, Moon, Route, Settings, Sun, TriangleAlert,
} from "lucide-react";
import { cn } from "cn";
import { LogoImage } from "@/components/brand/LogoImage";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@/components/ui/dialog";

const LINKS = [
  { href: "/", label: "Map", short: "Map", icon: MapIcon, match: (p: string) => p === "/" },
  { href: "/plan", label: "Plan a trip", short: "Plan", icon: Route, match: (p: string) => p === "/plan" || p.startsWith("/route") },
  { href: "/live", label: "Live updates", short: "Updates", icon: Bell, match: (p: string) => p.startsWith("/live") },
  { href: "/needs", label: "My needs", short: "Needs", icon: Settings, match: (p: string) => p.startsWith("/needs") },
  { href: "/report", label: "Report a barrier", short: "Report", icon: TriangleAlert, match: (p: string) => p.startsWith("/report") },
];

function NavLinks({ onNavigate, labelled = false }: { onNavigate?: () => void; labelled?: boolean }) {
  const path = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {LINKS.map((item) => {
        const current = item.match(path);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-[12px] px-3 text-[16px]",
                current ? "bg-primary-soft font-bold text-primary-hover" : "text-ink hover:bg-bg",
              )}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.2} />
              {labelled ? <span className="sr-only">{item.label}</span> : item.label}
            </Link>
          </li>
        );
      })}
      <li>
        <Link href="/about" onClick={onNavigate}
          className="flex min-h-12 items-center gap-3 rounded-[12px] px-3 text-[16px] text-ink hover:bg-bg">
          <CircleHelp aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.2} />
          How it works
        </Link>
      </li>
    </ul>
  );
}

function MenuBody({ onNavigate }: { onNavigate?: () => void }) {
  const { theme, toggle } = useTheme();
  const night = theme === "dark";
  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="inline-flex rounded-[12px] px-1 py-1">
        <LogoImage />
      </Link>
      <div className="mt-2 border-b border-line px-3 pb-4">
        <p className="text-[22px] font-bold">Hey there</p>
        <p className="text-[15px] text-muted">Step-free, from the stop to the door.</p>
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3">
        <NavLinks onNavigate={onNavigate} />
      </nav>
      <div className="border-t border-line p-3">
        <button type="button" onClick={toggle} aria-pressed={night}
          className="flex min-h-12 w-full items-center gap-3 rounded-[12px] px-3 text-left text-[16px] hover:bg-bg">
          {night
            ? <Sun aria-hidden="true" className="size-5" strokeWidth={2.2} />
            : <Moon aria-hidden="true" className="size-5" strokeWidth={2.2} />}
          {night ? "Light mode" : "Night mode"}
        </button>
        <Link href="/privacy" onClick={onNavigate}
          className="inline-flex min-h-11 items-center px-3 text-[15px] text-primary underline underline-offset-4">
          Privacy
        </Link>
      </div>
    </div>
  );
}

function BottomNav({ onMenu }: { onMenu: () => void }) {
  const path = usePathname();
  const tabs = LINKS.filter((item) => item.href !== "/needs");
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-[400] border-t border-line bg-surface lg:hidden">
      <ul className="mx-auto flex max-w-[560px] items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((item) => {
          const current = item.match(path);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link href={item.href} aria-current={current ? "page" : undefined} aria-label={item.label}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-0.5 text-[12px]",
                  current ? "font-bold text-primary" : "text-muted",
                )}>
                <Icon aria-hidden="true" className="size-5" strokeWidth={2.2} />
                <span aria-hidden="true">{item.short}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button type="button" onClick={onMenu} aria-haspopup="dialog"
            className="flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-[12px] text-muted">
            <Menu aria-hidden="true" className="size-5" strokeWidth={2.2} />
            Menu
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Desktop sidebar plus a phone bottom bar. `map` locks the page to the screen for the live map. */
export function AppShell({ children, map = false }: { children: ReactNode; map?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("flex w-full", map ? "h-dvh overflow-hidden" : "min-h-dvh")}>
      <aside className="sticky top-0 hidden h-dvh w-[280px] shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <MenuBody />
      </aside>
      <div className={cn("flex min-w-0 flex-1 flex-col", map && "min-h-0")}>
        <main id="main" className={cn("flex min-w-0 flex-1 flex-col", map ? "min-h-0" : "pb-20 lg:pb-0")}>
          {children}
        </main>
      </div>
      <BottomNav onMenu={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-0 left-0 z-[3000] flex h-dvh w-[min(100%,340px)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-surface p-4 shadow-xl sm:max-w-none"
        >
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <DialogDescription className="sr-only">Plan a trip, updates, needs, and appearance.</DialogDescription>
          <MenuBody onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
