import { describe, expect, it, vi } from 'vitest';

vi.mock('groq-sdk', () => ({ default: class {} }));

import {
  digProductionRoutes,
  extractLinks,
  parseRouteReply,
  rankLinks,
  type ProductionTarget,
} from './production';

const targets: ProductionTarget[] = [{ productId: 'p1', names: ['Sweelin', 'monellin'] }];
const article = 'https://www.foodnavigator.com/Article/2026/04/07/amai-sweet-protein';

describe('extractLinks', () => {
  it('finds links, skips images and duplicate fragments', () => {
    const md = [
      '![logo](https://x.test/logo.png)',
      'Read about [**Sweelin**](https://amaiproteins.com/sweelin#top) and [Sweelin](https://amaiproteins.com/sweelin).',
      '[Our technology](https://amaiproteins.com/technology "Tech")',
    ].join('\n');
    expect(extractLinks(md)).toEqual([
      { text: 'Sweelin', url: 'https://amaiproteins.com/sweelin' },
      { text: 'Our technology', url: 'https://amaiproteins.com/technology' },
    ]);
  });
});

describe('rankLinks', () => {
  it('prefers links naming the compound, then route pages, and drops furniture', () => {
    const links = [
      { text: 'Share on LinkedIn', url: 'https://www.linkedin.com/shareArticle?u=x' },
      { text: 'Subscribe', url: 'https://www.foodnavigator.com/newsletter' },
      { text: 'More sweeteners news', url: 'https://www.foodnavigator.com/Sections/Sweeteners' },
      { text: 'Our technology', url: 'https://amaiproteins.com/technology' },
      { text: 'Amai Proteins', url: 'https://amaiproteins.com/' },
      { text: 'Sweelin sweet protein', url: 'https://amaiproteins.com/products/sweelin' },
      { text: 'Same article', url: article },
    ];
    expect(rankLinks(links, targets, article).map((l) => l.url)).toEqual([
      'https://amaiproteins.com/products/sweelin',
      'https://amaiproteins.com/technology',
    ]);
  });
});

describe('parseRouteReply', () => {
  const page =
    'Sweelin is produced by precision fermentation: a designer monellin protein expressed in yeast and purified.';
  const reply = (route: object) => JSON.stringify({ routes: [route] });

  it('accepts a route whose quote is on the page', () => {
    const routes = parseRouteReply(
      reply({
        id: '1',
        method: 'precision_fermentation',
        detail: 'designer monellin expressed in yeast',
        quote: 'Sweelin is produced by precision fermentation: a designer monellin protein',
      }),
      targets,
      page,
      'https://amaiproteins.com/technology',
    );
    expect(routes.get('p1')).toEqual({
      method: 'precision_fermentation',
      detail: 'designer monellin expressed in yeast',
      evidenceUrl: 'https://amaiproteins.com/technology',
    });
  });

  it('rejects invented quotes, unknown methods and unknown ids', () => {
    const url = 'https://x.test';
    expect(
      parseRouteReply(reply({ id: '1', method: 'precision_fermentation', quote: 'Made from stevia leaves in a big factory' }), targets, page, url).size,
    ).toBe(0);
    expect(parseRouteReply(reply({ id: '1', method: 'alchemy', quote: page }), targets, page, url).size).toBe(0);
    expect(parseRouteReply(reply({ id: '7', method: 'precision_fermentation', quote: page }), targets, page, url).size).toBe(0);
    expect(parseRouteReply('not json', targets, page, url).size).toBe(0);
  });
});

describe('digProductionRoutes', () => {
  const page = 'Sweelin is produced by precision fermentation of a designer monellin protein in yeast.';
  const answer = JSON.stringify({
    routes: [{ id: '1', method: 'precision_fermentation', detail: 'yeast', quote: page }],
  });

  function client(replies: Record<string, string>) {
    const create = vi.fn(async (req: { messages: { content: string }[] }) => {
      const url = /Page: (\S+)/.exec(req.messages[1].content)![1];
      return { choices: [{ message: { content: replies[url] ?? '{"routes":[]}' } }] };
    });
    return { create, groq: { chat: { completions: { create } } } as never };
  }

  it('follows the article link that names the compound and stops once found', async () => {
    const { create, groq } = client({ 'https://amaiproteins.com/products/sweelin': answer });
    const search = vi.fn();
    const result = await digProductionRoutes({
      articleUrl: article,
      articleText: 'See [Sweelin](https://amaiproteins.com/products/sweelin) and [technology](https://amaiproteins.com/technology).',
      targets,
      fetchPage: async () => page,
      search,
      client: groq,
    });
    expect(result.routes.get('p1')?.evidenceUrl).toBe('https://amaiproteins.com/products/sweelin');
    expect(create).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
  });

  it('falls back to a web search when the links say nothing', async () => {
    const { groq } = client({ 'https://news.test/how-sweelin-is-made': answer });
    const search = vi.fn(async () => [{ url: 'https://news.test/how-sweelin-is-made', content: page }]);
    const result = await digProductionRoutes({
      articleUrl: article,
      articleText: 'No useful links here.',
      targets,
      fetchPage: async () => 'nothing',
      search,
      client: groq,
    });
    expect(search).toHaveBeenCalledWith(expect.stringContaining('"Sweelin"'));
    expect(result.routes.get('p1')?.method).toBe('precision_fermentation');
  });

  it('reads at most five pages', async () => {
    const { create, groq } = client({});
    const links = Array.from({ length: 8 }, (_, i) => `[Sweelin ${i}](https://amai.test/sweelin-${i})`).join(' ');
    const result = await digProductionRoutes({
      articleUrl: article,
      articleText: links,
      targets,
      fetchPage: async () => page,
      search: async () => Array.from({ length: 5 }, (_, i) => ({ url: `https://s.test/${i}`, content: page })),
      client: groq,
    });
    expect(result.pagesRead).toBe(5);
    expect(create).toHaveBeenCalledTimes(5);
    expect(result.routes.size).toBe(0);
  });
});
