import { CircleCheck, CircleDashed, CircleHelp, CircleMinus, Contrast, Ruler } from "lucide-react";
import { cn } from "cn";
import { trust, type TrustMark } from "@/lib/wording";

const MARKS: Record<TrustMark, typeof CircleCheck> = {
  tick: CircleCheck, ruler: Ruler, half: Contrast, dotted: CircleDashed, question: CircleHelp, dash: CircleMinus,
};
const TONE: Record<TrustMark, string> = {
  tick: "text-primary", ruler: "text-primary", half: "text-ink", dotted: "text-warn-strong", question: "text-warn-strong",
  dash: "text-muted",
};

/** Whether to trust it: plain words and a mark with its own shape (never colour alone). */
export function TrustBadge({ code, className }: { code: string; className?: string }) {
  const t = trust(code);
  const Mark = MARKS[t.mark];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-[13px] font-bold", TONE[t.mark], className)}>
      <Mark aria-hidden="true" className="size-4" strokeWidth={2.4} />
      {t.text}
    </span>
  );
}
