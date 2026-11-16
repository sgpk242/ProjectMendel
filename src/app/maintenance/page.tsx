import { CompoundMergeReview } from '@/components/maintenance/compound-merge-review';
import { MarketTagRunner } from '@/components/maintenance/market-tag-runner';
import { MoleculeClassRunner } from '@/components/maintenance/molecule-class-runner';
import { ReextractRunner } from '@/components/maintenance/reextract-runner';
import { buildMergePlan } from '@/lib/compound-merge';
import { PageShell } from '@/components/ui/page-shell';
import { createClient } from '@/lib/supabase/server';

/** One-off data maintenance tasks: each previews before it writes. */
export default async function MaintenancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // compounds_status null = compounds were extracted the legacy way (first
  // 12K characters only); failed = the full-text stage errored; complete
  // with compounds_error = some batches failed (partially extracted);
  // production_status null = extracted before brands, molecule classes and
  // production routes were collected.
  const { data: sources } = await supabase
    .from('sources')
    .select('id, title, url, compounds_status, compounds_error, production_status')
    .eq('ingest_status', 'complete')
    .or(
      'compounds_status.is.null,compounds_status.eq.failed,and(compounds_status.eq.complete,compounds_error.not.is.null),production_status.is.null',
    )
    .order('captured_at', { ascending: true });

  const mergePlan = await buildMergePlan(supabase);

  const [{ count: untaggedCount }, { count: unclassifiedCount }] = await Promise.all([
    supabase.from('product_ideas').select('id', { count: 'exact', head: true }).is('market', null),
    supabase.from('product_ideas').select('id', { count: 'exact', head: true }).is('molecule_class', null),
  ]);

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>

      <section className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold tracking-tight">Merge duplicate compounds</h2>
        <p className="mt-1 text-sm text-muted">
          Compounds are now matched by PubChem ID, so synonyms (&ldquo;Reb M&rdquo; and
          &ldquo;rebaudioside M&rdquo;) count as one. This merges the duplicates already in your
          library.
        </p>
        <div className="mt-4">
          <CompoundMergeReview plan={mergePlan} />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold tracking-tight">Tag compounds as industrial or pharma</h2>
        <p className="mt-1 text-sm text-muted">
          The Product Idea Radar toggles between industrial and pharma compounds. New compounds are
          tagged during extraction; this tags the ones already in your library. You can change any
          tag on the compound&apos;s product page. Run it after merging duplicates.
        </p>
        <div className="mt-4">
          <MarketTagRunner untagged={untaggedCount ?? 0} />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold tracking-tight">Classify molecule categories</h2>
        <p className="mt-1 text-sm text-muted">
          Each compound gets a molecule category (small molecule, protein, enzyme…), which decides
          where its description comes from: PubChem for small molecules, otherwise Wikipedia or the
          source&apos;s own description. New compounds are classified during extraction; this
          classifies the ones already in your library. You can change any category on the
          compound&apos;s product page. Run it after merging duplicates.
        </p>
        <div className="mt-4">
          <MoleculeClassRunner unclassified={unclassifiedCount ?? 0} />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold tracking-tight">Re-extract compounds from full text</h2>
        <p className="mt-1 text-sm text-muted">
          Re-runs compound extraction over each source&apos;s full text, one source at a time. It
          covers sources read the old way (first 12,000 characters only), sources whose extraction
          failed or was partial, and every source extracted before brand names, molecule categories
          and production routes were collected. For each compound without a production route it
          also follows the article&apos;s relevant links and runs a web search, so expect a few
          minutes per source. Existing compound links are kept; new ones are added. Apply the
          merges above first, so re-extracted compounds land on the merged rows.
        </p>
        <div className="mt-4">
          <ReextractRunner
            sources={(sources ?? []).map((s) => ({
              id: s.id,
              title: s.title || s.url,
              state:
                s.compounds_status === 'failed'
                  ? ('failed' as const)
                  : s.compounds_status === 'complete' && s.compounds_error
                    ? ('partial' as const)
                    : s.compounds_status === 'complete'
                      ? ('no-routes' as const)
                      : ('legacy' as const),
            }))}
          />
        </div>
      </section>
    </PageShell>
  );
}
