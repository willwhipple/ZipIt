'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-white">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
          <p className="text-sm text-gray-500">
            We sent a confirmation link to{' '}
            <span className="font-medium text-gray-800">{email}</span>.
            Tap it to activate your account and sign in.
          </p>
          <button
            onClick={() => { setConfirmSent(false); setEmail(''); setPassword(''); }}
            className="mt-6 text-sm text-blue-500 font-medium"
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
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-white">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">🔑</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
          <p className="text-sm text-gray-500">
            We sent a password reset link to{' '}
            <span className="font-medium text-gray-800">{email}</span>.
            Tap it to set a new password.
          </p>
          <button
            onClick={() => { setResetSent(false); switchMode('signin'); }}
            className="mt-6 text-sm text-blue-500 font-medium"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-white">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Zip It</h1>
          <p className="text-sm text-gray-500 mt-1">Your personal packing list</p>
        </div>

        {mode === 'forgot' ? (
          <>
            <h2 className="text-base font-semibold text-gray-800 mb-1">Reset your password</h2>
            <p className="text-sm text-gray-500 mb-6">
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  autoComplete="email"
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-500 text-white font-semibold py-3 rounded-xl disabled:opacity-50 transition-colors"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <button
              onClick={() => switchMode('signin')}
              className="mt-5 w-full text-sm text-center text-blue-500 font-medium"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            {/* Mode toggle */}
            <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-6">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  mode === 'signin' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  mode === 'signup' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600'
                }`}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  autoComplete="email"
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : ''}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-500 text-white font-semibold py-3 rounded-xl disabled:opacity-50 transition-colors"
              >
                {loading
                  ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
                  : mode === 'signin' ? 'Sign in' : 'Create account'
                }
              </button>

              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-sm text-center text-blue-500 font-medium"
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
