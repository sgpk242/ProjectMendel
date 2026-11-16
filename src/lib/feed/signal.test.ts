import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('groq-sdk', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { buildSignalInput, classifySignals, parseSignalReply } from './signal';

const items = [
  { id: 'a', title: 'Oobli and Ingredion partner on sweet proteins', abstract: 'The companies will…' },
  { id: 'b', title: 'Sweet-protein startup raises $18M Series B', abstract: null },
];

beforeEach(() => create.mockReset());

describe('buildSignalInput', () => {
  it('keys items by position and truncates snippets', () => {
    const input = JSON.parse(buildSignalInput([{ id: 'x', title: 'T', abstract: 'y'.repeat(2000) }]));
    expect(input).toEqual([{ id: '1', title: 'T', snippet: 'y'.repeat(600) }]);
  });
});

describe('parseSignalReply', () => {
  it('maps short ids back to feed item ids', () => {
    const reply = JSON.stringify({
      items: {
        '1': { signal: 'partnership', note: 'Oobli and Ingredion partner to scale sweet proteins' },
        '2': { signal: 'funding', note: '' },
      },
    });
    const results = parseSignalReply(reply, items);
    expect(results.get('a')).toEqual({
      signal: 'partnership',
      note: 'Oobli and Ingredion partner to scale sweet proteins',
    });
    expect(results.get('b')).toEqual({ signal: 'funding', note: null });
  });

  it('drops unknown signals and ids', () => {
    const reply = JSON.stringify({
      items: { '1': { signal: 'gossip' }, '9': { signal: 'funding' }, '2': { signal: 'acquisition' } },
    });
    const results = parseSignalReply(reply, items);
    expect([...results.keys()]).toEqual(['b']);
  });

  it('tolerates text around the JSON and returns nothing for garbage', () => {
    expect(parseSignalReply('Sure! {"items":{"1":{"signal":"setback"}}}', items).get('a')?.signal).toBe('setback');
    expect(parseSignalReply('not json', items).size).toBe(0);
    expect(parseSignalReply('{broken', items).size).toBe(0);
  });
});

describe('classifySignals', () => {
  it('sends one request per batch and parses the reply', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: '{"items":{"1":{"signal":"partnership","note":"n"}}}' } }],
    });
    const results = await classifySignals(items);
    expect(create).toHaveBeenCalledTimes(1);
    expect(results.get('a')?.signal).toBe('partnership');
  });

  it('skips the call for an empty batch', async () => {
    await classifySignals([]);
    expect(create).not.toHaveBeenCalled();
  });
});
