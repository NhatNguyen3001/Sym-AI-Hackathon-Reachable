import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-[15px] text-muted sm:px-7">
        <p>Reachable · Built at the Sym AI Open 2026, Macquarie University</p>
        <Link href="/privacy" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Privacy</Link>
      </div>
    </footer>
  );
}
