import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/ui/page-shell';
import { CaptureForm } from '@/components/capture/capture-form';

/**
 * Landing page for the PWA share target (see `share_target` in
 * `src/app/manifest.ts`). Android hands shared links here as `url`/`title`/
 * `text` query params — `text` is where some apps put the URL instead of
 * `url`, so the form falls back to extracting one from it.
 */
export default async function CapturePage({ searchParams }: PageProps<'/capture'>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;
  const initialUrl = firstParam(params.url) || extractUrl(firstParam(params.text)) || '';

  return (
    <PageShell email={user?.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Capture</h1>
      <div className="mt-6">
        <CaptureForm initialUrl={initialUrl} />
      </div>
    </PageShell>
  );
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function extractUrl(text: string): string {
  const match = text.match(/https?:\/\/\S+/);
  return match ? match[0] : '';
}
