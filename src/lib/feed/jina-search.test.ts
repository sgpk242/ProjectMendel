import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMERCIAL_SITES } from './commercial-sites';
import { searchCommercial, searchNews } from './jina-search';

let requestedUrl = '';

type MockItem = string | { url: string; title?: string; content?: string; date?: string };

function mockJina(items: MockItem[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        statusText: '',
        json: async () => ({
          data: items.map((item, i) =>
            typeof item === 'string'
              ? { title: `Result ${i}`, url: item, date: 'March 2, 2026' }
              : { title: `Result ${i}`, ...item },
          ),
        }),
      };
    }),
  );
}

beforeEach(() => {
  process.env.JINA_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchCommercial', () => {
  it('restricts the search to every commercial site', async () => {
    mockJina([]);
    await searchCommercial('precision fermentation dairy protein');
    const params = new URL(requestedUrl).searchParams.getAll('site');
    expect(params).toEqual(COMMERCIAL_SITES);
  });
});

describe('searchJina listing pages', () => {
  it('drops category pages from commercial results', async () => {
    mockJina([
      'https://www.synbiobeta.com/categories/food-agriculture',
      'https://www.synbiobeta.com/read/sweet-proteins-are-coming',
    ]);
    const { results, skipped } = await searchCommercial('biomanufactured sweetness proteins');
    expect(results.map((r) => r.url)).toEqual([
      'https://www.synbiobeta.com/read/sweet-proteins-are-coming',
    ]);
    expect(skipped).toEqual({ listing: 1, undated: 0 });
  });

  it('drops homepages and paginated archives', async () => {
    mockJina([
      'https://agfundernews.com/',
      'https://agfundernews.com/tag/precision-fermentation/page/6',
      'https://agfundernews.com/oobli-raises-series-b',
    ]);
    const { results, skipped } = await searchCommercial('sweet proteins');
    expect(results.map((r) => r.url)).toEqual(['https://agfundernews.com/oobli-raises-series-b']);
    expect(skipped.listing).toBe(2);
  });
});

describe('searchJina publish dates', () => {
  it('keeps dated articles with their date and drops undated pages', async () => {
    mockJina([
      { url: 'https://agfundernews.com/2026/04/07/oobli-partners-with-ingredion' },
      { url: 'https://www.synbiobeta.com/read/oobli', content: '# Oobli\n\nApril 9, 2026\n\nBody' },
      { url: 'https://www.oobli.com/our-proteins', content: 'Sweet proteins for everyone' },
    ]);
    const { results, skipped } = await searchCommercial('sweet proteins');
    expect(results.map((r) => [r.url, r.publishedDate])).toEqual([
      ['https://agfundernews.com/2026/04/07/oobli-partners-with-ingredion', '2026-04-07'],
      ['https://www.synbiobeta.com/read/oobli', '2026-04-09'],
    ]);
    expect(skipped.undated).toBe(1);
  });
});

describe('searchNews', () => {
  it('drops results from commercial sites and their subdomains', async () => {
    mockJina([
      'https://www.prnewswire.com/news/x',
      'https://news.fooddive.com/y',
      'https://cen.acs.org/a',
      'https://acs.org/b',
      'https://notprnewswire.com/c',
      'https://reuters.com/d',
    ]);
    const { results } = await searchNews('precision fermentation whey 2026');
    expect(results.map((r) => r.url)).toEqual([
      'https://acs.org/b',
      'https://notprnewswire.com/c',
      'https://reuters.com/d',
    ]);
    expect(new URL(requestedUrl).searchParams.getAll('site')).toEqual([]);
  });
});
