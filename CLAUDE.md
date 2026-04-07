# Zip It — Project Spec & Claude Code Instructions

## What This Is

A personal packing list web app (built with Next.js).
The app is called **Zip It**.
The core idea: maintain a master inventory of items tagged to activities,
describe a trip, and get a tailored packing list generated instantly.
No AI in Stage 1 — just clean set logic and a great mobile web experience.

---

## How to Work With Me

- Explain what you're doing and why at each significant step
- Prefer simple, readable code over clever or abstract code
- Don't abstract prematurely — build the obvious thing first
- Comment non-obvious logic clearly
- When you're about to make an architectural decision, flag it and ask
- Build one layer at a time: data → logic → UI. Don't jump ahead.
- Check in after completing each logical unit of work before moving on

---

## UI & Styling Preferences

- Mobile-first layout. Target ~430px max-width, centered on desktop.
- Tailwind CSS for all layout and styling — no component library.
- Bottom nav bar is a fixed `nav` element with two tabs (Home | Inventory).
- Modals are `div` overlays with fixed positioning — no browser `alert()` dialogs.
- Inline error messages in forms, not popups.
- Use `min-h-dvh` for full-height layouts (handles mobile browser chrome correctly).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Navigation | Next.js App Router (file-based) |
| Styling | Tailwind CSS v3 |
| Database | Supabase (Postgres) |
| Auth | None in Stage 1.0 — added in Stage 1.1 |
| AI | Google Gemini (`gemini-2.5-flash`) |
| Deployment | Vercel (free tier) |

---

## Stage Roadmap

**Stage 1.0 — Core**
Fully working app, single user, no auth. Ship something usable.

**Stage 1.1 — Auth**
Add Supabase auth. Add `user_id` to items, trips, activities tables.
Enable Row Level Security. Data follows the user across devices.

**Stage 2 — Smarts (complete)**
- ~~Weather pull based on destination + dates~~
- ~~Trip duration logic (auto-scale quantities)~~
- ~~Conditional item rules~~ *(descoped → issues.md)*
- ~~Lightweight trip history~~
- ~~"Review later" queue for ad-hoc items~~ *(descoped → issues.md)*

**Stage 3 — AI Layer (complete)**
- ~~`gemini-2.5-flash` integration~~
- ~~AI-generated packing suggestions based on trip context~~
- ~~Natural language trip creation~~


**Out of scope for Stage 1.0:**
- Auth / multi-user
- Weather API
- AI / Gemini
- Reminders
- Rules engine
- Trip history
- Sharing

---

## Data Model

### Enums

```sql
create type category_type as enum (
  'Clothing',
  'Shoes',
  'Toiletries',
  'Accessories',
  'Equipment'
);

create type quantity_type as enum (
  'fixed',       -- always bring exactly 1 (laptop, passport)
  'per_night',   -- scales with trip duration (socks, underwear)
  'per_activity' -- scales with number of matching activities (golf shirt per round)
);

create type accommodation_type as enum (
  'Hotel',
  'Airbnb',
  'Camping',
  'Staying with someone',
  'Other'
);
```

### Tables

```sql
-- User-defined activities, preloaded with defaults
create table activities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

insert into activities (name) values
  ('Golf'),
  ('Beach'),
  ('Business'),
  ('Hiking'),
  ('Formal Dinner'),
  ('Casual'),
  ('Ski'),
  ('City Sightseeing');

-- Master inventory of items
create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category category_type not null,
  quantity_type quantity_type not null default 'fixed',
  created_at timestamptz default now()
);

-- Join: items <-> activities (many-to-many)
create table item_activities (
  item_id uuid references items(id) on delete cascade,
  activity_id uuid references activities(id) on delete cascade,
  primary key (item_id, activity_id)
);

-- Trips
create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  accommodation_type accommodation_type not null,
  carry_on_only boolean not null default false,
  laundry_available boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz default now(),
  constraint valid_dates check (end_date >= start_date)
);

-- Join: trips <-> activities (many-to-many)
create table trip_activities (
  trip_id uuid references trips(id) on delete cascade,
  activity_id uuid references activities(id) on delete cascade,
  primary key (trip_id, activity_id)
);

-- Generated packing list entries (one per item per trip)
create table packing_list_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  quantity int not null default 1,
  packed boolean not null default false,
  is_adhoc boolean not null default false, -- true if added directly to trip, not from inventory
  added_to_inventory boolean,              -- null = not yet asked, true = added, false = declined
  created_at timestamptz default now(),
  unique (trip_id, item_id)
);
```

### Stage 1.1 additions (auth — do not build yet)
When auth is added, the following columns are appended to `items`, `trips`, and `activities`:
```sql
user_id uuid references auth.users(id)
```
Row Level Security policies are then enabled on all tables.

---

## Core Business Logic

### Packing List Generation
Triggered when a trip is created.

1. Fetch all activities selected for the trip
2. Find all items WHERE at least one of item's activities intersects trip's activities
3. For each matching item, calculate quantity:
   - `fixed` → 1
   - `per_night` → number of nights (end_date - start_date)
   - `per_activity` → count of activities that match between item and trip
4. Insert one `packing_list_entry` per item with calculated quantity

### Trip Duration
Always derived: `end_date - start_date = nights`. Never stored.

### Trip Status
- Active: not archived, end_date >= today
- Auto-archived: end_date < today (handled at query time, not a cron)
- Manually archived: `archived = true`

### Archive Prompt
- Prompt to archive when packed = 100%
- Option to archive manually at any time via trip menu
- Auto-archive on end_date

### Ad-hoc Items
Items added directly to a trip (not from inventory):
- `is_adhoc = true` on the packing_list_entry
- After adding, prompt: "Add to your master inventory?"
  - **Yes** → open Add Item flow pre-filled with name
  - **Later** → `added_to_inventory = null`, surfaced in Stage 2 review queue
  - **No** → `added_to_inventory = false`, never asked again for this item

---

## Screens

### 1. Home
- No active trips → empty state with "Create your first trip" CTA + nav to inventory
- 1 active trip → trip card front and center with progress indicator
- 2+ active trips → stacked cards ranked by start_date ascending
- Persistent bottom nav: Home | Inventory

### 2. Create Trip
- Fields: name, start date, end date, activities (multi-select), accommodation type, carry-on only (toggle), laundry available (toggle)
- CTA: "Generate Packing List"
- On submit: run generation logic, navigate to Packing List screen

### 3. Packing List
- Header: trip name, dates, "X of Y packed" progress
- Items grouped by category
- Tap item → toggles packed (check + strikethrough)
- FAB: "Add Item" → ad-hoc item flow
- Menu: "Archive Trip"
- 100% packed → prompt to archive

### 4. Inventory — Item List
- Items grouped by category
- "Add Item" button
- Tap item → Edit/Delete options

### 5. Add / Edit Item
- Fields: name, category (select), activities (multi-select), quantity type (select)
- Save / Cancel

### 6. Activities Manager
- Accessible from Inventory screen
- List of all activities
- Add new activity
- Tap activity → edit name or delete
- Cannot delete an activity that has items assigned (show warning)

---

## User Flows

### First Time Setup
```
Open app (no inventory)
→ Empty state prompts inventory setup
→ Activities: review preloaded list, add/remove
→ Items: add items (name, category, activities, quantity type)
→ Inventory ready → home screen
```

### Create a Trip
```
Home → "New Trip"
→ Fill trip form
→ "Generate Packing List"
→ App runs generation logic
→ Navigate to Packing List screen
```

### Pack a Trip
```
Home → tap active trip card
→ Packing List screen
→ Tap items to mark packed
→ Progress updates in real time
→ 100% packed → prompted to archive
```

### Manage Inventory
```
Bottom nav → Inventory
→ Browse items by category
→ Add / edit / delete items
→ Manage activities
```

### Ad-hoc Item
```
Packing List → FAB → "Add Item"
→ Enter item name
→ Item added to trip list (is_adhoc = true)
→ Prompt: "Add to master inventory?" → Yes / Later / No
```

---

## File Structure (Next.js App Router)

```
app/
  layout.tsx              # Root layout + fixed bottom nav (Home | Inventory)
  page.tsx                # Home screen
  globals.css             # Tailwind directives
  trip/
    create/
      page.tsx            # Create trip form
    [id]/
      page.tsx            # Packing list for a trip
  inventory/
    page.tsx              # Item list grouped by category
    item/
      create/
        page.tsx          # Add item
      [id]/
        page.tsx          # Edit item
  activities/
    page.tsx              # Activities manager
  api/
    ai/
      route.ts            # AI suggestion endpoint

lib/
  supabase.ts             # Supabase client
  generation.ts           # Packing list generation logic
  gemini.ts               # Gemini API client

types/
  index.ts                # Shared TypeScript types matching DB schema
```

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Server-only — never expose to client
GEMINI_API_KEY=
```

---

## Future / Parking Lot
- Item-level reminders (e.g. remind me to pack passport night before)
- Default inventory generator
- Trip sharing with travel companions
- "Review later" queue for ad-hoc items (→ issues.md)
- Conditional item rules engine (→ issues.md)
