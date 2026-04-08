'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const trimmed = email.trim();
    if (!trimmed) return setError('Please enter your email address.');

    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (otpError) {
      setError('Something went wrong. Please try again.');
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-white">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Zip It</h1>
          <p className="text-sm text-gray-500 mt-1">Your personal packing list</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📬</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
            <p className="text-sm text-gray-500">
              We sent a login link to <span className="font-medium text-gray-800">{email}</span>.
              Tap it to sign in.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="mt-6 text-sm text-blue-500 font-medium"
            >
              Use a different email
            </button>
          </div>
        ) : (
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

            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 text-white font-semibold py-3 rounded-xl disabled:opacity-50 transition-colors"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>

            <p className="text-xs text-center text-gray-400">
              We&apos;ll email you a one-tap sign-in link. No password needed.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
