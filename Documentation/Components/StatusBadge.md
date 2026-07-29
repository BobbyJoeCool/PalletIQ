# StatusBadge

**Category:** display field
**File:** `apps/floor-app/src/components/shared/StatusBadge.tsx`

## What it is

A colored pill for a status string, with best-effort default coloring across
`LocationStatus`/`PalletStatus`/`LabelStatus`/hold-category values (`KNOWN_VARIANTS`).
Purely presentational — takes a status string as a prop, does no fetching. The caller is
still responsible for resolving *which* entity's status to show (see the Display-Field
Inventory doc's "Location hold/contraction status" entry — LII independently fetches a
location and derives what to pass in here).

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `status` | `string` | yes | — | The status text to display (also used to look up a default color via `KNOWN_VARIANTS`) |
| `variant` | `StatusVariant` (`'neutral' \| 'good' \| 'warning' \| 'danger' \| 'info'`) | no | derived from `status` | Overrides the default color when a specific screen needs different semantics for the same status string |

## Output

One colored, bordered pill (`<span>`) with the status text.

## Data flow

Fully caller-driven — no internal state, no fetch. The `KNOWN_VARIANTS` default-coloring
map is the only "logic" this component owns.

## Consumers

- `LIIPage.tsx:202,206` — Contraction and Hold status
- `PIIPage.tsx` — pallet status

## Related

None — pure leaf presentational component.
