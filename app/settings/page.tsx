'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { LaundryStyle, TemperatureUnit, UserPreferences } from '@/types';

const LAUNDRY_OPTIONS: { value: LaundryStyle; label: string; description: string }[] = [
  { value: 'frequent', label: 'Frequent', description: 'I wash clothes often — pack lean' },
  { value: 'moderate', label: 'Moderate', description: 'Typical laundry tolerance' },
  { value: 'infrequent', label: 'Infrequent', description: 'I prefer a bigger buffer' },
];

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Local form state
  const [tempUnit, setTempUnit] = useState<TemperatureUnit>('celsius');
  const [laundryStyle, setLaundryStyle] = useState<LaundryStyle>('moderate');
  const [aboutMe, setAboutMe] = useState('');

  useEffect(() => {
    async function fetchPrefs() {
      const { data } = await supabase
        .from('user_preferences')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (data) {
        setPrefs(data as UserPreferences);
        setTempUnit(data.temperature_unit as TemperatureUnit);
        setLaundryStyle(data.laundry_style as LaundryStyle);
        setAboutMe(data.about_me ?? '');
      }
      setLoading(false);
    }

    fetchPrefs();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    const updates = {
      temperature_unit: tempUnit,
      laundry_style: laundryStyle,
      about_me: aboutMe.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (prefs?.id) {
      await supabase.from('user_preferences').update(updates).eq('id', prefs.id);
    } else {
      // Shouldn't happen after seeding, but handle gracefully
      await supabase.from('user_preferences').insert(updates);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4 border-b border-gray-100">
        <button onClick={() => router.back()} className="text-blue-500 text-sm font-medium">
          ← Back
        </button>
        <h1 className="text-xl font-bold text-gray-900 flex-1">Settings</h1>
      </div>

      <div className="flex flex-col gap-6 px-4 py-6">

        {/* Temperature Unit */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Temperature Unit</h2>
          <p className="text-xs text-gray-400 mb-3">Used when displaying weather on trip pages.</p>
          <div className="flex rounded-xl overflow-hidden border border-gray-200">
            {(['celsius', 'fahrenheit'] as TemperatureUnit[]).map((unit) => (
              <button
                key={unit}
                onClick={() => setTempUnit(unit)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  tempUnit === unit
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-600'
                }`}
              >
                {unit === 'celsius' ? '°C — Celsius' : '°F — Fahrenheit'}
              </button>
            ))}
          </div>
        </section>

        {/* Laundry Packing Style */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Laundry Packing Style</h2>
          <p className="text-xs text-gray-400 mb-3">
            When laundry is available on a trip, how aggressively should that affect your quantities?
          </p>
          <div className="flex flex-col gap-2">
            {LAUNDRY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setLaundryStyle(option.value)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                  laundryStyle === option.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    laundryStyle === option.value ? 'border-blue-500' : 'border-gray-300'
                  }`}
                >
                  {laundryStyle === option.value && (
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${laundryStyle === option.value ? 'text-blue-700' : 'text-gray-800'}`}>
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-400">{option.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* About Me */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">About Me</h2>
          <p className="text-xs text-gray-400 mb-3">
            Any context about you that helps the AI make better packing suggestions — travel style,
            preferences, things you always forget.
          </p>
          <textarea
            value={aboutMe}
            onChange={(e) => setAboutMe(e.target.value)}
            placeholder="e.g. I run hot, always overpack shoes, and usually travel for work with one leisure day added on…"
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-500 text-white font-semibold py-3 rounded-xl disabled:opacity-50 transition-colors"
        >
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Preferences'}
        </button>

        {/* Sign out */}
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push('/login');
          }}
          className="w-full text-sm text-red-400 font-medium py-2 text-center"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
