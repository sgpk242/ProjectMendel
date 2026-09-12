import Link from 'next/link';

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Funding Opportunities</h1>
        <Link href="/dashboard" className="text-sm text-muted hover:text-foreground">
          ← Dashboard
        </Link>
      </div>

      <div className="mt-6">
        <FundingTable opportunities={opportunities ?? []} />
      </div>
    </PageShell>
  );
}
