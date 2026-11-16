import { describe, expect, it } from 'vitest';

import { pickBestPerSource } from './thesis-suggestions';

describe('pickBestPerSource', () => {
  const chunks = [
    { source_id: 'A', content: 'a1', similarity: 0.4 },
    { source_id: 'A', content: 'a2', similarity: 0.55 },
    { source_id: 'B', content: 'b1', similarity: 0.6 },
    { source_id: 'C', content: 'c1', similarity: 0.3 },
    ...Array.from({ length: 12 }, (_, i) => ({ source_id: `X${i}`, content: 'x', similarity: 0.2 - i / 100 })),
  ];

  it('keeps each source’s best passage, skips excluded sources, and caps the list', () => {
    const picked = pickBestPerSource(chunks, new Set(['B']), 8);
    expect(picked).toHaveLength(8);
    expect(picked[0]).toMatchObject({ source_id: 'A', content: 'a2' });
    expect(picked.some((c) => c.source_id === 'B')).toBe(false);
    expect(picked.map((c) => c.similarity)).toEqual([...picked.map((c) => c.similarity)].sort((a, b) => b - a));
  });
});
