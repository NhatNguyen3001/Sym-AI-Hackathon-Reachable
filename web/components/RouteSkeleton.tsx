/** Shown in the route panel while a route is being found: the trip, then placeholders where the details go. */
export function RouteSkeleton({ from, to }: { from?: string; to?: string }) {
  return (
    <section aria-busy="true" aria-labelledby="loading-h" className="space-y-3">
      <h2 id="loading-h" className="text-[16px] font-bold">
        {from && to ? `${from} → ${to}` : "Your trip"}
      </h2>
      <p role="status" className="sr-only">Finding your route…</p>
      <div aria-hidden="true" className="space-y-3">
        <div className="skeleton h-9 w-28" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-4 w-2/3" />
      </div>
    </section>
  );
}
