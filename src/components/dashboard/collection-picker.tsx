'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Collection = { id: string; name: string; description: string | null };

/**
 * "Add to collection" dropdown. Lists the user's collections (fetched
 * lazily on first open, not on every card render) with a checkbox per
 * collection reflecting membership, plus a create-and-add row. Toggling a
 * checkbox POSTs/DELETEs `/api/collections/[id]/sources[/...]` immediately
 * — no separate save step.
 */
export function CollectionPicker({
  sourceId,
  initialCollectionIds,
}: {
  sourceId: string;
  initialCollectionIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [memberIds, setMemberIds] = useState(new Set(initialCollectionIds));
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || collections !== null) return;
    setLoading(true);
    fetch('/api/collections')
      .then((r) => r.json())
      .then((body: { collections?: Collection[] }) => setCollections(body.collections ?? []))
      .catch(() => setError('Failed to load collections'))
      .finally(() => setLoading(false));
  }, [open, collections]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function toggleMembership(collectionId: string, isMember: boolean) {
    setError(null);
    const previous = memberIds;
    const next = new Set(previous);
    if (isMember) next.delete(collectionId);
    else next.add(collectionId);
    setMemberIds(next);

    try {
      const response = isMember
        ? await fetch(`/api/collections/${collectionId}/sources/${sourceId}`, { method: 'DELETE' })
        : await fetch(`/api/collections/${collectionId}/sources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceId }),
          });
      if (!response.ok) throw new Error('request failed');
      router.refresh();
    } catch {
      setMemberIds(previous);
      setError('Failed to update collection');
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error('request failed');
      const collection = (await response.json()) as Collection;
      setCollections((prev) =>
        [...(prev ?? []), collection].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewName('');
      await toggleMembership(collection.id, false);
    } catch {
      setError('Failed to create collection');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Add to collection"
        className={`rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-accent/10 hover:text-accent ${
          memberIds.size > 0 ? 'text-accent' : 'text-muted'
        }`}
      >
        ＋ Collection{memberIds.size > 0 ? ` (${memberIds.size})` : ''}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-border bg-surface p-2 shadow-lg">
          {loading ? (
            <p className="px-1 py-1 text-xs text-muted">Loading…</p>
          ) : (
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {(collections ?? []).map((collection) => (
                <label
                  key={collection.id}
                  className="flex items-center gap-2 rounded px-1 py-1 text-sm text-muted hover:bg-background hover:text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={memberIds.has(collection.id)}
                    onChange={() => toggleMembership(collection.id, memberIds.has(collection.id))}
                    className="accent-accent"
                  />
                  {collection.name}
                </label>
              ))}
              {collections !== null && collections.length === 0 ? (
                <p className="px-1 py-1 text-xs text-muted">No collections yet.</p>
              ) : null}
            </div>
          )}
          {error ? <p className="mt-1 px-1 text-xs text-red-400">{error}</p> : null}
          <div className="mt-2 flex gap-1 border-t border-border pt-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="New collection…"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
