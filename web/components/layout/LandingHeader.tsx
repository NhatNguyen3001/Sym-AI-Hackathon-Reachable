import Link from "next/link";
import { Logo } from "./AppHeader";

export function LandingHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-7">
        <Logo />
        <nav aria-label="Main">
          <ul className="flex flex-wrap items-center gap-1">
            <li><a href="#how" className="inline-flex min-h-11 items-center rounded-[12px] px-3 hover:bg-bg">How it works</a></li>
            <li><Link href="/live" className="inline-flex min-h-11 items-center rounded-[12px] px-3 hover:bg-bg">Live updates</Link></li>
            <li>
              <Link href="/plan" className="ml-1 inline-flex min-h-12 items-center rounded-[12px] bg-primary px-4 font-bold text-white hover:bg-primary-hover">
                Plan a trip
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
