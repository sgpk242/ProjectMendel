'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const DEBOUNCE_MS = 300;

/**
 * Full-text search box for the dashboard. Debounced so typing doesn't
 * trigger a server re-render (and a `search_sources` RPC call) on every
 * keystroke — only after the user pauses. Reads/writes the `q` URL param;
 * the Server Component picks it up on the next render via `searchParams`.
 */
export function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync when the URL changes some other way (a filter
  // chip removed, browser back/forward) without fighting the user's typing.
  useEffect(() => {
    setValue(searchParams.get('q') ?? '');
  }, [searchParams]);

  function commit(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.trim()) params.set('q', next.trim());
    else params.delete('q');
    params.delete('page');
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => commit(next), DEBOUNCE_MS);
  }

  function handleClear() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setValue('');
    commit('');
  }

  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search titles, summaries, notes, topics…"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 pr-9 text-foreground outline-none focus:border-accent"
      />
      {value ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
