# LiveId

**Category:** display field (+ navigation)
**File:** `apps/floor-app/src/components/ui/LiveId.tsx`

## What it is

Inline tappable ID chip — renders a Pallet ID, Location ID, DPCI, or UPC as underlined
text; tapping navigates to the corresponding detail screen (`/pallet`, `/location`,
`/item?dpci=`/`/item?upc=`). The one display component in the app that does more than
pure rendering — it owns navigation — but it does **not** fetch or derive any data itself;
it only formats and links an ID the caller already has. Respects the shell-wide
`NavLockContext` — renders as inert plain text (not a button) while a screen has an active
transaction locked, so it can't offer an escape hatch around that lock.

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | `string` | yes | — | Raw ID — 8-digit location barcode, numeric pallet ID, DPCI, or UPC |
| `type` | `'pallet' \| 'location' \| 'dpci' \| 'upc'` | yes | — | Controls route and display format |
| `className` | `string` | no | `''` | Extra Tailwind classes to override text size/color |

## Output

A `<button>` (underlined, dotted decoration) that calls `navigate()` on tap, or — while
`NavLockContext.locked` is true — a plain, non-interactive `<span>` with the same text.
Location IDs are formatted via `fmtLocation` (adds dashes); everything else is shown as
given (DPCI is expected pre-formatted by the caller, e.g. via `fmtDpci()`).

## Data flow

Purely a formatter + navigator — no fetch, no internal state beyond reading
`useNavLockContext()`. The caller supplies an already-known, already-correct ID.

## Consumers

App-wide — used inside `DataRow` (as `children`), the Activity Log overlay
(`activityFormat.ts`'s tokens), and many detail screens directly.

## Related

- [`DataRow`](DataRow.md) — frequently wraps a `LiveId` as its value
