# WorkstationField

**Category:** entry field
**File:** `apps/floor-app/src/components/shared/WorkstationField.tsx`

## What it is

Shared Workstation entry field, matching the type-or-pick-from-popup pattern used by every
other code field in the app (`StorageCodeField`/`SizeField`/`ZoneField`/`ReasonCodeField`).
Mechanical extraction (Feature 10) of ELA's original inline `CodePickerField` usage — ELA's
field already owned its validity internally through `CodePickerField`, so this is a
consistency/readability extraction, not a behavior fix. Fetches the `GET /api/workstations`
list itself via `useWorkstations` rather than the caller fetching and handing down
`options`, matching `StorageCodeField`'s own internal-fetch shape.

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `value` | `string` | yes | — | The resolved workstation ID |
| `onChange` | `(value: string) => void` | yes | — | |
| `size` | `'compact' \| 'default'` | no | `'default'` | Styling variant (issue #78) |
| `width` | `string` | no | — | Overrides the width Tailwind class `size` would otherwise pick |
| `label` | `string` | no | `'Workstation'` | |
| `disabled` | `boolean` | no | `false` | |
| `strict` | `boolean` | no | `false` | Rejects a typed value not present in the workstation list instead of committing it |
| `onInvalid` | `(code: string) => void` | no | — | Fires on a strict-mode reject |
| `onValidityChange` | `(invalid: boolean) => void` | no | — | Reactive validity callback, independent of `strict` (Feature 10) |
| `invalid` | `boolean` | no | `false` | Forces the wash on top of the field's own internal check |

## Output

Renders a `CodePickerField` (keyboard panel, 4-char max, uppercased) with a dropdown-helper
popup listing every workstation (`code` = id, `desc` = name). Owns the loading state of the
workstation list itself (`optionsLoading` from `useWorkstations() === null`), so `strict`
never falsely rejects a valid-but-not-yet-loaded workstation.

## Data flow

`useWorkstations()` is called internally — the caller never fetches or passes the
workstation list. Validity (typed value vs. the fetched list) is computed and washed inside
`CodePickerField`/`useCodePickerField`, same as every other Feature 10 field; the caller
only needs `onValidityChange` if it wants a side effect (e.g. a message-bar error).

## Consumers

- `ELAPage.tsx` — Workstation restrict-to filter (only current consumer)

## Related

- [`CodePickerField`](CodePickerField.md) — underlying chrome wrapper
- [`StorageCodeField`](StorageCodeField.md) — same internal-fetch shape, for comparison
