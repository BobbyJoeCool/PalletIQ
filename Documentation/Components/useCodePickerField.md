# useCodePickerField

**Category:** shared hook
**File:** `apps/floor-app/src/lib/useCodePickerField.ts`

## What it is

The behavior layer behind every "type-a-value-or-pick-from-a-popup" field in the app —
numpad/keyboard wiring, tap-outside-closes-popup, the commit path, and (per Feature 10)
the field's own reactive valid/invalid computation. Chrome (box styling, label placement,
popup styling) deliberately stays with each caller — `CodePickerField` (filter-bar style)
and STG's `PalletCodePicker` (pallet-slat style) both use this hook directly, since their
visual chrome differs too much to share via one component's own style props (Refactoring
Audit finding F6).

## Props / Hook API

Called as `useCodePickerField(value, onChange, options, opts)`:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `value` | `string` | yes | — | The committed value (positional arg, not in `opts`) |
| `onChange` | `(v: string) => void` | yes | — | Fires on a successful commit (positional arg) |
| `options` | `CodeOption[]` | yes | — | The list shown in the popup (positional arg) |
| `opts.panel` | `'keyboard' \| 'numpad'` | yes | — | Which on-screen input panel this field uses |
| `opts.maxLength` | `number` | no | — | Fixed length that auto-commits without an explicit OK |
| `opts.transform` | `(raw: string) => string` | no | — | Applied to typed input before commit (e.g. uppercase) |
| `opts.earlyCommit` | `(value: string) => boolean` | no | — | Auto-submits before `maxLength` when this predicate matches |
| `opts.disabled` | `boolean` | no | `false` | Disables focus entirely |
| `opts.strict` | `boolean` | no | `false` | Rejects a committed value not present in `checkAgainst` (see `validOptions` below) instead of committing it |
| `opts.onInvalid` | `(code: string) => void` | no | — | Fires on a strict-mode commit-reject, in place of `onChange` |
| `opts.onValidityChange` | `(invalid: boolean) => void` | no | — | Fires reactively whenever the field's own computed validity changes — independent of `strict`, and also catches a value that becomes invalid later because `options`/`validOptions` narrowed under it |
| `opts.clearOnInvalid` | `boolean` | no | `false` | Clears the field instead of leaving the rejected value visible (opt-in escape from the app-wide "leave it visible, washed" convention, #109) |
| `opts.optionsLoading` | `boolean` | no | `false` | Suppresses both `strict` rejection and the reactive invalid computation while the reference list is still loading |
| `opts.closeOnAutoSubmit` | `boolean` | no | `false` | Also dismisses the input panel on a maxLength auto-submit, not just an explicit Enter/OK |
| `opts.validOptions` | `CodeOption[]` | no | `options` | The list `strict` and the reactive invalid check actually validate against, when it needs to differ from what's shown in the popup — see `StorageCodeField`'s `strictToAisle` for why this exists |

## Output

Returns `{ field, open, setOpen, wrapperRef, focusField, selectOption, invalid }`:

- `field` — the underlying `useNumpadField` handle (`.value`, `.isActive`, `.set()`, `.clear()`, `.focus()`)
- `open`/`setOpen` — popup open state
- `wrapperRef` — attach to the field's outer wrapper for tap-outside-closes-popup
- `focusField()` — call from the box's `onClick`
- `selectOption(code)` — call from a popup option's `onClick`
- `invalid` — **(Feature 10)** reactively computed: `!!value && !optionsLoading && !checkAgainst.some(o => o.code === value)`, OR'd with an internal `rejected` flag set on a strict-mode reject and cleared on the next successful commit or an external `value` change. This is what lets a caller stop tracking its own invalid boolean.

## Data flow

`value`/`onChange` in and out are the only required plumbing. Everything about *whether
the current value is valid* is now owned internally (`invalid` in the return value) —
callers should render their wash from `invalid`, not compute their own. `onValidityChange`
exists purely so a caller can hook a side effect (a message-bar line, `playAlert`) to that
same internal computation without owning the check itself.

## Consumers

- `CodePickerField.tsx` (via `useCodePickerField`) — used by `StorageCodeField`,
  `SizeField`, `ZoneField`, and directly by ELA's Workstation field
- `STGPage.tsx`'s local `PalletCodePicker` — same hook, STG's own chrome

## Related

- [`CodePickerField`](CodePickerField.md) — the primary chrome wrapper
- [`StorageCodeField`](StorageCodeField.md), [`SizeField`](SizeField.md), [`ZoneField`](ZoneField.md)
