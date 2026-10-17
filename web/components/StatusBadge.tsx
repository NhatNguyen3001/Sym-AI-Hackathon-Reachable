import { cn } from "cn";

const PRIMARY = ["confirmed", "updated", "resolved", "active", "working", "measured", "cleared", "refreshed"];
const WARN = ["not sure", "needs checking", "not found", "not checked", "out of service", "some details not sure", "in effect", "unconfirmed", "happening now"];

export function badgeTone(label: string): "primary" | "warn" | "muted" {
  const l = label.toLowerCase();
  if (WARN.some((w) => l.startsWith(w))) return "warn";
  if (PRIMARY.some((p) => l.startsWith(p))) return "primary";
  return "muted";
}

/** Status text in a tinted badge. The meaning is always in the text, never only in the colour. */
export function StatusBadge({ label, className }: { label: string; className?: string }) {
  const tone = badgeTone(label);
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-[6px] px-2 py-0.5 text-[13px] font-bold leading-snug",
        tone === "primary" && "bg-primary-soft text-primary",
        tone === "warn" && "bg-warn-soft text-warn-strong",
        tone === "muted" && "bg-bg text-muted",
        className,
      )}
    >
      {label}
    </span>
  );
}
