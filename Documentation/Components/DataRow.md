# DataRow

**Category:** display field
**File:** `apps/floor-app/src/components/shared/DataRow.tsx`

## What it is

Generic label + value row shared by every detail/lookup screen — a `label` on the left,
arbitrary `children` (usually a value, sometimes a tappable [`LiveId`](LiveId.md)) on the
right, with a bottom border. Purely presentational: it renders whatever it's given and
does no data fetching of its own. This is the most widely reused display primitive in the
app, but it does **not** solve the gap described in
`DevNotes/DesignPrompts/Display-Field-Inventory.md` — every caller still independently
fetches and formats the value it hands to `DataRow`'s `children`.

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `label` | `string` | yes | — | Left-column label text |
| `children` | `React.ReactNode` | yes | — | Right-column content — a plain value, a [`LiveId`](LiveId.md), or anything else |
| `labelWidth` | `number` | no | `180` | Label column width in px (PII/LII/IID/SDP/MNP's shared width; PIP's denser panel uses 160) |
| `dense` | `boolean` | no | `false` | Tighter vertical padding (PIP's own variant) |

## Output

One `<div>` row: label span (uppercase, fixed width) + value div, with a bottom border.
No internal state, no fetch.

## Data flow

100% caller-driven — `DataRow` has no data flow of its own. See the Display-Field
Inventory doc's "Item description" entry for the concrete gap this leaves: 8 screens each
independently fetch `descShort` and hand it to their own `DataRow` call, with 3 different
label texts for the same field.

## Consumers

PII, IID, SDP, MNP, PIP, LII (6 screens) — used for item description, pallet/location
metadata, quantity fields, and more.

## Related

- [`LiveId`](LiveId.md) — often used as `DataRow`'s `children` for a tappable ID value
