'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AppLogo from '@/components/AppLogo';
import { Input } from '@/components/ui/Input';
import { PrimaryBtn } from '@/components/ui/Button';
import { FilterSegment } from '@/components/ui/FilterSegment';

type Mode = 'signin' | 'signup' | 'forgot';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmSent, setConfirmSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setPassword('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) return setError('Please enter your email address.');

    setLoading(true);

    if (mode === 'forgot') {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
      });

      if (resetError) {
        setError('Something went wrong. Please try again.');
      } else {
        setResetSent(true);
      }
      setLoading(false);
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      setLoading(false);
      return;
    }

    if (mode === 'signin') {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError) {
        if (signInError.message.toLowerCase().includes('invalid login')) {
          setError('Incorrect email or password.');
        } else if (signInError.message.toLowerCase().includes('email not confirmed')) {
          setError('Please confirm your email address before signing in.');
        } else {
          setError('Something went wrong. Please try again.');
        }
        setLoading(false);
        return;
      }

      router.push('/');
      router.refresh();

    } else {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        setLoading(false);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes('already registered')) {
          setError('An account with this email already exists. Try signing in.');
        } else {
          setError('Something went wrong. Please try again.');
        }
        setLoading(false);
        return;
      }

      if (data.session) {
        router.push('/');
        router.refresh();
      } else {
        setConfirmSent(true);
      }
    }

    setLoading(false);
  }

  // Post-signup: waiting for email confirmation
  if (confirmSent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-gradient-to-b from-sky-50 via-white to-white">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--zi-text)' }}>Check your email</h2>
          <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
            We sent a confirmation link to{' '}
            <span className="font-medium" style={{ color: 'var(--zi-text)' }}>{email}</span>.
            Tap it to activate your account and sign in.
          </p>
          <button
            onClick={() => { setConfirmSent(false); setEmail(''); setPassword(''); }}
            className="mt-6 text-sm font-medium"
            style={{ color: 'var(--zi-brand)' }}
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  // Post-reset-request: waiting for reset email
  if (resetSent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-gradient-to-b from-sky-50 via-white to-white">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">🔑</div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--zi-text)' }}>Check your email</h2>
          <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
            We sent a password reset link to{' '}
            <span className="font-medium" style={{ color: 'var(--zi-text)' }}>{email}</span>.
            Tap it to set a new password.
          </p>
          <button
            onClick={() => { setResetSent(false); switchMode('signin'); }}
            className="mt-6 text-sm font-medium"
            style={{ color: 'var(--zi-brand)' }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-gradient-to-b from-sky-50 via-white to-white">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="text-center mb-10">
          <h1 className="flex justify-center mb-2">
            <AppLogo size="lg" colorScheme="brand" />
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--zi-text-muted)' }}>Your personal packing list</p>
        </div>

        {mode === 'forgot' ? (
          <>
            <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--zi-text)' }}>Reset your password</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--zi-text-muted)' }}>
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoFocus
                autoComplete="email"
              />

              {error && <p className="text-xs" style={{ color: 'var(--zi-danger)' }}>{error}</p>}

              <PrimaryBtn type="submit" disabled={loading} full>
                {loading ? 'Sending…' : 'Send reset link'}
              </PrimaryBtn>
            </form>

            <button
              onClick={() => switchMode('signin')}
              className="mt-5 w-full text-sm text-center font-medium"
              style={{ color: 'var(--zi-brand)' }}
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            {/* Mode toggle */}
            <div className="mb-6">
              <FilterSegment
                options={[
                  { id: 'signin', label: 'Sign in' },
                  { id: 'signup', label: 'Create account' },
                ]}
                value={mode}
                onChange={(v) => switchMode(v as Mode)}
                full
              />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoFocus
                autoComplete="email"
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder={mode === 'signup' ? 'At least 6 characters' : ''}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />

              {error && <p className="text-xs" style={{ color: 'var(--zi-danger)' }}>{error}</p>}

              <PrimaryBtn type="submit" disabled={loading} full>
                {loading
                  ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
                  : mode === 'signin' ? 'Sign in' : 'Create account'
                }
              </PrimaryBtn>

              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-sm text-center font-medium"
                  style={{ color: 'var(--zi-brand)' }}
                >
                  Forgot password?
                </button>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
