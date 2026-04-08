'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Trip, PackingListEntry, Item, CategoryType, AiSuggestion, TemperatureUnit } from '@/types';

type EntryWithItem = PackingListEntry & { items: Item };

type WeatherSummary = {
  label: string;   // resolved location name, e.g. "Dublin, Leinster, IE"
  emoji: string;
  low: number;     // °C
  high: number;    // °C
  isClimatology: boolean;
};

// Converts a °C value to °F (rounded to nearest integer).
function cToF(celsius: number): number {
  return Math.round(celsius * 9 / 5 + 32);
}

// Maps WMO weather interpretation codes to a representative emoji.
function weatherEmoji(code: number): string {
  if (code <= 1) return '☀️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '❄️';
  return '⛈️';
}

async function fetchWeather(trip: Trip): Promise<WeatherSummary | null> {
  if (!trip.destination) return null;

  // Step 1: Geocode the destination.
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trip.destination)}&count=1&language=en&format=json`
  );
  if (!geoRes.ok) return null;
  const geoData = await geoRes.json();
  if (!geoData.results?.length) return null;

  const { latitude, longitude, name, admin1, country_code } = geoData.results[0];
  const locationLabel = [name, admin1, country_code].filter(Boolean).join(', ');

  // Step 2: Decide forecast vs. climatology based on days until trip start.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tripStart = new Date(trip.start_date + 'T00:00:00');
  const daysUntil = Math.ceil((tripStart.getTime() - today.getTime()) / 86_400_000);
  const useForecast = daysUntil <= 16;

  let weatherData: { daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; weathercode: number[] } };

  if (useForecast) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&start_date=${trip.start_date}&end_date=${trip.end_date}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    weatherData = await res.json();
  } else {
    // Use climate API with the trip's actual month/dates.
    const url = `https://climate-api.open-meteo.com/v1/climate?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&models=EC_Earth3P_HR&start_date=${trip.start_date}&end_date=${trip.end_date}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    weatherData = await res.json();
  }

  const maxTemps = weatherData?.daily?.temperature_2m_max;
  const minTemps = weatherData?.daily?.temperature_2m_min;
  const codes = weatherData?.daily?.weathercode;
  if (!maxTemps?.length || !minTemps?.length) return null;

  const high = Math.round(Math.max(...maxTemps));
  const low = Math.round(Math.min(...minTemps));

  // Pick the most frequent weather code as representative.
  const codeFreq: Record<number, number> = {};
  for (const c of codes ?? []) codeFreq[c] = (codeFreq[c] ?? 0) + 1;
  const dominantCode = Number(Object.entries(codeFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);

  return { label: locationLabel, emoji: weatherEmoji(dominantCode), low, high, isClimatology: !useForecast };
}

const CATEGORY_ORDER: CategoryType[] = [
  'Clothing',
  'Shoes',
  'Toiletries',
  'Accessories',
  'Equipment',
];

export default function PackingListPage() {
  const router = useRouter();
  const { id: tripId } = useParams<{ id: string }>();
  const supabase = createClient();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [entries, setEntries] = useState<EntryWithItem[]>([]);
  const [loading, setLoading] = useState(true);

  // A trip is read-only if it's been archived or its end date has passed.
  const today = new Date().toISOString().split('T')[0];
  const readOnly = trip ? (trip.archived || trip.end_date < today) : false;

  // Ad-hoc item modal
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [adHocName, setAdHocName] = useState('');
  const [adHocSaving, setAdHocSaving] = useState(false);
  const [adHocEntry, setAdHocEntry] = useState<EntryWithItem | null>(null);

  // Archive confirm
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Show archive prompt when 100% packed
  const [archivePrompted, setArchivePrompted] = useState(false);

  // Weather
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [tempUnit, setTempUnit] = useState<TemperatureUnit>('celsius');

  // AI suggestions
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [tripId]);

  async function fetchData() {
    setLoading(true);

    const [tripRes, entriesRes, prefsRes] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).single(),
      supabase
        .from('packing_list_entries')
        .select('*, items(*)')
        .eq('trip_id', tripId)
        .order('items(name)'),
      supabase.from('user_preferences').select('temperature_unit').limit(1).maybeSingle(),
    ]);

    if (tripRes.data) setTrip(tripRes.data as Trip);
    if (entriesRes.data) setEntries(entriesRes.data as EntryWithItem[]);
    if (prefsRes.data?.temperature_unit) setTempUnit(prefsRes.data.temperature_unit as TemperatureUnit);
    setLoading(false);

    // Fetch weather after trip data is available, if a destination was set.
    if (tripRes.data?.destination) {
      setWeatherLoading(true);
      fetchWeather(tripRes.data as Trip).then((result) => {
        setWeather(result);
        setWeatherLoading(false);
      });
    }
  }

  async function togglePacked(entry: EntryWithItem) {
    const newPacked = !entry.packed;
    // Optimistic update
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, packed: newPacked } : e))
    );

    const { error } = await supabase
      .from('packing_list_entries')
      .update({ packed: newPacked })
      .eq('id', entry.id);

    if (error) {
      // Revert on failure
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, packed: entry.packed } : e))
      );
      return;
    }

    // Check if 100% packed
    const updatedEntries = entries.map((e) =>
      e.id === entry.id ? { ...e, packed: newPacked } : e
    );
    const allPacked = updatedEntries.length > 0 && updatedEntries.every((e) => e.packed);
    if (allPacked && !archivePrompted) {
      setArchivePrompted(true);
      setShowArchiveConfirm(true);
    }
  }

  async function archiveTrip() {
    await supabase.from('trips').update({ archived: true }).eq('id', tripId);
    router.replace('/');
  }

  async function addAdHocItem() {
    if (!adHocName.trim()) return;
    setAdHocSaving(true);

    // Create item in inventory
    const { data: newItem, error: itemError } = await supabase
      .from('items')
      .insert({ name: adHocName.trim(), category: 'Accessories', quantity_type: 'fixed' })
      .select()
      .single();

    if (itemError || !newItem) {
      setAdHocSaving(false);
      return;
    }

    // Add to packing list
    const { data: newEntry, error: entryError } = await supabase
      .from('packing_list_entries')
      .insert({
        trip_id: tripId,
        item_id: newItem.id,
        quantity: 1,
        packed: false,
        is_adhoc: true,
        added_to_inventory: null,
      })
      .select('*, items(*)')
      .single();

    if (entryError || !newEntry) {
      setAdHocSaving(false);
      return;
    }

    setEntries((prev) => [...prev, newEntry as EntryWithItem]);
    setAdHocName('');
    setShowAdHoc(false);
    setAdHocSaving(false);
    setAdHocEntry(newEntry as EntryWithItem);
  }

  async function handleAdHocInventoryResponse(response: 'yes' | 'later' | 'no') {
    if (!adHocEntry) return;

    if (response === 'yes') {
      await supabase
        .from('packing_list_entries')
        .update({ added_to_inventory: true })
        .eq('id', adHocEntry.id);
      router.push(`/inventory/item/${adHocEntry.items.id}`);
    } else if (response === 'no') {
      await supabase
        .from('packing_list_entries')
        .update({ added_to_inventory: false })
        .eq('id', adHocEntry.id);
    }
    // 'later' leaves added_to_inventory as null
    setAdHocEntry(null);
  }

  async function loadSuggestions() {
    setSuggestionsLoading(true);
    setSuggestionsError('');

    const existingItems = entries.map((e) => e.items.name);
    const weatherSummary = weather
      ? `${weather.isClimatology ? 'Typically' : ''} Low ${weather.low}°C / High ${weather.high}°C`.trim()
      : undefined;

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest_items', tripId, existingItems, weatherSummary }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSuggestionsError("Couldn't get suggestions right now. Try again later.");
      } else {
        setSuggestions(data.suggestions ?? []);
        if ((data.suggestions ?? []).length === 0) {
          setSuggestionsError("No additional suggestions — your list looks complete!");
        }
      }
    } catch {
      setSuggestionsError("Couldn't get suggestions right now. Try again later.");
    } finally {
      setSuggestionsLoading(false);
      setShowSuggestions(true); // open modal only once results (or error) are ready
    }
  }

  async function addSuggestion(suggestion: AiSuggestion) {
    setAddingSuggestion(suggestion.name);

    const { data: newItem, error: itemError } = await supabase
      .from('items')
      .insert({ name: suggestion.name, category: suggestion.category, quantity_type: 'fixed' })
      .select()
      .single();

    if (itemError || !newItem) {
      setAddingSuggestion(null);
      return;
    }

    const { data: newEntry, error: entryError } = await supabase
      .from('packing_list_entries')
      .insert({
        trip_id: tripId,
        item_id: newItem.id,
        quantity: 1,
        packed: false,
        is_adhoc: true,
        added_to_inventory: null,
      })
      .select('*, items(*)')
      .single();

    if (entryError || !newEntry) {
      setAddingSuggestion(null);
      return;
    }

    setEntries((prev) => [...prev, newEntry as EntryWithItem]);
    setSuggestions((prev) => prev.filter((s) => s.name !== suggestion.name));
    setAddingSuggestion(null);
    setAdHocEntry(newEntry as EntryWithItem);
  }

  function formatDate(dateStr: string) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  if (loading || !trip) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const total = entries.length;
  const packed = entries.filter((e) => e.packed).length;
  const progress = total > 0 ? Math.round((packed / total) * 100) : 0;

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    entries: entries.filter((e) => e.items.category === category),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.back()} className="text-blue-500 text-sm font-medium">
            ← Back
          </button>
          <div className="flex-1" />
          {readOnly ? (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
              Archived
            </span>
          ) : (
            <button
              onClick={() => setShowArchiveConfirm(true)}
              className="text-sm text-gray-400 font-medium"
            >
              Archive
            </button>
          )}
        </div>
        <h1 className="text-xl font-bold text-gray-900">{trip.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
        </p>

        {/* Progress */}
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {packed} / {total} packed
          </span>
        </div>

        {/* AI suggestions trigger — only shown for active trips */}
        {!readOnly && (
          <button
            onClick={loadSuggestions}
            disabled={suggestionsLoading}
            className="mt-2 text-xs text-blue-500 font-medium disabled:opacity-40"
          >
            ✦ Suggest missing items
          </button>
        )}
      </div>

      {/* Weather banner */}
      {weatherLoading && (
        <div className="px-4 py-2 border-b border-gray-100">
          <p className="text-xs text-gray-400">Loading weather…</p>
        </div>
      )}
      {weather && !weatherLoading && (
        <div className="px-4 py-2 border-b border-gray-100 bg-white">
          <p className="text-xs text-gray-500">
            {weather.label} · {formatDate(trip.start_date)}
            {trip.start_date !== trip.end_date && <>–{formatDate(trip.end_date)}</>}
            {' · '}{weather.emoji}{' '}
            {(() => {
              const unit = tempUnit === 'fahrenheit' ? '°F' : '°C';
              const lo = tempUnit === 'fahrenheit' ? cToF(weather.low) : weather.low;
              const hi = tempUnit === 'fahrenheit' ? cToF(weather.high) : weather.high;
              return weather.isClimatology
                ? `Typically ${lo}–${hi}${unit}`
                : `Low ${lo}${unit} / High ${hi}${unit}`;
            })()}
          </p>
        </div>
      )}

      {/* Grouped list */}
      <div className="flex-1">
        {grouped.map(({ category, entries: categoryEntries }) => (
          <div key={category}>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {category}
              </span>
            </div>
            {categoryEntries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => !readOnly && togglePacked(entry)}
                disabled={readOnly}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white text-left disabled:cursor-default"
              >
                {/* Checkbox */}
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    entry.packed ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                  }`}
                >
                  {entry.packed && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className={`text-sm font-medium ${
                      entry.packed ? 'line-through text-gray-400' : 'text-gray-900'
                    }`}
                  >
                    {entry.items.name}
                  </span>
                  {entry.quantity > 1 && (
                    <span className="text-xs text-gray-400 ml-1">× {entry.quantity}</span>
                  )}
                </div>
                {entry.is_adhoc && (
                  <span className="text-xs text-gray-300">ad-hoc</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* FAB — Add Item (hidden for archived/past trips) */}
      {!readOnly && (
        <button
          onClick={() => setShowAdHoc(true)}
          className="fixed bottom-24 right-4 w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center text-2xl font-light"
          style={{ maxWidth: 'calc(215px)' }}
        >
          +
        </button>
      )}

      {/* Ad-hoc item modal */}
      {showAdHoc && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-2xl p-6">
            <h3 className="text-lg font-semibold mb-4">Add Item to Trip</h3>
            <input
              type="text"
              value={adHocName}
              onChange={(e) => setAdHocName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAdHocItem()}
              placeholder="Item name"
              autoFocus
              className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowAdHoc(false); setAdHocName(''); }}
                className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={addAdHocItem}
                disabled={adHocSaving || !adHocName.trim()}
                className="flex-1 bg-blue-500 text-white font-semibold py-3 rounded-xl disabled:opacity-50"
              >
                {adHocSaving ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ad-hoc inventory prompt */}
      {adHocEntry && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-2xl p-6">
            <h3 className="text-lg font-semibold mb-2">Add to Master Inventory?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Add <span className="font-medium text-gray-800">{adHocEntry.items.name}</span> to
              your inventory so it can be included in future packing lists.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleAdHocInventoryResponse('yes')}
                className="w-full bg-blue-500 text-white font-semibold py-3 rounded-xl"
              >
                Yes — Add to Inventory
              </button>
              <button
                onClick={() => handleAdHocInventoryResponse('later')}
                className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl"
              >
                Later
              </button>
              <button
                onClick={() => handleAdHocInventoryResponse('no')}
                className="w-full text-gray-400 font-medium py-2"
              >
                No thanks
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking thinking indicator — floats above nav while AI fetches suggestions */}
      {suggestionsLoading && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 z-40 pointer-events-none">
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm text-gray-600">Thinking about your packing list…</span>
          </div>
        </div>
      )}

      {/* AI suggestions bottom sheet — shown only after results are ready */}
      {showSuggestions && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-lg font-semibold">Smart Suggestions</h3>
              <button
                onClick={() => setShowSuggestions(false)}
                className="text-gray-400 text-sm font-medium"
              >
                Done
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {suggestionsError && (
                <p className="text-sm text-gray-500 py-6 text-center">{suggestionsError}</p>
              )}

              {!suggestionsError && suggestions.length > 0 && (
                <div className="flex flex-col gap-3">
                  {suggestions.map((s) => (
                    <div
                      key={s.name}
                      className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{s.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{s.reason}</p>
                        <span className="inline-block mt-1 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {s.category}
                        </span>
                      </div>
                      <button
                        onClick={() => addSuggestion(s)}
                        disabled={addingSuggestion === s.name}
                        className="flex-shrink-0 bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
                      >
                        {addingSuggestion === s.name ? '…' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Archive confirm */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-2xl p-6">
            <h3 className="text-lg font-semibold mb-2">
              {archivePrompted ? '🎉 All Packed!' : 'Archive Trip?'}
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              {archivePrompted
                ? 'You\'ve packed everything. Archive this trip?'
                : 'This trip will be moved to your archive.'}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={archiveTrip}
                className="w-full bg-blue-500 text-white font-semibold py-3 rounded-xl"
              >
                Archive Trip
              </button>
              <button
                onClick={() => { setShowArchiveConfirm(false); setArchivePrompted(false); }}
                className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl"
              >
                Not Yet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
