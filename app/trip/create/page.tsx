'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { generatePackingList } from '@/lib/generation';
import type { Activity, ParsedTripDescription } from '@/types';
import LuggageSpinner from '@/components/LuggageSpinner';
import { PageHeader, HeaderIconBtn } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Chip } from '@/components/ui/Chip';
import { Toggle } from '@/components/ui/Toggle';
import { PrimaryBtn } from '@/components/ui/Button';

// Adds `days` to a YYYY-MM-DD string, returns YYYY-MM-DD.
// Uses T00:00:00 suffix to avoid UTC-vs-local timezone offset shifting the date.
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function CreateTripPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [nights, setNights] = useState('');
  const [endDateMode, setEndDateMode] = useState<'nights' | 'manual'>('nights');
  const [carryOnOnly, setCarryOnOnly] = useState(false);
  const [laundryAvailable, setLaundryAvailable] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Natural language trip description
  const [nlDescription, setNlDescription] = useState('');
  const [nlParsing, setNlParsing] = useState(false);
  const [nlError, setNlError] = useState('');
  const [nlDone, setNlDone] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      const { data } = await supabase.from('activities').select('*').order('name');
      if (data) setActivities(data as Activity[]);
    }
    init();
  }, []);

  async function handleNLParse() {
    if (!nlDescription.trim()) return;
    setNlParsing(true);
    setNlError('');

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse_trip_description', description: nlDescription }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setNlError("Couldn't parse your description. Fill in the form below manually.");
        return;
      }

      const parsed: ParsedTripDescription = data.parsed ?? {};

      if (parsed.name) setName(parsed.name);
      if (parsed.destination) setDestination(parsed.destination);
      if (parsed.startDate) setStartDate(parsed.startDate);
      // Derive nights from AI-returned dates so the form stays in nights mode
      if (parsed.startDate && parsed.endDate) {
        const n = Math.round(
          (new Date(parsed.endDate + 'T00:00:00').getTime() -
           new Date(parsed.startDate + 'T00:00:00').getTime()) /
          (1000 * 60 * 60 * 24)
        );
        if (n >= 0) setNights(String(n));
      } else if (parsed.endDate) {
        // End date only (no start date) — fall back to manual mode
        setEndDate(parsed.endDate);
        setEndDateMode('manual');
      }
      if (typeof parsed.carryOnOnly === 'boolean') setCarryOnOnly(parsed.carryOnOnly);
      if (typeof parsed.laundryAvailable === 'boolean') setLaundryAvailable(parsed.laundryAvailable);

      // Match parsed activity names against loaded activities (case-insensitive)
      if (parsed.activities?.length) {
        const matched = activities
          .filter((a) =>
            parsed.activities!.some(
              (name) => name.toLowerCase() === a.name.toLowerCase()
            )
          )
          .map((a) => a.id);
        if (matched.length > 0) setSelectedActivityIds(matched);
      }

      if (Object.keys(parsed).length === 0) {
        setNlError("Couldn't extract any details. Fill in the form below manually.");
      } else {
        setNlDone(true);
      }
    } catch {
      setNlError("Couldn't parse your description. Fill in the form below manually.");
    } finally {
      setNlParsing(false);
    }
  }

  function toggleActivity(id: string) {
    setSelectedActivityIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    setError('');
    if (!name.trim()) return setError('Please enter a trip name.');
    if (!startDate) return setError('Please enter a start date.');

    let finalEndDate: string;
    if (endDateMode === 'nights') {
      const n = parseInt(nights);
      if (!nights || isNaN(n) || n < 1) return setError('Please enter a valid number of nights (minimum 1).');
      finalEndDate = addDays(startDate, n);
    } else {
      if (!endDate) return setError('Please enter an end date.');
      if (endDate <= startDate) return setError('End date must be after start date.');
      finalEndDate = endDate;
    }

    setLoading(true);

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({
        name: name.trim(),
        destination: destination.trim() || null,
        start_date: startDate,
        end_date: finalEndDate,
        carry_on_only: carryOnOnly,
        laundry_available: laundryAvailable,
        user_id: userId,
      })
      .select()
      .single();

    if (tripError || !trip) {
      setError('Failed to create trip. Please try again.');
      setLoading(false);
      return;
    }

    if (selectedActivityIds.length > 0) {
      await supabase.from('trip_activities').insert(
        selectedActivityIds.map((activity_id) => ({
          trip_id: trip.id,
          activity_id,
        }))
      );
    }

    await generatePackingList(supabase, trip.id);

    router.replace(`/trip/${trip.id}`);
  }

  // Derived end date for nights mode — recomputed on every render
  const computedEndDate =
    startDate && nights && !isNaN(parseInt(nights))
      ? addDays(startDate, parseInt(nights))
      : '';

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
        title="New trip"
      />

      <div className="flex flex-col gap-5 px-4 py-5">
        {/* AI — natural language description */}
        <div className="rounded-[var(--zi-r-xl)] p-4 zi-grad-smart-quiet" style={{ border: '1px solid rgba(45,212,191,.25)' }}>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--zi-smart-deep)' }}>
            <span style={{ color: 'var(--zi-smart)' }}>✦</span> Describe your trip
          </p>
          {nlDone ? (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium" style={{ color: 'var(--zi-success)' }}>✓ Form filled from your description</p>
              <button
                onClick={() => { setNlDone(false); setNlError(''); }}
                className="text-xs font-medium ml-3"
                style={{ color: 'var(--zi-smart-deep)' }}
              >
                Edit
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={nlDescription}
                onChange={(e) => setNlDescription(e.target.value)}
                placeholder={`e.g. "A long weekend in Paris for a friend's wedding, staying at a hotel, flying carry-on only"`}
                rows={3}
                className="w-full px-3 py-2.5 text-sm resize-none outline-none"
                style={{
                  background: 'white',
                  border: '1px solid rgba(45,212,191,.4)',
                  borderRadius: 'var(--zi-r-lg)',
                }}
              />
              {nlError && <p className="text-xs mt-1" style={{ color: 'var(--zi-danger)' }}>{nlError}</p>}
              <button
                onClick={handleNLParse}
                disabled={nlParsing || !nlDescription.trim()}
                className="mt-2 w-full text-white text-sm font-semibold py-2.5 disabled:opacity-50"
                style={{
                  background: 'var(--zi-smart-lo)',
                  borderRadius: 'var(--zi-r-lg)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {nlParsing ? 'Filling form…' : 'Fill form from description'}
              </button>
            </>
          )}
        </div>

        <Input label="Trip name" value={name} onChange={setName} placeholder="e.g. Mexico City weekend" />

        <div>
          <Input label="Destination" value={destination} onChange={setDestination} placeholder="e.g. Mexico City, Mexico" />
          <p className="text-xs mt-1" style={{ color: 'var(--zi-text-subtle)' }}>
            Include city and country for weather (e.g. Dublin, Ireland)
          </p>
        </div>

        {/* Dates */}
        <div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input label="Start date" type="date" value={startDate} onChange={setStartDate} />
            </div>
            {endDateMode === 'nights' ? (
              <div className="flex-1">
                <Input label="Nights" type="number" value={nights} onChange={setNights} placeholder="e.g. 4" />
              </div>
            ) : (
              <div className="flex-1">
                <Input label="End date" type="date" value={endDate} onChange={setEndDate} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            {endDateMode === 'nights' && computedEndDate && (
              <p className="text-xs" style={{ color: 'var(--zi-text-subtle)' }}>Returns: {computedEndDate}</p>
            )}
            <button
              type="button"
              onClick={() => setEndDateMode(endDateMode === 'nights' ? 'manual' : 'nights')}
              className="text-xs font-medium ml-auto"
              style={{ color: 'var(--zi-brand)' }}
            >
              {endDateMode === 'nights' ? 'Enter end date manually' : 'Use number of nights instead'}
            </button>
          </div>
        </div>

        <div>
          <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Activities</p>
          <div className="flex flex-wrap gap-2">
            {activities.map((a) => (
              <Chip key={a.id} selected={selectedActivityIds.includes(a.id)} onClick={() => toggleActivity(a.id)}>
                {a.name}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--zi-border)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>Carry-on only</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>No checked luggage</p>
            </div>
            <Toggle on={carryOnOnly} onChange={setCarryOnOnly} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>Laundry available</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>Pack fewer clothes</p>
            </div>
            <Toggle on={laundryAvailable} onChange={setLaundryAvailable} />
          </div>
        </div>

        {error && (
          <p className="text-sm px-3 py-2 rounded-[var(--zi-r-lg)]" style={{ background: 'var(--zi-danger-tint)', color: 'var(--zi-danger)', border: '1px solid rgba(239,68,68,.2)' }}>
            {error}
          </p>
        )}

        <PrimaryBtn onClick={handleSubmit} disabled={loading} full className="mt-2 py-4">
          Generate packing list
        </PrimaryBtn>
      </div>
    </div>
  );
}
