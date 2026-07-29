# useLocationRangeFields

**Category:** shared hook
**File:** `apps/floor-app/src/lib/useLocationRangeFields.ts`

## What it is

Start/End Bin + optional Start/End Level range fields, extracted from WLH's Range Hold
panel — its only current consumer. Extracted despite no cross-screen duplication existing
yet, per Feature 10's own contract ("single-use fields aren't exempt... consistency is
the point, not just deduplication of already-existing repetition") — ready for a second
consumer without a rewrite, and keeps the range-validity rule in one place instead of
inline in the screen.

Deliberately does **not** own Aisle — WLH's Aisle field is a separate, bare-filter field
(issue #161's own scope: no shared component exists yet for that pattern app-wide), not
part of this range shape. Callers combine this hook's own `rangeValid` with their own
Aisle validity for the final gate.

## Props / Hook API

Called as `useLocationRangeFields(opts)`:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `onEndBinComplete` | `() => void` | no | — | Fires once End Bin completes (exactly 3 digits) — the chain's terminal required step. WLH passes its own `hidePanel` |

## Output

Returns `{ startBinField, endBinField, startLevelField, endLevelField, focusStartBin,
focusEndBin, focusStartLevel, focusEndLevel, startBin, endBin, startLevel, endLevel,
hasLevelRange, levelRangeValid, rangeValid, clear }`:

- `*Field` — `useNumpadField` handles for each of the 4 boxes
- `focusStartBin()`/`focusEndBin()` — chained: Start Bin auto-advances to End Bin at 3
  digits
- `focusStartLevel()`/`focusEndLevel()` — no auto-advance between them (the Level range
  is optional, either box fillable independently)
- `startBin`/`endBin`/`startLevel`/`endLevel` — parsed numeric values
- `hasLevelRange` — both Level boxes non-empty
- `levelRangeValid` — true if both boxes are blank (no filter) OR both are filled with a
  valid Start≤End pair; false for a half-entered range
- `rangeValid` — `binRangeValid && levelRangeValid` (does **not** include Aisle)
- `clear()` — resets all 4 boxes

## Data flow

No external `value`/`onChange` — this hook's state is the source of truth for the range
itself (matching the original WLH design, where the range doesn't get composed into a
single external value the way, say, Expiration Date's Month/Day/Year does). Callers read
the returned values directly for rendering and for their own final validity gate
(combining with Aisle).

## Consumers

- `WLHPage.tsx` — Range Hold panel (only current consumer)

## Related

- [`useExpirationDateFields`](useExpirationDateFields.md) — a similar multi-box range/
  chain extraction, for comparison
