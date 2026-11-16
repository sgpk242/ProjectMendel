import type { SupabaseClient } from '@supabase/supabase-js';

import type { AliasKind, MoleculeClass } from '@/lib/constants';
import { fetchPubChemDescription } from '@/lib/pubchem';
import type { Database } from '@/lib/types/database';
import { fetchWikipediaExtract } from '@/lib/wikipedia';

/**
 * Where a product's description comes from, chosen by molecule class:
 * PubChem for small molecules (and other classes PubChem covers), Wikipedia
 * for the rest when one of the product's generic names has its own article,
 * else the description the model wrote from the source that introduced it.
 * Brand names are never looked up.
 */

export type ReferenceSource = 'pubchem' | 'wikipedia' | 'source';
export type Reference = { extract: string; url: string | null; source: ReferenceSource };

/** Classes PubChem describes well (defined small structures). */
const PUBCHEM_CLASSES: MoleculeClass[] = ['small_molecule', 'oligosaccharide', 'lipid'];

type ProductForReference = {
  name: string;
  canonical_name: string | null;
  pubchem_cid: number | null;
  molecule_class: MoleculeClass | null;
  description: string | null;
};

/** Which lookups to try, in order, for a product. */
export function referencePlan(product: ProductForReference): ReferenceSource[] {
  const pubchemFirst =
    product.pubchem_cid !== null &&
    (product.molecule_class === null || PUBCHEM_CLASSES.includes(product.molecule_class));
  return pubchemFirst ? ['pubchem', 'wikipedia', 'source'] : ['wikipedia', 'source'];
}

/** Generic names to try on Wikipedia: the header, PubChem title, then other generic names. */
export function wikipediaNames(product: ProductForReference, aliases: { alias: string; kind: AliasKind }[]): string[] {
  const names = [
    product.name,
    product.canonical_name,
    ...aliases.filter((a) => a.kind === 'name').map((a) => a.alias),
  ].filter((n): n is string => Boolean(n && n.trim()));
  const brands = new Set(aliases.filter((a) => a.kind === 'brand').map((a) => a.alias.toLowerCase()));
  return [...new Set(names)].filter((n) => !brands.has(n.toLowerCase())).slice(0, 4);
}

export async function lookupReference(
  product: ProductForReference,
  aliases: { alias: string; kind: AliasKind }[],
): Promise<Reference | null> {
  for (const step of referencePlan(product)) {
    if (step === 'pubchem' && product.pubchem_cid !== null) {
      const hit = await fetchPubChemDescription(product.pubchem_cid);
      if (hit) return { ...hit, source: 'pubchem' };
    }
    if (step === 'wikipedia') {
      const hit = await fetchWikipediaExtract(wikipediaNames(product, aliases));
      if (hit) return { ...hit, source: 'wikipedia' };
    }
    if (step === 'source' && product.description?.trim()) {
      return { extract: product.description.trim(), url: null, source: 'source' };
    }
  }
  return null;
}

/**
 * Look a product's description up again and cache it on the row
 * (`reference_extract` '' = looked up, nothing found). Returns the result.
 */
export async function refreshReference(
  supabase: SupabaseClient<Database>,
  productId: string,
): Promise<Reference | null> {
  const [{ data: product, error }, { data: aliases }] = await Promise.all([
    supabase
      .from('product_ideas')
      .select('name, canonical_name, pubchem_cid, molecule_class, description')
      .eq('id', productId)
      .maybeSingle(),
    supabase.from('product_aliases').select('alias, kind').eq('product_idea_id', productId),
  ]);
  if (error) throw new Error(`Failed to load product: ${error.message}`);
  if (!product) throw new Error('Product not found');

  const reference = await lookupReference(product, aliases ?? []);
  const { error: saveError } = await supabase
    .from('product_ideas')
    .update({
      reference_extract: reference?.extract ?? '',
      reference_url: reference?.url ?? null,
      reference_source: reference?.source ?? null,
    })
    .eq('id', productId);
  if (saveError) throw new Error(`Failed to save description: ${saveError.message}`);
  return reference;
}
