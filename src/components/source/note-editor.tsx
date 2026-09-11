'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Click-to-edit note field for the detail page — room for a full textarea
 * rather than `QuickNote`'s popover, since this is the note's permanent
 * home rather than a card's quick action.
 */
export function NoteEditor({ sourceId, note }: { sourceId: string; note: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note ?? '');
  const [pending, setPending] = useState(false);

  function startEditing() {
    setValue(note ?? '');
    setEditing(true);
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
      {note ? (
        <p className="whitespace-pre-wrap text-sm text-foreground">{note}</p>
      ) : (
        <p className="text-sm text-muted">No note yet.</p>
      )}
      <button
        type="button"
        onClick={startEditing}
        className="mt-2 text-xs text-accent hover:underline"
      >
        {note ? 'Edit note' : 'Add note'}
      </button>
    </div>
  );
}
