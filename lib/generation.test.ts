import { describe, it, expect, vi } from 'vitest';

// Supabase initializes at module scope and requires env vars.
// Mock it so the pure utility exports can be imported without a real DB connection.
vi.mock('./supabase', () => ({ supabase: {} }));

import { calculateQuantity, daysBetween, LAUNDRY_CAP_MAP } from './generation';

const LAUNDRY_CAP = LAUNDRY_CAP_MAP.moderate;

// ── calculateQuantity ─────────────────────────────────────────────────────────

describe('calculateQuantity — fixed', () => {
  it('returns 1 regardless of nights or activity count', () => {
    expect(calculateQuantity('fixed', 0, 0)).toBe(1);
    expect(calculateQuantity('fixed', 7, 3)).toBe(1);
    expect(calculateQuantity('fixed', 14, 0, true)).toBe(1);
  });
});

describe('calculateQuantity — per_night', () => {
  it('returns the number of nights for a normal trip', () => {
    expect(calculateQuantity('per_night', 7, 0)).toBe(7);
    expect(calculateQuantity('per_night', 1, 0)).toBe(1);
    expect(calculateQuantity('per_night', 14, 0)).toBe(14);
  });

  it('floors to 1 for a same-day trip (0 nights) to avoid 0-quantity rows', () => {
    expect(calculateQuantity('per_night', 0, 0)).toBe(1);
  });

  it('ignores activity count', () => {
    expect(calculateQuantity('per_night', 5, 3)).toBe(5);
  });
});

describe('calculateQuantity — per_activity', () => {
  it('returns the number of matching activities', () => {
    expect(calculateQuantity('per_activity', 0, 3)).toBe(3);
    expect(calculateQuantity('per_activity', 0, 2)).toBe(2);
  });

  it('returns 1 when only a single activity matches', () => {
    expect(calculateQuantity('per_activity', 0, 1)).toBe(1);
  });

  it('returns 1 for essential items regardless of activity count', () => {
    expect(calculateQuantity('per_activity', 0, 0, true)).toBe(1);
    expect(calculateQuantity('per_activity', 0, 3, true)).toBe(1);
  });
});

describe('calculateQuantity — per_night with laundry', () => {
  it('floors to 1 for a same-day trip even with laundry', () => {
    expect(calculateQuantity('per_night', 0, 0, false, true)).toBe(1);
  });

  it('returns nights when under the cap', () => {
    expect(calculateQuantity('per_night', 1, 0, false, true)).toBe(1);
    expect(calculateQuantity('per_night', 3, 0, false, true)).toBe(3);
  });

  it('returns nights when exactly at the cap', () => {
    expect(calculateQuantity('per_night', LAUNDRY_CAP, 0, false, true)).toBe(LAUNDRY_CAP);
  });

  it('caps at LAUNDRY_CAP for trips longer than the cap', () => {
    expect(calculateQuantity('per_night', 7, 0, false, true)).toBe(LAUNDRY_CAP);
    expect(calculateQuantity('per_night', 14, 0, false, true)).toBe(LAUNDRY_CAP);
    expect(calculateQuantity('per_night', 30, 0, false, true)).toBe(LAUNDRY_CAP);
  });

  it('does not cap when laundry is unavailable (regression)', () => {
    expect(calculateQuantity('per_night', 7, 0, false, false)).toBe(7);
    expect(calculateQuantity('per_night', 14, 0)).toBe(14); // default false
  });

  it('does not apply laundry cap to fixed or per_activity items', () => {
    expect(calculateQuantity('fixed', 14, 0, false, true)).toBe(1);
    expect(calculateQuantity('per_activity', 14, 3, false, true)).toBe(3);
  });
});

describe('calculateQuantity — unknown type', () => {
  it('returns 1 as a safe default', () => {
    expect(calculateQuantity('mystery', 7, 3)).toBe(1);
    expect(calculateQuantity('', 0, 0)).toBe(1);
  });
});

// ── daysBetween ───────────────────────────────────────────────────────────────

describe('daysBetween', () => {
  it('returns 0 for the same day', () => {
    expect(daysBetween('2025-06-01', '2025-06-01')).toBe(0);
  });

  it('returns 1 for consecutive days', () => {
    expect(daysBetween('2025-06-01', '2025-06-02')).toBe(1);
  });

  it('handles a cross-month boundary correctly', () => {
    expect(daysBetween('2025-01-28', '2025-02-03')).toBe(6);
  });

  it('handles a cross-year boundary correctly', () => {
    expect(daysBetween('2024-12-29', '2025-01-05')).toBe(7);
  });
});
