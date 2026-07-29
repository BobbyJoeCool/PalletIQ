# SizeField

**Category:** entry field
**File:** `apps/floor-app/src/components/shared/SizeField.tsx`

## What it is

Shared Size entry field — the fixed XS/HS/S/M/L set. Wraps
[`CodePickerField`](CodePickerField.md); two-letter codes auto-commit at 2 characters,
single-letter codes (S/M/L) commit immediately via `earlyCommit`. Owns its own
aisle-*and*-storage-code-narrowing internally (Feature 10) via `useAisleFreightTypes` —
Size depends on **both** dependency props, since a given aisle can carry different sizes
per storage code.

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `value` | `string` | yes | — | Committed value |
| `onChange` | `(value: string) => void` | yes | — | Fires on successful commit |
| `aisle` | `number \| null` | no | — | First dependency prop — narrows to sizes present in this aisle |
| `storageCode` | `string \| null` | no | — | Second dependency prop — further narrows within `aisle` to sizes paired with this Storage Code. Ignored if `aisle` isn't also given |
| `options` | `CodeOption[]` | no | — | Escape hatch, wins over dependency-prop narrowing |
| `size` | `'compact' \| 'default'` | no | `'default'` | — |
| `width` | `string` | no | — | — |
| `label` | `string` | no | `'Size'` | — |
| `ariaLabel` | `string` | no | — | — |
| `disabled` | `boolean` | no | `false` | — |
| `strict` | `boolean` | no | `false` | Always checks the **narrowed** list when `aisle` is given — no `strictToAisle` toggle exists for Size (unlike `StorageCodeField`), since no current caller needs the broad-validation variant |
| `onInvalid` | `(code: string) => void` | no | — | — |
| `onValidityChange` | `(invalid: boolean) => void` | no | — | — |
| `invalid` | `boolean` | no | `false` | Forced-on override |

Exposes a `ref` with `{ focus }` (forwardRef), same as `CodePickerField`.

## Output

Renders via `CodePickerField`. Falls back to the full static `XS/HS/S/M/L` list when
`aisle` is omitted — Size has no lookup table to fetch from, so the un-narrowed case is
just this static array (`apps/floor-app/src/lib/sizes.ts`).

## Data flow

`aisle`/`storageCode` in → internal `useAisleFreightTypes(aisle).sizesFor(storageCode)`
call → narrowed popup + valid-check list (always the same list for Size, no split).

## Consumers

- `ELAPage.tsx:284` — no dependency props (full static list)
- `PARPage.tsx` — (not yet migrated onto dependency props; uses its own local Size
  handling, see PAR's own screen code)
- `SDPPage.tsx:812` (override) — `aisle` + `storageCode` both given
- `STGPage.tsx:1681` (Master Control) — `aisle` + `storageCode` both given

## Related

- [`CodePickerField`](CodePickerField.md), [`StorageCodeField`](StorageCodeField.md)
