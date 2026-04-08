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

// ── User preferences ───────────────────────────────────────────────────────────

export type TemperatureUnit = 'celsius' | 'fahrenheit';
export type LaundryStyle = 'frequent' | 'moderate' | 'infrequent';

export type UserPreferences = {
  id: string;
  temperature_unit: TemperatureUnit;
  laundry_style: LaundryStyle;
  about_me: string | null;
  created_at: string;
  updated_at: string;
};

// ── AI types ───────────────────────────────────────────────────────────────────

// A packing item suggested by the AI for a specific trip.
export type AiSuggestion = {
  name: string;
  category: CategoryType;
  reason: string;
};

// An inventory item suggested by the AI based on travel style.
export type InventorySuggestion = {
  name: string;
  category: CategoryType;
  quantityType: QuantityType;
  reason: string;
  activities: string[]; // activity names suggested by the AI
};

// Trip fields extracted from a natural language description.
export type ParsedTripDescription = {
  name?: string;
  destination?: string;
  startDate?: string;        // YYYY-MM-DD
  endDate?: string;          // YYYY-MM-DD
  activities?: string[];     // activity names
  accommodationType?: AccommodationType;
  carryOnOnly?: boolean;
  laundryAvailable?: boolean;
};

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
