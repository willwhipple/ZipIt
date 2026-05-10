# Zip It — Project Spec & Claude Code Instructions

## What This Is

A personal packing list web app (built with Next.js).
The app is called **Zip It**.
The core idea: maintain a master inventory of items tagged to activities,
describe a trip, and get a tailored packing list generated instantly.

---

## How to Work With Me

- Explain what you're doing and why at each significant step
- Prefer simple, readable code over clever or abstract code
- Don't abstract prematurely — build the obvious thing first
- Comment non-obvious logic clearly
- When you're about to make an architectural decision, flag it and ask
- Build one layer at a time: data → logic → UI. Don't jump ahead.
- Check in after completing each logical unit of work before moving on
- After completing any change that affects the app's structure, data model, business logic, screens, or file layout, update the relevant sections of `CLAUDE.md` to reflect the new state — keep it current so it stays the authoritative reference

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
| Auth | Supabase (email/password + password reset) |
| AI | Google Gemini (`gemini-2.5-flash`) |
| Weather | Open-Meteo (forecast ≤16 days; climatology beyond 16 days) |
| Deployment | Vercel (free tier) |

---

## What's Built

- Multi-user app with Supabase email/password auth and RLS (`user_id` via `DEFAULT auth.uid()`)
- Inventory management (items, activities, categories, essential flag, quantity types)
- Trip creation with natural language parsing (Gemini)
- Packing list generation (activity matching, essential items, laundry cap)
- Weather integration (Open-Meteo, shown on trip detail)
- AI packing suggestions and AI inventory prefill (Gemini 2.5 Flash)
- Packing list import from text, image, or PDF
- Onboarding wizard for new users
- Trip history, settings, PWA support

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
  essential boolean not null default false,
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
  destination text,
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

-- Per-user preferences (one row per user, seeded on first sign-in)
create table user_preferences (
  id uuid primary key default gen_random_uuid(),
  temperature_unit text not null default 'celsius', -- 'celsius' | 'fahrenheit'
  laundry_style text not null default 'moderate',   -- 'frequent' | 'moderate' | 'infrequent'
  about_me text,
  onboarding_completed boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Auth & RLS

Row Level Security is enabled on all tables. The `user_id` column on `items`, `activities`, `trips`, and `user_preferences` uses `DEFAULT auth.uid()` — app code never passes `user_id` explicitly. Join tables (`item_activities`, `trip_activities`, `packing_list_entries`) are protected via parent-row EXISTS checks. New users get default activities seeded by an `after insert on auth.users` trigger.

---

## Core Business Logic

### Packing List Generation
Triggered when a trip is created.

1. Fetch the trip's dates and `laundry_available` flag
2. Fetch the user's `laundry_style` from `user_preferences` (defaults to `moderate`)
3. Include all **essential** items (`essential = true`) unconditionally
4. Find non-essential items where at least one activity intersects the trip's activities
5. Merge and deduplicate by item_id
6. For each included item, calculate quantity:
   - `fixed` → 1
   - `per_night` → number of nights; if `laundry_available`, cap by laundry style (see Laundry Cap below); floor to 1
   - `per_activity` → count of overlapping activities (essential items with no activities default to 1)
7. Batch-insert one `packing_list_entry` per item

### Essential Items
Items with `essential = true` are automatically included on every packing list regardless of which activities are selected for the trip.

### Laundry Cap
When `laundry_available = true`, `per_night` quantities are capped based on the user's `laundry_style` preference:

| Style | Cap |
|---|---|
| frequent | 3 nights |
| moderate | 5 nights |
| infrequent | 6 nights |

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
  - **Later** → `added_to_inventory = null`, surfaced in the "Review Later" queue (not yet built)
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

### 7. Login
- Email/password sign-in and sign-up
- Forgot password → email reset link → `/auth/reset`
- Unauthenticated users are redirected here by middleware

### 8. Onboarding
- Shown to new users after first sign-in (`onboarding_completed = false`)
- Multi-step: walkthrough → About Me → activities review → choose path (AI prefill or manual) → review
- AI prefill calls `suggest_inventory_items` with the user's `about_me`
- Supports importing an existing packing list (text or image/PDF via `parse_packing_list`)
- Sets `onboarding_completed = true` on completion

### 9. Trip History
- Lists all archived trips (manually archived or past end date)
- Tap a trip to view its read-only packing list

### 10. Settings
- Toggle temperature unit (°C / °F)
- Set laundry style (Frequent / Moderate / Infrequent)
- Edit "About Me" (used by AI for personalised suggestions)
- Sign out button

---

## User Flows

### First Time Setup
```
Sign up → email confirmation → sign in
→ Onboarding wizard (About Me → activities → AI prefill or manual import)
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
  layout.tsx              # Root layout (PWA metadata, font)
  ClientLayout.tsx        # Client wrapper: auth guard, bottom nav, onboarding redirect
  page.tsx                # Home screen
  globals.css             # Tailwind directives + CSS custom properties
  manifest.ts             # PWA manifest
  login/
    page.tsx              # Sign in / sign up / forgot password
  onboarding/
    page.tsx              # New-user onboarding wizard
  settings/
    page.tsx              # User preferences + sign out
  auth/
    callback/
      route.ts            # OAuth / email-link callback handler
    reset/
      page.tsx            # Password reset (after email link)
  trip/
    create/
      page.tsx            # Create trip form (supports NL parsing)
    [id]/
      page.tsx            # Packing list + weather + AI suggestions
  trips/
    history/
      page.tsx            # Archived trip list
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
      route.ts            # AI endpoint (suggest_items, parse_trip_description,
                          #   suggest_inventory_items, parse_packing_list)

lib/
  supabase/
    client.ts             # Browser Supabase client
    server.ts             # Server Supabase client (API routes + server components)
  generation.ts           # Packing list generation logic
  generation.test.ts      # Vitest unit tests
  gemini.ts               # Gemini API client + prompt helpers
  gemini.test.ts          # Vitest unit tests

middleware.ts             # Session refresh + auth redirect guard

components/               # Shared UI components (AppLogo, LuggageSpinner, etc.)
  ui/                     # Reusable primitives (Button, Chip, Input, etc.)

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
# Optional — used by Vitest to skip live API calls in CI
SKIP_LIVE_API_TESTS=true
```

---

## Future / Parking Lot

- **Conditional Item Rules Engine** — conditionally include items based on trip context (e.g. "bring neck pillow when flight > 4 hrs"); requires a new `rules` table and an evaluation pass during generation
- **"Review Later" Queue** — surface items where `added_to_inventory = null` so the user can decide to add or dismiss them; could live as a banner on the Inventory screen
- **Trip Templates** — save a trip configuration (activities, accommodation, carry-on, laundry) to reuse for future trips
- **AI Gemini Free Tier Quota** — detect 429s from Gemini and show a distinct "AI is busy" message rather than a generic error
- **Calendar Integration** — pull events during trip dates and factor them into activity selection or suggestions
- **Travel Mode** — add "How are you getting there?" to Create Trip (Flying / Train / Driving / Other); Driving = no luggage restrictions
- **Item-level reminders** — remind user to pack specific items (e.g. passport) the night before departure
- **Trip sharing** — share a packing list with travel companions
