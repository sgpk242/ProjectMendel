'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Pencil icon that toggles a floating textarea for the user's note.
 * Dismisses on save, Escape, or an outside click; PATCHes
 * `/api/source/[id]` and refreshes on save.
 */
export function QuickNote({ sourceId, note }: { sourceId: string; note: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(note ?? '');
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function handleOpen() {
    setValue(note ?? '');
    setOpen(true);
  }

  async function handleSave() {
    setPending(true);
    try {
      const response = await fetch(`/api/source/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_note: value.trim() || null }),
      });
      if (response.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        title={note ? 'Edit note' : 'Add note'}
        className={`rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-accent/10 hover:text-accent ${
          note ? 'text-accent' : 'text-muted'
        }`}
      >
        ✎ Note
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-border bg-surface p-2 shadow-lg">
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            placeholder="Add a note…"
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
