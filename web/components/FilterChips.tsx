"use client";
import { cn } from "cn";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Single-select toggle chips. Each chip is a real <button aria-pressed>; the group is labelled so screen
 * readers announce what the choice is about. Use `legend` to render a visible group label.
 */
export function FilterChips<T extends string>({
  label, options, value, onChange, className,
}: {
  label: string;
  options: ChipOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 rounded-[22px] px-4 py-2 text-[16px] leading-tight transition-colors",
              on ? "border-2 border-primary bg-primary-soft font-bold text-primary-hover"
                : "border border-line-strong bg-surface text-ink hover:bg-bg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
