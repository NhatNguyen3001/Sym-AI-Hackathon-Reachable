"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, ChevronLeft, ChevronRight, Map as MapIcon, Menu, Moon, Sun, TriangleAlert,
} from "lucide-react";
import { cn } from "cn";
import { LogoImage } from "@/components/brand/LogoImage";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@/components/ui/dialog";
import { readStored, writeStored } from "@/lib/storage";

const LINKS = [
  { href: "/", label: "Map", icon: MapIcon, match: (p: string) => p === "/" || p.startsWith("/route") },
  { href: "/live", label: "Live updates", icon: Bell, match: (p: string) => p.startsWith("/live") },
  { href: "/report", label: "Report a barrier", icon: TriangleAlert, match: (p: string) => p.startsWith("/report") },
];

/** The name of an icon-only control: shown as a tooltip on hover or focus, and used as its accessible name. */
function Tip({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span role="tooltip" id={id}
      className="pointer-events-none invisible absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-[8px] bg-ink px-2.5 py-1.5 text-[14px] font-bold text-surface shadow-lg group-hover:visible group-focus-within:visible">
      {children}
    </span>
  );
}

function NavLinks({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const path = usePathname();
  const tip = useId();
  return (
    <ul className="flex flex-col gap-1">
      {LINKS.map((item) => {
        const current = item.match(path);
        const Icon = item.icon;
        return (
          <li key={item.href} className={cn(compact && "group relative")}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              aria-labelledby={compact ? `${tip}-${item.href}` : undefined}
              onClick={onNavigate}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-[12px] text-[16px]",
                compact ? "justify-center px-0" : "px-3",
                current ? "bg-primary-soft font-bold text-primary-hover" : "text-ink hover:bg-bg",
              )}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.2} />
              {!compact && item.label}
            </Link>
            {compact && <Tip id={`${tip}-${item.href}`}>{item.label}</Tip>}
          </li>
        );
      })}
    </ul>
  );
}

function MenuBody({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const { theme, toggle } = useTheme();
  const night = theme === "dark";
  const tip = useId();
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-12 items-center justify-center">
        <Link href="/" onClick={onNavigate} className="inline-flex rounded-[12px] px-1 py-1">
          {compact
            // eslint-disable-next-line @next/next/no-img-element -- small static logo mark
            ? <img src="/brand/reachable-mark.png" alt="Reachable" width={40} height={40} className="size-10" />
            : <LogoImage />}
        </Link>
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3">
        <NavLinks onNavigate={onNavigate} compact={compact} />
      </nav>
      <div className="border-t border-line p-3">
        <div className={cn(compact && "group relative")}>
        <button type="button" onClick={toggle} aria-pressed={night}
          aria-labelledby={compact ? `${tip}-theme` : undefined}
          className={cn("flex min-h-12 w-full items-center gap-3 rounded-[12px] text-left text-[16px] hover:bg-bg",
            compact ? "justify-center px-0" : "px-3")}>
          {night
            ? <Sun aria-hidden="true" className="size-5" strokeWidth={2.2} />
            : <Moon aria-hidden="true" className="size-5" strokeWidth={2.2} />}
          {!compact && (night ? "Light mode" : "Night mode")}
        </button>
        {compact && <Tip id={`${tip}-theme`}>{night ? "Light mode" : "Night mode"}</Tip>}
        </div>
        <div className={cn(compact && "group relative")}>
        <Link href="/privacy" onClick={onNavigate} aria-labelledby={compact ? `${tip}-privacy` : undefined}
          className={cn("inline-flex min-h-11 items-center text-[15px] text-primary underline underline-offset-4",
            compact ? "w-full justify-center px-0" : "px-3")}>
          {compact ? <span aria-hidden="true">i</span> : "Privacy"}
        </Link>
        {compact && <Tip id={`${tip}-privacy`}>Privacy</Tip>}
        </div>
      </div>
    </div>
  );
}

/** Desktop sidebar, and a phone menu button in the top-right corner. `map` locks the page to the screen. */
export function AppShell({ children, map = false }: { children: ReactNode; map?: boolean }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state is only readable after mount (no hydration mismatch)
    setCollapsed(readStored("reachable-sidebar") === "closed");
  }, []);
  function toggleSidebar() {
    setCollapsed((v) => {
      const next = !v;
      writeStored("reachable-sidebar", next ? "closed" : "open");
      return next;
    });
  }
  return (
    <div className={cn("flex w-full", map ? "h-dvh overflow-hidden" : "min-h-dvh")}>
      <aside className={cn(
        "sticky top-0 z-[900] hidden h-dvh shrink-0 flex-col border-r border-line bg-surface py-4 lg:flex",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0",
        collapsed ? "w-[76px] px-2" : "w-[280px] px-3",
      )}>
        <MenuBody compact={collapsed} />
        {/* Round handle on the border between the sidebar and the page. 44 px to tap, 28 px to see. */}
        <button type="button" onClick={toggleSidebar} aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="group absolute top-[76px] -right-[22px] inline-flex size-11 items-center justify-center">
          <span aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-full border border-line-strong bg-surface text-ink shadow-sm group-hover:bg-bg group-focus-visible:outline-2 group-focus-visible:outline-primary">
            {collapsed
              ? <ChevronRight className="size-4" strokeWidth={2.6} />
              : <ChevronLeft className="size-4" strokeWidth={2.6} />}
          </span>
        </button>
      </aside>
      <div className={cn("flex min-w-0 flex-1 flex-col", map && "min-h-0")}>
        <main id="main" className={cn("flex min-w-0 flex-1 flex-col", map && "min-h-0")}>
          {children}
        </main>
      </div>
      <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-haspopup="dialog"
        className="fixed top-3 left-3 z-[800] inline-flex size-12 items-center justify-center rounded-[12px] border-2 border-ink bg-surface text-ink shadow-sm lg:hidden">
        <Menu aria-hidden="true" className="size-6" strokeWidth={2.6} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-0 left-0 z-[3000] flex h-dvh w-[min(100%,340px)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-surface p-4 shadow-xl sm:max-w-none"
        >
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <DialogDescription className="sr-only">Map, live updates, reports, and appearance.</DialogDescription>
          <MenuBody onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
