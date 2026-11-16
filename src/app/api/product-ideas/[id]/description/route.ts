import { NextResponse } from 'next/server';

import { refreshReference } from '@/lib/product-reference';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/product-ideas/[id]/description — look the product's description
 * up again (PubChem / Wikipedia / source, by molecule class) and replace the
 * cached one. Used by the Refresh button on the product page.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const reference = await refreshReference(supabase, id);
    return NextResponse.json({ reference }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === 'Product not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
