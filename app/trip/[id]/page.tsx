'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Trip, PackingListEntry, Item, CategoryType, QuantityType, AiSuggestion, TemperatureUnit, Activity } from '@/types';
import LuggageSpinner from '@/components/LuggageSpinner';
import SuitcaseIcon from '@/components/SuitcaseIcon';

type EntryWithItem = PackingListEntry & { items: Item };

type WeatherSummary = {
  label: string;              // resolved location name, e.g. "Dublin, Leinster, IE"
  emoji: string;
  low: number;                // °C
  high: number;               // °C
  isClimatology: boolean;
  precipMm: number | null;         // total precipitation mm across trip
  precipProbability: number | null; // max daily % chance of rain (forecast only)
  windKph: number | null;          // max wind speed km/h across trip
};

// Converts a °C value to °F (rounded to nearest integer).
function cToF(celsius: number): number {
  return Math.round(celsius * 9 / 5 + 32);
}

const TTL_FORECAST_MS = 3 * 60 * 60 * 1000;  // 3 hours
const TTL_CLIMATE_MS  = 24 * 60 * 60 * 1000; // 24 hours

type WeatherCacheEntry = { data: WeatherSummary; cachedAt: number; ttlMs: number };

function readWeatherCache(key: string): WeatherSummary | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: WeatherCacheEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch { return null; }
}

function writeWeatherCache(key: string, data: WeatherSummary): void {
  if (typeof window === 'undefined') return;
  const ttlMs = data.isClimatology ? TTL_CLIMATE_MS : TTL_FORECAST_MS;
  try { localStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now(), ttlMs })); }
  catch { /* quota exceeded or private mode — silently skip */ }
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

  type DailyData = {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weathercode: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
    windspeed_10m_max?: number[];
  };
  let weatherData: { daily: DailyData };

  if (useForecast) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,precipitation_probability_max,windspeed_10m_max&timezone=auto&start_date=${trip.start_date}&end_date=${trip.end_date}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    weatherData = await res.json();
  } else {
    // Use climate API with the trip's actual month/dates.
    const url = `https://climate-api.open-meteo.com/v1/climate?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,windspeed_10m_max&models=EC_Earth3P_HR&start_date=${trip.start_date}&end_date=${trip.end_date}`;
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

  const precipVals = weatherData?.daily?.precipitation_sum;
  const precipProbVals = weatherData?.daily?.precipitation_probability_max;
  const windVals = weatherData?.daily?.windspeed_10m_max;

  const precipMm = precipVals?.length ? Math.round(precipVals.reduce((a, b) => a + b, 0)) : null;
  const precipProbability = precipProbVals?.length ? Math.round(Math.max(...precipProbVals)) : null;
  const windKph = windVals?.length ? Math.round(Math.max(...windVals)) : null;

  return {
    label: locationLabel,
    emoji: weatherEmoji(dominantCode),
    low, high,
    isClimatology: !useForecast,
    precipMm,
    precipProbability,
    windKph,
  };
}

const CATEGORY_ORDER: CategoryType[] = [
  'Clothing',
  'Shoes',
  'Toiletries',
  'Accessories',
  'Equipment',
];


const CATEGORIES: CategoryType[] = ['Clothing', 'Shoes', 'Toiletries', 'Accessories', 'Equipment'];
const QUANTITY_TYPES: { value: QuantityType; label: string; description: string }[] = [
  { value: 'fixed', label: 'Fixed', description: 'Always bring exactly 1' },
  { value: 'per_night', label: 'Per Night', description: 'Scales with trip duration' },
  { value: 'per_activity', label: 'Per Activity', description: 'Scales with matching activities' },
];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

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

  // Ad-hoc item sheet
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [adHocName, setAdHocName] = useState('');
  const [adHocCategory, setAdHocCategory] = useState<CategoryType>('Clothing');
  const [adHocQuantityType, setAdHocQuantityType] = useState<QuantityType>('fixed');
  const [adHocEssential, setAdHocEssential] = useState(false);
  const [adHocActivityIds, setAdHocActivityIds] = useState<string[]>([]);
  const [adHocSaving, setAdHocSaving] = useState(false);
  const [adHocError, setAdHocError] = useState('');
  const [showAdHocNewActivity, setShowAdHocNewActivity] = useState(false);
  const [adHocNewActivityName, setAdHocNewActivityName] = useState('');
  const [adHocActivityError, setAdHocActivityError] = useState('');
  const [adHocAddingActivity, setAdHocAddingActivity] = useState(false);

  // Archive confirm
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Show archive prompt when 100% packed
  const [archivePrompted, setArchivePrompted] = useState(false);

  // Weather
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [tempUnit, setTempUnit] = useState<TemperatureUnit>('celsius');

  // Edit trip modal
  const [showEditTrip, setShowEditTrip] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDestination, setEditDestination] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editNights, setEditNights] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editEndDateMode, setEditEndDateMode] = useState<'nights' | 'manual'>('nights');
  const [editCarryOnOnly, setEditCarryOnOnly] = useState(false);
  const [editLaundryAvailable, setEditLaundryAvailable] = useState(false);
  const [editActivityIds, setEditActivityIds] = useState<string[]>([]);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Smart Suggestions
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

    const [tripRes, entriesRes, prefsRes, activitiesRes, tripActivitiesRes] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).single(),
      supabase
        .from('packing_list_entries')
        .select('*, items(*)')
        .eq('trip_id', tripId)
        .order('items(name)'),
      supabase.from('user_preferences').select('temperature_unit').limit(1).maybeSingle(),
      supabase.from('activities').select('*').order('name'),
      supabase.from('trip_activities').select('activity_id').eq('trip_id', tripId),
    ]);

    if (tripRes.data) setTrip(tripRes.data as Trip);
    if (entriesRes.data) setEntries(entriesRes.data as EntryWithItem[]);
    if (prefsRes.data?.temperature_unit) setTempUnit(prefsRes.data.temperature_unit as TemperatureUnit);
    if (activitiesRes.data) setAllActivities(activitiesRes.data as Activity[]);
    setLoading(false);

    // Fetch weather after trip data is available, if a destination was set.
    if (tripRes.data?.destination) {
      const cacheKey = `zipit_weather_${tripId}_${tripRes.data.start_date}_${tripRes.data.end_date}`;
      const cached = readWeatherCache(cacheKey);
      if (cached) {
        setWeather(cached);
      } else {
        setWeatherLoading(true);
        fetchWeather(tripRes.data as Trip).then((result) => {
          if (result) { writeWeatherCache(cacheKey, result); setWeather(result); }
          // If null (network error), leave existing weather state untouched
          setWeatherLoading(false);
        });
      }
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

  function resetAdHocForm() {
    setAdHocName('');
    setAdHocCategory('Clothing');
    setAdHocQuantityType('fixed');
    setAdHocEssential(false);
    setAdHocActivityIds([]);
    setAdHocError('');
    setShowAdHocNewActivity(false);
    setAdHocNewActivityName('');
    setAdHocActivityError('');
  }

  async function addAdHocItem() {
    setAdHocError('');
    if (!adHocName.trim()) return setAdHocError('Please enter an item name.');
    setAdHocSaving(true);

    const { data: newItem, error: itemError } = await supabase
      .from('items')
      .insert({
        name: adHocName.trim(),
        category: adHocCategory,
        quantity_type: adHocQuantityType,
        essential: adHocEssential,
      })
      .select()
      .single();

    if (itemError || !newItem) {
      setAdHocError('Failed to save item. Please try again.');
      setAdHocSaving(false);
      return;
    }

    if (adHocActivityIds.length > 0) {
      await supabase.from('item_activities').insert(
        adHocActivityIds.map((activity_id) => ({ item_id: newItem.id, activity_id }))
      );
    }

    const { data: newEntry, error: entryError } = await supabase
      .from('packing_list_entries')
      .insert({
        trip_id: tripId,
        item_id: newItem.id,
        quantity: 1,
        packed: false,
        is_adhoc: true,
        added_to_inventory: true,
      })
      .select('*, items(*)')
      .single();

    if (entryError || !newEntry) {
      setAdHocError('Item saved but could not add to trip. Please try again.');
      setAdHocSaving(false);
      return;
    }

    setEntries((prev) => [...prev, newEntry as EntryWithItem]);
    setShowAdHoc(false);
    resetAdHocForm();
    setAdHocSaving(false);
  }

  async function addAdHocActivity() {
    setAdHocActivityError('');
    if (!adHocNewActivityName.trim()) return setAdHocActivityError('Please enter an activity name.');
    setAdHocAddingActivity(true);

    const { data, error } = await supabase
      .from('activities')
      .insert({ name: adHocNewActivityName.trim() })
      .select()
      .single();

    if (error || !data) {
      setAdHocActivityError('Could not create activity. It may already exist.');
      setAdHocAddingActivity(false);
      return;
    }

    setAllActivities((prev) =>
      [...prev, data as Activity].sort((a, b) => a.name.localeCompare(b.name))
    );
    setAdHocActivityIds((prev) => [...prev, data.id]);
    setAdHocNewActivityName('');
    setShowAdHocNewActivity(false);
    setAdHocAddingActivity(false);
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
  }

  function formatDate(dateStr: string) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  function openEditTrip() {
    if (!trip) return;
    setEditName(trip.name);
    setEditDestination(trip.destination ?? '');
    setEditStartDate(trip.start_date);
    setEditCarryOnOnly(trip.carry_on_only);
    setEditLaundryAvailable(trip.laundry_available);
    // Pre-populate activity IDs from what was fetched
    supabase.from('trip_activities').select('activity_id').eq('trip_id', tripId).then(({ data }) => {
      setEditActivityIds(data?.map((r) => r.activity_id) ?? []);
    });
    // Default to nights mode
    const n = Math.round(
      (new Date(trip.end_date + 'T00:00:00').getTime() - new Date(trip.start_date + 'T00:00:00').getTime()) / 86_400_000
    );
    setEditNights(String(n));
    setEditEndDate(trip.end_date);
    setEditEndDateMode('nights');
    setEditError('');
    setShowEditTrip(true);
  }

  async function saveEditTrip() {
    setEditError('');
    if (!editName.trim()) return setEditError('Trip name is required.');
    if (!editStartDate) return setEditError('Start date is required.');

    let finalEndDate: string;
    if (editEndDateMode === 'nights') {
      const n = parseInt(editNights);
      if (!editNights || isNaN(n) || n < 1) return setEditError('Enter a valid number of nights (minimum 1).');
      finalEndDate = addDays(editStartDate, n);
    } else {
      if (!editEndDate || editEndDate <= editStartDate) return setEditError('End date must be after start date.');
      finalEndDate = editEndDate;
    }

    setEditSaving(true);

    const { data: updatedTrip, error } = await supabase
      .from('trips')
      .update({
        name: editName.trim(),
        destination: editDestination.trim() || null,
        start_date: editStartDate,
        end_date: finalEndDate,
        carry_on_only: editCarryOnOnly,
        laundry_available: editLaundryAvailable,
      })
      .eq('id', tripId)
      .select()
      .single();

    if (error || !updatedTrip) {
      setEditError('Failed to save. Please try again.');
      setEditSaving(false);
      return;
    }

    // Replace trip_activities
    await supabase.from('trip_activities').delete().eq('trip_id', tripId);
    if (editActivityIds.length > 0) {
      await supabase.from('trip_activities').insert(
        editActivityIds.map((activity_id) => ({ trip_id: tripId, activity_id }))
      );
    }

    setTrip(updatedTrip as Trip);
    setEditSaving(false);
    setShowEditTrip(false);

    // Re-fetch weather if destination is set
    if (updatedTrip.destination) {
      const cacheKey = `zipit_weather_${tripId}_${updatedTrip.start_date}_${updatedTrip.end_date}`;
      const cached = readWeatherCache(cacheKey);
      if (cached) {
        setWeather(cached);
      } else {
        setWeatherLoading(true);
        fetchWeather(updatedTrip as Trip).then((result) => {
          if (result) { writeWeatherCache(cacheKey, result); setWeather(result); }
          setWeatherLoading(false);
        });
      }
    } else {
      setWeather(null); // destination explicitly removed — correct to clear
    }
  }

  if (loading || !trip) {
    return <LuggageSpinner />;
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
      <div className="header-noise px-4 pt-12 pb-4 bg-gradient-to-b from-sky-50 to-white">
        {/* Row: back | trip name (flex-1) | edit icon | archive icon/badge */}
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.back()} aria-label="Back" className="text-sky-500 -ml-1 flex-shrink-0">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="flex-1 text-lg font-semibold font-logo text-sky-500 leading-snug">{trip.name}</h1>
          <div className="flex items-center gap-3 flex-shrink-0">
            {readOnly ? (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Archived</span>
            ) : (
              <>
                <button onClick={openEditTrip} aria-label="Edit trip" className="text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button onClick={() => setShowArchiveConfirm(true)} aria-label="Archive trip" className="text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 8h14M5 8a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v0a2 2 0 01-2 2M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Dates + destination */}
        <div className="flex flex-wrap items-center gap-x-1.5 mt-1">
          <p className="text-sm text-gray-500">
            {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
          </p>
          {trip.destination && (
            <>
              <span className="text-gray-300">·</span>
              <p className="text-sm text-gray-500">{trip.destination}</p>
            </>
          )}
        </div>

        {/* Weather — inline below dates */}
        {weatherLoading && !weather && (
          <p className="text-xs text-gray-400 mt-1">Loading weather…</p>
        )}
        {weather && (
          <p className="text-xs text-gray-400 mt-1">
            {(() => {
              const unit = tempUnit === 'fahrenheit' ? '°F' : '°C';
              const lo = tempUnit === 'fahrenheit' ? cToF(weather.low) : weather.low;
              const hi = tempUnit === 'fahrenheit' ? cToF(weather.high) : weather.high;
              const windSpeed = weather.windKph != null
                ? (tempUnit === 'fahrenheit' ? Math.round(weather.windKph * 0.621371) : weather.windKph)
                : null;
              const windUnit = tempUnit === 'fahrenheit' ? 'mph' : 'km/h';

              const parts: string[] = [`${weather.emoji} ${lo}–${hi}${unit}`];
              if (!weather.isClimatology && weather.precipProbability != null) {
                parts.push(`${weather.precipProbability}% chance of rain`);
              } else if (weather.isClimatology && weather.precipMm != null) {
                parts.push(`~${weather.precipMm}mm rain`);
              }
              if (windSpeed != null) parts.push(`Winds up to ${windSpeed} ${windUnit}`);

              const label = weather.isClimatology ? 'Usually' : 'Forecast';
              return `${label}: ${parts.join(' · ')}`;
            })()}
          </p>
        )}

        {/* Progress */}
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-gradient-to-r from-sky-400 to-sky-500 h-1.5 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {packed} / {total} packed
          </span>
        </div>

        {/* Smart Suggestions trigger — only shown for active trips */}
        {!readOnly && (
          <button
            onClick={loadSuggestions}
            disabled={suggestionsLoading}
            className="mt-2 text-xs text-teal-400 font-medium disabled:opacity-40"
          >
            ✦ Suggest missing items
          </button>
        )}
      </div>

      {/* Grouped list */}
      <div className="flex-1">
        {grouped.map(({ category, entries: categoryEntries }) => (
          <div key={category}>
            <div className="px-4 py-2 bg-white border-b border-gray-50">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                {category}
              </span>
            </div>
            {categoryEntries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => !readOnly && togglePacked(entry)}
                disabled={readOnly}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white text-left disabled:cursor-default active:bg-gray-50 transition-colors"
              >
                {/* Checkbox */}
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    entry.packed ? 'bg-sky-500 border-sky-500' : 'border-gray-300'
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
          className="fixed bottom-24 right-4 w-14 h-14 bg-gradient-to-b from-sky-400 to-sky-600 text-white rounded-full shadow-sky flex items-center justify-center text-2xl font-light"
          style={{ maxWidth: 'calc(215px)' }}
        >
          +
        </button>
      )}

      {/* Add Item sheet — full form */}
      {showAdHoc && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl pt-4 max-h-[90dvh] flex flex-col">
            <div className="sheet-handle" />
            <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-base font-semibold text-gray-900">Add Item</h3>
              <button onClick={() => { setShowAdHoc(false); resetAdHocForm(); }} className="text-gray-400 text-sm font-medium">Cancel</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={adHocName}
                  onChange={(e) => setAdHocName(e.target.value)}
                  placeholder="e.g. Golf Shirt"
                  autoFocus
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setAdHocCategory(cat)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        adHocCategory === cat
                          ? 'bg-sky-500 text-white border-sky-500 shadow-sky-sm'
                          : 'bg-white text-gray-600 border-gray-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                <div className="flex flex-col gap-2">
                  {QUANTITY_TYPES.map(({ value, label, description }) => (
                    <button
                      key={value}
                      onClick={() => setAdHocQuantityType(value)}
                      className={`flex items-start gap-3 px-3 py-3 rounded-xl border text-left transition-colors ${
                        adHocQuantityType === value ? 'border-sky-500 bg-sky-50' : 'border-gray-200'
                      }`}
                    >
                      <div
                        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                          adHocQuantityType === value ? 'border-sky-500' : 'border-gray-300'
                        }`}
                      >
                        {adHocQuantityType === value && <div className="w-2 h-2 rounded-full bg-sky-500" />}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${adHocQuantityType === value ? 'text-sky-700' : 'text-gray-800'}`}>{label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Essential toggle */}
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-800">Essential</p>
                  <p className="text-xs text-gray-400 mt-0.5">Always packed on every trip</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adHocEssential}
                    onChange={(e) => setAdHocEssential(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-sky-500 rounded-full peer peer-checked:bg-sky-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
                </label>
              </div>

              {/* Activities — hidden when essential */}
              {!adHocEssential && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Activities</label>
                  <p className="text-xs text-gray-400 mb-2">
                    This item will appear in packing lists for trips with these activities.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {allActivities.map((a) => {
                      const selected = adHocActivityIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          onClick={() => setAdHocActivityIds((prev) =>
                            selected ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                          )}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            selected
                              ? 'bg-sky-500 text-white border-sky-500 shadow-sky-sm'
                              : 'bg-white text-gray-600 border-gray-300'
                          }`}
                        >
                          {a.name}
                        </button>
                      );
                    })}
                  </div>

                  {/* Inline new activity form */}
                  {showAdHocNewActivity ? (
                    <div className="mt-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={adHocNewActivityName}
                          onChange={(e) => setAdHocNewActivityName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addAdHocActivity()}
                          placeholder="Activity name"
                          autoFocus
                          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <button
                          onClick={addAdHocActivity}
                          disabled={adHocAddingActivity}
                          className="px-3 py-2 bg-gradient-to-b from-sky-400 to-sky-600 text-white text-sm font-medium rounded-xl disabled:opacity-40 shadow-sky-sm"
                        >
                          {adHocAddingActivity ? 'Adding…' : 'Add'}
                        </button>
                        <button
                          onClick={() => { setShowAdHocNewActivity(false); setAdHocNewActivityName(''); setAdHocActivityError(''); }}
                          className="px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-xl"
                        >
                          Cancel
                        </button>
                      </div>
                      {adHocActivityError && <p className="text-xs text-red-500 mt-1">{adHocActivityError}</p>}
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAdHocNewActivity(true)}
                      className="mt-2 text-sm text-sky-500 font-medium"
                    >
                      + New activity
                    </button>
                  )}
                </div>
              )}

              {/* Error */}
              {adHocError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <p className="text-sm text-red-600">{adHocError}</p>
                </div>
              )}

              {/* Actions */}
              <button
                onClick={addAdHocItem}
                disabled={adHocSaving}
                className="w-full bg-gradient-to-b from-sky-400 to-sky-600 text-white font-semibold py-4 rounded-xl disabled:opacity-50 shadow-sky"
              >
                {adHocSaving ? 'Adding…' : 'Add to Trip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking thinking indicator — floats above nav while Smart Suggestions fetches */}
      {suggestionsLoading && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 z-40 pointer-events-none">
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3">
            <SuitcaseIcon size={16} className="luggage-spin-icon text-teal-400 flex-shrink-0" />
            <span className="text-sm text-gray-600">Thinking about your packing list…</span>
          </div>
        </div>
      )}

      {/* Smart Suggestions bottom sheet — shown only after results are ready */}
      {showSuggestions && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl flex flex-col max-h-[80vh]">
            <div className="flex flex-col px-6 pt-4 pb-0 flex-shrink-0">
              <div className="sheet-handle" />
            </div>
            <div className="flex items-center justify-between px-6 pb-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-lg font-semibold text-teal-600">✦ Smart Suggestions</h3>
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
                        className="flex-shrink-0 bg-teal-400 text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-6 pt-4">
            <div className="sheet-handle" />
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
                className="w-full bg-gradient-to-b from-sky-400 to-sky-600 text-white font-semibold py-3 rounded-xl shadow-sky-sm"
              >
                Archive Trip
              </button>
              <button
                onClick={() => { setShowArchiveConfirm(false); setArchivePrompted(false); }}
                className="w-full bg-white text-gray-700 font-semibold py-3 rounded-xl border border-gray-200 shadow-sm"
              >
                Not Yet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Trip bottom sheet */}
      {showEditTrip && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl flex flex-col max-h-[90vh]">
            <div className="flex flex-col px-6 pt-4 pb-0 flex-shrink-0">
              <div className="sheet-handle" />
            </div>
            <div className="flex items-center justify-between px-6 pb-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-lg font-semibold font-logo text-sky-500">Edit Trip</h3>
              <button onClick={() => setShowEditTrip(false)} className="text-gray-400 text-sm font-medium">Cancel</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trip Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Destination */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                <input
                  type="text"
                  value={editDestination}
                  onChange={(e) => setEditDestination(e.target.value)}
                  placeholder="e.g. Paris, France"
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Dates */}
              <div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  {editEndDateMode === 'nights' ? (
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nights</label>
                      <input
                        type="number"
                        min="1"
                        value={editNights}
                        onChange={(e) => setEditNights(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  ) : (
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                      <input
                        type="date"
                        value={editEndDate}
                        min={editStartDate ? addDays(editStartDate, 1) : ''}
                        onChange={(e) => setEditEndDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  {editEndDateMode === 'nights' && editStartDate && editNights && !isNaN(parseInt(editNights)) && (
                    <p className="text-xs text-gray-400">Returns: {addDays(editStartDate, parseInt(editNights))}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditEndDateMode(editEndDateMode === 'nights' ? 'manual' : 'nights')}
                    className="text-xs text-sky-500 font-medium ml-auto"
                  >
                    {editEndDateMode === 'nights' ? 'Enter end date manually' : 'Use number of nights'}
                  </button>
                </div>
              </div>

              {/* Activities */}
              {allActivities.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Activities</label>
                  <div className="flex flex-wrap gap-2">
                    {allActivities.map((a) => {
                      const selected = editActivityIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          onClick={() => setEditActivityIds((prev) =>
                            selected ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                          )}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            selected ? 'bg-sky-500 text-white border-sky-500 shadow-sky-sm' : 'bg-white text-gray-600 border-gray-300'
                          }`}
                        >
                          {a.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Toggles */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Carry-on Only</p>
                    <p className="text-xs text-gray-400">No checked luggage</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={editCarryOnOnly} onChange={(e) => setEditCarryOnOnly(e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-sky-500 rounded-full peer peer-checked:bg-sky-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
                  </label>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Laundry Available</p>
                    <p className="text-xs text-gray-400">Pack fewer clothes</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={editLaundryAvailable} onChange={(e) => setEditLaundryAvailable(e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-sky-500 rounded-full peer peer-checked:bg-sky-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
                  </label>
                </div>
              </div>

              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <p className="text-sm text-red-600">{editError}</p>
                </div>
              )}

              <button
                onClick={saveEditTrip}
                disabled={editSaving}
                className="w-full bg-gradient-to-b from-sky-400 to-sky-600 text-white font-semibold py-4 rounded-xl disabled:opacity-50 shadow-sky"
              >
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
