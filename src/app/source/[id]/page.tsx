import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/ui/page-shell';

export default async function SourcePage({ params }: PageProps<'/source/[id]'>) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Source Detail</h1>
      <p className="mt-2 font-mono text-sm text-muted">{id}</p>

      <div className="mt-12 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
        <p className="text-muted">Source content will appear here.</p>
      </div>
    </PageShell>
  );
}
