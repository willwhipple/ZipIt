'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Trip, PackingListEntry, Item, CategoryType, QuantityType, AiSuggestion, TemperatureUnit, Activity } from '@/types';
import LuggageSpinner from '@/components/LuggageSpinner';
import SuitcaseIcon from '@/components/SuitcaseIcon';
import { PageHeader, MetaChip, HeaderIconBtn } from '@/components/ui/PageHeader';
import { FilterSegment } from '@/components/ui/FilterSegment';
import { SmartCTA } from '@/components/ui/SmartCTA';
import { PackCheck } from '@/components/ui/PackCheck';
import { CategoryHeader, ListRow } from '@/components/ui/ListRow';
import { PrimaryBtn, SecondaryBtn, DangerBtn } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Chip } from '@/components/ui/Chip';
import { Toggle } from '@/components/ui/Toggle';

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
  const [adHocSaveToMyStuff, setAdHocSaveToMyStuff] = useState(true);
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

  // Filter segment
  const [filter, setFilter] = useState<'all' | 'unpacked' | 'packed'>('all');

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
    setAdHocSaveToMyStuff(true);
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
        added_to_inventory: adHocSaveToMyStuff,
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
  const unpacked = total - packed;
  const progress = total > 0 ? Math.round((packed / total) * 100) : 0;

  const filteredEntries = entries.filter((e) => {
    if (filter === 'packed') return e.packed;
    if (filter === 'unpacked') return !e.packed;
    return true;
  });

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    entries: filteredEntries.filter((e) => e.items.category === category),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <PageHeader
        leading={
          <HeaderIconBtn onClick={() => router.back()} aria-label="Back">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </HeaderIconBtn>
        }
        trailing={
          readOnly ? (
            <span
              className="text-xs font-medium px-2 py-1 rounded-full"
              style={{ background: 'rgba(255,255,255,.15)', color: 'rgba(255,255,255,.8)' }}
            >
              Archived
            </span>
          ) : (
            <>
              <HeaderIconBtn onClick={openEditTrip} aria-label="Edit trip">
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </HeaderIconBtn>
              <HeaderIconBtn onClick={() => setShowArchiveConfirm(true)} aria-label="Archive trip">
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v0a2 2 0 01-2 2M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </HeaderIconBtn>
            </>
          )
        }
        eyebrow={
          <span style={{ fontFamily: 'var(--zi-font-mono)', fontVariantNumeric: 'tabular-nums' }}>
            {packed} / {total} packed
          </span>
        }
        title={trip.name}
        chips={
          <>
            <MetaChip>
              {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
            </MetaChip>
            {trip.destination && (
              <MetaChip>
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {trip.destination}
              </MetaChip>
            )}
            {weather && (() => {
              const unit = tempUnit === 'fahrenheit' ? '°F' : '°C';
              const lo = tempUnit === 'fahrenheit' ? cToF(weather.low) : weather.low;
              const hi = tempUnit === 'fahrenheit' ? cToF(weather.high) : weather.high;
              const windSpeed = weather.windKph != null
                ? (tempUnit === 'fahrenheit' ? Math.round(weather.windKph * 0.621371) : weather.windKph)
                : null;
              const windUnit = tempUnit === 'fahrenheit' ? 'mph' : 'km/h';
              const parts: string[] = [`${weather.emoji} ${lo}–${hi}${unit}`];
              if (!weather.isClimatology && weather.precipProbability != null) parts.push(`🌧️ ${weather.precipProbability}% rain`);
              else if (weather.isClimatology && weather.precipMm != null) parts.push(`🌧️ ~${weather.precipMm}mm`);
              if (windSpeed != null) parts.push(`💨 ${windSpeed} ${windUnit}`);
              return <MetaChip>{parts.join(' · ')}</MetaChip>;
            })()}
          </>
        }
      />

      {/* Filter bar */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--zi-border)', background: 'var(--zi-surface)' }}
      >
        <FilterSegment
          options={[
            { id: 'all', label: 'All', count: total },
            { id: 'unpacked', label: 'Unpacked', count: unpacked },
            { id: 'packed', label: 'Packed', count: packed },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as 'all' | 'unpacked' | 'packed')}
        />
      </div>

      {/* Smart Suggestions CTA — only for active trips */}
      {!readOnly && (
        <div className="px-4 py-2" style={{ background: 'var(--zi-surface)' }}>
          <SmartCTA onClick={loadSuggestions} />
        </div>
      )}

      {/* Grouped list */}
      <div className="flex-1">
        {grouped.map(({ category, entries: categoryEntries }) => (
          <div key={category}>
            <CategoryHeader
              name={category}
              meta={`${categoryEntries.filter(e => e.packed).length} / ${categoryEntries.length}`}
            />
            {categoryEntries.map((entry) => (
              <ListRow
                key={entry.id}
                leading={
                  <PackCheck
                    on={entry.packed}
                    onClick={() => !readOnly && togglePacked(entry)}
                  />
                }
                trailing={
                  entry.quantity > 1 ? (
                    <span style={{ fontSize: 12, color: 'var(--zi-text-subtle)', fontFamily: 'var(--zi-font-mono)' }}>
                      ×{entry.quantity}
                    </span>
                  ) : undefined
                }
              >
                <span style={{
                  textDecoration: entry.packed ? 'line-through' : 'none',
                  color: entry.packed ? 'var(--zi-text-subtle)' : 'var(--zi-text)',
                }}>
                  {entry.items.name}
                </span>
              </ListRow>
            ))}
            {/* Category divider */}
            <div style={{ height: 1, background: 'var(--zi-border)', margin: '0 20px' }} />
          </div>
        ))}
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p style={{ color: 'var(--zi-text-subtle)', fontSize: 14 }}>No items match this filter</p>
          </div>
        )}
      </div>

      {/* FAB — pill style, hidden for read-only trips */}
      {!readOnly && (
        <button
          onClick={() => setShowAdHoc(true)}
          className="fixed flex items-center gap-2"
          style={{
            bottom: 84,
            right: 16,
            background: 'var(--zi-brand)',
            color: '#fff',
            borderRadius: 'var(--zi-r-pill)',
            boxShadow: 'var(--zi-elev-fab)',
            padding: '12px 18px',
            fontSize: 14,
            fontWeight: 600,
            minHeight: 44,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Add item
        </button>
      )}

      {/* Add Item sheet */}
      {showAdHoc && (
        <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: 'var(--zi-overlay-scrim)' }}>
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl pt-4 max-h-[90dvh] flex flex-col">
            <div className="sheet-handle" />
            <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--zi-border)' }}>
              <h3 className="text-base font-semibold" style={{ color: 'var(--zi-text)' }}>Add item</h3>
              <button onClick={() => { setShowAdHoc(false); resetAdHocForm(); }} className="text-sm font-medium" style={{ color: 'var(--zi-text-muted)' }}>Cancel</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
              <Input
                label="Name"
                value={adHocName}
                onChange={setAdHocName}
                placeholder="e.g. Golf shirt"
              />

              <div>
                <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Category</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <Chip key={cat} selected={adHocCategory === cat} onClick={() => setAdHocCategory(cat)}>{cat}</Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Quantity</p>
                <div className="flex flex-col gap-2">
                  {QUANTITY_TYPES.map(({ value, label, description }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAdHocQuantityType(value)}
                      className="flex items-start gap-3 px-3 py-3 text-left"
                      style={{
                        borderRadius: 'var(--zi-r-lg)',
                        border: `1px solid ${adHocQuantityType === value ? 'var(--zi-brand)' : 'var(--zi-border-strong)'}`,
                        background: adHocQuantityType === value ? 'var(--zi-brand-tint)' : 'transparent',
                      }}
                    >
                      <div className="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                        style={{ borderColor: adHocQuantityType === value ? 'var(--zi-brand)' : 'var(--zi-border-strong)' }}>
                        {adHocQuantityType === value && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--zi-brand)' }} />}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>{label}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>{description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--zi-border)' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>Essential</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>Always packed on every trip</p>
                </div>
                <Toggle on={adHocEssential} onChange={setAdHocEssential} />
              </div>

              <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--zi-border)' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>Save to My Stuff</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>Add this item to your permanent list</p>
                </div>
                <Toggle on={adHocSaveToMyStuff} onChange={setAdHocSaveToMyStuff} />
              </div>

              {!adHocEssential && (
                <div>
                  <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--zi-text)' }}>Activities</p>
                  <p className="text-xs mb-2" style={{ color: 'var(--zi-text-subtle)' }}>
                    This item will appear in packing lists for trips with these activities.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {allActivities.map((a) => {
                      const selected = adHocActivityIds.includes(a.id);
                      return (
                        <Chip
                          key={a.id}
                          selected={selected}
                          onClick={() => setAdHocActivityIds((prev) =>
                            selected ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                          )}
                        >
                          {a.name}
                        </Chip>
                      );
                    })}
                  </div>

                  {showAdHocNewActivity ? (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={adHocNewActivityName}
                        onChange={(e) => setAdHocNewActivityName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addAdHocActivity()}
                        placeholder="Activity name"
                        autoFocus
                        className="flex-1 border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--zi-brand)]"
                        style={{ borderColor: 'var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
                      />
                      <SecondaryBtn onClick={addAdHocActivity} disabled={adHocAddingActivity}>
                        {adHocAddingActivity ? '…' : 'Add'}
                      </SecondaryBtn>
                      <SecondaryBtn onClick={() => { setShowAdHocNewActivity(false); setAdHocNewActivityName(''); setAdHocActivityError(''); }}>
                        Cancel
                      </SecondaryBtn>
                      {adHocActivityError && <p className="text-xs mt-1" style={{ color: 'var(--zi-danger)' }}>{adHocActivityError}</p>}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAdHocNewActivity(true)}
                      className="mt-2 text-sm font-medium"
                      style={{ color: 'var(--zi-brand)' }}
                    >
                      + New activity
                    </button>
                  )}
                </div>
              )}

              {adHocError && (
                <p className="text-sm px-3 py-2 rounded-[var(--zi-r-lg)]" style={{ background: 'var(--zi-danger-tint)', color: 'var(--zi-danger)', border: '1px solid rgba(239,68,68,.2)' }}>
                  {adHocError}
                </p>
              )}

              <PrimaryBtn onClick={addAdHocItem} disabled={adHocSaving} full>
                {adHocSaving ? 'Adding…' : 'Add to trip'}
              </PrimaryBtn>
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

      {/* Smart Suggestions sheet */}
      {showSuggestions && (
        <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: 'var(--zi-overlay-scrim)' }}>
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl flex flex-col max-h-[80vh]">
            <div className="flex flex-col px-6 pt-4 pb-0 flex-shrink-0">
              <div className="sheet-handle" />
            </div>
            <div className="flex items-center justify-between px-6 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--zi-border)' }}>
              <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--zi-smart-deep)' }}>
                <span style={{ color: 'var(--zi-smart)' }}>✦</span> What am I missing?
              </h3>
              <button onClick={() => setShowSuggestions(false)} className="text-sm font-medium" style={{ color: 'var(--zi-text-muted)' }}>
                Done
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {suggestionsError && (
                <p className="text-sm py-6 text-center" style={{ color: 'var(--zi-text-muted)' }}>{suggestionsError}</p>
              )}
              {!suggestionsError && suggestions.length > 0 && (
                <div className="flex flex-col gap-3">
                  {suggestions.map((s) => (
                    <div key={s.name} className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--zi-border)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>{s.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>{s.reason}</p>
                        <span className="inline-block mt-1 text-xs px-2 py-0.5" style={{ color: 'var(--zi-text-subtle)', background: 'var(--zi-border)', borderRadius: 'var(--zi-r-pill)' }}>
                          {s.category}
                        </span>
                      </div>
                      <button
                        onClick={() => addSuggestion(s)}
                        disabled={addingSuggestion === s.name}
                        className="flex-shrink-0 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
                        style={{ background: 'var(--zi-smart)', borderRadius: 'var(--zi-r-pill)', border: 'none', cursor: 'pointer' }}
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
        <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: 'var(--zi-overlay-scrim)' }}>
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-6 pt-4">
            <div className="sheet-handle" />
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--zi-text)' }}>
              {archivePrompted ? '🎉 All packed!' : 'Archive trip?'}
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--zi-text-muted)' }}>
              {archivePrompted
                ? "You've packed everything. Archive this trip?"
                : 'This trip will be moved to your archive.'}
            </p>
            <div className="flex flex-col gap-2">
              <PrimaryBtn onClick={archiveTrip} full>Archive trip</PrimaryBtn>
              <SecondaryBtn onClick={() => { setShowArchiveConfirm(false); setArchivePrompted(false); }} full>
                Not yet
              </SecondaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* Edit Trip sheet */}
      {showEditTrip && (
        <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: 'var(--zi-overlay-scrim)' }}>
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl flex flex-col max-h-[90vh]">
            <div className="flex flex-col px-6 pt-4 pb-0 flex-shrink-0">
              <div className="sheet-handle" />
            </div>
            <div className="flex items-center justify-between px-6 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--zi-border)' }}>
              <h3 className="text-base font-semibold" style={{ color: 'var(--zi-text)' }}>Edit trip</h3>
              <button onClick={() => setShowEditTrip(false)} className="text-sm font-medium" style={{ color: 'var(--zi-text-muted)' }}>Cancel</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
              <Input label="Trip name" value={editName} onChange={setEditName} />
              <Input label="Destination" value={editDestination} onChange={setEditDestination} placeholder="e.g. Paris, France" />

              <div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input label="Start date" type="date" value={editStartDate} onChange={setEditStartDate} />
                  </div>
                  {editEndDateMode === 'nights' ? (
                    <div className="flex-1">
                      <Input label="Nights" type="number" value={editNights} onChange={setEditNights} />
                    </div>
                  ) : (
                    <div className="flex-1">
                      <Input label="End date" type="date" value={editEndDate} onChange={setEditEndDate} />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  {editEndDateMode === 'nights' && editStartDate && editNights && !isNaN(parseInt(editNights)) && (
                    <p className="text-xs" style={{ color: 'var(--zi-text-subtle)' }}>Returns: {addDays(editStartDate, parseInt(editNights))}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditEndDateMode(editEndDateMode === 'nights' ? 'manual' : 'nights')}
                    className="text-xs font-medium ml-auto"
                    style={{ color: 'var(--zi-brand)' }}
                  >
                    {editEndDateMode === 'nights' ? 'Enter end date manually' : 'Use number of nights'}
                  </button>
                </div>
              </div>

              {allActivities.length > 0 && (
                <div>
                  <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Activities</p>
                  <div className="flex flex-wrap gap-2">
                    {allActivities.map((a) => {
                      const selected = editActivityIds.includes(a.id);
                      return (
                        <Chip
                          key={a.id}
                          selected={selected}
                          onClick={() => setEditActivityIds((prev) =>
                            selected ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                          )}
                        >
                          {a.name}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--zi-border)' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>Carry-on only</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>No checked luggage</p>
                  </div>
                  <Toggle on={editCarryOnOnly} onChange={setEditCarryOnOnly} />
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>Laundry available</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>Pack fewer clothes</p>
                  </div>
                  <Toggle on={editLaundryAvailable} onChange={setEditLaundryAvailable} />
                </div>
              </div>

              {editError && (
                <p className="text-sm px-3 py-2 rounded-[var(--zi-r-lg)]" style={{ background: 'var(--zi-danger-tint)', color: 'var(--zi-danger)', border: '1px solid rgba(239,68,68,.2)' }}>
                  {editError}
                </p>
              )}

              <PrimaryBtn onClick={saveEditTrip} disabled={editSaving} full>
                {editSaving ? 'Saving…' : 'Save changes'}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
