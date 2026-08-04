# Keyboard

**Category:** chrome wrapper
**File:** `apps/floor-app/src/components/input/Keyboard.tsx`

## What it is

The shared full-width QWERTY keyboard panel — a shell-level overlay (rendered by
`AppShell`, not any individual screen) spanning the full bottom of the content slot,
used for free-text entry fields where alphanumeric input is needed rather than digits
only (Size and Storage Code overrides on SDP; `ReasonCodeField`'s own prefix-letter
entry, issue #84). Sibling of `Numpad` — same `NumpadContext.handleKey` dispatch pattern,
just a different physical panel and key set.

No doc existed for this component prior to issue #100 — filled in as part of that issue's
own work, same as `Numpad.md`.

Layout: a number row (`1`–`0`), three QWERTY rows (last one ending in `⌫`), and an action
row — **Tab / Back Tab / Clear / space / Enter** (issue #100 added Tab and Back Tab, and
renamed the old `OK` button to `Enter`; Clear and space already existed).

**Tab/Back Tab are inert today**, same as `Numpad`'s own new buttons — see `Numpad.md`'s
"What it is" section for the full explanation (no field-navigation mechanism exists
anywhere in the app yet; building one was scoped to
[#199](https://github.com/BobbyJoeCool/PalletIQ/issues/199) rather than guessed at here).

**Renders at `z-[60]`** — see `Numpad.md`'s own doc comment (issue #84 fix, 2026-08-03):
every full-screen dialog tops out at `z-50`, which otherwise sits on top of this panel and
blocks it entirely.

## Props / Hook API

None — `Keyboard` takes no props. It calls `useNumpad()` internally for `handleKey`.

## Output

Renders the number row, three QWERTY rows, and the action row. Every tap calls
`handleKey(dispatch)`:

| Button | Dispatched key | Notes |
| --- | --- | --- |
| `1`–`0` (number row), `Q`–`P`/`A`–`L`/`Z`–`M` (QWERTY rows) | the character itself | unchanged |
| `⌫` (end of the bottom QWERTY row) | `'⌫'` | unchanged |
| `Tab` | `'Tab'` | new, inert |
| `Back Tab` | `'Back Tab'` | new, inert |
| `Clear` | `'CLEAR'` | unchanged — same key `Numpad`'s new Clear button (issue #100) now also dispatches |
| `space` | `' '` | unchanged |
| `Enter` | `'Enter'` | renamed from `OK` (issue #100) — label-only, see `Numpad.md`'s equivalent note |

## Data flow

Fully stateless — no internal state, no props, identical shape to `Numpad`. `useNumpad()`
supplies `handleKey`; every tap dispatches into whichever field's handler `NumpadContext`
currently has registered.

## Consumers

- `AppShell.tsx` — mounted whenever `NumpadContext`'s `activePanel === 'keyboard'`
- `StorageCodeField`/`SizeField` (SDP's overrides) — the only fields currently requiring
  alphanumeric entry; every other field in the app uses `Numpad` instead

## Related

- [`Numpad`](Numpad.md) — the sibling numeric-only panel, same dispatch pattern, same
  #100 changes
- [`NumpadContext`](NumpadContext.md) — owns the active-field routing this panel
  dispatches into
- `useNumpadField` (`apps/floor-app/src/lib/useNumpadField.ts`) — every field's own key
  handler
