# Issues

## UI / Labels
- Change "Inventory" to "My Stuff" throughout

## Create Trip — Date Entry
- Change date input: user enters start date + number of nights, end date is calculated automatically. Manual end date entry remains as an option. Also, if inputting the end date manually the end date selector should begin at the day after the start date, not the current date. 

## Travel Mode
- Add "How are you getting there?" to Create Trip: Flying, Train, Driving, Other.
- Driving = no luggage restrictions. Flying/Train = respect carry-on only toggle and flag size limits.

## Essential Flag (requires DB migration)
- Add `essential` boolean column to `items` table (default false).
- Essential items are always included in every packing list — no activity tag needed.
- Non-essential items require at least one activity match to appear on a packing list.
- Packing list generation logic: include item if `essential = true` OR item has a matching activity.
- In Add/Edit Item UI: "Essential" toggle. When on, hide/disable activity selector. When off, activity selection is required.

## Packing List — Show Quantity
- For items with quantity > 1, display the calculated quantity on the packing list (e.g. "Socks × 5").
- The quantity is already stored in `packing_list_entries.quantity` — this is a UI-only change.

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

