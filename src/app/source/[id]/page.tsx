import Link from 'next/link';

import { CollectionMemberships, type Membership } from '@/components/source/collection-memberships';
import { CompoundList, type CompoundItem } from '@/components/source/compound-list';
import { DeleteSourceButton } from '@/components/source/delete-button';
import { MetadataPanel } from '@/components/source/metadata-panel';
import { NoteEditor } from '@/components/source/note-editor';
import { RatingEditor } from '@/components/source/rating-editor';
import { SimilarSources, type SimilarSourceItem } from '@/components/source/similar-sources';
import { StatusEditor } from '@/components/source/status-editor';
import { SummarySection } from '@/components/source/summary-section';
import { TopicList, type TopicItem } from '@/components/source/topic-list';
import { PageShell } from '@/components/ui/page-shell';
import { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export default async function SourcePage({ params }: PageProps<'/source/[id]'>) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS hides rows the signed-in user doesn't own, so a missing row here
  // means either a bad id or someone else's source — both render the same
  // not-found state.
  const source = await loadSource(supabase, id);

  if (!source) {
    return (
      <PageShell email={user?.email}>
        <h1 className="text-2xl font-semibold tracking-tight">Source not found</h1>
        <p className="mt-2 text-muted">
          It may have been deleted, or it belongs to a different account.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm text-accent hover:underline">
          ← Back to dashboard
        </Link>
      </PageShell>
    );
  }

  const [topics, compounds, similarSources, memberships] = await Promise.all([
    loadTopics(supabase, id),
    loadProductIdeas(supabase, id),
    loadSimilarSources(supabase, id),
    loadCollectionMemberships(supabase, id),
  ]);

  return (
    <PageShell email={user?.email}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Source Details</h1>
          <p className="mt-1 text-lg italic text-foreground">{source.title || 'Untitled'}</p>
          {/* The URL is the primary way back to the actual content, so it's
              sized and colored to read as the page's second headline, not a
              footnote. */}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 break-all text-base text-accent hover:underline"
          >
            {source.url}
            <span aria-hidden className="shrink-0">
              ↗
            </span>
          </a>
        </div>
        <DeleteSourceButton sourceId={source.id} title={source.title} redirectTo="/dashboard">
          Delete
        </DeleteSourceButton>
      </div>

      <div className="mt-4">
        <MetadataPanel
          author={source.author}
          publication={source.publication}
          publishedDate={source.published_date}
          capturedAt={source.captured_at}
          sourceType={source.source_type}
          wordCount={source.word_count}
          readingTimeMinutes={source.reading_time_minutes}
        />
      </div>

      {source.ingest_status === 'failed' ? (
        <div className="mt-6 rounded-md border border-red-700/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <p className="font-medium">Ingest failed</p>
          {source.ingest_error ? (
            <p className="mt-1 text-red-300/80">{source.ingest_error}</p>
          ) : null}
        </div>
      ) : source.ingest_status !== 'complete' ? (
        <div className="mt-6 rounded-md border border-yellow-700/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300">
          Still processing ({source.ingest_status})…
        </div>
      ) : null}

      {source.classification_truncated ? (
        <div className="mt-6 rounded-md border border-yellow-700/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300">
          <p className="font-medium">Classification output was truncated</p>
          <p className="mt-1 text-yellow-300/80">
            The model hit its output limit while classifying this source, so the summary, topics,
            or biochemical products below may be an incomplete read. Delete and re-capture this
            source to try again.
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-6">
        <StatusEditor sourceId={source.id} status={source.status} />
        <RatingEditor sourceId={source.id} rating={source.interest_rating} />
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold tracking-tight text-muted">Note</h2>
        <div className="mt-2">
          <NoteEditor sourceId={source.id} note={source.user_note} />
        </div>
      </div>

      <div className="mt-6">
        <SummarySection summary={source.summary} />
      </div>

      {topics.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-semibold tracking-tight text-muted">Topics</h2>
          <div className="mt-2">
            <TopicList topics={topics} />
          </div>
        </div>
      ) : null}

      {source.ingest_status === 'complete' ? (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-muted">
              Biochemical products mentioned
            </h2>
            {compounds.length > 0 ? (
              <div className="flex items-center gap-4 text-xs text-muted">
                <span>Relevance</span>
                <span>Interest</span>
              </div>
            ) : null}
          </div>
          <div className="mt-2">
            <CompoundList compounds={compounds} />
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <h2 className="text-sm font-semibold tracking-tight text-muted">Collections</h2>
        <div className="mt-2">
          <CollectionMemberships sourceId={source.id} memberships={memberships} />
        </div>
      </div>

      {similarSources.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-semibold tracking-tight text-muted">Similar sources</h2>
          <div className="mt-2">
            <SimilarSources sources={similarSources} />
          </div>
        </div>
      ) : null}

      <div className="mt-12 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
        <p className="text-muted">Full text and chunk browsing will appear here.</p>
      </div>
    </PageShell>
  );
}

async function loadSource(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from('sources')
    .select(
      'id, title, url, author, publication, published_date, captured_at, summary, source_type, status, ingest_status, ingest_error, interest_rating, word_count, reading_time_minutes, user_note, classification_truncated',
    )
    .eq('id', id)
    .maybeSingle();
  return data;
}

async function loadTopics(supabase: Supabase, sourceId: string): Promise<TopicItem[]> {
  const { data: links } = await supabase
    .from('source_topics')
    .select('topic_id, relevance_score')
    .eq('source_id', sourceId);

  if (!links || links.length === 0) return [];

  const topicIds = links.map((l) => l.topic_id);
  const { data: topicRows } = await supabase.from('topics').select('id, name').in('id', topicIds);
  const nameById = new Map((topicRows ?? []).map((t) => [t.id, t.name]));

  const topics: TopicItem[] = [];
  for (const link of links) {
    const name = nameById.get(link.topic_id);
    if (!name) continue;
    topics.push({ id: link.topic_id, name, relevanceScore: link.relevance_score });
  }
  return topics;
}

/**
 * `source_similarities` uses canonical pair ordering (`source_a_id <
 * source_b_id`), so a similarity row involving this source has it on either
 * side — every row needs to resolve which id is "this source" and which is
 * "the other one" before it's usable here.
 */
async function loadSimilarSources(
  supabase: Supabase,
  sourceId: string,
): Promise<SimilarSourceItem[]> {
  const { data: links } = await supabase
    .from('source_similarities')
    .select('source_a_id, source_b_id, similarity_score, relationship_type')
    .or(`source_a_id.eq.${sourceId},source_b_id.eq.${sourceId}`);

  if (!links || links.length === 0) return [];

  const otherIds = links.map((l) => (l.source_a_id === sourceId ? l.source_b_id : l.source_a_id));
  const { data: otherSources } = await supabase
    .from('sources')
    .select('id, title, url')
    .in('id', otherIds);

  const otherById = new Map((otherSources ?? []).map((s) => [s.id, s]));

  const results: SimilarSourceItem[] = [];
  for (const link of links) {
    const otherId = link.source_a_id === sourceId ? link.source_b_id : link.source_a_id;
    const other = otherById.get(otherId);
    if (!other) continue;
    results.push({
      id: other.id,
      title: other.title,
      url: other.url,
      similarityScore: link.similarity_score,
      relationshipType: link.relationship_type,
    });
  }
  return results.sort((a, b) => b.similarityScore - a.similarityScore);
}

async function loadCollectionMemberships(
  supabase: Supabase,
  sourceId: string,
): Promise<Membership[]> {
  const { data: links } = await supabase
    .from('collection_sources')
    .select('collection_id')
    .eq('source_id', sourceId);

  if (!links || links.length === 0) return [];

  const collectionIds = links.map((l) => l.collection_id);
  const { data: collections } = await supabase
    .from('collections')
    .select('id, name')
    .in('id', collectionIds);

  return (collections ?? []).map((c) => ({ id: c.id, name: c.name }));
}

/** Product ideas (compounds) linked to this source via source_product_ideas. */
async function loadProductIdeas(
  supabase: Supabase,
  sourceId: string,
): Promise<CompoundItem[]> {
  const { data: links } = await supabase
    .from('source_product_ideas')
    .select('product_idea_id, context, relevance_score')
    .eq('source_id', sourceId);

  if (!links || links.length === 0) return [];

  const ideaIds = links.map((l) => l.product_idea_id);
  const { data: ideas } = await supabase
    .from('product_ideas')
    .select('id, name, description, interest_rating')
    .in('id', ideaIds);

  const ideaById = new Map((ideas ?? []).map((i) => [i.id, i]));

  const compounds: CompoundItem[] = [];
  for (const link of links) {
    const idea = ideaById.get(link.product_idea_id);
    if (!idea) continue;
    compounds.push({
      id: idea.id,
      name: idea.name,
      description: idea.description,
      context: link.context,
      relevanceScore: link.relevance_score,
      interestRating: idea.interest_rating,
    });
  }

  return compounds.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
}
