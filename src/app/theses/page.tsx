import { ThesisList, type LinkedSource, type ThesisItem } from '@/components/theses/thesis-list';
import { PageShell } from '@/components/ui/page-shell';
import { createClient } from '@/lib/supabase/server';

export default async function ThesesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: theses }, { data: links }] = await Promise.all([
    supabase
      .from('theses')
      .select('*')
      .order('review_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.from('thesis_sources').select('thesis_id, source_id, stance, note'),
  ]);

  const sourceIds = [...new Set((links ?? []).map((l) => l.source_id))];
  const { data: sources } =
    sourceIds.length > 0
      ? await supabase.from('sources').select('id, title, url').in('id', sourceIds)
      : { data: [] as { id: string; title: string | null; url: string }[] };
  const sourceById = new Map((sources ?? []).map((s) => [s.id, s]));

  const linksByThesis = new Map<string, LinkedSource[]>();
  for (const link of links ?? []) {
    const source = sourceById.get(link.source_id);
    if (!source) continue;
    const list = linksByThesis.get(link.thesis_id) ?? [];
    list.push({
      sourceId: link.source_id,
      title: source.title || source.url,
      stance: link.stance,
      note: link.note,
    });
    linksByThesis.set(link.thesis_id, list);
  }

  const items: ThesisItem[] = (theses ?? []).map((t) => ({
    id: t.id,
    claim: t.claim,
    confidence: t.confidence,
    changeMyMind: t.change_my_mind,
    reviewDate: t.review_date,
    status: t.status,
    resolutionNote: t.resolution_note,
    resolvedAt: t.resolved_at,
    createdAt: t.created_at,
    sources: linksByThesis.get(t.id) ?? [],
  }));

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Theses</h1>
      <p className="mt-1 text-sm text-muted">
        Calls about where the industry is going, with a date to check them against what happened.
      </p>

      <div className="mt-6">
        <ThesisList theses={items} today={new Date().toISOString().slice(0, 10)} />
      </div>
    </PageShell>
  );
}
