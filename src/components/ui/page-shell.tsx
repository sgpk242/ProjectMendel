import type { ReactNode } from 'react';

import { Nav } from '@/components/ui/nav';

/**
 * Standard frame for signed-in pages: nav bar plus a centered content column.
 */
export function PageShell({
  email,
  children,
}: {
  email?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Nav email={email} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-16">
        {children}
      </main>
    </>
  );
}
