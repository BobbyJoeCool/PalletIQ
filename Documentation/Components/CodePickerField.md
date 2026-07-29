# CodePickerField

**Category:** entry field (chrome wrapper)
**File:** `apps/floor-app/src/components/shared/CodePickerField.tsx`

## What it is

The filter-bar-style visual chrome for every "type or pick from a popup" field —
box + dropdown-helper button + anchored popup listing `{code} — {desc}` options. Wraps
[`useCodePickerField`](useCodePickerField.md) for all its behavior; this component owns
only rendering. Used directly by `StorageCodeField`/`SizeField`/`ZoneField` and by ELA's
Workstation field (no dedicated `WorkstationField` wrapper exists yet).

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `value` | `string` | yes | — | Committed value |
| `onChange` | `(value: string) => void` | yes | — | Fires on successful commit |
| `options` | `CodeOption[]` | yes | — | Popup list |
| `validOptions` | `CodeOption[]` | no | `options` | List actually checked for validity, if it should differ from the popup list |
| `optionsLoading` | `boolean` | no | `false` | Shows a loading state in the popup, suppresses strict-reject/invalid-check |
| `panel` | `'keyboard' \| 'numpad'` | yes | — | Which on-screen panel |
| `maxLength` | `number` | no | — | Fixed-length auto-commit |
| `transform` | `(raw: string) => string` | no | — | Applied before commit |
| `size` | `'compact' \| 'default'` | no | `'default'` | Box height/text-size preset |
| `width` | `string` | no | size-based | Tailwind width class override |
| `label` | `string` | no | — | Label above the box |
| `ariaLabel` | `string` | no | — | Accessible name |
| `disabled` | `boolean` | no | `false` | Disables entry + popup button |
| `closeOnAutoSubmit` | `boolean` | no | `false` | See hook doc |
| `earlyCommit` | `(value: string) => boolean` | no | — | See hook doc |
| `strict` | `boolean` | no | `false` | See hook doc |
| `onInvalid` | `(code: string) => void` | no | — | See hook doc |
| `onValidityChange` | `(invalid: boolean) => void` | no | — | See hook doc |
| `invalid` | `boolean` | no | `false` | Forces the wash on **in addition to** the field's own internal check (OR'd) — reserved for genuine cross-cutting cases (form reset, group-wash), not the ordinary case |

Exposes a `ref` with `{ focus: () => void }` (via `forwardRef`) for a caller that needs to
programmatically focus the field (e.g. PAR's screen-wide auto-advance chain).

## Output

Renders the box (value or `—` placeholder, active/invalid border states), the popup
toggle button, and — when open — the options popup (`{code} — {desc}` rows, or a loading/
empty state). Washes with `INVALID_WASH` whenever `invalid` (prop) OR the hook's own
computed `invalid` is true — invalid always wins over active.

## Data flow

Pure pass-through to `useCodePickerField` for behavior; own only the rendering. A caller
supplying `options` alone (no `validOptions`) gets identical popup-list and valid-list
behavior — the split only matters for callers like `StorageCodeField` that need them to
differ.

## Consumers

- `StorageCodeField.tsx`, `SizeField.tsx`, `ZoneField.tsx` (always)
- `ELAPage.tsx:311-324` — Workstation field, directly (no dedicated component)

## Related

- [`useCodePickerField`](useCodePickerField.md) — underlying behavior
- STG's `PalletCodePicker` (local to `STGPage.tsx`, not in `components/shared/`) — a
  parallel chrome wrapper for the same hook, not documented separately here since it's
  screen-local, not a shared component
