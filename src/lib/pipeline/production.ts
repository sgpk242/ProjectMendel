import type { SupabaseClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

import {
  PRODUCTION_METHODS,
  PRODUCTION_METHOD_DEFINITIONS,
  type ProductionMethod,
} from '@/lib/constants';
import { searchJina } from '@/lib/feed/jina-search';
import { isListingPage } from '@/lib/feed/listing-page';
import { normalizeName } from '@/lib/pubchem';
import type { Database } from '@/lib/types/database';

import { tokenBudget } from './compounds';
import { extract } from './extract';

/**
 * Production-route deep dig, run after compound extraction when a source is
 * ingested (or re-extracted).
 *
 * Compound extraction records how a compound is made when the article says
 * so. For the compounds it doesn't, this stage reads further: first the
 * article's own links that look relevant (a company's technology or product
 * page), then one web search per compound still unknown. Each page is read
 * by Groq, and a route is accepted only with a quote found on that page.
 * The page is saved as the evidence.
 */

const MODEL = 'openai/gpt-oss-120b';
/** Pages read per source, links and search results together. */
export const MAX_PAGES = 5;
/** Of those, how many may come from the article's links. */
export const MAX_LINK_PAGES = 3;
/** Search results read per compound. */
const SEARCH_RESULTS = 2;
const MAX_PAGE_CHARS = 12_000;

export type Link = { text: string; url: string };
export type ProductionTarget = { productId: string; names: string[] };
export type ProductionRoute = { method: ProductionMethod; detail: string | null; evidenceUrl: string };

const SKIP_HOSTS = [
  'twitter.com',
  'x.com',
  'facebook.com',
  'linkedin.com',
  'instagram.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'pinterest.com',
  'reddit.com',
  'whatsapp.com',
  't.me',
  'google.com',
  'apple.com',
];
const SKIP_PATH = /\/(share|sharer|login|signin|sign-in|signup|sign-up|register|subscribe|newsletter|cart|account|privacy|terms|cookie)/i;
const SKIP_FILE = /\.(png|jpe?g|gif|svg|webp|mp4|mp3|zip|ics)$/i;
const ROUTE_WORDS =
  /(technolog|platform|process|how[-\s]?it|science|fermentation|production|manufactur|ingredient|product|solution|innovation)/i;

/** Markdown links in `markdown` (images skipped), deduplicated on URL without the fragment. */
export function extractLinks(markdown: string): Link[] {
  const links: Link[] = [];
  const seen = new Set<string>();
  const re = /(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    if (match[1] === '!') continue;
    const url = match[3].replace(/#.*$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({ text: match[2].replace(/[*_`]/g, '').trim(), url });
  }
  return links;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function slug(value: string): string {
  return normalizeName(value).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

/**
 * The article links most likely to say how the target compounds are made,
 * best first. A link must mention a compound (in its text or URL) or look
 * like a technology / product page; page furniture, social links, files,
 * listing pages and links back to the article are dropped.
 */
export function rankLinks(links: Link[], targets: ProductionTarget[], articleUrl: string, limit = MAX_LINK_PAGES): Link[] {
  const articleHost = hostOf(articleUrl);
  const names = targets.flatMap((t) => t.names).map((n) => ({ plain: normalizeName(n), slug: slug(n) }));
  const scored: { link: Link; score: number }[] = [];

  for (const link of links) {
    const host = hostOf(link.url);
    if (!host) continue;
    if (SKIP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) continue;
    if (link.url.replace(/\/$/, '') === articleUrl.replace(/\/$/, '')) continue;
    if (SKIP_PATH.test(link.url) || SKIP_FILE.test(link.url) || isListingPage(link.url, link.text)) continue;

    const text = normalizeName(link.text);
    const path = link.url.toLowerCase();
    const mentions = names.some(
      (n) => (n.plain.length >= 3 && text.includes(n.plain)) || (n.slug.length >= 3 && path.includes(n.slug)),
    );
    const routeWords = ROUTE_WORDS.test(link.text) || ROUTE_WORDS.test(path);
    if (!mentions && !routeWords) continue;

    const score = (mentions ? 3 : 0) + (routeWords ? 2 : 0) + (host !== articleHost ? 1 : 0);
    scored.push({ link, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.link);
}

const SYSTEM_PROMPT = `You read one web page and say how specific biomanufacturing compounds are made, ONLY from what this page states.

Methods: ${PRODUCTION_METHODS.map((m) => `"${m}" (${PRODUCTION_METHOD_DEFINITIONS[m]})`).join('; ')}.

Input: a list of compounds (each with an id and the names it goes by, brands included) and the page text.
Return JSON: { "routes": [ { "id": "<compound id>", "method": "<method>", "detail": "<organism, host, feedstock or plant, a few words>", "quote": "<exact sentence from the page that says how it is made>" } ] }.
Only include a compound if the page itself says how it (or that branded product) is made; never guess from general knowledge. The quote must be copied exactly from the page. Return { "routes": [] } if the page doesn't say. Respond with ONLY valid JSON.`;

function squash(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Parse Groq's reply. A route is kept only when its id is one of the
 * targets, its method is known, and the first part of its quote appears on
 * the page (ignoring case, punctuation and spacing).
 */
export function parseRouteReply(
  reply: string,
  targets: ProductionTarget[],
  pageText: string,
  pageUrl: string,
): Map<string, ProductionRoute> {
  const routes = new Map<string, ProductionRoute>();
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return routes;
  let parsed: { routes?: unknown };
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return routes;
  }
  if (!Array.isArray(parsed.routes)) return routes;

  const page = squash(pageText);
  for (const raw of parsed.routes) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { id, method, detail, quote } = raw as Record<string, unknown>;
    const target = targets[Number(id) - 1];
    if (!target || routes.has(target.productId)) continue;
    if (!PRODUCTION_METHODS.includes(method as ProductionMethod)) continue;
    if (typeof quote !== 'string') continue;
    const probe = squash(quote).split(' ').slice(0, 8).join(' ');
    if (probe.length < 15 || !page.includes(probe)) continue;
    routes.set(target.productId, {
      method: method as ProductionMethod,
      detail: typeof detail === 'string' && detail.trim() ? detail.trim().slice(0, 300) : null,
      evidenceUrl: pageUrl,
    });
  }
  return routes;
}

/** Ask Groq how the targets are made, according to one page. */
export async function readRoutesFromPage(
  client: Groq,
  page: { url: string; text: string },
  targets: ProductionTarget[],
): Promise<Map<string, ProductionRoute>> {
  if (targets.length === 0) return new Map();
  const budget = tokenBudget();
  const text = page.text.slice(0, Math.min(MAX_PAGE_CHARS, budget.batchChars));
  const compounds = targets.map((t, i) => ({ id: String(i + 1), names: t.names.slice(0, 6) }));

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: Math.min(budget.maxTokens, 2000),
    reasoning_effort: 'low',
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Compounds: ${JSON.stringify(compounds)}\n\nPage: ${page.url}\n\n${text}` },
    ],
  });
  return parseRouteReply(response.choices[0]?.message?.content ?? '', targets, text, page.url);
}

/**
 * Find production routes for a source's compounds that don't have one yet,
 * reading at most `MAX_PAGES` pages beyond the article. Returns how many
 * routes were found and a warning when pages couldn't be read.
 */
export async function digProductionRoutes(input: {
  articleUrl: string;
  articleText: string;
  targets: ProductionTarget[];
  fetchPage?: (url: string) => Promise<string>;
  search?: (query: string) => Promise<{ url: string; content: string | null }[]>;
  client?: Groq;
}): Promise<{ routes: Map<string, ProductionRoute>; pagesRead: number; failures: number }> {
  const fetchPage = input.fetchPage ?? (async (url: string) => (await extract(url)).content);
  const search =
    input.search ??
    (async (query: string) =>
      (await searchJina(query, { limit: SEARCH_RESULTS, requireDate: false })).results.map((r) => ({
        url: r.url,
        content: r.content,
      })));
  const client = input.client ?? new Groq({ maxRetries: 6, timeout: 120_000 });

  const routes = new Map<string, ProductionRoute>();
  const visited = new Set<string>([input.articleUrl]);
  let pagesRead = 0;
  let failures = 0;
  const remaining = () => input.targets.filter((t) => !routes.has(t.productId));

  const readPage = async (url: string, text: string | null) => {
    pagesRead++;
    if (!text) {
      failures++;
      return;
    }
    try {
      for (const [id, route] of await readRoutesFromPage(client, { url, text }, remaining())) {
        if (!routes.has(id)) routes.set(id, route);
      }
    } catch {
      failures++;
    }
  };

  // 1. The article's own links.
  for (const link of rankLinks(extractLinks(input.articleText), remaining(), input.articleUrl)) {
    if (remaining().length === 0 || pagesRead >= MAX_PAGES) break;
    if (visited.has(link.url)) continue;
    visited.add(link.url);
    let text: string | null = null;
    try {
      text = await fetchPage(link.url);
    } catch {
      text = null;
    }
    await readPage(link.url, text);
  }

  // 2. One web search per compound still unknown.
  for (const target of remaining()) {
    if (pagesRead >= MAX_PAGES) break;
    const name = target.names[0];
    let results: { url: string; content: string | null }[] = [];
    try {
      results = await search(`"${name}" how it is made production fermentation OR extraction OR synthesis`);
    } catch {
      failures++;
      continue;
    }
    for (const result of results.slice(0, SEARCH_RESULTS)) {
      if (routes.has(target.productId) || pagesRead >= MAX_PAGES) break;
      if (visited.has(result.url)) continue;
      visited.add(result.url);
      await readPage(result.url, result.content);
    }
  }

  return { routes, pagesRead, failures };
}

/**
 * Run the deep dig for one source and save what it finds on the source's
 * compound links (only links still without a route). Tracks progress in
 * `sources.production_status`; never throws.
 */
export async function runProductionStage(
  supabase: SupabaseClient<Database>,
  sourceId: string,
): Promise<{ ok: boolean; found: number; error: string | null }> {
  const setStatus = (status: Database['public']['Enums']['compound_status'], error: string | null) =>
    supabase.from('sources').update({ production_status: status, production_error: error }).eq('id', sourceId);

  try {
    const [{ data: source, error: sourceError }, { data: links, error: linksError }] = await Promise.all([
      supabase.from('sources').select('url, full_text').eq('id', sourceId).single(),
      supabase
        .from('source_product_ideas')
        .select('product_idea_id, names_used')
        .eq('source_id', sourceId)
        .is('production_method', null),
    ]);
    if (sourceError || !source) throw new Error(`Source not found: ${sourceError?.message ?? sourceId}`);
    if (linksError) throw new Error(`Failed to load compound links: ${linksError.message}`);
    if (!links || links.length === 0) {
      await setStatus('complete', null);
      return { ok: true, found: 0, error: null };
    }

    await setStatus('running', null);

    const ids = links.map((l) => l.product_idea_id);
    const [{ data: products }, { data: aliases }] = await Promise.all([
      supabase.from('product_ideas').select('id, name').in('id', ids),
      supabase.from('product_aliases').select('product_idea_id, alias, kind').in('product_idea_id', ids).neq('kind', 'pubchem'),
    ]);
    // Brands first: a producer's pages and search results use the brand.
    const targets: ProductionTarget[] = (products ?? []).map((p) => {
      const own = (aliases ?? []).filter((a) => a.product_idea_id === p.id);
      const names = [
        ...own.filter((a) => a.kind === 'brand').map((a) => a.alias),
        p.name,
        ...own.filter((a) => a.kind !== 'brand').map((a) => a.alias),
      ];
      return { productId: p.id, names: [...new Map(names.map((n) => [normalizeName(n), n])).values()] };
    });

    const { routes, pagesRead, failures } = await digProductionRoutes({
      articleUrl: source.url,
      articleText: source.full_text ?? '',
      targets,
    });

    for (const [productId, route] of routes) {
      const { error } = await supabase
        .from('source_product_ideas')
        .update({
          production_method: route.method,
          production_detail: route.detail,
          production_evidence_url: route.evidenceUrl,
        })
        .eq('source_id', sourceId)
        .eq('product_idea_id', productId)
        .is('production_method', null);
      if (error) throw new Error(`Failed to save production route: ${error.message}`);
    }

    const warning = failures > 0 ? `${failures} of ${pagesRead} pages couldn't be read` : null;
    await setStatus('complete', warning);
    return { ok: true, found: routes.size, error: warning };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setStatus('failed', message).then(
      () => {},
      () => {},
    );
    return { ok: false, found: 0, error: message };
  }
}
