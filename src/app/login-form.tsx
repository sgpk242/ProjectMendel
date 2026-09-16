'use client';

import { useActionState, useState } from 'react';

import { signIn, signUp, type AuthState } from '@/app/auth/actions';

type Mode = 'signin' | 'signup';

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [mode, setMode] = useState<Mode>('signin');
  const action = mode === 'signin' ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, null);

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-center text-3xl font-semibold tracking-tight">Mendel</h1>
      <p className="mt-2 text-center text-sm text-muted">
        Personal research intelligence.
      </p>

      <form action={formAction} className="mt-10 flex flex-col gap-4">
        {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted">Password</span>
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
          />
        </label>

        {state?.error ? (
          <p role="alert" className="text-sm text-red-400">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-md bg-accent px-3 py-2 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="text-accent hover:underline"
        >
          {mode === 'signin' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  );
}
