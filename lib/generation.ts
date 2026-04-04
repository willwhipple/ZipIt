import { supabase } from './supabase';
import type { NewPackingListEntry } from '../types';

/**
 * Generates a packing list for a trip and inserts the entries into the DB.
 *
 * Logic (from spec):
 * 1. Fetch all activity IDs selected for the trip
 * 2. Find all items that share at least one activity with the trip
 * 3. For each matching item, calculate quantity based on quantity_type:
 *    - fixed       → always 1
 *    - per_night   → number of nights (end_date - start_date)
 *    - per_activity → count of overlapping activities between item and trip
 * 4. Batch-insert one packing_list_entry per item
 *
 * Throws on any DB error so the caller can surface it to the user.
 */
export async function generatePackingList(tripId: string): Promise<void> {
  // ── Step 1: Fetch the trip's dates and activity IDs ─────────────────────────

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('start_date, end_date')
    .eq('id', tripId)
    .single();

  if (tripError) throw new Error(`Failed to fetch trip: ${tripError.message}`);

  const { data: tripActivityRows, error: taError } = await supabase
    .from('trip_activities')
    .select('activity_id')
    .eq('trip_id', tripId);

  if (taError) throw new Error(`Failed to fetch trip activities: ${taError.message}`);

  const tripActivityIds = new Set(tripActivityRows.map((r) => r.activity_id));

  // No activities selected → nothing to generate
  if (tripActivityIds.size === 0) return;

  // ── Step 2: Fetch all items that have at least one matching activity ─────────
  // item_activities gives us item_id + activity_id pairs. We then group by item
  // to find the intersection with the trip's activities.

  const { data: itemActivityRows, error: iaError } = await supabase
    .from('item_activities')
    .select('item_id, activity_id')
    .in('activity_id', Array.from(tripActivityIds));

  if (iaError) throw new Error(`Failed to fetch item activities: ${iaError.message}`);

  if (itemActivityRows.length === 0) return;

  // Group matching activity IDs by item_id so we can calculate per_activity qty
  const itemMatchingActivities = new Map<string, string[]>();
  for (const row of itemActivityRows) {
    const existing = itemMatchingActivities.get(row.item_id) ?? [];
    existing.push(row.activity_id);
    itemMatchingActivities.set(row.item_id, existing);
  }

  const matchingItemIds = Array.from(itemMatchingActivities.keys());

  // ── Step 3: Fetch quantity_type for each matching item ───────────────────────

  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('id, quantity_type')
    .in('id', matchingItemIds);

  if (itemsError) throw new Error(`Failed to fetch items: ${itemsError.message}`);

  // Number of nights: end_date - start_date (minimum 1 to avoid 0-quantity rows)
  const nights = Math.max(
    1,
    daysBetween(trip.start_date, trip.end_date),
  );

  // ── Step 4: Build entries and insert ─────────────────────────────────────────

  const entries: NewPackingListEntry[] = items.map((item) => {
    let quantity: number;

    switch (item.quantity_type) {
      case 'fixed':
        quantity = 1;
        break;
      case 'per_night':
        quantity = nights;
        break;
      case 'per_activity':
        // Count how many of the trip's activities match this item's activities
        quantity = (itemMatchingActivities.get(item.id) ?? []).length;
        break;
      default:
        quantity = 1;
    }

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

// Returns the number of days between two ISO date strings (YYYY-MM-DD).
// Uses UTC to avoid daylight-saving edge cases.
function daysBetween(start: string, end: string): number {
  const startMs = Date.UTC(
    ...parseDate(start) as [number, number, number],
  );
  const endMs = Date.UTC(
    ...parseDate(end) as [number, number, number],
  );
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
}

// Splits a YYYY-MM-DD string into [year, month-1, day] for Date.UTC.
function parseDate(iso: string): [number, number, number] {
  const [year, month, day] = iso.split('-').map(Number);
  return [year, month - 1, day]; // month is 0-indexed in JS Date
}
