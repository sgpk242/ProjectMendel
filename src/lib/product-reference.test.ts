import { afterEach, describe, expect, it, vi } from 'vitest';

import { parsePubChemDescription } from './pubchem';
import { lookupReference, referencePlan, wikipediaNames } from './product-reference';
import { fetchWikipediaExtract } from './wikipedia';

type Route = { match: RegExp; body: unknown; status?: number };

function mockFetch(routes: Route[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const route = routes.find((r) => r.match.test(url));
      return {
        ok: route ? (route.status ?? 200) < 400 : false,
        status: route ? (route.status ?? 200) : 404,
        statusText: '',
        json: async () => route?.body,
      };
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const sweelinck = {
  type: 'standard',
  title: 'Jan Pieterszoon Sweelinck',
  extract: 'Jan Pieterszoon Sweelinck was a Dutch composer…',
  content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Jan_Pieterszoon_Sweelinck' } },
};

describe('fetchWikipediaExtract', () => {
  it('rejects a search hit whose title is not one of the names (Sweelin → Sweelinck)', async () => {
    mockFetch([
      { match: /opensearch/, body: ['Sweelin', ['Jan Pieterszoon Sweelinck']] },
      { match: /summary\/Jan/, body: sweelinck },
    ]);
    expect(await fetchWikipediaExtract(['Sweelin'])).toBeNull();
  });

  it('uses a direct article and rejects disambiguation pages', async () => {
    mockFetch([
      { match: /summary\/PHA/, body: { type: 'disambiguation', title: 'PHA', extract: 'PHA may refer to…', content_urls: { desktop: { page: 'u' } } } },
      {
        match: /summary\/monellin/,
        body: { type: 'standard', title: 'Monellin', extract: 'Monellin is a sweet protein.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Monellin' } } },
      },
    ]);
    expect(await fetchWikipediaExtract(['PHA', 'monellin'])).toEqual({
      extract: 'Monellin is a sweet protein.',
      url: 'https://en.wikipedia.org/wiki/Monellin',
    });
  });
});

describe('parsePubChemDescription', () => {
  it('returns the first description entry', () => {
    const body = {
      InformationList: { Information: [{ CID: 1, Title: 'Vanillin' }, { CID: 1, Description: ' Vanillin is a phenolic aldehyde. ' }] },
    };
    expect(parsePubChemDescription(body)).toBe('Vanillin is a phenolic aldehyde.');
    expect(parsePubChemDescription(null)).toBeNull();
  });
});

const base = { name: 'x', canonical_name: null, pubchem_cid: null, molecule_class: null, description: null };

describe('referencePlan', () => {
  it('uses PubChem first only for small-molecule-type compounds with a CID', () => {
    expect(referencePlan({ ...base, pubchem_cid: 1, molecule_class: 'small_molecule' })[0]).toBe('pubchem');
    expect(referencePlan({ ...base, pubchem_cid: 1, molecule_class: null })[0]).toBe('pubchem');
    expect(referencePlan({ ...base, pubchem_cid: 1, molecule_class: 'protein' })[0]).toBe('wikipedia');
    expect(referencePlan({ ...base, molecule_class: 'small_molecule' })[0]).toBe('wikipedia');
  });
});

describe('wikipediaNames', () => {
  it('never looks up brand names', () => {
    const names = wikipediaNames({ ...base, name: 'Sweelin' }, [
      { alias: 'Sweelin', kind: 'brand' },
      { alias: 'monellin', kind: 'name' },
      { alias: 'MNEI', kind: 'abbreviation' },
    ]);
    expect(names).toEqual(['monellin']);
  });
});

describe('lookupReference', () => {
  it('falls back to the source description for a brand-only protein', async () => {
    mockFetch([{ match: /opensearch/, body: ['Sweelin', ['Jan Pieterszoon Sweelinck']] }]);
    const result = await lookupReference(
      { ...base, name: 'monellin variant', molecule_class: 'protein', description: 'A designer sweet protein.' },
      [{ alias: 'Sweelin', kind: 'brand' }],
    );
    expect(result).toEqual({ extract: 'A designer sweet protein.', url: null, source: 'source' });
  });

  it('describes a small molecule from PubChem', async () => {
    const calls = mockFetch([
      { match: /pubchem.*description/, body: { InformationList: { Information: [{ Description: 'Vanillin is…' }] } } },
    ]);
    const result = await lookupReference({ ...base, name: 'vanillin', pubchem_cid: 1183, molecule_class: 'small_molecule' }, []);
    expect(result).toEqual({ extract: 'Vanillin is…', url: 'https://pubchem.ncbi.nlm.nih.gov/compound/1183', source: 'pubchem' });
    expect(calls.some((c) => c.includes('wikipedia'))).toBe(false);
  });
});
