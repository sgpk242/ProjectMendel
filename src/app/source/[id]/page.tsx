import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';
import { DeleteSourceButton } from '@/components/source/delete-button';
import { PageShell } from '@/components/ui/page-shell';
import { SOURCE_TYPE_LABELS } from '@/lib/constants';

export default async function SourcePage({ params }: PageProps<'/source/[id]'>) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS hides rows the signed-in user doesn't own, so a missing row here
  // means either a bad id or someone else's source — both render the same
  // not-found state.
  const { data: source } = await supabase
    .from('sources')
    .select(
      'id, title, url, summary, source_type, ingest_status, ingest_error, word_count, reading_time_minutes, captured_at',
    )
    .eq('id', id)
    .maybeSingle();

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

  return (
    <PageShell email={user?.email}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{source.title || 'Untitled'}</h1>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block break-all text-sm text-accent hover:underline"
          >
            {source.url}
          </a>
        </div>
        <DeleteSourceButton sourceId={source.id} title={source.title} redirectTo="/dashboard">
          Delete
        </DeleteSourceButton>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="rounded-full border border-border px-2 py-0.5">
          {SOURCE_TYPE_LABELS[source.source_type]}
        </span>
        {source.word_count ? <span>{source.word_count.toLocaleString()} words</span> : null}
        {source.reading_time_minutes ? <span>{source.reading_time_minutes} min read</span> : null}
        <span>Captured {new Date(source.captured_at).toLocaleDateString()}</span>
      </div>

      {source.ingest_status === 'failed' ? (
        <div className="mt-6 rounded-md border border-red-700/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <p className="font-medium">Ingest failed</p>
          {source.ingest_error ? <p className="mt-1 text-red-300/80">{source.ingest_error}</p> : null}
        </div>
      ) : source.ingest_status !== 'complete' ? (
        <div className="mt-6 rounded-md border border-yellow-700/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300">
          Still processing ({source.ingest_status})…
        </div>
      ) : null}

      {source.summary ? (
        <p className="mt-6 text-sm leading-relaxed text-foreground">{source.summary}</p>
      ) : null}

      <div className="mt-12 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
        <p className="text-muted">Full text and chunk browsing will appear here.</p>
      </div>
    </PageShell>
  );
}
