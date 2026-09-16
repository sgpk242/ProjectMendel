import type { ReactNode } from 'react';

import { Nav } from '@/components/ui/nav';

/**
 * Standard frame for signed-in pages: nav bar plus a centered content column.
 *
 * `backdrop` is an optional full-bleed decorative layer (e.g. the dashboard's
 * fermentor background) rendered behind the nav+main content, sized to the
 * full scrollable height of the page rather than the viewport — it scrolls
 * with the content instead of staying pinned. Most pages don't pass one.
 */
export function PageShell({
  email,
  backdrop,
  children,
}: {
  email?: string;
  backdrop?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-1 flex-col">
      {backdrop ? (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          {backdrop}
        </div>
      ) : null}
      <Nav email={email} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-16">
        {children}
      </main>
    </div>
  );
}
