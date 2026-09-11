import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/ui/page-shell';
import { UrlInput } from '@/components/ingest/url-input';
import { SourceList, type SourceListItem } from '@/components/dashboard/source-list';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sources = await loadRecentSources(supabase);

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="mt-6">
        <UrlInput />
      </div>

      <div className="mt-8">
        {sources.length > 0 ? (
          <SourceList sources={sources} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
            <p className="text-muted">No sources yet.</p>
            <p className="mt-1 text-muted">Capture your first URL to get started.</p>
          </div>
        )}
      </div>
    </PageShell>
  );
}

/**
 * Latest 20 sources with their topic names attached. Two follow-up queries
 * (links, then topic names) rather than a PostgREST embedded select — the
 * hand-written `Database` type declares no `Relationships`, so nested-select
 * type inference isn't available; this keeps every query fully typed.
 */
async function loadRecentSources(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<SourceListItem[]> {
  const { data: sourceRows } = await supabase
    .from('sources')
    .select('id, title, summary, source_type, ingest_status, captured_at')
    .order('captured_at', { ascending: false })
    .limit(20);

  if (!sourceRows || sourceRows.length === 0) return [];

  const sourceIds = sourceRows.map((s) => s.id);

  const { data: links } = await supabase
    .from('source_topics')
    .select('source_id, topic_id')
    .in('source_id', sourceIds);

  const topicIds = [...new Set((links ?? []).map((l) => l.topic_id))];

  const { data: topicRows } =
    topicIds.length > 0
      ? await supabase.from('topics').select('id, name').in('id', topicIds)
      : { data: [] as { id: string; name: string }[] };

  const topicNameById = new Map((topicRows ?? []).map((t) => [t.id, t.name]));
  const topicsBySource = new Map<string, string[]>();
  for (const link of links ?? []) {
    const name = topicNameById.get(link.topic_id);
    if (!name) continue;
    const list = topicsBySource.get(link.source_id) ?? [];
    list.push(name);
    topicsBySource.set(link.source_id, list);
  }

  return sourceRows.map((s) => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    sourceType: s.source_type,
    ingestStatus: s.ingest_status,
    capturedAt: s.captured_at,
    topics: topicsBySource.get(s.id) ?? [],
  }));
}
