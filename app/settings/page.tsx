'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { LaundryStyle, TemperatureUnit, UserPreferences } from '@/types';
import LuggageSpinner from '@/components/LuggageSpinner';
import { PageHeader, HeaderIconBtn } from '@/components/ui/PageHeader';
import { Textarea } from '@/components/ui/Input';
import { FilterSegment } from '@/components/ui/FilterSegment';
import { PrimaryBtn, DangerBtn } from '@/components/ui/Button';

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
    return <LuggageSpinner />;
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        leading={
          <HeaderIconBtn onClick={() => router.back()} aria-label="Back">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </HeaderIconBtn>
        }
        title="Settings"
      />

      <div className="flex flex-col gap-6 px-4 py-6">

        {/* Temperature Unit */}
        <section>
          <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--zi-text)' }}>Temperature unit</p>
          <p className="text-xs mb-3" style={{ color: 'var(--zi-text-subtle)' }}>Used when displaying weather on trip pages.</p>
          <FilterSegment
            options={[
              { id: 'celsius', label: '°C — Celsius' },
              { id: 'fahrenheit', label: '°F — Fahrenheit' },
            ]}
            value={tempUnit}
            onChange={(v) => setTempUnit(v as TemperatureUnit)}
          />
        </section>

        {/* Laundry Packing Style */}
        <section>
          <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--zi-text)' }}>Laundry packing style</p>
          <p className="text-xs mb-3" style={{ color: 'var(--zi-text-subtle)' }}>
            When laundry is available on a trip, how aggressively should that affect your quantities?
          </p>
          <div className="flex flex-col gap-2">
            {LAUNDRY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setLaundryStyle(option.value)}
                className="flex items-center gap-3 px-4 py-3 text-left"
                style={{
                  borderRadius: 'var(--zi-r-lg)',
                  border: `1px solid ${laundryStyle === option.value ? 'var(--zi-brand)' : 'var(--zi-border-strong)'}`,
                  background: laundryStyle === option.value ? 'var(--zi-brand-tint)' : 'white',
                }}
              >
                <div className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                  style={{ borderColor: laundryStyle === option.value ? 'var(--zi-brand)' : 'var(--zi-border-strong)' }}>
                  {laundryStyle === option.value && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--zi-brand)' }} />}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>{option.label}</p>
                  <p className="text-xs" style={{ color: 'var(--zi-text-subtle)' }}>{option.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* About Me */}
        <section>
          <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--zi-text)' }}>About me</p>
          <p className="text-xs mb-3" style={{ color: 'var(--zi-text-subtle)' }}>
            Any context about you that improves your Smart Suggestions — travel style,
            preferences, things you always forget.
          </p>
          <Textarea
            value={aboutMe}
            onChange={setAboutMe}
            placeholder="e.g. I run hot, always overpack shoes, and usually travel for work with one leisure day added on…"
            rows={4}
          />
        </section>

        <PrimaryBtn onClick={handleSave} disabled={saving} full>
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save preferences'}
        </PrimaryBtn>

        <button
          onClick={() => router.push('/onboarding?redo=true')}
          className="w-full py-3 text-sm font-medium"
          style={{ color: 'var(--zi-brand)', border: '1px solid var(--zi-brand)', borderRadius: 'var(--zi-r-lg)' }}
        >
          Redo setup
        </button>

        <DangerBtn
          onClick={async () => {
            await supabase.auth.signOut();
            router.push('/login');
          }}
          full
        >
          Sign out
        </DangerBtn>
      </div>
    </div>
  );
}
