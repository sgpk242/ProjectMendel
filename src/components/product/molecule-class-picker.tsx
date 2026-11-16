'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  MOLECULE_CLASSES,
  MOLECULE_CLASS_DEFINITIONS,
  MOLECULE_CLASS_LABELS,
  type MoleculeClass,
} from '@/lib/constants';

/**
 * Molecule category dropdown. Set by the model when the compound is first
 * extracted (only while empty), correctable here; it decides where the
 * description comes from (PubChem for small molecules).
 */
export function MoleculeClassPicker({
  productId,
  moleculeClass,
}: {
  productId: string;
  moleculeClass: MoleculeClass | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function handleChange(next: MoleculeClass | null) {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/product-ideas/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ molecule_class: next }),
      });
      if (!res.ok) setError(true);
      else router.refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted">Molecule category</span>
      <select
        value={moleculeClass ?? ''}
        disabled={saving}
        onChange={(e) => handleChange((e.target.value || null) as MoleculeClass | null)}
        title={moleculeClass ? MOLECULE_CLASS_DEFINITIONS[moleculeClass] : 'Not classified yet'}
        className={`rounded-md border px-2 py-1 text-xs outline-none focus:border-accent disabled:opacity-50 ${
          error ? 'border-red-700/40 text-red-400' : 'border-border text-foreground'
        }`}
      >
        <option value="">Not classified</option>
        {MOLECULE_CLASSES.map((c) => (
          <option key={c} value={c}>
            {MOLECULE_CLASS_LABELS[c]}
          </option>
        ))}
      </select>
    </div>
  );
}
