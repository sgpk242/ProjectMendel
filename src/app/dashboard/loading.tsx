/**
 * Shown while the dashboard Server Component re-renders for a new
 * `searchParams` (a filter change, a page nav) or the initial load.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="h-8 w-40 animate-pulse rounded-md bg-surface" />

      <div className="mt-6 h-10 animate-pulse rounded-md bg-surface" />

      <div className="mt-8 flex flex-col gap-3">
        <div className="h-10 animate-pulse rounded-md bg-surface" />
        <div className="flex gap-2">
          <div className="h-6 w-24 animate-pulse rounded-full bg-surface" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-surface" />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        <div className="h-96 w-full shrink-0 animate-pulse rounded-lg bg-surface md:w-64" />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}
