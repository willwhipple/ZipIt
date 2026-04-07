// ── Enums ──────────────────────────────────────────────────────────────────────
// These mirror the Postgres enum types defined in the DB schema.

export type CategoryType =
  | 'Clothing'
  | 'Shoes'
  | 'Toiletries'
  | 'Accessories'
  | 'Equipment';

// fixed     → always bring exactly 1 (e.g. laptop, passport)
// per_night → scales with trip duration (e.g. socks, underwear)
// per_activity → scales with matching activity count (e.g. golf shirt per round)
export type QuantityType = 'fixed' | 'per_night' | 'per_activity';

export type AccommodationType =
  | 'Hotel'
  | 'Airbnb'
  | 'Camping'
  | 'Staying with someone'
  | 'Other';

// ── Row types ──────────────────────────────────────────────────────────────────
// One type per DB table. Field names match column names exactly.

export type Activity = {
  id: string;
  name: string;
  created_at: string;
};

export type Item = {
  id: string;
  name: string;
  category: CategoryType;
  quantity_type: QuantityType;
  essential: boolean;
  created_at: string;
};

export type ItemActivity = {
  item_id: string;
  activity_id: string;
};

export type Trip = {
  id: string;
  name: string;
  start_date: string; // ISO date string (YYYY-MM-DD)
  end_date: string;   // ISO date string (YYYY-MM-DD)
  destination: string | null;
  accommodation_type: AccommodationType;
  carry_on_only: boolean;
  laundry_available: boolean;
  archived: boolean;
  created_at: string;
};

export type TripActivity = {
  trip_id: string;
  activity_id: string;
};

export type PackingListEntry = {
  id: string;
  trip_id: string;
  item_id: string;
  quantity: number;
  packed: boolean;
  is_adhoc: boolean;
  // null = not yet asked, true = added to inventory, false = declined
  added_to_inventory: boolean | null;
  created_at: string;
};

// ── Insert types ───────────────────────────────────────────────────────────────
// Used when creating new rows. Omits server-generated fields (id, created_at).

export type NewItem = Omit<Item, 'id' | 'created_at'>;

export type NewTrip = Omit<Trip, 'id' | 'created_at' | 'archived'>;

export type NewPackingListEntry = Omit<PackingListEntry, 'id' | 'created_at'>;

// ── Composite types ────────────────────────────────────────────────────────────
// Used by generation logic and UI — joins that the app frequently needs.

// A trip with its associated activity IDs pre-fetched (avoids a second query).
export type TripWithActivities = Trip & {
  activity_ids: string[];
};

// A packing list entry with the item's details joined in (for display).
export type PackingListEntryWithItem = PackingListEntry & {
  item: Item;
};
