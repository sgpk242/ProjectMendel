import { PageShell } from '@/components/ui/page-shell';
import { FeedView } from '@/components/feed/feed-view';
import { createClient } from '@/lib/supabase/server';

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: queries }, { data: items }, { count: newCount }] = await Promise.all([
    supabase
      .from('feed_queries')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('feed_items')
      .select('*')
      .order('fetched_at', { ascending: false })
      .limit(50),
    supabase
      .from('feed_items')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new'),
  ]);

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Papers Feed</h1>

      <div className="mt-6">
        <FeedView
          queries={queries ?? []}
          items={items ?? []}
          newCount={newCount ?? 0}
        />
      </div>
    </PageShell>
  );
}
