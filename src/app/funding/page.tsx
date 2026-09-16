import { PageShell } from '@/components/ui/page-shell';
import { FundingTable } from '@/components/funding/funding-table';
import { createClient } from '@/lib/supabase/server';

export default async function FundingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: opportunities } = await supabase
    .from('funding_opportunities')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false });

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Funding Opportunities</h1>

      <div className="mt-6">
        <FundingTable opportunities={opportunities ?? []} />
      </div>
    </PageShell>
  );
}
