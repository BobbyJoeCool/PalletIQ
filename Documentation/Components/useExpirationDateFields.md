# useExpirationDateFields

**Category:** shared hook
**File:** `apps/floor-app/src/lib/useExpirationDateFields.ts`

## What it is

The Month/Day/Year expiration-date chain, extracted (Feature 10, issue #163) from PAR and
PII, which had independently implemented the identical chain — including a copy-pasted
days-in-month/leap-year helper; PII's own prior comment admitted it was "matching PAR's
exact format." Chrome stays with each caller (PAR uses `FieldBox` in a dedicated row, PII
uses `EditBox` inline in its detail-row layout) — only the field behavior is shared, same
split as [`useCodePickerField`](useCodePickerField.md)/`CodePickerField`.

Uses `monthValueRef`/`dayValueRef` internally rather than reading `monthField.value`/
`dayField.value` directly inside the Day/Year confirm handlers — the same fix PAR's own
v1.6.11 round needed after a direct bug report (entering 10/24/2027 submitted `//2027`,
because those handlers are closures frozen from whenever Month was first tapped, before
Month/Day had values). PII's pre-extraction implementation read `.value` directly in the
identical shape and very likely carried the same latent bug, just never reported — this
hook fixes it for both as a side effect of the consolidation.

## Props / Hook API

Called as `useExpirationDateFields(opts)`:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `onChange` | `(iso: string) => void` | yes | — | Fires once Year commits, with the composed `YYYY-MM-DD` string |
| `checkTooSoon` | `boolean` | no | `false` | Also runs PAR's "at least 1 month out" business-rule check as a group-level state once the chain completes. PII omits this — it relies on the server's `EXPIRATION_NEEDS_CONFIRM` confirm-popup round trip instead, per its own documented reasoning (a business rule, not a format one) |
| `onTooSoonChange` | `(invalid: boolean) => void` | no | — | Fires with the too-soon result — only meaningful when `checkTooSoon` is true |
| `onComplete` | `() => void` | no | — | Fires once Year commits (the chain's terminal step) — e.g. PAR's own screen-wide auto-advance to Location; PII passes `hidePanel` |

## Output

Returns `{ monthField, dayField, yearField, monthInvalid, dayInvalid, focusMonthField,
focusDayField, focusYearField, clear, setFromIso }`:

- `monthField`/`dayField`/`yearField` — `useNumpadField` handles, render their own
  `.value`/`.isActive` in whatever box component the caller uses
- `monthInvalid`/`dayInvalid` — individual per-box invalid state (Month: 1-12 range; Day:
  exists in the entered month, leap-year-precise once Year lands)
- `focusMonthField()`/`focusDayField()`/`focusYearField()` — call from each box's `onClick`
- `clear()` — resets all three boxes, refs, and invalid state — for a caller's own
  form-reset
- `setFromIso(iso: string)` — imperatively populates all three boxes from an existing ISO
  string (PII's "enter Edit mode, pre-fill from the loaded pallet" case) — a **one-time
  populate**, not a continuous reactive sync (typing in progress is never overwritten by
  an external value changing)

The caller separately owns whatever group-level "too soon" wash rendering it wants
(driven by `onTooSoonChange`) — the hook doesn't render anything itself.

## Data flow

Committed value flows **out only** via `onChange` (no `value` prop in — this isn't a
controlled component in the usual sense, since neither PAR nor PII needs continuous
external sync into the boxes). External pre-population is the explicit, one-shot
`setFromIso` call instead. Individual Month/Day validity is fully internal; the
too-soon business rule is opt-in and its result flows out via `onTooSoonChange`, since
whether/how to render that group wash is chrome-specific (PAR only).

## Consumers

- `PARPage.tsx` — `checkTooSoon: true`, `onComplete` re-triggers screen-wide auto-advance
- `PIIPage.tsx` — `checkTooSoon` omitted, `onComplete: hidePanel`, uses `setFromIso` on
  entering Edit mode

## Related

- [`useCodePickerField`](useCodePickerField.md) — same behavior/chrome split pattern
