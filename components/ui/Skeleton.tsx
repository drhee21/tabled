/** Placeholder shown while a session loads. Shaped like the page so nothing jumps. */
export function SessionSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-section">
      <span className="sr-only">Loading session…</span>
      <div aria-hidden="true" className="animate-pulse">
        <div className="h-4 w-28 rounded-full bg-brand-100" />
        <div className="mt-3 h-10 w-52 rounded-control bg-brand-100" />
      </div>
      <div aria-hidden="true" className="h-56 animate-pulse rounded-card bg-brand-50 ring-1 ring-line" />
      <div aria-hidden="true" className="h-32 animate-pulse rounded-card bg-brand-50 ring-1 ring-line" />
    </div>
  );
}
