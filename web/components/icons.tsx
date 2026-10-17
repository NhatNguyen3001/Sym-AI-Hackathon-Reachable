import type { SVGProps } from "react";

/** Lucide has no stairs icon; this one matches its 24px grid and stroke style. */
export function StairsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={2.2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 20h5v-5h5v-5h5V5h3" />
    </svg>
  );
}

/** The Reachable mark: a rising path in a rounded square. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center justify-center rounded-[10px] bg-primary text-white"
      style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor"
        strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 17 12 7l7 10" />
      </svg>
    </span>
  );
}
