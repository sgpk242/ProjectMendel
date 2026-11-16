import type { AliasKind } from '@/lib/constants';
import { normalizeName } from '@/lib/pubchem';

/**
 * Pure helpers for a compound's names: which names a source used (and of
 * what kind), matching a mention to an existing product through its
 * aliases, and choosing the product page header.
 */

export type NamedCompound = { name: string; aliases: string[]; brands: string[] };
export type AliasEntry = { alias: string; normalized: string; kind: AliasKind };

/**
 * Abbreviation: short ("Reb M", "2'-FL", "HMO") or written in capitals and
 * digits ("BDO", "PHA-B").
 */
export function isAbbreviation(alias: string): boolean {
  const trimmed = alias.trim();
  return trimmed.length <= 6 || /^[\p{Lu}\p{N}][\p{Lu}\p{N}'’\-\s.]*$/u.test(trimmed);
}

/**
 * The names a source used for a compound, each with its kind. A name that
 * is also listed as a brand counts as a brand (so it never becomes the
 * header by default). Deduplicated on the normalized form; earlier entries
 * win, in the order name → brands → aliases.
 */
export function aliasEntries(compound: NamedCompound): AliasEntry[] {
  const brands = new Set(compound.brands.map(normalizeName));
  const raw: { alias: string; kind: AliasKind }[] = [
    { alias: compound.name, kind: brands.has(normalizeName(compound.name)) ? 'brand' : 'name' },
    ...compound.brands.map((alias) => ({ alias, kind: 'brand' as const })),
    ...compound.aliases.map((alias) => ({
      alias,
      kind: brands.has(normalizeName(alias)) ? ('brand' as const) : isAbbreviation(alias) ? ('abbreviation' as const) : ('name' as const),
    })),
  ];
  const seen = new Set<string>();
  const entries: AliasEntry[] = [];
  for (const { alias, kind } of raw) {
    const normalized = normalizeName(alias);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push({ alias: alias.trim(), normalized, kind });
  }
  return entries;
}

/**
 * Find the existing product a mention refers to: by PubChem CID first, then
 * by any name the source used or the PubChem title, through the alias index
 * (normalized alias → product id).
 */
export function matchProduct(
  compound: NamedCompound,
  lookup: { cid: number | null; canonicalName: string | null } | null,
  idByCid: Map<number, string>,
  idByAlias: Map<string, string>,
): string | undefined {
  if (lookup?.cid != null && idByCid.has(lookup.cid)) return idByCid.get(lookup.cid);
  const names = [compound.name, ...compound.brands, ...compound.aliases];
  if (lookup?.canonicalName) names.push(lookup.canonicalName);
  for (const name of names) {
    const id = idByAlias.get(normalizeName(name));
    if (id) return id;
  }
  return undefined;
}

/**
 * The page header: the generic name ("name" alias) used by the most
 * sources, ties going to the PubChem title, then the shorter name. Falls
 * back to abbreviations and brands only when the product has no generic
 * name. Null when there is nothing to choose from.
 *
 * `usage` maps a normalized name to how many sources used it.
 */
export function pickDisplayName(
  aliases: { alias: string; kind: AliasKind }[],
  usage: Map<string, number>,
  pubchemTitle: string | null,
): string | null {
  const title = pubchemTitle ? normalizeName(pubchemTitle) : null;
  const pools = [
    aliases.filter((a) => a.kind === 'name'),
    aliases.filter((a) => a.kind === 'abbreviation' || a.kind === 'brand'),
  ];
  const pool = pools.find((p) => p.length > 0);
  if (!pool) return null;

  const score = (a: { alias: string }) => usage.get(normalizeName(a.alias)) ?? 0;
  const sorted = [...pool].sort(
    (a, b) =>
      score(b) - score(a) ||
      Number(normalizeName(b.alias) === title) - Number(normalizeName(a.alias) === title) ||
      a.alias.length - b.alias.length ||
      a.alias.localeCompare(b.alias),
  );
  return sorted[0].alias;
}

/** How many sources used each normalized name, from links' `names_used`. */
export function countNameUsage(links: { names_used: string[] }[]): Map<string, number> {
  const usage = new Map<string, number>();
  for (const link of links) {
    for (const name of new Set(link.names_used)) usage.set(name, (usage.get(name) ?? 0) + 1);
  }
  return usage;
}
