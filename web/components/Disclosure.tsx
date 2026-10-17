"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";

/** A question that opens to show its answer: a button with aria-expanded controlling the panel. */
export function Disclosure({ question, children, defaultOpen = false }: {
  question: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="rounded-[14px] border border-line bg-surface">
      <h2 className="text-[18px] font-bold">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}
          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[14px] px-4 py-3 text-left hover:bg-bg">
          {question}
          <ChevronDown aria-hidden="true" strokeWidth={2.4}
            className={cn("size-5 shrink-0 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </h2>
      <div id={id} hidden={!open} className="space-y-2 px-4 pb-4 text-[16px] leading-relaxed text-muted">
        {children}
      </div>
    </div>
  );
}
