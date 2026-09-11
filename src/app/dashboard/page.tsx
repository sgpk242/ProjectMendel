import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/ui/page-shell';
import { UrlInput } from '@/components/ingest/url-input';
import { SearchBar } from '@/components/dashboard/search-bar';
import { FilterChips } from '@/components/dashboard/filter-chips';
import { FilterSidebar } from '@/components/dashboard/filter-sidebar';
import { Pagination } from '@/components/dashboard/pagination';
import { SourceList, type SourceListItem } from '@/components/dashboard/source-list';
import {
  hasActiveFilters,
  parseSearchParams,
  toRpcArgs,
  toURLSearchParams,
  type DashboardFilters,
} from '@/lib/search-params';

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Topic = { id: string; name: string };

export default async function DashboardPage({ searchParams }: PageProps<'/dashboard'>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const filters = parseSearchParams(toURLSearchParams(await searchParams));

  const [{ sources, totalCount }, topics] = await Promise.all([
    searchSources(supabase, filters),
    loadTopics(supabase),
  ]);

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="mt-6">
        <UrlInput />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <SearchBar />
        <FilterChips topics={topics} />
      </div>

      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        <FilterSidebar topics={topics} />

        <div className="min-w-0 flex-1">
          {sources.length > 0 ? (
            <SourceList sources={sources} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
              {hasActiveFilters(filters) ? (
                <>
                  <p className="text-muted">No sources match these filters.</p>
                  <p className="mt-1 text-muted">Try clearing a filter or search term.</p>
                </>
              ) : (
                <>
                  <p className="text-muted">No sources yet.</p>
                  <p className="mt-1 text-muted">Capture your first URL to get started.</p>
                </>
              )}
            </div>
          )}

          <div className="mt-8">
            <Pagination filters={filters} totalCount={totalCount} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

/**
 * Runs `search_sources` (full-text + facets + pagination in one RPC call,
 * see 004_search_sources_rpc.sql) then attaches topic names and collection
 * memberships for the returned page of sources — two follow-up queries
 * rather than nested selects, for the same reason the old dashboard did:
 * the hand-written `Database` type declares no `Relationships`, so
 * PostgREST embedded-select type inference isn't available here.
 */
async function searchSources(
  supabase: Supabase,
  filters: DashboardFilters,
): Promise<{ sources: SourceListItem[]; totalCount: number }> {
  const { data, error } = await supabase.rpc('search_sources', toRpcArgs(filters));

  if (error || !data || data.length === 0) {
    return { sources: [], totalCount: 0 };
  }

  const totalCount = data[0]?.total_count ?? 0;
  const sourceIds = data.map((s) => s.id);

  const [topicsBySource, collectionsBySource] = await Promise.all([
    loadTopicsBySource(supabase, sourceIds),
    loadCollectionsBySource(supabase, sourceIds),
  ]);

  return {
    totalCount,
    sources: data.map((s) => ({
      id: s.id,
      title: s.title,
      summary: s.summary,
      sourceType: s.source_type,
      ingestStatus: s.ingest_status,
      status: s.status,
      capturedAt: s.captured_at,
      publication: s.publication,
      interestRating: s.interest_rating,
      readingTimeMinutes: s.reading_time_minutes,
      userNote: s.user_note,
      topics: topicsBySource.get(s.id) ?? [],
      collectionIds: collectionsBySource.get(s.id) ?? [],
    })),
  };
}

async function loadTopicsBySource(
  supabase: Supabase,
  sourceIds: string[],
): Promise<Map<string, string[]>> {
  const { data: links } = await supabase
    .from('source_topics')
    .select('source_id, topic_id')
    .in('source_id', sourceIds);

  const topicIds = [...new Set((links ?? []).map((l) => l.topic_id))];
  const { data: topicRows } =
    topicIds.length > 0
      ? await supabase.from('topics').select('id, name').in('id', topicIds)
      : { data: [] as Topic[] };

  const nameById = new Map((topicRows ?? []).map((t) => [t.id, t.name]));
  const bySource = new Map<string, string[]>();
  for (const link of links ?? []) {
    const name = nameById.get(link.topic_id);
    if (!name) continue;
    const list = bySource.get(link.source_id) ?? [];
    list.push(name);
    bySource.set(link.source_id, list);
  }
  return bySource;
}

async function loadCollectionsBySource(
  supabase: Supabase,
  sourceIds: string[],
): Promise<Map<string, string[]>> {
  const { data } = await supabase
    .from('collection_sources')
    .select('source_id, collection_id')
    .in('source_id', sourceIds);

  const bySource = new Map<string, string[]>();
  for (const row of data ?? []) {
    const list = bySource.get(row.source_id) ?? [];
    list.push(row.collection_id);
    bySource.set(row.source_id, list);
  }
  return bySource;
}

/** Every one of the user's topics, for the filter sidebar's checkboxes and
 * the filter chips' id → name lookup. */
async function loadTopics(supabase: Supabase): Promise<Topic[]> {
  const { data } = await supabase.from('topics').select('id, name').order('name');
  return data ?? [];
}
