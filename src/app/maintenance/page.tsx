import { ReextractRunner } from '@/components/maintenance/reextract-runner';
import { PageShell } from '@/components/ui/page-shell';
import { createClient } from '@/lib/supabase/server';

/**
 * One-off data maintenance tasks. Not linked from the nav — reach it at
 * /maintenance.
 */
export default async function MaintenancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // compounds_status null = compounds were extracted the legacy way (first
  // 12K characters only); failed = the full-text stage errored.
  const { data: sources } = await supabase
    .from('sources')
    .select('id, title, url, compounds_status')
    .eq('ingest_status', 'complete')
    .or('compounds_status.is.null,compounds_status.eq.failed')
    .order('captured_at', { ascending: true });

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>

      <section className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold tracking-tight">Re-extract compounds from full text</h2>
        <p className="mt-1 text-sm text-muted">
          Sources ingested before full-text extraction only had their first 12,000 characters
          read for compounds. This re-runs extraction over each one&apos;s full text, one source at
          a time. Existing compound links are kept; new ones are added.
        </p>
        <div className="mt-4">
          <ReextractRunner
            sources={(sources ?? []).map((s) => ({
              id: s.id,
              title: s.title || s.url,
              failed: s.compounds_status === 'failed',
            }))}
          />
        </div>
      </section>
    </PageShell>
  );
}
