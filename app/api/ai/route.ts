import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import {
  buildTripContext,
  askGemini,
  askGeminiMultimodal,
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
  aboutMe?: string;           // optional user self-description for personalised suggestions
};

type ParseTripDescriptionRequest = {
  action: 'parse_trip_description';
  description: string;
};

type SuggestInventoryItemsRequest = {
  action: 'suggest_inventory_items';
  aboutMe?: string;             // from user profile "About You"
  extraContext?: string;        // additional context entered in the modal
  existingItemNames?: string[]; // names already in inventory — AI won't repeat them
  activityNames?: string[];     // available activity names — AI picks which apply to each item
};

type ParsePackingListRequest = {
  action: 'parse_packing_list';
  text?: string;        // plain text content
  fileData?: string;    // base64 encoded (no data URI prefix)
  mimeType?: string;    // e.g. 'image/jpeg', 'application/pdf'
  activityNames: string[];
};

type AiRequest =
  | SuggestItemsRequest
  | ParseTripDescriptionRequest
  | SuggestInventoryItemsRequest
  | ParsePackingListRequest;

function parseRequest(body: unknown): AiRequest | null {
  if (body === null || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  if (b.action === 'suggest_items') {
    if (typeof b.tripId !== 'string' || b.tripId.trim() === '') return null;
    const existingItems = Array.isArray(b.existingItems)
      ? b.existingItems.filter((x): x is string => typeof x === 'string')
      : [];
    const weatherSummary = typeof b.weatherSummary === 'string' ? b.weatherSummary : undefined;
    const aboutMe = typeof b.aboutMe === 'string' ? b.aboutMe : undefined;
    return { action: 'suggest_items', tripId: b.tripId.trim(), existingItems, weatherSummary, aboutMe };
  }

  if (b.action === 'parse_trip_description') {
    if (typeof b.description !== 'string' || b.description.trim() === '') return null;
    return { action: 'parse_trip_description', description: b.description.trim() };
  }

  if (b.action === 'suggest_inventory_items') {
    const aboutMe = typeof b.aboutMe === 'string' && b.aboutMe.trim() ? b.aboutMe.trim() : undefined;
    const extraContext = typeof b.extraContext === 'string' && b.extraContext.trim() ? b.extraContext.trim() : undefined;
    const existingItemNames = Array.isArray(b.existingItemNames)
      ? b.existingItemNames.filter((x): x is string => typeof x === 'string')
      : [];
    const activityNames = Array.isArray(b.activityNames)
      ? b.activityNames.filter((x): x is string => typeof x === 'string')
      : [];
    return { action: 'suggest_inventory_items', aboutMe, extraContext, existingItemNames, activityNames };
  }

  if (b.action === 'parse_packing_list') {
    const text = typeof b.text === 'string' && b.text.trim() ? b.text.trim() : undefined;
    const fileData = typeof b.fileData === 'string' && b.fileData.trim() ? b.fileData.trim() : undefined;
    const mimeType = typeof b.mimeType === 'string' && b.mimeType.trim() ? b.mimeType.trim() : undefined;
    const activityNames = Array.isArray(b.activityNames)
      ? b.activityNames.filter((x): x is string => typeof x === 'string')
      : [];
    if (!text && !fileData) return null; // must have at least one input
    return { action: 'parse_packing_list', text, fileData, mimeType, activityNames };
  }

  return null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
  if (parsed.action === 'parse_packing_list') return handleParsePackingList(parsed);

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
  const supabase = await createClient();
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, name, start_date, end_date, carry_on_only, laundry_available')
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
    .flatMap((row) => row.activities ?? []) as { id: string; name: string; created_at: string }[];

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('about_me')
    .limit(1)
    .maybeSingle();

  const tripContext = buildTripContext(trip, activities, req.weatherSummary);
  const existingList = req.existingItems?.length ? req.existingItems.join(', ') : 'None';
  const aboutMeSection = prefs?.about_me
    ? `\n--- ABOUT THE TRAVELLER ---\n${prefs.about_me}\n`
    : '';

  const prompt = `You are a packing assistant. Given the trip below, suggest up to 10 items the traveller may have forgotten.

Return ONLY a JSON array of objects with this exact shape:
[{ "name": string, "category": "Clothing"|"Shoes"|"Toiletries"|"Accessories"|"Equipment", "reason": string }]

Rules:
- Do not include items already in their packing list (listed below).
- Do not include explanatory text outside the JSON array.
- Each "reason" should be one short sentence explaining why the item is relevant to this trip.
${aboutMeSection}
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

  const contextParts = [req.aboutMe, req.extraContext].filter(Boolean);
  const contextBlock = contextParts.length > 0
    ? contextParts.join('\n\n')
    : 'No specific context provided.';

  const availableActivities = req.activityNames?.length
    ? req.activityNames.join(', ')
    : 'None';

  const prompt = `You are a packing expert. Based on the traveler context below, suggest up to 15 items for a master packing inventory.

Return ONLY a JSON array of objects with this exact shape:
[{ "name": string, "category": "Clothing"|"Shoes"|"Toiletries"|"Accessories"|"Equipment", "quantityType": "fixed"|"per_night"|"per_activity", "activities": string[], "reason": string }]

quantityType guide:
- "fixed"        → always pack exactly 1 (e.g. passport, laptop, charger)
- "per_night"    → scales with trip length (e.g. socks, underwear, t-shirts)
- "per_activity" → needed once per matching activity (e.g. golf glove, hiking boots)

activities guide:
- Set "activities" to a subset of the available activities listed below that this item is relevant to.
- Use [] if the item applies to all trips regardless of activity (e.g. passport, charger).

Rules:
- Do not include items already in their inventory (listed below).
- Do not include explanatory text outside the JSON array.
- Each "reason" should be one short sentence.

--- TRAVELER CONTEXT ---
${contextBlock}

--- AVAILABLE ACTIVITIES ---
${availableActivities}

--- EXISTING INVENTORY ---
${existingList}`;

  const { text, error, status } = await callGeminiSafely(prompt);
  if (!text) return NextResponse.json({ error }, { status });

  return NextResponse.json({ suggestions: parseInventorySuggestions(text) });
}

// ── parse_packing_list ────────────────────────────────────────────────────────

async function handleParsePackingList(req: ParsePackingListRequest) {
  const availableActivities = req.activityNames.length
    ? req.activityNames.join(', ')
    : 'None';

  const prompt = `You are a packing list parser. Extract all packing items from the content below and return them in this exact JSON shape:
[{ "name": string, "category": "Clothing"|"Shoes"|"Toiletries"|"Accessories"|"Equipment", "quantityType": "fixed"|"per_night"|"per_activity", "activities": string[], "reason": string }]

quantityType guide:
- "fixed"        → always pack exactly 1 (passport, laptop, charger)
- "per_night"    → scales with trip length (socks, underwear, t-shirts)
- "per_activity" → needed once per matching activity (golf glove, hiking boots)

Map "activities" to a subset of these available activities: ${availableActivities}
Use [] if the item is universal (passport, charger, etc.).
Do not add explanatory text outside the JSON array.
${req.text ? `\n--- CONTENT ---\n${req.text}` : ''}`;

  let rawText: string | null = null;
  let error: string | null = null;
  let status = 200;

  try {
    const inlineData = req.fileData && req.mimeType
      ? { data: req.fileData, mimeType: req.mimeType }
      : undefined;
    rawText = await askGeminiMultimodal(prompt, inlineData);
  } catch (err) {
    if (err instanceof GeminiError) {
      const isTimeout = err.message.includes('timed out');
      const isMisconfig = err.message.includes('not set');
      console.error('[ai/route] Gemini error:', err.message, err.cause ?? '');
      error = err.message;
      status = isTimeout ? 504 : isMisconfig ? 500 : 503;
    } else {
      console.error('[ai/route] Unexpected error:', err);
      error = 'AI unavailable';
      status = 503;
    }
  }

  if (!rawText) return NextResponse.json({ error }, { status });
  return NextResponse.json({ suggestions: parseInventorySuggestions(rawText) });
}
