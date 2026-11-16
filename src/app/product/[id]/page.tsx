import Link from 'next/link';

import { AliasList, type AliasItem } from '@/components/product/alias-list';
import { DelistButton } from '@/components/product/delist-button';
import { MarketPicker } from '@/components/product/market-picker';
import { MoleculeClassPicker } from '@/components/product/molecule-class-picker';
import { ProductNoteEditor } from '@/components/product/product-note-editor';
import { RefreshDescriptionButton } from '@/components/product/refresh-description-button';
import { PageShell } from '@/components/ui/page-shell';
import { countNameUsage } from '@/lib/compound-names';
import {
  PRODUCTION_METHOD_DEFINITIONS,
  PRODUCTION_METHOD_LABELS,
  type ProductionMethod,
} from '@/lib/constants';
import { normalizeName } from '@/lib/pubchem';
import { refreshReference } from '@/lib/product-reference';
import { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const REFERENCE_LABELS: Record<string, string> = {
  pubchem: 'PubChem',
  wikipedia: 'Wikipedia',
  source: 'From source',
};

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

  const [references, aliasRows] = await Promise.all([
    loadReferencingSources(supabase, id),
    loadAliases(supabase, id),
  ]);

  // Look the description up on first visit and cache it. null = never looked
  // up; '' = looked up, nothing found. A wrong one is replaced with Refresh.
  let reference = {
    extract: product.reference_extract,
    url: product.reference_url,
    source: product.reference_source,
  };
  if (product.reference_extract === null) {
    try {
      const fresh = await refreshReference(supabase, id);
      reference = { extract: fresh?.extract ?? '', url: fresh?.url ?? null, source: fresh?.source ?? null };
    } catch {
      reference = { extract: '', url: null, source: null };
    }
  }

  const usage = countNameUsage(references);
  const aliases: AliasItem[] = aliasRows.map((a) => ({
    id: a.id,
    alias: a.alias,
    kind: a.kind,
    sourceCount: usage.get(normalizeName(a.alias)) ?? 0,
  }));

  const routed = references.filter((r) => r.production_method);
  const methods = [...new Set(routed.map((r) => r.production_method!))];

  return (
    <PageShell email={user?.email}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">Product Details</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{product.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <MarketPicker productId={product.id} market={product.market} />
            <MoleculeClassPicker productId={product.id} moleculeClass={product.molecule_class} />
          </div>
        </div>
        <DelistButton productId={product.id} />
      </div>

      <div className="mt-6">
        <h2 className="flex items-baseline gap-3 text-sm font-semibold tracking-tight text-muted">
          Description
          {reference.url ? (
            <a
              href={reference.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-normal text-accent hover:underline"
            >
              {REFERENCE_LABELS[reference.source ?? ''] ?? 'Reference'} ↗
            </a>
          ) : reference.source ? (
            <span className="text-xs font-normal">{REFERENCE_LABELS[reference.source]}</span>
          ) : null}
          <RefreshDescriptionButton productId={product.id} />
        </h2>
        {reference.extract ? (
          <p className="mt-2 text-sm leading-relaxed text-foreground">{reference.extract}</p>
        ) : (
          <p className="mt-2 text-sm text-muted">No description found.</p>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold tracking-tight text-muted">Also known as</h2>
        <div className="mt-2">
          <AliasList
            productId={product.id}
            name={product.name}
            pinned={product.product_name_pinned}
            aliases={aliases}
          />
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold tracking-tight text-muted">How it&apos;s made</h2>
        {methods.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {methods.map((m) => (
              <span
                key={m}
                title={PRODUCTION_METHOD_DEFINITIONS[m]}
                className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent"
              >
                {PRODUCTION_METHOD_LABELS[m]}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            No production route found yet. Routes are looked for when a source is ingested or re-extracted.
          </p>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold tracking-tight text-muted">
          Sources referencing this compound
        </h2>
        <div className="mt-2">
          {references.length > 0 ? (
            <ul className="space-y-3">
              {references.map((s) => (
                <li key={s.id}>
                  <Link href={`/source/${s.id}`} className="text-sm text-accent hover:underline">
                    {s.title || 'Untitled'}
                  </Link>
                  {s.production_method ? (
                    <p className="mt-0.5 text-xs text-muted">
                      <span className="text-foreground/90">
                        {PRODUCTION_METHOD_LABELS[s.production_method]}
                      </span>
                      {s.production_detail ? ` — ${s.production_detail}` : null}
                      {s.production_evidence_url ? (
                        <>
                          {' · '}
                          <a
                            href={s.production_evidence_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-accent hover:underline"
                          >
                            {evidenceLabel(s.production_evidence_url, s.url)} ↗
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No sources reference this compound.</p>
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

/** "the article" when the route came from the source itself, else the page's host. */
function evidenceLabel(evidenceUrl: string, sourceUrl: string): string {
  if (evidenceUrl === sourceUrl) return 'from the article';
  try {
    return `from ${new URL(evidenceUrl).hostname.replace(/^www\./, '')}`;
  } catch {
    return 'evidence';
  }
}

async function loadProduct(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from('product_ideas')
    .select(
      'id, name, notes, reference_extract, reference_url, reference_source, market, molecule_class, product_name_pinned',
    )
    .eq('id', id)
    .maybeSingle();
  return data;
}

async function loadAliases(supabase: Supabase, productId: string) {
  const { data } = await supabase
    .from('product_aliases')
    .select('id, alias, kind')
    .eq('product_idea_id', productId);
  return data ?? [];
}

async function loadReferencingSources(
  supabase: Supabase,
  productId: string,
): Promise<
  {
    id: string;
    title: string | null;
    url: string;
    names_used: string[];
    production_method: ProductionMethod | null;
    production_detail: string | null;
    production_evidence_url: string | null;
  }[]
> {
  const { data: links } = await supabase
    .from('source_product_ideas')
    .select('source_id, names_used, production_method, production_detail, production_evidence_url')
    .eq('product_idea_id', productId);

  if (!links || links.length === 0) return [];

  const { data: sources } = await supabase
    .from('sources')
    .select('id, title, url')
    .in(
      'id',
      links.map((l) => l.source_id),
    );

  const byId = new Map((sources ?? []).map((s) => [s.id, s]));
  return links
    .filter((l) => byId.has(l.source_id))
    .map((l) => ({
      id: l.source_id,
      title: byId.get(l.source_id)!.title,
      url: byId.get(l.source_id)!.url,
      names_used: l.names_used,
      production_method: l.production_method,
      production_detail: l.production_detail,
      production_evidence_url: l.production_evidence_url,
    }));
}
