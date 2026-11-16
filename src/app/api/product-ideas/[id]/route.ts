import { NextResponse } from 'next/server';

import { COMPOUND_MARKETS, MOLECULE_CLASSES, type CompoundMarket, type MoleculeClass } from '@/lib/constants';
import { refreshDisplayNames } from '@/lib/product-aliases';
import { createClient } from '@/lib/supabase/server';
import type { TablesUpdate } from '@/lib/types/database';

/**
 * PATCH /api/product-ideas/[id] — update a product idea: rating, notes,
 * description, market, molecule class, and the page header. Setting `name`
 * pins it as the header; `name_pinned: false` goes back to the automatic
 * header (the generic name most sources use).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { interest_rating, notes, description, market, molecule_class, name, name_pinned } = (body ??
    {}) as Record<string, unknown>;

  const updates: TablesUpdate<'product_ideas'> = {};

  if (interest_rating !== undefined) {
    if (interest_rating === null) {
      updates.interest_rating = null;
    } else if (
      typeof interest_rating === 'number' &&
      Number.isInteger(interest_rating) &&
      // 0 is a valid rating here — it's the "de-listed" sentinel set by the
      // product page's De-list button, distinct from null ("never rated").
      interest_rating >= 0 &&
      interest_rating <= 5
    ) {
      updates.interest_rating = interest_rating;
    } else {
      return NextResponse.json(
        { error: 'interest_rating must be an integer 0-5 or null' },
        { status: 400 },
      );
    }
  }

  if (notes !== undefined) {
    updates.notes = typeof notes === 'string' ? notes.trim() || null : null;
  }

  if (description !== undefined) {
    updates.description = typeof description === 'string' ? description.trim() || null : null;
  }

  if (market !== undefined) {
    if (market !== null && !COMPOUND_MARKETS.includes(market as CompoundMarket)) {
      return NextResponse.json(
        { error: `market must be one of: ${COMPOUND_MARKETS.join(', ')}, or null` },
        { status: 400 },
      );
    }
    updates.market = market as CompoundMarket | null;
  }

  if (molecule_class !== undefined) {
    if (molecule_class !== null && !MOLECULE_CLASSES.includes(molecule_class as MoleculeClass)) {
      return NextResponse.json(
        { error: `molecule_class must be one of: ${MOLECULE_CLASSES.join(', ')}, or null` },
        { status: 400 },
      );
    }
    updates.molecule_class = molecule_class as MoleculeClass | null;
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    updates.name = name.trim();
    updates.product_name_pinned = true;
  } else if (name_pinned !== undefined) {
    if (name_pinned !== false) {
      return NextResponse.json({ error: 'name_pinned can only be set to false' }, { status: 400 });
    }
    updates.product_name_pinned = false;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('product_ideas')
    .update(updates)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Another product already uses that name' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `Failed to update product idea: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Product idea not found' }, { status: 404 });
  }

  if (name_pinned === false && name === undefined) {
    try {
      await refreshDisplayNames(supabase, [id]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json(data, { status: 200 });
}

/** DELETE /api/product-ideas/[id] — remove a product idea. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('product_ideas')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete product idea: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Product idea not found' }, { status: 404 });
  }

  return NextResponse.json({ id: data.id }, { status: 200 });
}
