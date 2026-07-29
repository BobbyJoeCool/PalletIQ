# StorageCodeField

**Category:** entry field
**File:** `apps/floor-app/src/components/shared/StorageCodeField.tsx`

## What it is

Shared 2-character Storage Code entry field — keyboard-driven, uppercases and
auto-commits at 2 characters. Wraps [`CodePickerField`](CodePickerField.md). Owns its own
aisle-narrowing internally (Feature 10, issue retrofit 2026-07-27) via `useAisleFreightTypes`
— callers pass an `aisle` dependency prop instead of pre-computing a narrowed options list.

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `value` | `string` | yes | — | Committed value |
| `onChange` | `(value: string) => void` | yes | — | Fires on successful commit |
| `aisle` | `number \| null` | no | — | Dependency prop — when given, narrows the popup to codes present in this aisle via `useAisleFreightTypes(aisle)` internally |
| `strictToAisle` | `boolean` | no | `false` | Whether **validity** also uses the aisle-narrowed list (`true`) or always the full reference list (`false`) — see below |
| `options` | `CodeOption[]` | no | — | Escape hatch: an explicit list wins over `aisle`-based narrowing entirely. No current caller needs this |
| `size` | `'compact' \| 'default'` | no | `'default'` | — |
| `width` | `string` | no | — | — |
| `label` | `string` | no | `'Storage Code'` | — |
| `disabled` | `boolean` | no | `false` | — |
| `closeOnAutoSubmit` | `boolean` | no | `false` | — |
| `strict` | `boolean` | no | `false` | See `CodePickerField` |
| `onInvalid` | `(code: string) => void` | no | — | See `CodePickerField` |
| `onValidityChange` | `(invalid: boolean) => void` | no | — | See `CodePickerField` |
| `invalid` | `boolean` | no | `false` | Forced-on override, OR'd with the internal check |

### `strictToAisle` — the two legitimate meanings of "invalid" here

- **`false` (default)** — the popup narrows to the aisle for convenience, but a real code
  just absent from that aisle isn't "invalid," it's a valid code with an empty result
  (ELZ's read-only zone report: `strictToAisle` omitted).
- **`true`** — the value must actually resolve *within this aisle* to count as valid at
  all (STG: a stack's Storage Code must be placeable there).

## Output

Renders via `CodePickerField`. `optionsLoading` is computed internally from
`useAisleFreightTypes`'s own loading state (or `useStorageCodes()`'s, when no `aisle` is
given) — callers never pass it.

## Data flow

`aisle` in → internal fetch + narrow (or fall back to the full `useStorageCodes()` list)
→ popup list and (depending on `strictToAisle`) the valid-check list. `value`/`onChange`
are the only things the caller owns; invalid state is fully internal.

## Consumers

- `ELAPage.tsx:288` — no `aisle` (always full list), external `onValidityChange`
- `ELZPage.tsx:182` — `aisle` given, `strictToAisle` omitted (broad validation)
- `SDPPage.tsx:825` (override field) — `aisle` given, no strict mode
- `STGPage.tsx:1671` (Master Control) — `aisle` + `strictToAisle` both given

## Related

- [`CodePickerField`](CodePickerField.md), [`SizeField`](SizeField.md) (Size depends on
  Storage Code too, via a second dependency prop)
