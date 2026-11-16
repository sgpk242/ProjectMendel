import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/types/database';

/**
 * Compound-name normalization against PubChem (PUG REST).
 *
 * Every lookup is cached in `compound_lookups` (misses included), so a name
 * is only ever sent to PubChem once. Requests are serialized at least
 * `MIN_INTERVAL_MS` apart to stay under PubChem's 5 requests/second limit.
 *
 * Docs: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
 */

const BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const MIN_INTERVAL_MS = 220;
const MAX_ATTEMPTS = 4;
/** How many PubChem synonyms to keep per compound. */
const SYNONYM_LIMIT = 20;

export type CompoundLookup = {
  cid: number | null;
  canonicalName: string | null;
  synonyms: string[];
};

type Supabase = SupabaseClient<Database>;

/** Cache key / comparison form of a name: NFKC, straight quotes, collapsed spaces, lowercase. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Resolve names to PubChem compounds, from the cache where possible.
 * Returns a map keyed by `normalizeName(name)`; every input name gets an
 * entry (`cid: null` when PubChem has no confident match).
 */
export async function resolveNames(
  supabase: Supabase,
  names: string[],
): Promise<Map<string, CompoundLookup>> {
  const keys = [...new Set(names.map(normalizeName).filter(Boolean))];
  const result = new Map<string, CompoundLookup>();
  if (keys.length === 0) return result;

  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await supabase
      .from('compound_lookups')
      .select('query_name, pubchem_cid, canonical_name, synonyms')
      .in('query_name', keys.slice(i, i + 200));
    if (error) throw new Error(`Failed to read compound lookup cache: ${error.message}`);
    for (const row of data ?? []) {
      result.set(row.query_name, {
        cid: row.pubchem_cid,
        canonicalName: row.canonical_name,
        synonyms: row.synonyms,
      });
    }
  }

  const missing = keys.filter((k) => !result.has(k));
  const fetched: Database['public']['Tables']['compound_lookups']['Insert'][] = [];
  for (const key of missing) {
    const lookup = await lookupPubChem(key);
    result.set(key, lookup);
    fetched.push({
      query_name: key,
      pubchem_cid: lookup.cid,
      canonical_name: lookup.canonicalName,
      synonyms: lookup.synonyms,
    });
  }

  if (fetched.length > 0) {
    const { error } = await supabase
      .from('compound_lookups')
      .upsert(fetched, { onConflict: 'query_name' });
    if (error) throw new Error(`Failed to write compound lookup cache: ${error.message}`);
  }

  return result;
}

/**
 * Resolve a compound by its name, then by each alias in turn; the first
 * that maps to a PubChem compound wins. Aliases are only looked up when the
 * name itself doesn't resolve.
 */
export async function resolveCompounds(
  supabase: Supabase,
  compounds: { name: string; aliases: string[] }[],
): Promise<(CompoundLookup | null)[]> {
  const byName = await resolveNames(
    supabase,
    compounds.map((c) => c.name),
  );
  const pending = compounds
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !byName.get(normalizeName(c.name))?.cid);
  const byAlias = await resolveNames(
    supabase,
    pending.flatMap(({ c }) => c.aliases),
  );

  return compounds.map((c) => {
    for (const candidate of [c.name, ...c.aliases]) {
      const hit = byName.get(normalizeName(candidate)) ?? byAlias.get(normalizeName(candidate));
      if (hit?.cid) return hit;
    }
    return null;
  });
}

/**
 * Look one name up in PubChem. Accepts a CID only if the queried name is
 * itself one of that compound's synonyms — PubChem's name search is fuzzy
 * enough that short or ambiguous names ("PHA") can otherwise map to an
 * unrelated compound.
 */
export async function lookupPubChem(name: string): Promise<CompoundLookup> {
  const miss: CompoundLookup = { cid: null, canonicalName: null, synonyms: [] };
  const wanted = normalizeName(name);
  if (!wanted) return miss;

  // POST form input, so names containing "/" or other path characters work.
  const synonymsBody = await pubchemRequest('/compound/name/synonyms/JSON', `name=${encodeURIComponent(name)}`);
  const info = (synonymsBody as SynonymsResponse | null)?.InformationList?.Information ?? [];

  const match = info.find(
    (entry) =>
      typeof entry.CID === 'number' &&
      Array.isArray(entry.Synonym) &&
      entry.Synonym.some((s) => normalizeName(s) === wanted),
  );
  if (!match || typeof match.CID !== 'number') return miss;

  const titleBody = await pubchemRequest(`/compound/cid/${match.CID}/property/Title/JSON`);
  const title = (titleBody as PropertyResponse | null)?.PropertyTable?.Properties?.[0]?.Title;

  return {
    cid: match.CID,
    canonicalName: typeof title === 'string' && title.trim() ? title.trim() : (match.Synonym?.[0] ?? name),
    synonyms: (match.Synonym ?? []).slice(0, SYNONYM_LIMIT),
  };
}

type SynonymsResponse = {
  InformationList?: { Information?: { CID?: number; Synonym?: string[] }[] };
};

type PropertyResponse = {
  PropertyTable?: { Properties?: { CID?: number; Title?: string }[] };
};

let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

/** Wait for this request's turn: calls are spaced `MIN_INTERVAL_MS` apart. */
function throttle(): Promise<void> {
  const turn = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  queue = turn.catch(() => {});
  return turn;
}

/**
 * GET (or POST with a form body) a PUG REST path. Returns null when PubChem
 * says the input doesn't match anything (404, or 400 for a name it can't
 * parse); retries with backoff on 503/429, which is how PubChem signals
 * throttling or overload.
 */
async function pubchemRequest(path: string, formBody?: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await throttle();
    const res = await fetch(`${BASE}${path}`, {
      method: formBody ? 'POST' : 'GET',
      headers: {
        Accept: 'application/json',
        ...(formBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: formBody,
      signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 404 || res.status === 400) return null;
    if (res.status === 503 || res.status === 429) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`PubChem request failed: ${res.status} ${res.statusText}`);
    return res.json();
  }
  throw new Error('PubChem is throttling requests; try again shortly');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type DescriptionResponse = {
  InformationList?: {
    Information?: { CID?: number; Description?: string; DescriptionSourceName?: string }[];
  };
};

/** The first description PubChem lists for a compound, or null. */
export function parsePubChemDescription(body: unknown): string | null {
  const info = (body as DescriptionResponse | null)?.InformationList?.Information ?? [];
  const entry = info.find((i) => typeof i.Description === 'string' && i.Description.trim());
  return entry?.Description?.trim() ?? null;
}

/**
 * PubChem's description of a compound, with a link to its page. Null when
 * PubChem has no description for it.
 */
export async function fetchPubChemDescription(cid: number): Promise<{ extract: string; url: string } | null> {
  const body = await pubchemRequest(`/compound/cid/${cid}/description/JSON`);
  const extract = parsePubChemDescription(body);
  return extract ? { extract, url: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}` } : null;
}
