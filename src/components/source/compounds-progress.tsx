'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const POLL_MS = 5000;

/**
 * Shown while full-text compound extraction runs in the background after
 * ingest. Refreshes the server component every few seconds so the compound
 * list appears as soon as `compounds_status` flips to complete.
 */
export function CompoundsProgress({ status }: { status: 'pending' | 'running' }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <p className="mt-2 text-sm text-muted">
      {status === 'pending' ? 'Compound extraction queued…' : 'Extracting compounds from the full text…'}{' '}
      Long papers can take a few minutes.
    </p>
  );
}
