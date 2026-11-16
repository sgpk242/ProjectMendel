import { afterEach, describe, expect, it, vi } from 'vitest';

import { lookupPubChem, normalizeName } from './pubchem';

type FakeResponse = { status: number; body?: unknown };

/** Route PubChem requests to canned responses keyed by the queried name. */
function mockPubChem(byName: Record<string, FakeResponse[]>, title = 'Canonical Title') {
  const calls: { url: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body?: string }) => {
      calls.push({ url, body: init.body });
      let res: FakeResponse;
      if (url.endsWith('/compound/name/synonyms/JSON')) {
        const name = decodeURIComponent(String(init.body).replace(/^name=/, ''));
        res = byName[name]?.shift() ?? { status: 404, body: { Fault: {} } };
      } else {
        res = { status: 200, body: { PropertyTable: { Properties: [{ CID: 1, Title: title }] } } };
      }
      return {
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        statusText: '',
        json: async () => res.body,
      };
    }),
  );
  return calls;
}

const synonyms = (cid: number, names: string[]) => ({
  status: 200,
  body: { InformationList: { Information: [{ CID: cid, Synonym: names }] } },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeName', () => {
  it('lowercases, collapses whitespace and straightens quotes', () => {
    expect(normalizeName('  Reb   M ')).toBe('reb m');
    expect(normalizeName('2’-Fucosyllactose')).toBe("2'-fucosyllactose");
  });
});

describe('lookupPubChem', () => {
  it('accepts a CID when the name is one of its synonyms, with PubChem’s title', async () => {
    const calls = mockPubChem({ 'rebaudioside M': [synonyms(92023628, ['Rebaudioside M', 'Reb M'])] }, 'Rebaudioside M');
    const result = await lookupPubChem('rebaudioside M');
    expect(result).toMatchObject({ cid: 92023628, canonicalName: 'Rebaudioside M' });
    expect(result.synonyms).toContain('Reb M');
    // Names go in a POST form body, so "/" and other path characters are safe.
    expect(calls[0].body).toBe('name=rebaudioside%20M');
  });

  it('rejects a CID whose synonyms do not include the queried name', async () => {
    mockPubChem({ PHA: [synonyms(4747, ['Phenylalanine hydroxylase activator'])] });
    expect((await lookupPubChem('PHA')).cid).toBeNull();
  });

  it('matches across curly vs straight quotes', async () => {
    mockPubChem({ '2’-fucosyllactose': [synonyms(170484, ["2'-Fucosyllactose"])] });
    expect((await lookupPubChem('2’-fucosyllactose')).cid).toBe(170484);
  });

  it('treats 404 as no match', async () => {
    mockPubChem({});
    expect(await lookupPubChem('proprietary blend X')).toEqual({ cid: null, canonicalName: null, synonyms: [] });
  });

  it('retries after a 503 throttle response', async () => {
    mockPubChem({ squalene: [{ status: 503 }, synonyms(638072, ['Squalene'])] });
    expect((await lookupPubChem('squalene')).cid).toBe(638072);
  });
});
