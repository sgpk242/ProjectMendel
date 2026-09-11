'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export type AuthState = { error: string } | null;

/** Only allow relative paths, so redirectTo cannot bounce to another origin. */
function safeRedirect(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : '';
  return path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard';
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = safeRedirect(formData.get('redirectTo'));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  redirect(next);
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: error.message };

  // With email confirmations enabled (the Supabase default), signUp returns a
  // user but no session — the account is unusable until the link is clicked.
  // Say so rather than redirecting to a dashboard that will bounce right back.
  if (data.user && !data.session) {
    return { error: 'Check your email to confirm your account, then sign in.' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  redirect('/');
}
