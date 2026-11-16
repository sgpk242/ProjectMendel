import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chunk } from './chunk';
import {
  buildBatches,
  endMatterCutoff,
  extractCompounds,
  mergeMarkets,
  summarizeFailures,
  tokenBudget,
  type ChunkSpan,
} from './compounds';

// Fake Groq: rejects (413) any request whose estimated input + max_tokens
// exceeds the free-tier 8000 TPM limit, or that holds more chunks than
// `maxChunksPerRequest`; otherwise returns one compound per chunk marker.
const groq = vi.hoisted(() => ({
  maxChunksPerRequest: Infinity,
  requests: [] as { requested: number; chunks: number[] }[],
}));

vi.mock('groq-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('groq-sdk')>();
  class FakeGroq {
    chat = {
      completions: {
        create: async (req: { max_tokens: number; messages: { content: string }[] }) => {
          const content = req.messages.map((m) => m.content).join('');
          const requested = Math.ceil(content.length / 3.5) + req.max_tokens;
          const chunks = [...req.messages[1].content.matchAll(/\[\[chunk (\d+)\]\]/g)].map((m) =>
            Number(m[1]),
          );
          groq.requests.push({ requested, chunks });
          if (requested > 8000 || chunks.length > groq.maxChunksPerRequest) {
            throw new actual.APIError(413, { error: { message: 'Request too large' } }, 'Request too large', new Headers());
          }
          const compounds = chunks.map((i) => ({ name: `compound ${i}`, chunkIndex: i, relevanceScore: 0.5 }));
          return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ compounds }) } }] };
        },
      },
    };
  }
  return { ...actual, default: FakeGroq };
});

const para = (i: number) =>
  `Result paragraph ${i}: the engineered Yarrowia strain produced rebaudioside M at titers improving across fed-batch runs.`;
const body = (n: number) => Array.from({ length: n }, (_, i) => para(i)).join('\n\n');

function spans(text: string): ChunkSpan[] {
  return chunk(text).map((c) => ({ index: c.index, content: c.content, startChar: c.startChar, endChar: c.endChar }));
}

describe('endMatterCutoff', () => {
  const cutAt = (text: string) => {
    const c = endMatterCutoff(text);
    return c === text.length ? null : text.slice(c).split('\n')[0];
  };

  it('cuts at a references heading', () => {
    expect(cutAt(`${body(20)}\n\n## References\n\n1. Smith J.`)).toBe('## References');
  });
  it('cuts at a bold "About {Company}" heading', () => {
    expect(cutAt(`${body(20)}\n\n**About Amyris**\n\nAmyris makes squalane.`)).toBe('**About Amyris**');
  });
  it('cuts at a plain Title Case "About {Company}" line', () => {
    expect(cutAt(`${body(20)}\n\nAbout Ginkgo Bioworks\n\nGinkgo is...`)).toBe('About Ginkgo Bioworks');
  });
  it('does not cut at body text starting with "About"', () => {
    expect(cutAt(`${body(10)}\n\nAbout two weeks later\n\n${body(10)}`)).toBeNull();
  });
  it('ignores end-matter headings in the first 40% of the text', () => {
    expect(cutAt(`## About this study\n\n${body(30)}`)).toBeNull();
  });
  it('cuts at media contacts and related-article lists', () => {
    expect(cutAt(`${body(20)}\n\nMedia Contact:\n\nJane`)).toBe('Media Contact:');
    expect(cutAt(`${body(20)}\n\n## Related Articles\n\n- [x](https://a)`)).toBe('## Related Articles');
  });
});

describe('buildBatches', () => {
  it('sends every paragraph exactly once and stops at the cutoff', () => {
    const text = `${body(300)}\n\n## References\n\n1. Vanillin production in J Biotech.`;
    const batches = buildBatches(text, spans(text), endMatterCutoff(text), 9000);
    const sent = batches.flatMap((b) => b.pieces.map((p) => p.text)).join('\n');
    for (let i = 0; i < 300; i++) {
      expect(sent.split(`Result paragraph ${i}:`).length - 1).toBe(1);
    }
    expect(sent).not.toContain('J Biotech');
  });
});

describe('tokenBudget', () => {
  it('keeps one free-tier request well under 8000 tokens', () => {
    const b = tokenBudget(8000);
    expect(b.concurrency).toBe(1);
    expect(b.maxTokens + 900 + b.batchChars / 3).toBeLessThanOrEqual(8000 * 0.85 + 1);
  });
  it('allows bigger batches and parallelism on higher tiers, within the cap', () => {
    const b = tokenBudget(250_000);
    expect(b.concurrency).toBe(2);
    expect(b.maxTokens).toBe(6144);
    expect(b.batchChars).toBe(24_000);
  });
});

describe('extractCompounds', () => {
  beforeEach(() => {
    groq.requests = [];
    groq.maxChunksPerRequest = Infinity;
    delete process.env.GROQ_TPM_LIMIT;
  });

  it('sizes every request to fit the free-tier limit and covers every chunk', async () => {
    const text = body(700);
    const result = await extractCompounds(text, spans(text), 'scientific_paper', 'T');
    expect(result.failedBatches).toEqual([]);
    expect(Math.max(...groq.requests.map((r) => r.requested))).toBeLessThanOrEqual(8000);
    expect(result.compounds).toHaveLength(spans(text).length);
  });

  it('splits a batch Groq rejects as too large and loses nothing', async () => {
    groq.maxChunksPerRequest = 2;
    const text = body(700);
    const result = await extractCompounds(text, spans(text), 'scientific_paper', 'T');
    expect(result.failedBatches).toEqual([]);
    expect(new Set(result.compounds.map((c) => c.chunkIndex)).size).toBe(spans(text).length);
    expect(groq.requests.length).toBeGreaterThan(result.batchCount);
  });
});

describe('summarizeFailures', () => {
  it('collapses repeated reasons', () => {
    const reasons = [...Array(5).fill("too large for Groq's per-minute token limit"), 'rate limited by Groq'];
    expect(summarizeFailures(reasons, 10)).toBe(
      "6 of 10 batches failed: too large for Groq's per-minute token limit (×5); rate limited by Groq",
    );
  });
});

describe('mergeMarkets', () => {
  it('keeps agreement, fills gaps, and turns disagreement into both', () => {
    expect(mergeMarkets('pharma', 'pharma')).toBe('pharma');
    expect(mergeMarkets(null, 'industrial')).toBe('industrial');
    expect(mergeMarkets('industrial', 'pharma')).toBe('both');
  });
});
