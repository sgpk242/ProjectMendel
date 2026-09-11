'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { SOURCE_STATUS_LABELS, SOURCE_TYPE_LABELS } from '@/lib/constants';
import { parseSearchParams, READING_BUCKET_LABELS } from '@/lib/search-params';

type Topic = { id: string; name: string };

type Chip = { key: string; label: string; remove: (params: URLSearchParams) => void };

function removeFromCsv(params: URLSearchParams, key: string, value: string) {
  const remaining = (params.get(key) ?? '').split(',').filter((v) => v && v !== value);
  if (remaining.length > 0) params.set(key, remaining.join(','));
  else params.delete(key);
}

/**
 * Active filters as removable pills above the source list — the "what am I
 * currently looking at" summary, and the fastest way to back out of one
 * facet without touching the sidebar. Topic chips need `topics` (id → name)
 * since the URL only carries topic ids.
 */
export function FilterChips({ topics }: { topics: Topic[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = parseSearchParams(searchParams);
  const topicNameById = new Map(topics.map((t) => [t.id, t.name]));

  const chips: Chip[] = [];

  if (filters.q) {
    chips.push({ key: 'q', label: `Search: "${filters.q}"`, remove: (p) => p.delete('q') });
  }
  for (const type of filters.types) {
    chips.push({
      key: `type:${type}`,
      label: SOURCE_TYPE_LABELS[type],
      remove: (p) => removeFromCsv(p, 'type', type),
    });
  }
  for (const status of filters.statuses) {
    chips.push({
      key: `status:${status}`,
      label: SOURCE_STATUS_LABELS[status],
      remove: (p) => removeFromCsv(p, 'status', status),
    });
  }
  for (const topicId of filters.topicIds) {
    chips.push({
      key: `topic:${topicId}`,
      label: topicNameById.get(topicId) ?? 'Topic',
      remove: (p) => removeFromCsv(p, 'topic', topicId),
    });
  }
  if (filters.ratingMin !== null || filters.ratingMax !== null) {
    chips.push({
      key: 'rating',
      label: `Rating ${filters.ratingMin ?? 1}–${filters.ratingMax ?? 5}`,
      remove: (p) => {
        p.delete('rating_min');
        p.delete('rating_max');
      },
    });
  }
  for (const bucket of filters.readingBuckets) {
    chips.push({
      key: `reading:${bucket}`,
      label: READING_BUCKET_LABELS[bucket],
      remove: (p) => removeFromCsv(p, 'reading', bucket),
    });
  }
  if (filters.dateFrom || filters.dateTo) {
    chips.push({
      key: 'date',
      label: `${filters.dateFrom ?? '…'} → ${filters.dateTo ?? '…'}`,
      remove: (p) => {
        p.delete('from');
        p.delete('to');
      },
    });
  }

  if (chips.length === 0) return null;

  function removeChip(chip: Chip) {
    const params = new URLSearchParams(searchParams.toString());
    chip.remove(params);
    params.delete('page');
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => removeChip(chip)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground"
        >
          {chip.label}
          <span aria-hidden>✕</span>
        </button>
      ))}
    </div>
  );
}
