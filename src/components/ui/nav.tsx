import Link from 'next/link';

import { signOut } from '@/app/auth/actions';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/chat', label: 'Chat' },
] as const;

/** Top-level navigation for the authenticated area. */
export function Nav({ email }: { email?: string }) {
  return (
    <header className="border-b border-border bg-surface">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          Mendel 🦠
        </Link>

        <div className="flex items-center gap-6 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}

          {email ? (
            <form action={signOut}>
              <button
                type="submit"
                className="text-muted transition-colors hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
