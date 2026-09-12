import Link from 'next/link';

import { ProductNoteEditor } from '@/components/product/product-note-editor';
import { PageShell } from '@/components/ui/page-shell';
import { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export default async function ProductPage({ params }: PageProps<'/product/[id]'>) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS hides rows the signed-in user doesn't own, so a missing row here
  // means either a bad id or someone else's product idea — both render the
  // same not-found state, same convention as the source detail page.
  const product = await loadProduct(supabase, id);

  if (!product) {
    return (
      <PageShell email={user?.email}>
        <h1 className="text-2xl font-semibold tracking-tight">Product not found</h1>
        <p className="mt-2 text-muted">
          It may have been deleted, or it belongs to a different account.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm text-accent hover:underline">
          ← Back to dashboard
        </Link>
      </PageShell>
    );
  }

  const referencingSources = await loadReferencingSources(supabase, id);

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Product Details</h1>
      <p className="mt-1 text-lg text-foreground">{product.name}</p>

      <div className="mt-6">
        <h2 className="text-sm font-semibold tracking-tight text-muted">
          Papers referencing this product
        </h2>
        <div className="mt-2">
          {referencingSources.length > 0 ? (
            <ul className="space-y-2">
              {referencingSources.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/source/${s.id}`}
                    className="text-sm text-accent hover:underline"
                  >
                    {s.title || 'Untitled'}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No papers reference this product.</p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold tracking-tight text-muted">Notes</h2>
        <div className="mt-2">
          <ProductNoteEditor productId={product.id} notes={product.notes} />
        </div>
      </div>
    </PageShell>
  );
}

async function loadProduct(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from('product_ideas')
    .select('id, name, notes')
    .eq('id', id)
    .maybeSingle();
  return data;
}

async function loadReferencingSources(
  supabase: Supabase,
  productId: string,
): Promise<{ id: string; title: string | null }[]> {
  const { data: links } = await supabase
    .from('source_product_ideas')
    .select('source_id')
    .eq('product_idea_id', productId);

  if (!links || links.length === 0) return [];

  const sourceIds = links.map((l) => l.source_id);
  const { data: sources } = await supabase
    .from('sources')
    .select('id, title')
    .in('id', sourceIds);

  return sources ?? [];
}
