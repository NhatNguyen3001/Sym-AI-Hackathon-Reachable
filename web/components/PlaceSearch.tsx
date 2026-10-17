"use client";
// Search opens a white panel: recent places until the query is long enough to search.
import { useEffect, useId, useRef, useState } from "react";
import { Clock, MapPin } from "lucide-react";
import { cn } from "cn";
import { getPlaces } from "@/lib/api";
import { loadPlaces, rememberPlace } from "@/lib/profile";
import type { Place } from "@/lib/types";

export function PlaceSearch({
  label, value, onChange, placeholder = "Search a place",
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  placeholder?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(value?.name ?? "");
  const [options, setOptions] = useState<Place[]>([]);
  const [history, setHistory] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [limited, setLimited] = useState(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsFor = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(value?.id);
  if (value && value.id !== shown) {
    setShown(value.id);
    setText(value.name);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const typed = text.trim();
  const searching = typed.length >= 2;
  const rows: Place[] = searching ? options : history;

  const normalise = (q: string) => (q.trim().length >= 2 ? q : "");

  async function runSearch(query: string): Promise<Place[] | null> {
    const n = ++seq.current;
    const { data, limited: lim } = await getPlaces(query);
    if (n !== seq.current) return null;
    optionsFor.current = query;
    setOptions(data);
    setLimited(lim && query.trim().length >= 2);
    setActive(data.length ? 0 : -1);
    return data;
  }

  function search(q: string, immediate = false) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    seq.current++;
    optionsFor.current = null;
    const query = normalise(q);
    if (!query) {
      setOptions([]);
      setActive(history.length ? 0 : -1);
      return;
    }
    if (immediate) void runSearch(query);
    else timer.current = setTimeout(() => { timer.current = null; void runSearch(query); }, 250);
  }

  /** Open the list with the latest recent places. */
  function openList() {
    setHistory(loadPlaces());
    setOpen(true);
  }

  function pick(p: Place) {
    rememberPlace(p);
    onChange(p);
    setText(p.name);
    setOpen(false);
    setHistory(loadPlaces());
  }

  async function pickForEnter() {
    const query = normalise(text);
    const visible = query
      ? (optionsFor.current === query && !timer.current ? options : null)
      : rows;
    if (visible) {
      if (visible[active] ?? visible[0]) pick((visible[active] ?? visible[0]));
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const results = await runSearch(query);
    const matched = results ?? [];
    if (matched.length && query) pick(matched[0]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openList();
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void pickForEnter();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const heading = searching ? "Matching places" : "Recent places";

  return (
    <div ref={rootRef}
      className={cn(open && "max-lg:fixed max-lg:inset-0 max-lg:z-[3000] max-lg:overflow-y-auto max-lg:bg-surface max-lg:p-4")}>
      {open && (
        <div className="mb-3 flex items-center justify-between lg:hidden">
          <p className="text-[20px] font-bold">Search</p>
          <button type="button" onClick={() => setOpen(false)}
            className="inline-flex min-h-11 items-center rounded-[12px] px-2 font-bold text-primary">
            Close
          </button>
        </div>
      )}
      <label htmlFor={id} className="mb-1.5 block text-[16px] font-bold">{label}</label>
      <div className="relative">
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open && rows.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            if (value) onChange(null);
            openList();
            setOptions([]);
            setActive(-1);
            search(e.target.value);
          }}
          onFocus={() => {
            openList();
            setActive(0);
          }}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (!next || rootRef.current?.contains(next)) return;
            setOpen(false);
          }}
          onKeyDown={onKeyDown}
          className="h-12 w-full rounded-[16px] border border-line-strong bg-surface px-3.5 text-[17px] text-ink shadow-sm"
        />
      </div>
      {open && (
        <div className="max-lg:mt-4 lg:absolute lg:top-[calc(100%+0.5rem)] lg:z-[1000] lg:w-full lg:rounded-[16px] lg:border lg:border-line lg:bg-surface lg:p-2 lg:shadow-xl">
          <p className="px-3 pt-2 text-[13px] font-bold tracking-wide text-muted uppercase">{heading}</p>
          {rows.length === 0 ? (
            <p className="px-3 py-4 text-[15px] text-muted">
              {searching ? "No places match that." : "Places you search for will show here."}
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="max-h-80 overflow-auto py-1">
              {rows.map((p, i) => (
                <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2",
                    i === active && "rounded-[12px] bg-primary-soft text-primary-hover")}>
                  {searching
                    ? <MapPin aria-hidden="true" className="size-5 shrink-0 text-muted" />
                    : <Clock aria-hidden="true" className="size-5 shrink-0 text-muted" />}
                  <span className="min-w-0">
                    <span className="block truncate text-[16px]">{p.name}</span>
                    {p.detail && <span className="block truncate text-[14px] text-muted">{p.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p role="status" className={cn("px-3 pb-2 text-[14px] text-warn-strong", !(open && limited && searching) && "sr-only")}>
            {open && limited && searching ? "Search is limited right now. Only some places are shown." : ""}
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
