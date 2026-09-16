'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CollectionPicker } from '@/components/dashboard/collection-picker';

export type Membership = { id: string; name: string };

/**
 * Current collection memberships as removable tags, plus the same
 * add-to-collection picker the dashboard card uses for adding more.
 */
export function CollectionMemberships({
  sourceId,
  memberships,
}: {
  sourceId: string;
  memberships: Membership[];
}) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(collectionId: string) {
    setRemovingId(collectionId);
    try {
      const response = await fetch(`/api/collections/${collectionId}/sources/${sourceId}`, {
        method: 'DELETE',
      });
      if (response.ok) router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {memberships.map((membership) => (
        <span
          key={membership.id}
          className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-sm text-muted"
        >
          {membership.name}
          <button
            type="button"
            onClick={() => handleRemove(membership.id)}
            disabled={removingId === membership.id}
            aria-label={`Remove from ${membership.name}`}
            className="text-muted transition-colors hover:text-red-400 disabled:opacity-50"
          >
            ✕
          </button>
        </span>
      ))}
      <CollectionPicker
        sourceId={sourceId}
        initialCollectionIds={memberships.map((m) => m.id)}
      />
    </div>
  );
}
