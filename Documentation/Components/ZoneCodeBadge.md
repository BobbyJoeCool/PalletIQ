# ZoneCodeBadge

**Category:** display field
**File:** `apps/floor-app/src/components/shared/ZoneCodeBadge.tsx`

## What it is

A compact badge showing a Storage Code + Size pair along with empty/staged counts (e.g.
`"CR-L"` with an empty/staged breakdown) — used in ELZ's and STG's per-zone summary
panels. Purely presentational; the caller has already fetched and aggregated the
breakdown data before rendering one badge per Storage-Code/Size combination.

## Props / Hook API

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `storageCode` | `string` | yes | — |
| `size` | `string` | yes | — |
| `empty` | `number` | yes | Empty-location count for this Storage Code/Size in the current zone |
| `staged` | `number` | yes | Staged-location count |
| `badgeSize` | `'default' \| 'compact'` (STG only) | no | STG's zone summary uses `compact`; ELZ uses the default |

## Output

One small pill: `{storageCode}-{size}` plus the empty/staged counts, color-coded by
whether the location type has any empty/staged locations at all.

## Data flow

Fully caller-driven — no fetch, no internal state. The caller (`ELZPage.tsx`/
`STGPage.tsx`) already queried `/api/locations/empty-by-zone` and grouped the results into
one `{storageCode, size, empty, staged}` row per badge before rendering.

## Consumers

- `ELZPage.tsx:227` — Zone Summary panel
- `STGPage.tsx` — STG's own (compact) zone summary

## Related

None — pure leaf presentational component.
