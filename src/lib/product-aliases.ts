import type { SupabaseClient } from '@supabase/supabase-js';

import { countNameUsage, pickDisplayName, type AliasEntry } from '@/lib/compound-names';
import type { Database } from '@/lib/types/database';

type Supabase = SupabaseClient<Database>;

/**
 * Database side of product aliases: saving the names a compound goes by and
 * keeping each product's header in line with them.
 */

/**
 * Save aliases for products. An alias already used by any of the user's
 * products is left where it is (one alias, one product).
 */
export async function saveAliases(
  supabase: Supabase,
  userId: string,
  rows: { productId: string; entry: AliasEntry; sourceId: string | null }[],
): Promise<void> {
  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!unique.has(row.entry.normalized)) unique.set(row.entry.normalized, row);
  if (unique.size === 0) return;

  const { error } = await supabase.from('product_aliases').upsert(
    [...unique.values()].map(({ productId, entry, sourceId }) => ({
      user_id: userId,
      product_idea_id: productId,
      alias: entry.alias,
      alias_normalized: entry.normalized,
      kind: entry.kind,
      first_source_id: sourceId,
    })),
    { onConflict: 'user_id,alias_normalized', ignoreDuplicates: true },
  );
  if (error) throw new Error(`Failed to save product aliases: ${error.message}`);
}

/**
 * Re-pick the header of each product whose header isn't pinned: the generic
 * name used by the most sources (see `pickDisplayName()`). Only writes rows
 * whose name actually changes.
 */
export async function refreshDisplayNames(supabase: Supabase, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;

  const [products, aliases, links] = await Promise.all([
    supabase
      .from('product_ideas')
      .select('id, name, canonical_name, product_name_pinned')
      .in('id', productIds),
    supabase.from('product_aliases').select('product_idea_id, alias, kind').in('product_idea_id', productIds),
    supabase.from('source_product_ideas').select('product_idea_id, names_used').in('product_idea_id', productIds),
  ]);
  for (const result of [products, aliases, links]) {
    if (result.error) throw new Error(`Failed to load product names: ${result.error.message}`);
  }

  for (const product of products.data ?? []) {
    if (product.product_name_pinned) continue;
    const name = pickDisplayName(
      (aliases.data ?? []).filter((a) => a.product_idea_id === product.id),
      countNameUsage((links.data ?? []).filter((l) => l.product_idea_id === product.id)),
      product.canonical_name,
    );
    if (!name || name === product.name) continue;
    const { error } = await supabase.from('product_ideas').update({ name }).eq('id', product.id);
    // A clash with another product's name (the pre-alias unique index on
    // lower(name)) just keeps the current header.
    if (error && error.code !== '23505') {
      throw new Error(`Failed to update product name: ${error.message}`);
    }
  }
}
