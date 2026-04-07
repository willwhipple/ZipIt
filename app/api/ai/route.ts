import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import {
  buildTripContext,
  askGemini,
  parseSuggestions,
  parseInventorySuggestions,
  parseTripDescription,
  GeminiError,
} from '../../../lib/gemini';

// ── Request types ─────────────────────────────────────────────────────────────

type SuggestItemsRequest = {
  action: 'suggest_items';
  tripId: string;
  existingItems?: string[];   // names already on the list — AI won't repeat them
  weatherSummary?: string;    // optional formatted weather string, e.g. "Low 20°C / High 28°C"
};

type ParseTripDescriptionRequest = {
  action: 'parse_trip_description';
  description: string;
};

type SuggestInventoryItemsRequest = {
  action: 'suggest_inventory_items';
  travelStyle: string;        // free-text description, e.g. "I travel for business"
  existingItemNames?: string[]; // names already in inventory — AI won't repeat them
};

type AiRequest =
  | SuggestItemsRequest
  | ParseTripDescriptionRequest
  | SuggestInventoryItemsRequest;

function parseRequest(body: unknown): AiRequest | null {
  if (body === null || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  if (b.action === 'suggest_items') {
    if (typeof b.tripId !== 'string' || b.tripId.trim() === '') return null;
    const existingItems = Array.isArray(b.existingItems)
      ? b.existingItems.filter((x): x is string => typeof x === 'string')
      : [];
    const weatherSummary = typeof b.weatherSummary === 'string' ? b.weatherSummary : undefined;
    return { action: 'suggest_items', tripId: b.tripId.trim(), existingItems, weatherSummary };
  }

  if (b.action === 'parse_trip_description') {
    if (typeof b.description !== 'string' || b.description.trim() === '') return null;
    return { action: 'parse_trip_description', description: b.description.trim() };
  }

  if (b.action === 'suggest_inventory_items') {
    if (typeof b.travelStyle !== 'string' || b.travelStyle.trim() === '') return null;
    const existingItemNames = Array.isArray(b.existingItemNames)
      ? b.existingItemNames.filter((x): x is string => typeof x === 'string')
      : [];
    return { action: 'suggest_inventory_items', travelStyle: b.travelStyle.trim(), existingItemNames };
  }

  return null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = parseRequest(body);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (parsed.action === 'suggest_items') return handleSuggestItems(parsed);
  if (parsed.action === 'parse_trip_description') return handleParseTripDescription(parsed);
  if (parsed.action === 'suggest_inventory_items') return handleSuggestInventoryItems(parsed);

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callGeminiSafely(prompt: string) {
  try {
    return { text: await askGemini(prompt), error: null };
  } catch (err) {
    if (err instanceof GeminiError) {
      const isTimeout = err.message.includes('timed out');
      const isMisconfig = err.message.includes('not set');
      console.error('[ai/route] Gemini error:', err.message, err.cause ?? '');
      return { text: null, error: err.message, status: isTimeout ? 504 : isMisconfig ? 500 : 503 };
    }
    console.error('[ai/route] Unexpected error:', err);
    return { text: null, error: 'AI unavailable', status: 503 };
  }
}

// ── suggest_items ─────────────────────────────────────────────────────────────

async function handleSuggestItems(req: SuggestItemsRequest) {
  // NOTE: Once Stage 1.1 auth is added, validate the session here and use a
  // user-scoped client to ensure the trip belongs to the requesting user.
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, name, start_date, end_date, accommodation_type, carry_on_only, laundry_available')
    .eq('id', req.tripId)
    .single();

  if (tripError || !trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  const { data: tripActivityRows, error: taError } = await supabase
    .from('trip_activities')
    .select('activity_id, activities(id, name, created_at)')
    .eq('trip_id', req.tripId);

  if (taError) {
    console.error('[ai/route] Failed to fetch trip activities:', taError.message);
    return NextResponse.json({ error: 'Failed to load trip data' }, { status: 500 });
  }

  const activities = (tripActivityRows ?? [])
    .map((row) => row.activities)
    .filter(Boolean) as { id: string; name: string; created_at: string }[];

  const tripContext = buildTripContext(trip, activities, req.weatherSummary);
  const existingList = req.existingItems?.length ? req.existingItems.join(', ') : 'None';

  const prompt = `You are a packing assistant. Given the trip below, suggest up to 10 items the traveller may have forgotten.

Return ONLY a JSON array of objects with this exact shape:
[{ "name": string, "category": "Clothing"|"Shoes"|"Toiletries"|"Accessories"|"Equipment", "reason": string }]

Rules:
- Do not include items already in their packing list (listed below).
- Do not include explanatory text outside the JSON array.
- Each "reason" should be one short sentence explaining why the item is relevant to this trip.

--- TRIP ---
${tripContext}

--- EXISTING PACKING LIST ---
${existingList}`;

  const { text, error, status } = await callGeminiSafely(prompt);
  if (!text) return NextResponse.json({ error }, { status });

  return NextResponse.json({ suggestions: parseSuggestions(text) });
}

// ── parse_trip_description ────────────────────────────────────────────────────

async function handleParseTripDescription(req: ParseTripDescriptionRequest) {
  const today = new Date().toISOString().split('T')[0];

  const prompt = `You are a travel assistant. Extract trip details from the description below.

Return ONLY a JSON object with these fields:
{
  "name": string,              // Always include. If not stated, infer a short trip name from the destination/purpose (e.g. "Paris Wedding Weekend", "London Business Trip")
  "destination": string,       // Always include. Format as "City, Country" (e.g. "London, United Kingdom"). Infer country from city if not stated — best guess is fine.
  "startDate": string,         // YYYY-MM-DD format
  "endDate": string,           // YYYY-MM-DD format
  "activities": string[],      // only from: Golf, Beach, Business, Hiking, Formal Dinner, Casual, Ski, City Sightseeing
  "accommodationType": string, // one of: Hotel, Airbnb, Camping, Staying with someone, Other
  "carryOnOnly": boolean,
  "laundryAvailable": boolean
}

Today's date is ${today}. Use it to resolve relative dates like "next weekend" or "in two weeks".
Always include "name" and "destination". For all other fields, only include if mentioned or clearly implied.
Do not include explanatory text outside the JSON.

--- DESCRIPTION ---
${req.description}`;

  const { text, error, status } = await callGeminiSafely(prompt);
  if (!text) return NextResponse.json({ error }, { status });

  return NextResponse.json({ parsed: parseTripDescription(text) });
}

// ── suggest_inventory_items ───────────────────────────────────────────────────

async function handleSuggestInventoryItems(req: SuggestInventoryItemsRequest) {
  const existingList = req.existingItemNames?.length
    ? req.existingItemNames.join(', ')
    : 'None';

  const prompt = `You are a packing expert. Based on the travel style described below, suggest up to 15 items for a master packing inventory.

Return ONLY a JSON array of objects with this exact shape:
[{ "name": string, "category": "Clothing"|"Shoes"|"Toiletries"|"Accessories"|"Equipment", "quantityType": "fixed"|"per_night"|"per_activity", "reason": string }]

quantityType guide:
- "fixed"        → always pack exactly 1 (e.g. passport, laptop, charger)
- "per_night"    → scales with trip length (e.g. socks, underwear, t-shirts)
- "per_activity" → needed once per matching activity (e.g. golf glove, hiking boots)

Rules:
- Do not include items already in their inventory (listed below).
- Do not include explanatory text outside the JSON array.
- Each "reason" should be one short sentence.

--- TRAVEL STYLE ---
${req.travelStyle}

--- EXISTING INVENTORY ---
${existingList}`;

  const { text, error, status } = await callGeminiSafely(prompt);
  if (!text) return NextResponse.json({ error }, { status });

  return NextResponse.json({ suggestions: parseInventorySuggestions(text) });
}
