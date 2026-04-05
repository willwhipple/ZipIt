# Issues

## UI / Labels
- Change "Inventory" to "My Stuff" throughout

## Create Trip — Date Entry
- Change date input: user enters start date + number of nights, end date is calculated automatically. Manual end date entry remains as an option.

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
