// The phone's demo session (cycle 7): a random id kept on this device, sent with every API call. In demo sandbox
// mode the server keeps this phone's reports and rain toggle to itself; otherwise the server ignores it.
const KEY = "reachable.session";
let memo: string | null = null;

function fresh(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function sessionId(): string {
  if (memo) return memo;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[a-z0-9-]{16,64}$/.test(saved)) return (memo = saved);
    memo = fresh();
    localStorage.setItem(KEY, memo);
  } catch {
    memo = memo ?? fresh(); // storage blocked: one id for this visit
  }
  return memo;
}

/** For tests: forget the remembered id (as if the page reloaded). */
export function resetSessionForTests() {
  memo = null;
}
