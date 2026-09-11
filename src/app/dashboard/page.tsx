import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/ui/page-shell';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="mt-12 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
        <p className="text-muted">No sources yet.</p>
        <p className="mt-1 text-muted">Capture your first URL to get started.</p>
      </div>
    </PageShell>
  );
}
