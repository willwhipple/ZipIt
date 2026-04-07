# Issues

## Create Trip — Date Entry
- Change date input: user enters start date + number of nights, end date is calculated automatically. Manual end date entry remains as an option. Also, if inputting the end date manually the end date selector should begin at the day after the start date, not the current date. 

## Travel Mode
- Add "How are you getting there?" to Create Trip: Flying, Train, Driving, Other.
- Driving = no luggage restrictions. Flying/Train = respect carry-on only toggle and flag size limits.

## Add Item — Inline Activity Creation
- When adding/editing an item, allow creating a new activity inline without leaving the form.

## Weather — Temperature Unit Preference
- Currently displays temperatures in °C.
- Add a user setting to choose °C or °F.
- Could live in a future Settings screen or as a toggle on the weather banner itself.

## Laundry — Customisable Cap
- Currently, enabling "Laundry Available" hard-caps all `per_night` items at `LAUNDRY_CAP = 4` nights.
- Some users pack conservatively (happy with 3 nights); others pack a bit more buffer (prefer 5–6).
- Add a laundry intensity preference, e.g. a slider or segmented control: **Light / Moderate / Heavy**.
  - Light  → cap at 3 nights (pack very lean, wash often)
  - Moderate → cap at 4 nights (current default)
  - Heavy → cap at 6 nights (more buffer between washes)
- Preference could live on the Create Trip form (next to the laundry toggle, revealed when it's on), or in a future Settings screen as a global default.
- Implementation: replace the `LAUNDRY_CAP` constant with a value derived from the user's preference; pass it into `calculateQuantity` the same way the boolean is passed today.

## Conditional Item Rules Engine (deferred from Stage 2)
- Allow users to define rules that conditionally include items based on trip context.
- Example rules: "bring neck pillow WHEN flight duration > 4hrs", "bring travel umbrella WHEN destination is rainy season".
- Likely requires a new `rules` table and a rule evaluation pass during packing list generation.
- Deferred due to complexity — revisit after trip history and review queue are complete.

## "Review Later" Queue (deferred from Stage 2)
- When a user taps "Later" on the ad-hoc inventory prompt, the item is stored with `added_to_inventory = null`.
- A review queue should surface these items so the user can decide: add to inventory or dismiss permanently.
- Could live on the Inventory screen as a banner/section, or as a dedicated screen.
- Deferred until trip history is complete.

## Trip Templates
- Allow users to save a trip as a template for trips they take regularly (e.g. "Weekend Golf Trip", "Annual Ski Week").
- Templates store all trip fields except dates and duration: name, activities, accommodation type, carry-on only, laundry available, travel mode.
- When creating a new trip, user can optionally select a template to prefill the form — then just add dates and go.
- Requires a new `trip_templates` table and a template picker step in the Create Trip flow.

## AI — Gemini Free Tier Quota
- `gemini-2.0-flash-lite` has a free-tier daily request quota. Once exhausted, all AI features (trip description parsing, packing suggestions, inventory prefill) return a 503 error.
- Root fix: enable billing on the Google Cloud project tied to `GEMINI_API_KEY` (Gemini Flash-Lite costs ~$0.075/1M input tokens — negligible at this scale).
- Code improvement: the route currently returns 503 for rate-limit errors. Should detect the 429 from the SDK and return 429 to the client, with a user-facing message like "AI is busy — try again in a moment."
- Related: `callGeminiSafely` in `app/api/ai/route.ts` now logs the underlying SDK error (cause) for easier diagnosis.

## About Me
- Allow users to share any context about them that may be helpful to AI when thinking of things they might have forgotten. 

## Calendar Integration
- Optional Calendar Sync to retreive any specific events that might be on the cal. 
