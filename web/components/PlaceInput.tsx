"use client";
// Accessible combobox (WAI-ARIA 1.2 list autocomplete): type to search campus places, arrows to move, Enter to pick.
import { useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "cn";
import { searchPlaces } from "@/lib/api";
import type { Place } from "@/lib/types";

export function PlaceInput({
  label, value, onChange, placeholder, hint, menuPlacement = "down",
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  placeholder?: string;
  hint?: string;
  menuPlacement?: "up" | "down";
}) {
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const [text, setText] = useState(value?.name ?? "");
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [limited, setLimited] = useState(false);
  const [pending, setPending] = useState(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When the parent changes the picked place (e.g. from the URL), show its name.
  const [shown, setShown] = useState(value?.id);
  if (value && value.id !== shown) {
    setShown(value.id);
    setText(value.name);
  }

  // The query the current suggestions belong to, so Enter never picks a result for different text.
  const optionsFor = useRef<string | null>(null);

  /** One or no characters only shows our known places. */
  const normalise = (q: string) => (q.trim().length >= 2 ? q : "");

  /** Runs a search now. Returns its results, or null if a newer search started meanwhile. */
  async function runSearch(query: string): Promise<Place[] | null> {
    const n = ++seq.current;
    let first = true;
    // Known places show at once; address results replace them when the full search answers.
    const done = await searchPlaces(query, (r) => {
      if (n !== seq.current) return;  // a newer search (or a pick) has taken over
      optionsFor.current = query;
      setOptions(r.data);
      setLimited(r.limited && query.trim().length >= 2);
      setPending(r.pending);
      if (first) setActive(r.data.length ? 0 : -1);
      first = false;
    });
    if (n !== seq.current) return null;
    return done.data;
  }

  /** Waits for a pause in typing (250 ms). Any search already in flight is discarded straight away. */
  function search(q: string, immediate = false) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    seq.current++;
    optionsFor.current = null;
    setPending(false);
    const query = normalise(q);
    if (immediate) void runSearch(query);
    else timer.current = setTimeout(() => { timer.current = null; void runSearch(query); }, 250);
  }

  /** Enter while the list is out of date (still typing, or results for older text): search now, pick the top match. */
  async function pickForEnter() {
    const query = normalise(text);
    if (optionsFor.current === query && !timer.current) {
      if (options[active]) pick(options[active]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const results = await runSearch(query);
    if (results && results.length && query) pick(results[0]);
  }

  function pick(p: Place) {
    onChange(p);
    setText(p.name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        search(text, true);
      } else setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      void pickForEnter();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-[16px] font-bold">{label}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={hint ? hintId : undefined}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange(null);
          setOpen(true);
          // Drop suggestions for the old text so Enter can't pick a stale result while the new search waits.
          setOptions([]);
          setActive(-1);
          search(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          search(value ? "" : text, true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        className="h-12 w-full rounded-[12px] border border-line-strong bg-surface px-3.5 text-[17px] text-ink"
      />
      {hint && <p id={hintId} className="mt-1 text-[14px] text-muted">{hint}</p>}
      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} suggestions`}
        className={cn("absolute z-[1000] max-h-72 w-full overflow-auto rounded-[12px] border border-line bg-surface py-1",
          menuPlacement === "up" ? "bottom-full mb-1" : "mt-1",
          !(open && options.length > 0) && "hidden")}
      >
        {options.map((p, i) => (
          <li
            key={p.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(p);
            }}
            onMouseEnter={() => setActive(i)}
            className={cn("flex min-h-11 cursor-pointer items-center gap-2 px-3.5 py-2 text-[16px]",
              i === active && "bg-primary-soft text-primary-hover")}
          >
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-muted" />
            <span className="min-w-0">
              <span className="block">{p.name}</span>
              {p.detail && <span className="block text-[14px] text-muted">{p.detail}</span>}
            </span>
            {p.kind === "station" && <span className="ml-auto text-[13px] text-muted">Station</span>}
          </li>
        ))}
      </ul>
      <p role="status" className={cn("mt-1 text-[14px] text-muted", !(open && pending) && "sr-only")}>
        {open && pending ? "Searching…" : ""}
      </p>
      <p role="status" className={cn("mt-1 text-[14px] text-warn-strong", !(open && limited) && "sr-only")}>
        {open && limited ? "Search is limited right now. Only some places are shown." : ""}
      </p>
    </div>
  );
}
