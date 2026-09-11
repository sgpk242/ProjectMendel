'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  SOURCE_STATUSES,
  SOURCE_STATUS_LABELS,
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
} from '@/lib/constants';
import { READING_BUCKETS, READING_BUCKET_LABELS } from '@/lib/search-params';

type Topic = { id: string; name: string };

const checkboxClass = 'flex items-center gap-2 text-sm text-muted hover:text-foreground';
const groupClass = 'border-b border-border py-4 first:pt-0 last:border-b-0';
const summaryClass = 'cursor-pointer text-sm font-medium text-foreground';
const selectClass =
  'rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus:border-accent';

function csvSet(value: string | null): Set<string> {
  return new Set((value ?? '').split(',').filter(Boolean));
}

/**
 * Faceted filter controls for the dashboard: status, source type, topic,
 * interest rating range, reading-time buckets, and date range. Every
 * control reads its current state from the URL and writes back via
 * `router.replace()` — no local component state, so the URL is always the
 * single source of truth and stays shareable/bookmarkable.
 */
export function FilterSidebar({ topics }: { topics: Topic[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete('page');
    router.replace(`${pathname}?${params.toString()}`);
  }

  function toggleCsv(key: string, value: string) {
    updateParams((params) => {
      const current = csvSet(params.get(key));
      if (current.has(value)) current.delete(value);
      else current.add(value);
      if (current.size > 0) params.set(key, [...current].join(','));
      else params.delete(key);
    });
  }

  function setParam(key: string, value: string | null) {
    updateParams((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
  }

  const activeTypes = csvSet(searchParams.get('type'));
  const activeStatuses = csvSet(searchParams.get('status'));
  const activeTopics = csvSet(searchParams.get('topic'));
  const activeReading = csvSet(searchParams.get('reading'));

  return (
    <aside className="w-full shrink-0 rounded-lg border border-border bg-surface p-4 md:w-64">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Filters</h2>
        <button
          type="button"
          onClick={() => router.replace(pathname)}
          className="text-xs text-muted transition-colors hover:text-foreground"
        >
          Clear all
        </button>
      </div>

      <details className={groupClass} open>
        <summary className={summaryClass}>Status</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          {SOURCE_STATUSES.map((status) => (
            <label key={status} className={checkboxClass}>
              <input
                type="checkbox"
                checked={activeStatuses.has(status)}
                onChange={() => toggleCsv('status', status)}
                className="accent-accent"
              />
              {SOURCE_STATUS_LABELS[status]}
            </label>
          ))}
        </div>
      </details>

      <details className={groupClass}>
        <summary className={summaryClass}>Source type</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          {SOURCE_TYPES.map((type) => (
            <label key={type} className={checkboxClass}>
              <input
                type="checkbox"
                checked={activeTypes.has(type)}
                onChange={() => toggleCsv('type', type)}
                className="accent-accent"
              />
              {SOURCE_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      </details>

      {topics.length > 0 ? (
        <details className={groupClass}>
          <summary className={summaryClass}>Topics</summary>
          <div className="mt-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
            {topics.map((topic) => (
              <label key={topic.id} className={checkboxClass}>
                <input
                  type="checkbox"
                  checked={activeTopics.has(topic.id)}
                  onChange={() => toggleCsv('topic', topic.id)}
                  className="accent-accent"
                />
                {topic.name}
              </label>
            ))}
          </div>
        </details>
      ) : null}

      <details className={groupClass}>
        <summary className={summaryClass}>Interest rating</summary>
        <div className="mt-2 flex items-center gap-2">
          <select
            aria-label="Minimum interest rating"
            value={searchParams.get('rating_min') ?? ''}
            onChange={(e) => setParam('rating_min', e.target.value || null)}
            className={selectClass}
          >
            <option value="">Any</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted">to</span>
          <select
            aria-label="Maximum interest rating"
            value={searchParams.get('rating_max') ?? ''}
            onChange={(e) => setParam('rating_max', e.target.value || null)}
            className={selectClass}
          >
            <option value="">Any</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </details>

      <details className={groupClass}>
        <summary className={summaryClass}>Reading time</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          {READING_BUCKETS.map((bucket) => (
            <label key={bucket} className={checkboxClass}>
              <input
                type="checkbox"
                checked={activeReading.has(bucket)}
                onChange={() => toggleCsv('reading', bucket)}
                className="accent-accent"
              />
              {READING_BUCKET_LABELS[bucket]}
            </label>
          ))}
        </div>
      </details>

      <details className={groupClass}>
        <summary className={summaryClass}>Date captured</summary>
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm text-muted">
            From
            <input
              type="date"
              value={searchParams.get('from') ?? ''}
              onChange={(e) => setParam('from', e.target.value || null)}
              className={selectClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            To
            <input
              type="date"
              value={searchParams.get('to') ?? ''}
              onChange={(e) => setParam('to', e.target.value || null)}
              className={selectClass}
            />
          </label>
        </div>
      </details>
    </aside>
  );
}
