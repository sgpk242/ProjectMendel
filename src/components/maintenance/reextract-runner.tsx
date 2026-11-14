'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type SourceItem = { id: string; title: string; failed: boolean };

type Outcome = { ok: boolean; message: string };

/**
 * Runs compound re-extraction over a list of sources, one request per
 * source so each stays inside a single function's time limit, with a
 * per-source result as it goes.
 */
export function ReextractRunner({ sources }: { sources: SourceItem[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    for (const source of sources) {
      if (outcomes[source.id]?.ok) continue;
      setCurrentId(source.id);
      let outcome: Outcome;
      try {
        const res = await fetch('/api/maintenance/reextract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceId: source.id }),
        });
        const data = (await res.json()) as { ok?: boolean; compoundCount?: number; error?: string | null };
        outcome = data.ok
          ? { ok: true, message: `${data.compoundCount ?? 0} compounds${data.error ? ` (warning: ${data.error})` : ''}` }
          : { ok: false, message: data.error ?? `HTTP ${res.status}` };
      } catch (err) {
        outcome = { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
      setOutcomes((prev) => ({ ...prev, [source.id]: outcome }));
    }
    setCurrentId(null);
    setRunning(false);
    router.refresh();
  }

  if (sources.length === 0) {
    return <p className="text-sm text-muted">Every source has been extracted from its full text.</p>;
  }

  const done = Object.keys(outcomes).length;

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {running ? 'Re-extracting…' : `Re-extract ${sources.length} sources`}
        </button>
        {done > 0 ? (
          <span className="text-sm text-muted">
            {done} / {sources.length} done
          </span>
        ) : null}
      </div>

      <ul className="mt-4 space-y-1.5 text-sm">
        {sources.map((s) => {
          const outcome = outcomes[s.id];
          return (
            <li key={s.id} className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 truncate">
                {s.title}
                {s.failed && !outcome ? <span className="ml-2 text-xs text-red-300">previously failed</span> : null}
              </span>
              <span
                className={`shrink-0 text-xs ${
                  outcome ? (outcome.ok ? 'text-accent' : 'text-red-300') : 'text-muted'
                }`}
              >
                {currentId === s.id ? 'running…' : outcome ? outcome.message : 'pending'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
