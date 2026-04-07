import { describe, it, expect } from 'vitest';
import { buildTripContext, parseSuggestions, parseInventorySuggestions, parseTripDescription } from './gemini';
import type { Activity } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseTrip = {
  name: 'Miami Beach',
  start_date: '2025-06-12',
  end_date: '2025-06-18',
  accommodation_type: 'Hotel' as const,
  carry_on_only: false,
  laundry_available: false,
};

const activities: Activity[] = [
  { id: 'a1', name: 'Golf', created_at: '2024-01-01T00:00:00Z' },
  { id: 'a2', name: 'Beach', created_at: '2024-01-01T00:00:00Z' },
];

// ── buildTripContext ───────────────────────────────────────────────────────────

describe('buildTripContext', () => {
  it('includes trip name, dates, and night count', () => {
    const ctx = buildTripContext(baseTrip, activities);
    expect(ctx).toContain('Miami Beach');
    expect(ctx).toContain('2025-06-12');
    expect(ctx).toContain('2025-06-18');
    expect(ctx).toContain('6 nights');
  });

  it('uses singular "1 night" for a one-night trip', () => {
    const trip = { ...baseTrip, start_date: '2025-06-12', end_date: '2025-06-13' };
    expect(buildTripContext(trip, [])).toContain('1 night');
  });

  it('includes activity names', () => {
    const ctx = buildTripContext(baseTrip, activities);
    expect(ctx).toContain('Golf');
    expect(ctx).toContain('Beach');
  });

  it('shows "None" when no activities are provided', () => {
    expect(buildTripContext(baseTrip, [])).toContain('Activities: None');
  });

  it('includes accommodation type', () => {
    expect(buildTripContext(baseTrip, [])).toContain('Hotel');
  });

  it('shows carry-on and laundry flags correctly', () => {
    const ctx1 = buildTripContext({ ...baseTrip, carry_on_only: true, laundry_available: true }, []);
    expect(ctx1).toContain('Carry-on only: Yes');
    expect(ctx1).toContain('Laundry available: Yes');

    const ctx2 = buildTripContext(baseTrip, []);
    expect(ctx2).toContain('Carry-on only: No');
    expect(ctx2).toContain('Laundry available: No');
  });

  it('includes weather when provided', () => {
    const ctx = buildTripContext(baseTrip, [], '85°F, humid');
    expect(ctx).toContain('Weather: 85°F, humid');
  });

  it('omits the weather line when not provided', () => {
    const ctx = buildTripContext(baseTrip, []);
    expect(ctx).not.toContain('Weather:');
  });

  it('handles a same-day trip (0 nights)', () => {
    const trip = { ...baseTrip, start_date: '2025-06-12', end_date: '2025-06-12' };
    expect(buildTripContext(trip, [])).toContain('0 nights');
  });
});

// ── parseSuggestions ──────────────────────────────────────────────────────────

describe('parseSuggestions — valid input', () => {
  it('parses a well-formed JSON array', () => {
    const raw = JSON.stringify([
      { name: 'Sunscreen', category: 'Toiletries', reason: 'Essential for beach days.' },
      { name: 'Golf Glove', category: 'Accessories', reason: 'Useful for your golf activities.' },
    ]);
    const result = parseSuggestions(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'Sunscreen', category: 'Toiletries', reason: 'Essential for beach days.' });
    expect(result[1].name).toBe('Golf Glove');
  });

  it('strips ```json ... ``` code fences', () => {
    const raw = '```json\n[{"name":"Hat","category":"Accessories","reason":"Sun protection."}]\n```';
    const result = parseSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Hat');
  });

  it('strips plain ``` ... ``` code fences', () => {
    const raw = '```\n[{"name":"Hat","category":"Accessories","reason":"Sun protection."}]\n```';
    const result = parseSuggestions(raw);
    expect(result).toHaveLength(1);
  });

  it('trims whitespace from name and reason', () => {
    const raw = JSON.stringify([{ name: '  Sunscreen  ', category: 'Toiletries', reason: '  Good idea.  ' }]);
    const result = parseSuggestions(raw);
    expect(result[0].name).toBe('Sunscreen');
    expect(result[0].reason).toBe('Good idea.');
  });

  it('returns an empty array for an empty JSON array', () => {
    expect(parseSuggestions('[]')).toEqual([]);
  });
});

describe('parseSuggestions — filtering invalid items', () => {
  it('filters out items with an invalid category', () => {
    const raw = JSON.stringify([
      { name: 'Valid Item', category: 'Toiletries', reason: 'Good.' },
      { name: 'Bad Item', category: 'Gadgets', reason: 'Not a real category.' },
    ]);
    const result = parseSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valid Item');
  });

  it('filters out items missing required fields', () => {
    const raw = JSON.stringify([
      { name: 'No Reason', category: 'Clothing' },
      { category: 'Clothing', reason: 'No name.' },
      { name: 'Valid', category: 'Clothing', reason: 'All good.' },
    ]);
    const result = parseSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valid');
  });

  it('filters out items with empty string fields', () => {
    const raw = JSON.stringify([
      { name: '', category: 'Clothing', reason: 'Empty name.' },
      { name: 'Good', category: 'Clothing', reason: '' },
    ]);
    expect(parseSuggestions(raw)).toHaveLength(0);
  });

  it('filters out null entries in the array', () => {
    const raw = JSON.stringify([
      null,
      { name: 'Valid', category: 'Clothing', reason: 'Fine.' },
    ]);
    expect(parseSuggestions(raw)).toHaveLength(1);
  });

  it('accepts all valid category values', () => {
    const categories = ['Clothing', 'Shoes', 'Toiletries', 'Accessories', 'Equipment'];
    for (const category of categories) {
      const raw = JSON.stringify([{ name: 'Item', category, reason: 'Because.' }]);
      expect(parseSuggestions(raw)).toHaveLength(1);
    }
  });
});

describe('parseSuggestions — malformed input', () => {
  it('returns [] for invalid JSON', () => {
    expect(parseSuggestions('not json at all')).toEqual([]);
    expect(parseSuggestions('{}')).toEqual([]); // object, not array
    expect(parseSuggestions('')).toEqual([]);
  });

  it('returns [] when the top-level value is not an array', () => {
    expect(parseSuggestions('"just a string"')).toEqual([]);
    expect(parseSuggestions('42')).toEqual([]);
    expect(parseSuggestions('null')).toEqual([]);
  });
});

// ── parseInventorySuggestions ─────────────────────────────────────────────────

describe('parseInventorySuggestions — valid input', () => {
  it('parses a well-formed array', () => {
    const raw = JSON.stringify([
      { name: 'Passport', category: 'Accessories', quantityType: 'fixed', reason: 'Always required.' },
      { name: 'T-shirt', category: 'Clothing', quantityType: 'per_night', reason: 'One per night.' },
    ]);
    const result = parseInventorySuggestions(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'Passport', category: 'Accessories', quantityType: 'fixed', reason: 'Always required.' });
    expect(result[1].quantityType).toBe('per_night');
  });

  it('accepts all valid quantityType values', () => {
    for (const qt of ['fixed', 'per_night', 'per_activity']) {
      const raw = JSON.stringify([{ name: 'Item', category: 'Clothing', quantityType: qt, reason: 'Fine.' }]);
      expect(parseInventorySuggestions(raw)).toHaveLength(1);
    }
  });

  it('strips code fences', () => {
    const raw = '```json\n[{"name":"Hat","category":"Accessories","quantityType":"fixed","reason":"Sun."}]\n```';
    expect(parseInventorySuggestions(raw)).toHaveLength(1);
  });
});

describe('parseInventorySuggestions — filtering', () => {
  it('filters out items with invalid quantityType', () => {
    const raw = JSON.stringify([
      { name: 'Good', category: 'Clothing', quantityType: 'fixed', reason: 'Fine.' },
      { name: 'Bad', category: 'Clothing', quantityType: 'weekly', reason: 'Not valid.' },
    ]);
    expect(parseInventorySuggestions(raw)).toHaveLength(1);
  });

  it('returns [] for malformed input', () => {
    expect(parseInventorySuggestions('not json')).toEqual([]);
    expect(parseInventorySuggestions('null')).toEqual([]);
  });
});

// ── parseTripDescription ──────────────────────────────────────────────────────

describe('parseTripDescription — valid input', () => {
  it('parses a complete object', () => {
    const raw = JSON.stringify({
      name: 'Paris Weekend',
      destination: 'Paris, France',
      startDate: '2025-09-12',
      endDate: '2025-09-15',
      activities: ['Casual', 'City Sightseeing'],
      accommodationType: 'Hotel',
      carryOnOnly: true,
      laundryAvailable: false,
    });
    const result = parseTripDescription(raw);
    expect(result.name).toBe('Paris Weekend');
    expect(result.destination).toBe('Paris, France');
    expect(result.startDate).toBe('2025-09-12');
    expect(result.endDate).toBe('2025-09-15');
    expect(result.activities).toEqual(['Casual', 'City Sightseeing']);
    expect(result.accommodationType).toBe('Hotel');
    expect(result.carryOnOnly).toBe(true);
    expect(result.laundryAvailable).toBe(false);
  });

  it('strips code fences', () => {
    const raw = '```json\n{"name":"Test Trip"}\n```';
    expect(parseTripDescription(raw).name).toBe('Test Trip');
  });

  it('returns only the fields that are present and valid', () => {
    const raw = JSON.stringify({ name: 'Partial Trip' });
    const result = parseTripDescription(raw);
    expect(result.name).toBe('Partial Trip');
    expect(result.destination).toBeUndefined();
    expect(result.startDate).toBeUndefined();
  });

  it('trims name and destination', () => {
    const raw = JSON.stringify({ name: '  Weekend Trip  ', destination: '  London  ' });
    const result = parseTripDescription(raw);
    expect(result.name).toBe('Weekend Trip');
    expect(result.destination).toBe('London');
  });
});

describe('parseTripDescription — validation', () => {
  it('rejects dates not in YYYY-MM-DD format', () => {
    const raw = JSON.stringify({ startDate: '12/25/2025', endDate: 'next Friday' });
    const result = parseTripDescription(raw);
    expect(result.startDate).toBeUndefined();
    expect(result.endDate).toBeUndefined();
  });

  it('rejects invalid accommodationType', () => {
    const raw = JSON.stringify({ accommodationType: 'Hostel' });
    expect(parseTripDescription(raw).accommodationType).toBeUndefined();
  });

  it('accepts all valid accommodationType values', () => {
    for (const type of ['Hotel', 'Airbnb', 'Camping', 'Staying with someone', 'Other']) {
      const raw = JSON.stringify({ accommodationType: type });
      expect(parseTripDescription(raw).accommodationType).toBe(type);
    }
  });

  it('rejects empty name and destination strings', () => {
    const raw = JSON.stringify({ name: '', destination: '  ' });
    const result = parseTripDescription(raw);
    expect(result.name).toBeUndefined();
    expect(result.destination).toBeUndefined();
  });

  it('filters non-string values out of the activities array', () => {
    const raw = JSON.stringify({ activities: ['Golf', 42, null, 'Beach'] });
    expect(parseTripDescription(raw).activities).toEqual(['Golf', 'Beach']);
  });
});

describe('parseTripDescription — malformed input', () => {
  it('returns {} for invalid JSON', () => {
    expect(parseTripDescription('not json')).toEqual({});
    expect(parseTripDescription('')).toEqual({});
  });

  it('returns {} for non-object top-level values', () => {
    expect(parseTripDescription('[]')).toEqual({});
    expect(parseTripDescription('null')).toEqual({});
    expect(parseTripDescription('"string"')).toEqual({});
  });
});
