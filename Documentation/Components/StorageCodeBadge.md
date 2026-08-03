# StorageCodeBadge

**Category:** display field
**File:** `apps/floor-app/src/components/shared/StorageCodeBadge.tsx`

## What it is

A compact, color-coded pill showing a single Storage Code — optionally paired with a
Size (`"CR"` or `"CR-L"`). Bare identity badge for a single pallet or location; no
empty/staged counts (contrast `ZoneCodeBadge`, which always shows those for a Zone
Summary panel). Purely presentational, no fetch/state of its own.

## Props / Hook API

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `storageCode` | `string` | yes | — |
| `size` | `string` | no | Omit for a Storage-Code-only badge (e.g. next to a DPCI); include for a Storage Code + Size badge (e.g. next to a location) |
| `badgeSize` | `'default' \| 'compact'` | no | Defaults to `'default'` |

## Output

One small pill, color-coded via the same `STORAGE_CODE_COLORS` palette `AisleGrid`/
`ZoneCodeBadge` use — a badge reads as the same "type" wherever it appears.

## Data flow

Fully caller-driven — no fetch, no internal state.

## Consumers

- `SDPVerifyPutModal.tsx` (#151) — Storage Code + Size badge next to the directed
  location, Storage Code badge next to the DPCI.

## Related

- `ZoneCodeBadge` — the aggregate (Storage Code + Size + empty/staged counts) sibling
  used by ELZ/STG's Zone Summary panels; shares the same color palette and pill styling.
