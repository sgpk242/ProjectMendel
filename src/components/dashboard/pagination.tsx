import type { ReactNode } from 'react';
import Link from 'next/link';

import { PAGE_SIZE, serializeFilters, type DashboardFilters } from '@/lib/search-params';

/**
 * Page links for the dashboard's source list. Server Component — the RPC's
 * `total_count` (from a window function, no second query) is enough to
 * compute page count; every link preserves the rest of the active filters
 * via `serializeFilters`, so paging never drops a search or facet.
 */
export function Pagination({
  filters,
  totalCount,
}: {
  filters: DashboardFilters;
  totalCount: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  if (totalPages <= 1) return null;

  const current = Math.min(filters.page, totalPages);

  function hrefForPage(page: number): string {
    const qs = serializeFilters({ ...filters, page }).toString();
    return qs ? `?${qs}` : '?';
  }

  const pages = pageWindow(current, totalPages);

  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
      <PageLink href={hrefForPage(current - 1)} disabled={current <= 1}>
        Prev
      </PageLink>
      {pages.map((page, i) =>
        page === null ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-muted">
            …
          </span>
        ) : (
          <Link
            key={page}
            href={hrefForPage(page)}
            aria-current={page === current ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm ${
              page === current
                ? 'bg-accent text-background'
                : 'text-muted transition-colors hover:bg-surface hover:text-foreground'
            }`}
          >
            {page}
          </Link>
        ),
      )}
      <PageLink href={hrefForPage(current + 1)} disabled={current >= totalPages}>
        Next
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return <span className="rounded-md px-3 py-1.5 text-sm text-muted/40">{children}</span>;
  }
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
    >
      {children}
    </Link>
  );
}

/** Windowed page numbers around the current page, `null` marking an ellipsis gap. */
function pageWindow(current: number, total: number): (number | null)[] {
  const keep = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...keep].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push(null);
    result.push(p);
    prev = p;
  }
  return result;
}
