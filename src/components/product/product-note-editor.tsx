'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Click-to-edit personal notes field for a product idea's detail page.
 * Mirrors `src/components/source/note-editor.tsx` but PATCHes
 * `/api/product-ideas/[id]` instead of `/api/source/[id]`.
 */
export function ProductNoteEditor({ productId, notes }: { productId: string; notes: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? '');
  const [pending, setPending] = useState(false);

  function startEditing() {
    setValue(notes ?? '');
    setEditing(true);
  }

  async function handleSave() {
    setPending(true);
    try {
      const response = await fetch(`/api/product-ideas/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: value.trim() || null }),
      });
      if (response.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  if (editing) {
    return (
      <div>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          placeholder="Add a note…"
          className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {notes ? (
        <p className="whitespace-pre-wrap text-sm text-foreground">{notes}</p>
      ) : (
        <p className="text-sm text-muted">No note yet.</p>
      )}
      <button
        type="button"
        onClick={startEditing}
        className="mt-2 text-xs text-accent hover:underline"
      >
        {notes ? 'Edit note' : 'Add note'}
      </button>
    </div>
  );
}
