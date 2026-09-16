import { LoginForm } from '@/app/login-form';

/**
 * Landing / login. Signed-in visitors are redirected to /dashboard by proxy.ts
 * before this renders.
 */
export default async function Home({ searchParams }: PageProps<'/'>) {
  const { redirectTo } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <LoginForm redirectTo={typeof redirectTo === 'string' ? redirectTo : undefined} />
    </main>
  );
}
