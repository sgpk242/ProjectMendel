import { describe, expect, it } from 'vitest';

import { parseThesisFields, resolvedAtFor } from './theses';

describe('parseThesisFields', () => {
  it('requires a claim on create', () => {
    expect(parseThesisFields({}, { requireClaim: true })).toEqual({ error: 'claim is required' });
    expect(parseThesisFields({ claim: '  ' }, { requireClaim: true })).toEqual({ error: 'claim is required' });
  });

  it('trims text, blanks to null, and returns only the fields sent', () => {
    expect(
      parseThesisFields({ claim: ' Whey parity by 2029 ', change_my_mind: '  ' }, { requireClaim: true }),
    ).toEqual({ fields: { claim: 'Whey parity by 2029', change_my_mind: null } });
  });

  it('validates review dates and statuses', () => {
    expect(parseThesisFields({ review_date: '2027-01-15' }, { requireClaim: false })).toEqual({
      fields: { review_date: '2027-01-15' },
    });
    expect(parseThesisFields({ review_date: '' }, { requireClaim: false })).toEqual({ fields: { review_date: null } });
    expect('error' in parseThesisFields({ review_date: '15/01/2027' }, { requireClaim: false })).toBe(true);
    expect('error' in parseThesisFields({ status: 'maybe' }, { requireClaim: false })).toBe(true);
  });

  it('ignores the removed confidence field', () => {
    expect(parseThesisFields({ confidence: 70 }, { requireClaim: false })).toEqual({ fields: {} });
  });
});

describe('resolvedAtFor', () => {
  it('stamps only when moving from open to a resolved status', () => {
    expect(typeof resolvedAtFor('open', 'confirmed')).toBe('string');
    expect(typeof resolvedAtFor(null, 'refuted')).toBe('string');
  });

  it('clears when reopened and leaves it alone otherwise', () => {
    expect(resolvedAtFor('confirmed', 'open')).toBeNull();
    expect(resolvedAtFor('confirmed', 'confirmed')).toBeUndefined();
    expect(resolvedAtFor('confirmed', 'refuted')).toBeUndefined();
    expect(resolvedAtFor('open', undefined)).toBeUndefined();
  });
});
