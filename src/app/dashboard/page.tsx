import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/ui/page-shell';
import { UrlInput } from '@/components/ingest/url-input';
import { SearchBar } from '@/components/dashboard/search-bar';
import { FermentorBackdrop } from '@/components/dashboard/fermentor-backdrop';
import { FilterChips } from '@/components/dashboard/filter-chips';
import { FilterSidebar } from '@/components/dashboard/filter-sidebar';
import { FundingTile, type FundingTileItem } from '@/components/dashboard/funding-tile';
import { PapersFeedTile, type FeedTileItem } from '@/components/dashboard/papers-feed-tile';
import { ProductRadarTile, type RatedProductIdea } from '@/components/dashboard/product-radar-tile';
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

  const [{ sources, totalCount, error }, topics, funding, ratedProductIdeas, { newCount, items: recentFeedItems }] = await Promise.all([
    searchSources(supabase, filters),
    loadTopics(supabase),
    loadFunding(supabase),
    loadRatedProductIdeas(supabase),
    loadNewFeedItems(supabase),
  ]);

  return (
    <PageShell email={user?.email} backdrop={<FermentorBackdrop />}>
      <h1 className="text-2xl font-semibold tracking-tight [text-shadow:0_1px_4px_rgba(0,0,0,0.55)]">
        Dashboard
      </h1>

      {/* Row 1: New papers | Product radar. Row 2: Funding | New source upload. */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <PapersFeedTile newCount={newCount} items={recentFeedItems} />
        <ProductRadarTile ideas={ratedProductIdeas} />
        <FundingTile opportunities={funding} />
        <UrlInput />
      </div>

      <div className="mt-8">
        <SearchBar />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <FilterSidebar topics={topics} />
        <FilterChips topics={topics} />
      </div>

      {error ? (
        <div className="mt-6 rounded-md border border-red-700/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <p className="font-medium">Couldn&apos;t load sources</p>
          <p className="mt-1 text-red-300/80">{error}</p>
          <p className="mt-1 text-red-300/80">
            If this mentions <code>search_sources</code>, the database migration that adds it
            hasn&apos;t been applied yet — run <code>npm run db:push</code>.
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Source Repository</h2>
            {totalCount > 0 && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                {totalCount}
              </span>
            )}
          </div>

          <div className="px-4 py-3">
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
      )}
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
 *
 * An RPC failure (most commonly: migration 004 hasn't been applied yet, so
 * the function doesn't exist) is returned as `error` rather than folded
 * into an empty result — those two cases look identical to a user ("no
 * sources") but mean very different things, and conflating them is exactly
 * what made a real failure here hard to diagnose from the outside.
 */
async function searchSources(
  supabase: Supabase,
  filters: DashboardFilters,
): Promise<{ sources: SourceListItem[]; totalCount: number; error: string | null }> {
  const { data, error } = await supabase.rpc('search_sources', toRpcArgs(filters));

  if (error) {
    return { sources: [], totalCount: 0, error: error.message };
  }
  if (!data || data.length === 0) {
    return { sources: [], totalCount: 0, error: null };
  }

  const totalCount = data[0]?.total_count ?? 0;
  const sourceIds = data.map((s) => s.id);

  const [topicsBySource, collectionsBySource] = await Promise.all([
    loadTopicsBySource(supabase, sourceIds),
    loadCollectionsBySource(supabase, sourceIds),
  ]);

  return {
    totalCount,
    error: null,
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

/** Top 5 open funding opportunities sorted by nearest deadline. */
async function loadFunding(supabase: Supabase): Promise<FundingTileItem[]> {
  const { data } = await supabase
    .from('funding_opportunities')
    .select('id, title, organization, amount, deadline, url, status')
    .eq('status', 'open')
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(5);
  return data ?? [];
}

/** Product ideas that have been rated, with source counts. */
async function loadRatedProductIdeas(supabase: Supabase): Promise<RatedProductIdea[]> {
  const { data } = await supabase
    .from('product_ideas')
    .select('id, name, description, interest_rating, source_product_ideas(source_id)')
    // 0 is "de-listed" (set via the product page's De-list button) —
    // excluded the same as null ("never rated").
    .not('interest_rating', 'is', null)
    .gt('interest_rating', 0)
    .order('interest_rating', { ascending: false })
    .limit(10);

  return (data ?? []).map((idea) => ({
    id: idea.id,
    name: idea.name,
    description: idea.description,
    interest_rating: idea.interest_rating!,
    source_count: Array.isArray(idea.source_product_ideas)
      ? idea.source_product_ideas.length
      : 0,
  }));
}

/** Count of new feed items + the 5 most recent. */
async function loadNewFeedItems(
  supabase: Supabase,
): Promise<{ newCount: number; items: FeedTileItem[] }> {
  const [{ count }, { data }] = await Promise.all([
    supabase
      .from('feed_items')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new'),
    supabase
      .from('feed_items')
      .select('id, title, authors, published_date, url')
      .eq('status', 'new')
      .order('fetched_at', { ascending: false })
      .limit(5),
  ]);

  return { newCount: count ?? 0, items: data ?? [] };
}
