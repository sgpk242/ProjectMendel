import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/product-ideas — list the caller's product ideas (compounds).
 *
 * Query params:
 *   ?rated=true   — only return ideas with an interest_rating
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ratedOnly = searchParams.get('rated') === 'true';

  let query = supabase
    .from('product_ideas')
    .select('*, source_product_ideas(source_id)')
    .order('interest_rating', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (ratedOnly) {
    query = query.not('interest_rating', 'is', null);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Failed to list product ideas: ${error.message}` },
      { status: 500 },
    );
  }

  // Flatten source count into each idea
  const ideas = (data ?? []).map((idea) => ({
    ...idea,
    source_count: Array.isArray(idea.source_product_ideas)
      ? idea.source_product_ideas.length
      : 0,
    source_product_ideas: undefined,
  }));

  return NextResponse.json({ ideas }, { status: 200 });
}
