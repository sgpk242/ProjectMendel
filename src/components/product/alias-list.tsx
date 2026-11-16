'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ALIAS_KINDS, ALIAS_KIND_LABELS, type AliasKind } from '@/lib/constants';

export type AliasItem = { id: string; alias: string; kind: AliasKind; sourceCount: number };

/**
 * Every name the product goes by, grouped by kind. New sources that use any
 * of these names link to this product. "Make header" pins a name as the
 * page header; × removes a wrong alias.
 */
export function AliasList({
  productId,
  name,
  pinned,
  aliases,
}: {
  productId: string;
  name: string;
  pinned: boolean;
  aliases: AliasItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(key: string, url: string, init: RequestInit) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed (${res.status})`);
      } else {
        router.refresh();
      }
    } catch {
      setError('Request failed: network error');
    } finally {
      setBusy(null);
    }
  }

  const patch = (key: string, body: object) =>
    send(key, `/api/product-ideas/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const groups = ALIAS_KINDS.map((kind) => ({
    kind,
    items: aliases
      .filter((a) => a.kind === kind)
      .sort((a, b) => b.sourceCount - a.sourceCount || a.alias.localeCompare(b.alias)),
  })).filter((g) => g.items.length > 0);

  const chip = (a: AliasItem) => (
    <li
      key={a.id}
      className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
        a.alias === name ? 'border-accent/60 text-accent' : 'border-border text-foreground'
      }`}
    >
      <span>{a.alias}</span>
      {a.sourceCount > 0 ? (
        <span className="text-muted" title="Sources using this name">
          {a.sourceCount}
        </span>
      ) : null}
      {a.alias !== name ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => patch(a.id, { name: a.alias })}
          className="text-muted hover:text-accent disabled:opacity-50"
          title="Use as the page header"
        >
          Make header
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => send(a.id, `/api/product-ideas/${productId}/aliases/${a.id}`, { method: 'DELETE' })}
        className="text-muted hover:text-red-400 disabled:opacity-50"
        title="Remove this alias: new sources using it won't link here"
      >
        ×
      </button>
    </li>
  );

  return (
    <div>
      <p className="text-xs text-muted">
        {pinned ? 'Header chosen by hand. ' : 'Header: the generic name most sources use. '}
        {pinned ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => patch('unpin', { name_pinned: false })}
            className="text-accent hover:underline disabled:opacity-50"
          >
            Use automatic header
          </button>
        ) : null}
      </p>
      {groups.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No aliases recorded yet. Re-extract a source to collect them.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {groups.map(({ kind, items }) =>
            kind === 'pubchem' ? (
              <details key={kind}>
                <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                  {ALIAS_KIND_LABELS[kind]} ({items.length})
                </summary>
                <ul className="mt-2 flex flex-wrap gap-1.5">{items.map(chip)}</ul>
              </details>
            ) : (
              <div key={kind}>
                <h3 className="text-xs text-muted">{ALIAS_KIND_LABELS[kind]}</h3>
                <ul className="mt-1 flex flex-wrap gap-1.5">{items.map(chip)}</ul>
              </div>
            ),
          )}
        </div>
      )}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
