import { describe, expect, it } from 'vitest';

import { chunk } from './chunk';

describe('chunk', () => {
  const text =
    '\n\n' +
    Array.from({ length: 80 }, (_, i) => `Paragraph ${i} about fed-batch fermentation and downstream processing.`).join(
      '\n\n',
    );

  it('returns sequential chunks whose offsets slice back to their content', () => {
    const chunks = chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(text.slice(c.startChar, c.endChar)).toBe(c.content);
    });
  });

  it('covers every paragraph', () => {
    const all = chunk(text).map((c) => c.content).join('\n');
    for (let i = 0; i < 80; i++) expect(all).toContain(`Paragraph ${i} `);
  });

  it('returns nothing for empty text', () => {
    expect(chunk('   ')).toEqual([]);
  });
});
