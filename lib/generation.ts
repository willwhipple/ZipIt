import type { SupabaseClient } from '@supabase/supabase-js';
import type { LaundryStyle, NewPackingListEntry } from '../types';

// Maps the user's laundry style preference to a night cap for per_night items.
// When laundry is available, per_night quantities are capped at this many nights.
// "frequent" packers wash clothes often so need fewer; "infrequent" need more buffer.
export const LAUNDRY_CAP_MAP: Record<LaundryStyle, number> = {
  frequent: 3,
  moderate: 5,
  infrequent: 6,
};

/**
 * Generates a packing list for a trip and inserts the entries into the DB.
 *
 * Logic:
 * 1. Fetch all activity IDs selected for the trip
 * 2. Always include essential items (essential = true)
 * 3. Also include non-essential items that share at least one activity with the trip
 * 4. For each included item, calculate quantity based on quantity_type:
 *    - fixed        → always 1
 *    - per_night    → number of nights (end_date - start_date)
 *    - per_activity → count of overlapping activities (essential items default to 1)
 * 5. Batch-insert one packing_list_entry per item
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generatePackingList(supabase: SupabaseClient<any>, tripId: string): Promise<void> {
  // ── Step 1: Fetch the trip's dates and activity IDs ─────────────────────────

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('start_date, end_date, laundry_available')
    .eq('id', tripId)
    .single();

  if (tripError) throw new Error(`Failed to fetch trip: ${tripError.message}`);

  const { data: tripActivityRows, error: taError } = await supabase
    .from('trip_activities')
    .select('activity_id')
    .eq('trip_id', tripId);

  if (taError) throw new Error(`Failed to fetch trip activities: ${taError.message}`);

  const tripActivityIds = new Set(tripActivityRows.map((r) => r.activity_id));

  // Number of nights: end_date - start_date (minimum 1 to avoid 0-quantity rows)
  const nights = Math.max(1, daysBetween(trip.start_date, trip.end_date));

  // ── Step 1b: Fetch the user's laundry style preference ──────────────────────
  // Falls back to 'moderate' if the row is missing (shouldn't happen after seeding).
  const { data: prefsRow } = await supabase
    .from('user_preferences')
    .select('laundry_style')
    .limit(1)
    .maybeSingle();

  const laundryCap = LAUNDRY_CAP_MAP[(prefsRow?.laundry_style ?? 'moderate') as LaundryStyle];

  // ── Step 2: Fetch all essential items ───────────────────────────────────────
  // These are always included regardless of trip activities.

  const { data: essentialItems, error: essentialError } = await supabase
    .from('items')
    .select('id, quantity_type')
    .eq('essential', true);

  if (essentialError) throw new Error(`Failed to fetch essential items: ${essentialError.message}`);

  // ── Step 3: Fetch non-essential items with matching activities ───────────────

  // Maps item_id → array of matching activity IDs (for per_activity quantity)
  const itemMatchingActivities = new Map<string, string[]>();

  if (tripActivityIds.size > 0) {
    const { data: itemActivityRows, error: iaError } = await supabase
      .from('item_activities')
      .select('item_id, activity_id')
      .in('activity_id', Array.from(tripActivityIds));

    if (iaError) throw new Error(`Failed to fetch item activities: ${iaError.message}`);

    for (const row of itemActivityRows) {
      const existing = itemMatchingActivities.get(row.item_id) ?? [];
      existing.push(row.activity_id);
      itemMatchingActivities.set(row.item_id, existing);
    }
  }

  // ── Step 4: Fetch quantity_type for non-essential matched items ──────────────
  // (Essential items are already fetched with quantity_type above)

  const activityMatchedItemIds = Array.from(itemMatchingActivities.keys());

  let activityMatchedItems: { id: string; quantity_type: string }[] = [];
  if (activityMatchedItemIds.length > 0) {
    const { data, error } = await supabase
      .from('items')
      .select('id, quantity_type')
      .in('id', activityMatchedItemIds)
      .eq('essential', false); // exclude essentials already covered above

    if (error) throw new Error(`Failed to fetch activity-matched items: ${error.message}`);
    activityMatchedItems = data ?? [];
  }

  // ── Step 5: Merge essential + activity-matched items ────────────────────────
  // Use a Map to deduplicate by item_id (shouldn't happen in practice, but safe).

  const allItems = new Map<string, { id: string; quantity_type: string; isEssential: boolean }>();

  for (const item of essentialItems ?? []) {
    allItems.set(item.id, { ...item, isEssential: true });
  }
  for (const item of activityMatchedItems) {
    if (!allItems.has(item.id)) {
      allItems.set(item.id, { ...item, isEssential: false });
    }
  }

  if (allItems.size === 0) return;

  // ── Step 6: Build entries and insert ─────────────────────────────────────────

  const entries: NewPackingListEntry[] = Array.from(allItems.values()).map((item) => {
    const matchCount = item.isEssential
      ? 0
      : (itemMatchingActivities.get(item.id) ?? []).length;
    const quantity = calculateQuantity(item.quantity_type, nights, matchCount, item.isEssential, trip.laundry_available, laundryCap);

    return {
      trip_id: tripId,
      item_id: item.id,
      quantity,
      packed: false,
      is_adhoc: false,
      added_to_inventory: null,
    };
  });

  const { error: insertError } = await supabase
    .from('packing_list_entries')
    .insert(entries);

  if (insertError) {
    throw new Error(`Failed to insert packing list entries: ${insertError.message}`);
  }
}

// Returns the quantity for one item given trip context.
// Exported for unit testing.
export function calculateQuantity(
  quantityType: string,
  nights: number,
  matchingActivityCount: number,
  isEssential: boolean = false,
  laundryAvailable: boolean = false,
  laundryCap: number = LAUNDRY_CAP_MAP.moderate
): number {
  switch (quantityType) {
    case 'fixed':
      return 1;
    case 'per_night': {
      // If laundry is available, cap at laundryCap nights — no need to pack
      // the full trip's worth of clothes when you can wash them.
      // Floor to 1 so same-day trips never produce 0-quantity rows.
      const effective = laundryAvailable ? Math.min(nights, laundryCap) : nights;
      return Math.max(1, effective);
    }
    case 'per_activity':
      // Essential items have no activity match context → default to 1.
      return isEssential ? 1 : matchingActivityCount;
    default:
      return 1;
  }
}

// Returns the number of days between two ISO date strings (YYYY-MM-DD).
// Uses UTC to avoid daylight-saving edge cases.
// Exported for unit testing.
export function daysBetween(start: string, end: string): number {
  const startMs = Date.UTC(...parseDate(start) as [number, number, number]);
  const endMs = Date.UTC(...parseDate(end) as [number, number, number]);
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
}

// Splits a YYYY-MM-DD string into [year, month-1, day] for Date.UTC.
function parseDate(iso: string): [number, number, number] {
  const [year, month, day] = iso.split('-').map(Number);
  return [year, month - 1, day]; // month is 0-indexed in JS Date
}
