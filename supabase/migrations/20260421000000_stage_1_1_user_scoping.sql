-- Stage 1.1: User scoping — add user_id columns, RLS policies, signup trigger, system_items table
-- Run this migration via the Supabase SQL editor or CLI.
-- IMPORTANT: Run against a database that has no real user data yet, or backfill user_id on
-- existing rows before enabling RLS (NULL user_id rows will become invisible to all users).

-- ── 1. Add user_id columns ────────────────────────────────────────────────────

alter table activities add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table items      add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table trips      add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- ── 2. Update unique constraint on activities (name must be unique per user) ──

alter table activities drop constraint if exists activities_name_key;
alter table activities add constraint activities_name_user_key unique (name, user_id);

-- ── 3. System starter pack table for items ────────────────────────────────────
-- Read-only for app users; seeded manually by admins.
-- activity_names is a text array of activity names to auto-link when a user copies
-- a system item into their inventory (resolved at copy time via the user's own activities).

create table if not exists system_items (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       category_type not null,
  quantity_type  quantity_type not null default 'fixed',
  essential      boolean not null default false,
  activity_names text[] not null default '{}'
);

-- ── 4. Seed system_items ──────────────────────────────────────────────────────

insert into system_items (name, category, quantity_type, essential, activity_names) values
  -- Essentials (no activity tag — appear on every trip)
  ('Passport',               'Accessories', 'fixed',    true,  '{}'),
  ('Phone charger',          'Accessories', 'fixed',    true,  '{}'),
  ('Travel adapter',         'Accessories', 'fixed',    true,  '{}'),
  ('Wallet',                 'Accessories', 'fixed',    true,  '{}'),
  ('Keys',                   'Accessories', 'fixed',    true,  '{}'),
  ('Toothbrush',             'Toiletries',  'fixed',    true,  '{}'),
  ('Toothpaste',             'Toiletries',  'fixed',    true,  '{}'),
  ('Deodorant',              'Toiletries',  'fixed',    true,  '{}'),
  ('Shampoo',                'Toiletries',  'fixed',    true,  '{}'),
  ('Moisturiser',            'Toiletries',  'fixed',    true,  '{}'),
  ('Sunscreen',              'Toiletries',  'fixed',    true,  '{}'),
  ('Headphones',             'Accessories', 'fixed',    true,  '{}'),
  ('Laptop',                 'Equipment',   'fixed',    true,  '{}'),
  -- Clothing (per night)
  ('T-shirt',                'Clothing',    'per_night', false, '{"Casual","City Sightseeing"}'),
  ('Underwear',              'Clothing',    'per_night', true,  '{}'),
  ('Socks',                  'Clothing',    'per_night', true,  '{}'),
  ('Jeans',                  'Clothing',    'fixed',    false, '{"Casual","City Sightseeing"}'),
  ('Pyjamas',                'Clothing',    'fixed',    true,  '{}'),
  -- Business
  ('Dress shirt',            'Clothing',    'per_activity', false, '{"Business","Formal Dinner"}'),
  ('Suit jacket',            'Clothing',    'fixed',    false, '{"Business","Formal Dinner"}'),
  ('Dress trousers',         'Clothing',    'fixed',    false, '{"Business","Formal Dinner"}'),
  ('Dress shoes',            'Shoes',       'fixed',    false, '{"Business","Formal Dinner"}'),
  -- Golf
  ('Golf shirt',             'Clothing',    'per_activity', false, '{"Golf"}'),
  ('Golf shorts',            'Clothing',    'per_activity', false, '{"Golf"}'),
  ('Golf shoes',             'Shoes',       'fixed',    false, '{"Golf"}'),
  ('Golf glove',             'Accessories', 'fixed',    false, '{"Golf"}'),
  -- Beach
  ('Swimsuit',               'Clothing',    'fixed',    false, '{"Beach"}'),
  ('Beach towel',            'Accessories', 'fixed',    false, '{"Beach"}'),
  ('Flip flops',             'Shoes',       'fixed',    false, '{"Beach"}'),
  ('Sunglasses',             'Accessories', 'fixed',    false, '{"Beach","City Sightseeing"}'),
  -- Hiking
  ('Hiking boots',           'Shoes',       'fixed',    false, '{"Hiking"}'),
  ('Hiking socks',           'Clothing',    'per_activity', false, '{"Hiking"}'),
  ('Rain jacket',            'Clothing',    'fixed',    false, '{"Hiking"}'),
  ('Backpack',               'Equipment',   'fixed',    false, '{"Hiking"}'),
  ('Water bottle',           'Equipment',   'fixed',    false, '{"Hiking","Beach"}'),
  -- Ski
  ('Ski jacket',             'Clothing',    'fixed',    false, '{"Ski"}'),
  ('Ski trousers',           'Clothing',    'fixed',    false, '{"Ski"}'),
  ('Thermal base layer',     'Clothing',    'fixed',    false, '{"Ski","Hiking"}'),
  ('Ski gloves',             'Accessories', 'fixed',    false, '{"Ski"}'),
  ('Ski goggles',            'Accessories', 'fixed',    false, '{"Ski"}'),
  ('Ski helmet',             'Equipment',   'fixed',    false, '{"Ski"}'),
  ('Ski socks',              'Clothing',    'per_activity', false, '{"Ski"}'),
  -- Formal
  ('Dress / evening wear',   'Clothing',    'fixed',    false, '{"Formal Dinner"}'),
  ('Heels / formal shoes',   'Shoes',       'fixed',    false, '{"Formal Dinner"}');

-- ── 5. Enable RLS on all tables ───────────────────────────────────────────────

alter table activities          enable row level security;
alter table items               enable row level security;
alter table trips               enable row level security;
alter table packing_list_entries enable row level security;
alter table item_activities     enable row level security;
alter table trip_activities     enable row level security;
alter table system_items        enable row level security;

-- ── 6. RLS policies ───────────────────────────────────────────────────────────

-- activities: user sees and writes only their own rows
create policy "activities_select" on activities for select using (user_id = auth.uid());
create policy "activities_insert" on activities for insert with check (user_id = auth.uid());
create policy "activities_update" on activities for update using (user_id = auth.uid());
create policy "activities_delete" on activities for delete using (user_id = auth.uid());

-- items: user sees and writes only their own rows
create policy "items_select" on items for select using (user_id = auth.uid());
create policy "items_insert" on items for insert with check (user_id = auth.uid());
create policy "items_update" on items for update using (user_id = auth.uid());
create policy "items_delete" on items for delete using (user_id = auth.uid());

-- trips: user sees and writes only their own rows
create policy "trips_select" on trips for select using (user_id = auth.uid());
create policy "trips_insert" on trips for insert with check (user_id = auth.uid());
create policy "trips_update" on trips for update using (user_id = auth.uid());
create policy "trips_delete" on trips for delete using (user_id = auth.uid());

-- packing_list_entries: scoped via parent trip ownership
create policy "ple_select" on packing_list_entries
  for select using (
    exists (select 1 from trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "ple_insert" on packing_list_entries
  for insert with check (
    exists (select 1 from trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "ple_update" on packing_list_entries
  for update using (
    exists (select 1 from trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "ple_delete" on packing_list_entries
  for delete using (
    exists (select 1 from trips where trips.id = trip_id and trips.user_id = auth.uid())
  );

-- item_activities: scoped via parent item ownership
create policy "ia_select" on item_activities
  for select using (
    exists (select 1 from items where items.id = item_id and items.user_id = auth.uid())
  );
create policy "ia_insert" on item_activities
  for insert with check (
    exists (select 1 from items where items.id = item_id and items.user_id = auth.uid())
  );
create policy "ia_delete" on item_activities
  for delete using (
    exists (select 1 from items where items.id = item_id and items.user_id = auth.uid())
  );

-- trip_activities: scoped via parent trip ownership
create policy "ta_select" on trip_activities
  for select using (
    exists (select 1 from trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "ta_insert" on trip_activities
  for insert with check (
    exists (select 1 from trips where trips.id = trip_id and trips.user_id = auth.uid())
  );
create policy "ta_delete" on trip_activities
  for delete using (
    exists (select 1 from trips where trips.id = trip_id and trips.user_id = auth.uid())
  );

-- system_items: any authenticated user can read; nobody (except service role) can write
create policy "system_items_read" on system_items
  for select using (auth.uid() is not null);

-- ── 7. Trigger to seed default activities per new user ────────────────────────

create or replace function seed_default_activities()
returns trigger language plpgsql security definer as $$
begin
  insert into activities (name, user_id) values
    ('Golf',             new.id),
    ('Beach',            new.id),
    ('Business',         new.id),
    ('Hiking',           new.id),
    ('Formal Dinner',    new.id),
    ('Casual',           new.id),
    ('Ski',              new.id),
    ('City Sightseeing', new.id);
  return new;
end;
$$;

drop trigger if exists on_user_created on auth.users;
create trigger on_user_created
  after insert on auth.users
  for each row execute procedure seed_default_activities();
