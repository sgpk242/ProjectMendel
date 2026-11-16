import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMERCIAL_SITES } from './commercial-sites';
import { searchCommercial, searchNews } from './jina-search';

let requestedUrl = '';

function mockJina(urls: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        statusText: '',
        json: async () => ({ data: urls.map((u, i) => ({ title: `Result ${i}`, url: u })) }),
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
    const results = await searchNews('precision fermentation whey 2026');
    expect(results.map((r) => r.url)).toEqual([
      'https://acs.org/b',
      'https://notprnewswire.com/c',
      'https://reuters.com/d',
    ]);
    expect(new URL(requestedUrl).searchParams.getAll('site')).toEqual([]);
  });
});
