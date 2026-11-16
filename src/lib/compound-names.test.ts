import { describe, expect, it } from 'vitest';

import { aliasEntries, countNameUsage, isAbbreviation, matchProduct, pickDisplayName } from './compound-names';

describe('isAbbreviation', () => {
  it.each(['Reb M', "2'-FL", 'HMO', 'BDO', 'PHA-B', 'GLP-1'])('treats %s as an abbreviation', (a) => {
    expect(isAbbreviation(a)).toBe(true);
  });
  it.each(['rebaudioside M', 'brazzein', 'monellin', 'Sweet protein'])('treats %s as a name', (a) => {
    expect(isAbbreviation(a)).toBe(false);
  });
});

describe('aliasEntries', () => {
  it('labels names, brands and abbreviations and dedupes', () => {
    expect(
      aliasEntries({ name: 'rebaudioside M', aliases: ['Reb M', 'Rebaudioside  M', 'stevia glycoside'], brands: ['EverSweet'] }),
    ).toEqual([
      { alias: 'rebaudioside M', normalized: 'rebaudioside m', kind: 'name' },
      { alias: 'EverSweet', normalized: 'eversweet', kind: 'brand' },
      { alias: 'Reb M', normalized: 'reb m', kind: 'abbreviation' },
      { alias: 'stevia glycoside', normalized: 'stevia glycoside', kind: 'name' },
    ]);
  });

  it('counts a name that is also a brand as a brand', () => {
    expect(aliasEntries({ name: 'Sweelin', aliases: [], brands: ['Sweelin'] })).toEqual([
      { alias: 'Sweelin', normalized: 'sweelin', kind: 'brand' },
    ]);
  });
});

describe('matchProduct', () => {
  const idByCid = new Map([[123, 'reb-m']]);
  const idByAlias = new Map([
    ['sweelin', 'monellin'],
    ['monellin', 'monellin'],
  ]);

  it('matches on PubChem CID first', () => {
    expect(matchProduct({ name: 'x', aliases: [], brands: [] }, { cid: 123, canonicalName: null }, idByCid, idByAlias)).toBe('reb-m');
  });

  it('matches a brand-only mention to the existing product', () => {
    expect(matchProduct({ name: 'sweet protein', aliases: [], brands: ['Sweelin'] }, null, idByCid, idByAlias)).toBe('monellin');
  });

  it('returns undefined for an unknown compound', () => {
    expect(matchProduct({ name: 'thaumatin', aliases: [], brands: [] }, null, idByCid, idByAlias)).toBeUndefined();
  });
});

describe('pickDisplayName', () => {
  const aliases = [
    { alias: 'rebaudioside M', kind: 'name' as const },
    { alias: 'Rebaudioside M (stevia)', kind: 'name' as const },
    { alias: 'Reb M', kind: 'abbreviation' as const },
    { alias: 'EverSweet', kind: 'brand' as const },
  ];

  it('picks the generic name most sources use, never a brand', () => {
    const usage = new Map([
      ['eversweet', 9],
      ['reb m', 9],
      ['rebaudioside m (stevia)', 3],
      ['rebaudioside m', 1],
    ]);
    expect(pickDisplayName(aliases, usage, null)).toBe('Rebaudioside M (stevia)');
  });

  it('breaks ties with the PubChem title, then the shorter name', () => {
    expect(pickDisplayName(aliases, new Map(), 'Rebaudioside M (stevia)')).toBe('Rebaudioside M (stevia)');
    expect(pickDisplayName(aliases, new Map(), null)).toBe('rebaudioside M');
  });

  it('falls back to a brand when there is no generic name', () => {
    expect(pickDisplayName([{ alias: 'Sweelin', kind: 'brand' }], new Map(), null)).toBe('Sweelin');
    expect(pickDisplayName([{ alias: 'x', kind: 'pubchem' }], new Map(), null)).toBeNull();
  });
});

describe('countNameUsage', () => {
  it('counts each source once per name', () => {
    const usage = countNameUsage([{ names_used: ['a', 'a', 'b'] }, { names_used: ['a'] }]);
    expect(usage.get('a')).toBe(2);
    expect(usage.get('b')).toBe(1);
  });
});
