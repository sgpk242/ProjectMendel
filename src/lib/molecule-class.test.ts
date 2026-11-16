import { describe, expect, it } from 'vitest';

import { parseClassReply } from './molecule-class';

describe('parseClassReply', () => {
  it('keeps known classes for known ids', () => {
    const reply = 'Here: {"classes":{"a":"protein","b":"small_molecule","c":"gemstone","z":"protein"}}';
    expect([...parseClassReply(reply, ['a', 'b', 'c'])]).toEqual([
      ['a', 'protein'],
      ['b', 'small_molecule'],
    ]);
  });

  it('returns nothing for a malformed reply', () => {
    expect(parseClassReply('nope', ['a']).size).toBe(0);
    expect(parseClassReply('{"classes":', ['a']).size).toBe(0);
  });
});
