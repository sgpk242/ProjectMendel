import { describe, expect, it } from 'vitest';

import { findPublishedDate, parseDateText } from './article-date';

describe('parseDateText', () => {
  it.each([
    ['Published March 2, 2026 by Jane Doe', '2026-03-02'],
    ['Mar. 2 2026', '2026-03-02'],
    ['Sept 14th, 2025', '2025-09-14'],
    ['2 March 2026 | Food Navigator', '2026-03-02'],
    ['Updated 2026-03-02T10:00:00Z', '2026-03-02'],
    ['Mon, 02 Mar 2026 14:00:00 GMT', '2026-03-02'],
  ])('reads "%s"', (text, expected) => {
    expect(parseDateText(text)).toBe(expected);
  });

  it('returns the earliest date in the text', () => {
    expect(parseDateText('Jan 5, 2026 … related: 2025-12-01')).toBe('2026-01-05');
  });

  it('rejects impossible and out-of-range dates', () => {
    expect(parseDateText('February 31, 2026')).toBeNull();
    expect(parseDateText('© 2026 AgFunderNews')).toBeNull();
    expect(parseDateText('March 2, 1850')).toBeNull();
  });
});

describe('findPublishedDate', () => {
  it('prefers the API date field', () => {
    expect(
      findPublishedDate({
        fields: [undefined, 'Feb 10, 2026'],
        url: 'https://example.com/2025/01/01/x',
        content: 'March 2, 2026',
      }),
    ).toBe('2026-02-10');
  });

  it.each([
    ['https://agfundernews.com/2026/03/02/oobli-raises', '2026-03-02'],
    ['https://www.businesswire.com/news/home/20260302005123/en/', '2026-03-02'],
    ['https://greenqueen.com.hk/2026/03/sweet-protein/', '2026-03-01'],
  ])('reads the date in %s', (url, expected) => {
    expect(findPublishedDate({ url })).toBe(expected);
  });

  it('falls back to the top of the page text', () => {
    const content = '# Oobli and Ingredion partner on sweet proteins\n\nBy Jane Doe · April 7, 2026\n\nBody…';
    expect(findPublishedDate({ url: 'https://www.synbiobeta.com/read/oobli', content })).toBe('2026-04-07');
  });

  it('ignores dates far down the page', () => {
    const content = `${'x'.repeat(5000)} April 7, 2026`;
    expect(findPublishedDate({ url: 'https://example.com/about', content })).toBeNull();
  });

  it('returns null for an undated page', () => {
    expect(findPublishedDate({ url: 'https://example.com/products/sweetener', content: 'Our sweetener' })).toBeNull();
  });
});
