# ZoneField

**Category:** entry field
**File:** `apps/floor-app/src/components/shared/ZoneField.tsx`

## What it is

Shared single-digit Zone entry field — a fixed 1-4 list, never narrowed by aisle context
(unlike Storage Code/Size). Wraps [`CodePickerField`](CodePickerField.md). Until Feature
10's retrofit (2026-07-27), this component didn't wire `strict`/`invalid`/`onInvalid`/
`onValidityChange` through to `CodePickerField` at all, despite the underlying component
supporting it — low-severity gap given Zone's single current consumer, fixed as part of
the same sweep as `StorageCodeField`/`SizeField`.

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `value` | `number \| null` | yes | — | Committed value |
| `onChange` | `(value: number \| null) => void` | yes | — | Fires on successful commit |
| `size` | `'compact' \| 'default'` | no | `'default'` | — |
| `width` | `string` | no | — | — |
| `label` | `string` | no | `'Zone'` | — |
| `disabled` | `boolean` | no | `false` | — |
| `strict` | `boolean` | no | `false` | Rejects a value outside 1-4 |
| `onInvalid` | `(code: string) => void` | no | — | — |
| `onValidityChange` | `(invalid: boolean) => void` | no | — | — |
| `invalid` | `boolean` | no | `false` | Forced-on override |

## Output

Renders via `CodePickerField` with a fixed `ZONE_OPTIONS` list (`['1','2','3','4']`,
each labeled `"Zone {n}"`). No dependency props — always the same 4 options.

## Data flow

No narrowing to own; behaves identically to a plain `CodePickerField` call with a fixed
list. Exists as its own named component mainly for consistency with Storage Code/Size
(per Feature 10's "single-use fields aren't exempt" principle) and to centralize the
`ZONE_OPTIONS` list definition.

## Consumers

- `SDPPage.tsx` — Zone override field (only current consumer app-wide)

## Related

- [`CodePickerField`](CodePickerField.md)
