'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Deletes a source after a confirm prompt. Cascades to its chunks, topic
 * links, and similarity rows (see `/api/source/[id]`).
 *
 * Defaults to `router.refresh()` afterward, which is right for a card in a
 * list. Pass `redirectTo` instead when this button lives on the detail page
 * of the source being removed — a plain string (rather than a callback) so
 * this stays usable directly from a Server Component, which can't pass
 * closures across to a Client Component.
 */
export function DeleteSourceButton({
  sourceId,
  title,
  redirectTo,
  className = '',
  children,
}: {
  sourceId: string;
  title?: string | null;
  redirectTo?: string;
  className?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(event: MouseEvent) {
    // Cards wrap this button alongside a Link to the same source — stop the
    // click from also triggering navigation.
    event.preventDefault();
    event.stopPropagation();

    const label = title || 'this source';
    const confirmed = window.confirm(
      `Delete "${label}"? This also removes its chunks and embeddings. This can't be undone.`,
    );
    if (!confirmed) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/source/${sourceId}`, { method: 'DELETE' });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || 'Failed to delete source');
        setPending(false);
        return;
      }

      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch {
      setError('Network error — try again');
      setPending(false);
    }
  }

  return (
    <span className={className}>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        title="Delete source"
        className="rounded-md px-1.5 py-0.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
      >
        {children ?? (pending ? '…' : '✕')}
      </button>
      {error ? <span className="ml-2 text-xs text-red-400">{error}</span> : null}
    </span>
  );
}
