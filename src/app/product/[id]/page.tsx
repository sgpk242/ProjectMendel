import Link from 'next/link';

import { DelistButton } from '@/components/product/delist-button';
import { ProductNoteEditor } from '@/components/product/product-note-editor';
import { PageShell } from '@/components/ui/page-shell';
import { createClient } from '@/lib/supabase/server';
import { fetchWikipediaExtract } from '@/lib/wikipedia';

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

  // Lazy-fetch and cache the Wikipedia extract on first visit.
  // null = never looked up; '' = looked up, nothing found; any other string = cached extract.
  let wikiExtract: string | null = product.wikipedia_extract;
  let wikiUrl: string | null = product.wikipedia_url;

  if (product.wikipedia_extract === null) {
    const result = await fetchWikipediaExtract(product.name);
    if (result) {
      wikiExtract = result.extract;
      wikiUrl = result.url;
      await supabase
        .from('product_ideas')
        .update({ wikipedia_extract: result.extract, wikipedia_url: result.url })
        .eq('id', id);
    } else {
      wikiExtract = '';
      wikiUrl = null;
      await supabase
        .from('product_ideas')
        .update({ wikipedia_extract: '' })
        .eq('id', id);
    }
  }

  return (
    <PageShell email={user?.email}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Product Details</h1>
          <p className="mt-1 text-lg text-foreground">{product.name}</p>
        </div>
        <DelistButton productId={product.id} />
      </div>

      {wikiExtract ? (
        <div className="mt-6">
          <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-tight text-muted">
            Description
            {wikiUrl ? (
              <a
                href={wikiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-normal text-accent hover:underline"
              >
                Wikipedia ↗
              </a>
            ) : null}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{wikiExtract}</p>
        </div>
      ) : null}

      <div className="mt-6">
        <h2 className="text-sm font-semibold tracking-tight text-muted">
          Papers referencing this compound
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
            <p className="text-sm text-muted">No papers reference this compound.</p>
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
    .select('id, name, notes, wikipedia_extract, wikipedia_url')
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
