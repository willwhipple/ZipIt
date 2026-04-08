# Database & Auth Updates: Plan

## Context
ZipIt is deployed to Vercel but has two problems blocking broader use:
1. **Supabase RLS is disabled** — anyone with the project URL can read/write/delete all data.
2. **No auth** — can't share with friends without everyone writing to the same shared database.

The goal is to implement Stage 1.1: Supabase magic-link auth, per-user data isolation via RLS, and open signup so friends can test the app. User wants to start fresh (existing data wiped). Magic link first, but architecture stays open for adding email/password or OAuth later via Supabase.

**On env var security:** The Gemini API key has no `NEXT_PUBLIC_` prefix and is only used server-side in `app/api/ai/route.ts` — already correct, no change needed. The Supabase anon key is designed to be public; RLS is Supabase's intended security layer. No changes to how keys are stored in Vercel.

---

## Session A — Database Only (Supabase dashboard, no code changes)

Everything in this session is run as SQL in the Supabase SQL editor. After this session the deployed app will partially break (inserts fail without `user_id`), which is intentional — it's resolved in Session C.

### A1. Wipe existing data
```sql
TRUNCATE packing_list_entries, trip_activities, item_activities, trips, items, activities, user_preferences RESTART IDENTITY CASCADE;
```

### A2. Fix activities unique constraint (must be scoped to user)
```sql
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_name_key;
ALTER TABLE activities ADD CONSTRAINT activities_name_user_id_key UNIQUE (name, user_id);
```

### A3. Add user_id to all user-owned tables
```sql
ALTER TABLE items ADD COLUMN user_id uuid REFERENCES auth.users(id) NOT NULL;
ALTER TABLE activities ADD COLUMN user_id uuid REFERENCES auth.users(id) NOT NULL;
ALTER TABLE trips ADD COLUMN user_id uuid REFERENCES auth.users(id) NOT NULL;
ALTER TABLE user_preferences ADD COLUMN user_id uuid REFERENCES auth.users(id) NOT NULL;
```

### A4. Set auth.uid() as the default for user_id columns
This means app code never needs to pass `user_id` explicitly — Postgres fills it in from the session.
```sql
ALTER TABLE items ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE activities ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE trips ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE user_preferences ALTER COLUMN user_id SET DEFAULT auth.uid();
```

### A5. Enable RLS on all tables
```sql
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_list_entries ENABLE ROW LEVEL SECURITY;
```

### A6. Add RLS policies
```sql
-- Direct user_id check on owned tables
CREATE POLICY "Users manage own items" ON items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own activities" ON activities FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own trips" ON trips FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own preferences" ON user_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Join tables: access allowed if the parent row belongs to the user
CREATE POLICY "Users manage own item_activities" ON item_activities FOR ALL USING (
  EXISTS (SELECT 1 FROM items WHERE items.id = item_id AND items.user_id = auth.uid())
);
CREATE POLICY "Users manage own trip_activities" ON trip_activities FOR ALL USING (
  EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_id AND trips.user_id = auth.uid())
);
CREATE POLICY "Users manage own packing_list_entries" ON packing_list_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_id AND trips.user_id = auth.uid())
);
```

### A7. Trigger to seed default activities for new users
```sql
CREATE OR REPLACE FUNCTION public.seed_default_activities()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.activities (name, user_id) VALUES
    ('Golf', NEW.id),
    ('Beach', NEW.id),
    ('Business', NEW.id),
    ('Hiking', NEW.id),
    ('Formal Dinner', NEW.id),
    ('Casual', NEW.id),
    ('Ski', NEW.id),
    ('City Sightseeing', NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_activities();
```

**Verification:** In the Supabase dashboard, confirm RLS is shown as enabled on all 7 tables. Run `SELECT * FROM activities;` — should return 0 rows (data was wiped).

---

## Session B — Auth Infrastructure (code, no visible UI change)

Depends on: nothing (can run before or after Session A)
After this session: app looks identical to users, but session machinery is wired up.

### B1. Install `@supabase/ssr`
```bash
npm install @supabase/ssr
```

### B2. Create `lib/supabase/client.ts` (browser client for `'use client'` components)
```ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### B3. Create `lib/supabase/server.ts` (server client for API routes + server components)
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}
```

### B4. Delete `lib/supabase.ts` and update all imports
All `app/**/page.tsx` files import from `'../../lib/supabase'`. Update each to:
```ts
import { createClient } from '../../lib/supabase/client';
// ...
const supabase = createClient();
```

### B5. Create `middleware.ts` at project root
Refreshes the session token on every request so it never expires mid-session.
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          ),
      },
    }
  );
  await supabase.auth.getUser();
  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### B6. Create `app/auth/callback/route.ts`
Handles the redirect after the user clicks the magic link in their email.
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}/`);
}
```

**Verification:** `npm run build` should succeed with no type errors.

---

## Session C — Login UI + Auth Guard

Depends on: Session B
After this session: app requires login. You can sign in via magic link and use the app as yourself.

### C1. Create `app/login/page.tsx`
- Mobile-first, matches existing style (max-w-sm centered, Tailwind only)
- Email input + "Send magic link" button
- Calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + '/auth/callback' } })`
- On submit, replaces form with: "Check your email for a login link."
- No password field — magic link only for now

### C2. Add auth guard to `app/layout.tsx`
- Use the server client to call `supabase.auth.getUser()`
- If no session and path is not `/login` or `/auth/callback`, redirect to `/login`

### C3. Add sign-out to settings page (`app/settings/page.tsx`)
- Add a "Sign out" button at the bottom
- Calls `supabase.auth.signOut()` then redirects to `/login`

**Verification:**
1. Visit the deployed app → redirected to `/login`
2. Enter your email → receive magic link → click it → land on home screen
3. Sign up with a second email → confirm activities are seeded and inventory is empty/separate from yours
4. Sign out → redirected to `/login`

---

## Session D — Harden API + Cleanup

Depends on: Session C
After this session: app is fully production-ready. AI endpoint rejects unauthenticated requests.

### D1. Update `app/api/ai/route.ts` to validate sessions
At the top of the `POST` handler, before any other logic:
```ts
const supabase = await createClient(); // server client
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```
Import from `lib/supabase/server.ts` (not the old singleton).

### D2. Remove the old auth-disabled config
The old `lib/supabase.ts` had `autoRefreshToken: false, persistSession: false, detectSessionInUrl: false`. These are gone now that we use `@supabase/ssr` clients. No further action needed — just confirm the old file is deleted from Session B.

**Verification:**
```bash
curl -X POST https://your-app.vercel.app/api/ai \
  -H "Content-Type: application/json" \
  -d '{"action":"suggest_inventory_items"}'
# Should return: {"error":"Unauthorized"} with status 401
```

---

## Critical Files Summary

| File | Session | Action |
|---|---|---|
| Supabase SQL editor | A | Migration: wipe, schema changes, RLS, trigger |
| `lib/supabase.ts` | B | Delete |
| `lib/supabase/client.ts` | B | Create |
| `lib/supabase/server.ts` | B | Create |
| `middleware.ts` | B | Create |
| `app/auth/callback/route.ts` | B | Create |
| All `app/**/page.tsx` | B | Update imports |
| `app/login/page.tsx` | C | Create |
| `app/layout.tsx` | C | Add auth guard |
| `app/settings/page.tsx` | C | Add sign-out button |
| `app/api/ai/route.ts` | D | Add session validation |
