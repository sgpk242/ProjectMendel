import { PageShell } from '@/components/ui/page-shell';
import { FeedView } from '@/components/feed/feed-view';
import { isListingPage } from '@/lib/feed/listing-page';
import { createClient } from '@/lib/supabase/server';

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: queries }, { data: items }, { data: newItems }] = await Promise.all([
    supabase
      .from('feed_queries')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('feed_items')
      .select('*')
      .order('fetched_at', { ascending: false })
      .limit(50),
    supabase.from('feed_items').select('url, title').eq('status', 'new'),
  ]);

  // Search now drops listing pages; this hides any stored before it did.
  const articles = (items ?? []).filter((i) => !isListingPage(i.url, i.title));
  const newCount = (newItems ?? []).filter((i) => !isListingPage(i.url, i.title)).length;

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Sources Feed</h1>

      <div className="mt-6">
        <FeedView queries={queries ?? []} items={articles} newCount={newCount} />
      </div>
    </PageShell>
  );
}
