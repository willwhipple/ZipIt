'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { generatePackingList } from '@/lib/generation';
import type { Activity, AccommodationType, ParsedTripDescription } from '@/types';

// Adds `days` to a YYYY-MM-DD string, returns YYYY-MM-DD.
// Uses T00:00:00 suffix to avoid UTC-vs-local timezone offset shifting the date.
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const ACCOMMODATION_TYPES: AccommodationType[] = [
  'Hotel',
  'Airbnb',
  'Camping',
  'Staying with someone',
  'Other',
];

export default function CreateTripPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [nights, setNights] = useState('');
  const [endDateMode, setEndDateMode] = useState<'nights' | 'manual'>('nights');
  const [accommodation, setAccommodation] = useState<AccommodationType>('Hotel');
  const [carryOnOnly, setCarryOnOnly] = useState(false);
  const [laundryAvailable, setLaundryAvailable] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Natural language trip description
  const [nlDescription, setNlDescription] = useState('');
  const [nlParsing, setNlParsing] = useState(false);
  const [nlError, setNlError] = useState('');
  const [nlDone, setNlDone] = useState(false);

  useEffect(() => {
    supabase
      .from('activities')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) setActivities(data as Activity[]);
      });
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
      if (parsed.accommodationType) setAccommodation(parsed.accommodationType);
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
        accommodation_type: accommodation,
        carry_on_only: carryOnOnly,
        laundry_available: laundryAvailable,
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

    await generatePackingList(trip.id);

    router.replace(`/trip/${trip.id}`);
  }

  // Derived end date for nights mode — recomputed on every render
  const computedEndDate =
    startDate && nights && !isNaN(parseInt(nights))
      ? addDays(startDate, parseInt(nights))
      : '';

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4 border-b border-gray-100">
        <button onClick={() => router.back()} className="text-blue-500 text-sm font-medium">
          ← Back
        </button>
        <h1 className="text-lg font-semibold flex-1">New Trip</h1>
      </div>

      <div className="flex flex-col gap-5 px-4 py-5">
        {/* Natural language description */}
        <div className="bg-blue-50 rounded-2xl p-4">
          <p className="text-sm font-medium text-blue-800 mb-2">✦ Describe your trip</p>
          {nlDone ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-green-700 font-medium">✓ Form filled from your description</p>
              <button
                onClick={() => { setNlDone(false); setNlError(''); }}
                className="text-xs text-blue-500 font-medium ml-3"
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
                className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {nlError && <p className="text-xs text-red-500 mt-1">{nlError}</p>}
              <button
                onClick={handleNLParse}
                disabled={nlParsing || !nlDescription.trim()}
                className="mt-2 w-full bg-blue-500 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
              >
                {nlParsing ? 'Filling form…' : 'Fill form from description'}
              </button>
            </>
          )}
        </div>

        {/* Trip Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Trip Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mexico City Weekend"
            className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Destination */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Mexico City, Mexico"
            className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            For best results, include city and country (e.g. Dublin, Ireland)
          </p>
        </div>

        {/* Dates */}
        <div>
          <div className="flex gap-3">
            {/* Start date — always shown */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {endDateMode === 'nights' ? (
              /* Nights input */
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nights</label>
                <input
                  type="number"
                  min="1"
                  value={nights}
                  onChange={(e) => setNights(e.target.value)}
                  placeholder="e.g. 4"
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              /* Manual end date — min set to day after start date */
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate ? addDays(startDate, 1) : ''}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* Computed return date + mode toggle */}
          <div className="flex items-center justify-between mt-2">
            {endDateMode === 'nights' && computedEndDate && (
              <p className="text-xs text-gray-400">Returns: {computedEndDate}</p>
            )}
            <button
              type="button"
              onClick={() => setEndDateMode(endDateMode === 'nights' ? 'manual' : 'nights')}
              className="text-xs text-blue-500 font-medium ml-auto"
            >
              {endDateMode === 'nights' ? 'Enter end date manually' : 'Use number of nights instead'}
            </button>
          </div>
        </div>

        {/* Activities */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Activities</label>
          <div className="flex flex-wrap gap-2">
            {activities.map((a) => {
              const selected = selectedActivityIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggleActivity(a.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    selected
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-600 border-gray-300'
                  }`}
                >
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Accommodation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Accommodation</label>
          <div className="flex flex-col gap-2">
            {ACCOMMODATION_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setAccommodation(type)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left ${
                  accommodation === type
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700'
                }`}
              >
                {accommodation === type && <span className="text-blue-500">✓</span>}
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-800">Carry-on Only</p>
              <p className="text-xs text-gray-400">No checked luggage</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={carryOnOnly}
                onChange={(e) => setCarryOnOnly(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
            </label>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-gray-800">Laundry Available</p>
              <p className="text-xs text-gray-400">Pack fewer clothes</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={laundryAvailable}
                onChange={(e) => setLaundryAvailable(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
            </label>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-500 text-white font-semibold py-4 rounded-xl mt-2 disabled:opacity-50"
        >
          {loading ? 'Generating Packing List…' : 'Generate Packing List'}
        </button>
      </div>
    </div>
  );
}
