import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Trip, Activity, CategoryType, QuantityType, AiSuggestion, InventorySuggestion, ParsedTripDescription } from '../types';

// Re-export AI types so callers can import from one place.
export type { AiSuggestion, InventorySuggestion, ParsedTripDescription };

// ── Error type ────────────────────────────────────────────────────────────────

// Typed error so callers can distinguish AI failures from other errors.
export class GeminiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'GeminiError';
  }
}

// ── Client ────────────────────────────────────────────────────────────────────

// Lazily instantiated so missing API key only throws at call time, not import time.
// This prevents test imports from failing when GEMINI_API_KEY is not set.
let _model: ReturnType<InstanceType<typeof GoogleGenerativeAI>['getGenerativeModel']> | null = null;

function getModel() {
  if (_model) return _model;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY is not set');
  const genAI = new GoogleGenerativeAI(apiKey);
  _model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  return _model;
}

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Serialises trip context into a plain-text block injected into prompts.
 * weather is optional — if provided it's included as a context line.
 */
export function buildTripContext(
  trip: Pick<Trip, 'name' | 'start_date' | 'end_date' | 'carry_on_only' | 'laundry_available'>,
  activities: Pick<Activity, 'name'>[],
  weather?: string
): string {
  const nights = daysBetween(trip.start_date, trip.end_date);
  const nightLabel = nights === 1 ? '1 night' : `${nights} nights`;
  const activityNames = activities.map((a) => a.name).join(', ') || 'None';

  const lines = [
    `Trip: ${trip.name}`,
    `Dates: ${trip.start_date} to ${trip.end_date} (${nightLabel})`,
    `Activities: ${activityNames}`,
    `Carry-on only: ${trip.carry_on_only ? 'Yes' : 'No'}`,
    `Laundry available: ${trip.laundry_available ? 'Yes' : 'No'}`,
  ];

  if (weather) lines.push(`Weather: ${weather}`);

  return lines.join('\n');
}

function daysBetween(start: string, end: string): number {
  const toUtcMs = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtcMs(end) - toUtcMs(start)) / (1000 * 60 * 60 * 24));
}

// ── Call wrapper ──────────────────────────────────────────────────────────────

const TIMEOUT_MS = 30_000;

/**
 * Sends a prompt to Gemini and returns the raw text response.
 * Throws GeminiError on timeout, SDK error, or empty response.
 * Parsing and validation are the caller's responsibility.
 */
export async function askGemini(prompt: string): Promise<string> {
  const model = getModel(); // throws GeminiError if key is missing

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new GeminiError('Gemini request timed out')), TIMEOUT_MS)
  );

  try {
    const result = await Promise.race([
      model.generateContent(prompt),
      timeoutPromise,
    ]);

    const text = result.response.text();
    if (!text) throw new GeminiError('Gemini returned an empty response');
    return text;
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    throw new GeminiError('Gemini request failed', err);
  }
}

/**
 * Like askGemini but accepts an optional binary file (image or PDF) alongside the text prompt.
 * Uses the Gemini multimodal API (inline data parts).
 */
export async function askGeminiMultimodal(
  prompt: string,
  inlineData?: { data: string; mimeType: string }
): Promise<string> {
  const model = getModel();

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new GeminiError('Gemini request timed out')), TIMEOUT_MS)
  );

  type Part = { text: string } | { inlineData: { data: string; mimeType: string } };
  const parts: Part[] = [{ text: prompt }];
  if (inlineData) parts.push({ inlineData });

  try {
    const result = await Promise.race([
      model.generateContent(parts),
      timeoutPromise,
    ]);
    const text = result.response.text();
    if (!text) throw new GeminiError('Gemini returned an empty response');
    return text;
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    throw new GeminiError('Gemini request failed', err);
  }
}

// ── Response parsers ──────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set<string>([
  'Clothing', 'Shoes', 'Toiletries', 'Accessories', 'Equipment',
]);

const VALID_QUANTITY_TYPES = new Set<string>(['fixed', 'per_night', 'per_activity']);

/**
 * Strips optional markdown code fences from a raw AI response.
 * Gemini sometimes wraps JSON in ```json ... ```.
 */
function stripCodeFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

/**
 * Parses the raw Gemini text into an array of AiSuggestion objects (trip items).
 * Filters out any element that fails shape/enum validation.
 * Returns [] on completely malformed input rather than throwing.
 */
export function parseSuggestions(raw: string): AiSuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const suggestions: AiSuggestion[] = [];
  for (const item of parsed) {
    if (
      item !== null &&
      typeof item === 'object' &&
      typeof item.name === 'string' && item.name.trim() !== '' &&
      typeof item.category === 'string' && VALID_CATEGORIES.has(item.category) &&
      typeof item.reason === 'string' && item.reason.trim() !== ''
    ) {
      suggestions.push({
        name: item.name.trim(),
        category: item.category as CategoryType,
        reason: item.reason.trim(),
      });
    }
  }

  return suggestions;
}

/**
 * Parses the raw Gemini text into an array of InventorySuggestion objects.
 * Used for the inventory prefill feature.
 * Filters out items with invalid fields; returns [] on malformed input.
 */
export function parseInventorySuggestions(raw: string): InventorySuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const suggestions: InventorySuggestion[] = [];
  for (const item of parsed) {
    if (
      item !== null &&
      typeof item === 'object' &&
      typeof item.name === 'string' && item.name.trim() !== '' &&
      typeof item.category === 'string' && VALID_CATEGORIES.has(item.category) &&
      typeof item.quantityType === 'string' && VALID_QUANTITY_TYPES.has(item.quantityType) &&
      typeof item.reason === 'string' && item.reason.trim() !== ''
    ) {
      suggestions.push({
        name: item.name.trim(),
        category: item.category as CategoryType,
        quantityType: item.quantityType as QuantityType,
        reason: item.reason.trim(),
        activities: Array.isArray(item.activities)
          ? (item.activities as unknown[]).filter((a): a is string => typeof a === 'string' && a.trim() !== '')
          : [],
      });
    }
  }

  return suggestions;
}

/**
 * Parses the raw Gemini text into a ParsedTripDescription object.
 * Used for natural language trip creation.
 * Only returns fields that are present and pass validation.
 * Returns {} on malformed input rather than throwing.
 */
export function parseTripDescription(raw: string): ParsedTripDescription {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return {};
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const obj = parsed as Record<string, unknown>;
  const result: ParsedTripDescription = {};
  const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;

  if (typeof obj.name === 'string' && obj.name.trim()) result.name = obj.name.trim();
  if (typeof obj.destination === 'string' && obj.destination.trim()) result.destination = obj.destination.trim();
  if (typeof obj.startDate === 'string' && isoDateRe.test(obj.startDate)) result.startDate = obj.startDate;
  if (typeof obj.endDate === 'string' && isoDateRe.test(obj.endDate)) result.endDate = obj.endDate;
  if (Array.isArray(obj.activities)) {
    const names = obj.activities.filter((a): a is string => typeof a === 'string' && a.trim() !== '');
    if (names.length > 0) result.activities = names;
  }
  if (typeof obj.carryOnOnly === 'boolean') result.carryOnOnly = obj.carryOnOnly;
  if (typeof obj.laundryAvailable === 'boolean') result.laundryAvailable = obj.laundryAvailable;

  return result;
}
