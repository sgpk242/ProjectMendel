'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type SourceItem = { id: string; title: string; state: 'legacy' | 'failed' | 'partial' | 'no-routes' };

/** `message` is the one-line result; `detail` is the full reason, shown wrapped below it. */
type Outcome = { ok: boolean; message: string; detail?: string };

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
        const count = `${data.compoundCount ?? 0} compounds`;
        const failedPart = data.error?.match(/^\d+ of \d+ batches failed/)?.[0];
        outcome = data.ok
          ? data.error
            ? { ok: true, message: failedPart ? `${count} · ${failedPart}` : `${count} · with warnings`, detail: data.error }
            : { ok: true, message: count }
          : { ok: false, message: 'Failed', detail: data.error ?? `HTTP ${res.status}` };
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
            <li key={s.id}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate">
                  {s.title}
                  {s.state !== 'legacy' && s.state !== 'no-routes' && !outcome ? (
                    <span className="ml-2 text-xs text-yellow-300">
                      {s.state === 'failed' ? 'previously failed' : 'partially extracted'}
                    </span>
                  ) : null}
                </span>
                <span
                  title={outcome?.detail}
                  className={`shrink-0 text-xs ${
                    outcome ? (outcome.ok && !outcome.detail ? 'text-accent' : outcome.ok ? 'text-yellow-300' : 'text-red-300') : 'text-muted'
                  }`}
                >
                  {currentId === s.id ? 'running…' : outcome ? outcome.message : 'pending'}
                </span>
              </div>
              {outcome?.detail ? (
                <p className="mt-0.5 break-words text-xs text-muted">{outcome.detail}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
