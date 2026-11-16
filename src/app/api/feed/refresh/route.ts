import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { searchOpenAlex } from '@/lib/feed/openalex';
import { searchCommercial, searchNews, type JinaSearchOutcome } from '@/lib/feed/jina-search';
import { classifyPendingFeedItems } from '@/lib/feed/signal';

// Signal classification makes a few Groq calls after the searches.
export const maxDuration = 300;

/**
 * POST /api/feed/refresh — run all enabled feed queries and fetch new items.
 *
 * For each enabled query:
 *  1. Call the appropriate fetcher (OpenAlex, Jina Search, or Jina Search
 *     restricted to commercial sites)
 *  2. Dedup-insert results into feed_items (web searches keep only dated,
 *     individual articles)
 *  3. Update feed_queries.last_run_at
 * Then classifies unclassified feed items by commercial signal.
 *
 * Returns how many items were added, skipped and classified.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Load all enabled queries
  const { data: queries, error: queriesError } = await supabase
    .from('feed_queries')
    .select('*')
    .eq('enabled', true);

  if (queriesError) {
    return NextResponse.json(
      { error: `Failed to load feed queries: ${queriesError.message}` },
      { status: 500 },
    );
  }

  if (!queries || queries.length === 0) {
    return NextResponse.json(
      { added: 0, queries: 0, message: 'No enabled feed queries' },
      { status: 200 },
    );
  }

  let totalAdded = 0;
  const skipped = { listing: 0, undated: 0 };
  const errors: string[] = [];

  for (const query of queries) {
    try {
      // Fetch results from the appropriate source
      const outcome: JinaSearchOutcome =
        query.source_type === 'openalex'
          ? {
              results: (await searchOpenAlex(query.query_text)).map((r) => ({ ...r, content: null })),
              skipped: { listing: 0, undated: 0 },
            }
          : query.source_type === 'commercial'
            ? await searchCommercial(query.query_text)
            : await searchNews(query.query_text);
      const { results } = outcome;
      skipped.listing += outcome.skipped.listing;
      skipped.undated += outcome.skipped.undated;

      if (results.length === 0) {
        // Update last_run_at even with no results
        await supabase
          .from('feed_queries')
          .update({ last_run_at: new Date().toISOString() })
          .eq('id', query.id);
        continue;
      }

      // Insert items, ignoring duplicates (dedup on external_id and url).
      // We insert one at a time to gracefully handle constraint violations.
      let added = 0;
      for (const item of results) {
        const { error: insertError } = await supabase.from('feed_items').insert({
          user_id: user.id,
          feed_query_id: query.id,
          title: item.title,
          authors: item.authors,
          abstract: item.abstract,
          url: item.url,
          external_id: item.externalId,
          published_date: item.publishedDate,
        });

        if (!insertError) {
          added++;
        }
        // Silently skip duplicates (unique constraint violations)
      }

      totalAdded += added;

      // Update last_run_at
      await supabase
        .from('feed_queries')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', query.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Query "${query.query_text}": ${msg}`);
    }
  }

  let classified = 0;
  try {
    classified = await classifyPendingFeedItems(supabase);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Signal classification: ${msg}`);
  }

  return NextResponse.json(
    {
      added: totalAdded,
      queries: queries.length,
      skipped,
      classified,
      ...(errors.length > 0 ? { errors } : {}),
    },
    { status: 200 },
  );
}
