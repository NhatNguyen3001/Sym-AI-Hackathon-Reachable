"use client";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, runMapAgent } from "@/lib/api";
import { readStored, removeStored, writeStored } from "@/lib/storage";
import type { MapStatus } from "@/lib/types";

const KEY = "reachable.ownerKey";

/** The owner's "Update map now" button. Hidden until the owner enters their key once on this device. */
export function OwnerMapUpdate({ status, reload }: { status: MapStatus | null; reload: () => Promise<MapStatus | null> }) {
  const [key, setKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [starting, setStarting] = useState(false);
  const inputId = useId();
  const running = starting || !!status?.running;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after mount
    setKey(readStored(KEY));
  }, []);

  // While a run is going, check every 3 s (the live event usually arrives first).
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const s = await reload();
      if (s && !s.running) setStarting(false);
    }, 3000);
    return () => clearInterval(t);
  }, [running, reload]);

  async function update() {
    if (!key) return;
    setMessage("");
    setStarting(true);
    try {
      await runMapAgent(key);
      await reload();
    } catch (e) {
      setStarting(false);
      if (e instanceof ApiError && e.code === "forbidden") {
        removeStored(KEY);
        setKey(null);
        setMessage("That key didn't work.");
      } else {
        setMessage(e instanceof ApiError ? e.message : "Couldn't start the update.");
      }
    }
  }

  if (!key) {
    return (
      <div className="text-[14px]">
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
          className="min-h-11 rounded-[10px] px-1 font-bold text-muted underline">Owner</button>
        {message && <p role="alert" className="mt-1 font-bold text-warn-strong">{message}</p>}
        {open && (
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            writeStored(KEY, draft.trim());
            setKey(draft.trim());
            setDraft("");
            setMessage("");
          }}>
            <div className="flex flex-col gap-1">
              <label htmlFor={inputId} className="font-bold">Owner key</label>
              <input id={inputId} type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)}
                className="min-h-11 rounded-[10px] border border-line-strong bg-surface px-3" />
            </div>
            <Button type="submit" variant="secondary">Unlock</Button>
          </form>
        )}
      </div>
    );
  }

  const paused = !!status?.paused;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" onClick={update} disabled={paused || running}>
        {paused ? "Map updates are paused" : running ? "Updating the map…" : "Update map now"}
      </Button>
      <p role="status" className="text-[14px] text-muted">{message}</p>
    </div>
  );
}
