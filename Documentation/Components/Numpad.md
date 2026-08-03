# Numpad

**Category:** chrome wrapper
**File:** `apps/floor-app/src/components/input/Numpad.tsx`

## What it is

The shared on-screen numeric keypad panel — a shell-level overlay (rendered by
`AppShell`, not any individual screen) that appears in the bottom-right of the content
slot whenever a numeric field is focused. Every digit-entry field in the app (Pallet ID,
Aisle/Bin/Level, DPCI, UPC, etc.) shares this one panel rather than each screen owning its
own keypad; a button tap dispatches a key string to `NumpadContext.handleKey`, which
routes it to whichever field currently holds logical focus via `useNumpadField`.

No doc existed for this component prior to issue #100 despite it being one of the most
widely-used pieces of chrome in the app — filled in as part of that issue's own work
rather than left as a further gap.

4-column layout (issue #100, replacing the older 3-column 7-8-9/4-5-6/1-2-3/⌫-0-OK grid):

```text
7     | 8 | 9 | ⌫
4     | 5 | 6 | Tab
1     | 2 | 3 | Back Tab
Clear | 0 | Enter (spans the last 2 columns)
```

Every button's width still falls out of plain `flex-1` sizing (Enter uses `flex-[2]` for
its 2-column span) — no fixed per-button pixel widths, so the panel keeps its existing
436×494px footprint unchanged.

**Tab/Back Tab are inert today** — they dispatch their own key strings (`'Tab'`/`'Back
Tab'`) but nothing consumes them yet. Confirmed while researching #100 that no field-
navigation mechanism (an ordered field registry, `focusNext`/`focusPrev`) exists anywhere
in the app — every existing "advance to next field" (SDP, MNP, PAR, PIP) is a bespoke
single-field `.focus()` call wired per screen, with no shared abstraction a generic Tab
implementation could plug into. Building that was scoped out of #100 itself to
[#199](https://github.com/BobbyJoeCool/PalletIQ/issues/199) (screen-by-screen field-order
design) rather than guessed at here — see that issue for the open design question. Tapping either button is a
silent no-op (`useNumpadField`'s handler has no final `else` branch, so an unrecognized key
string is simply dropped, same as before this change for any other unmapped key).

## Props / Hook API

None — `Numpad` takes no props. It calls `useNumpad()` internally for `handleKey`.

## Output

Renders the 4×4 (3+1-spanning) button grid described above. Every tap calls
`handleKey(dispatch)`, where `dispatch` is:

| Button label | Dispatched key | Notes |
| --- | --- | --- |
| `7`–`9`, `0`–`1`–`2`–`3`, `4`–`6` | the digit itself | unchanged from the old layout |
| `⌫` | `'⌫'` | same key/label as before — just moved from the old bottom-left slot to the 4th column |
| `Tab` | `'Tab'` | new, inert (see above) |
| `Back Tab` | `'Back Tab'` | new, inert (see above) |
| `Clear` | `'CLEAR'` | new on this panel; same key string `Keyboard.tsx`'s pre-existing Clear button already uses |
| `Enter` | `'Enter'` | renamed from `OK` (issue #100) — `useNumpadField` already treats `'Enter'`/`'OK'`/`'Blur'` as equivalent submit triggers, so this is label-only, not a new codepath |

## Data flow

Fully stateless — no internal state, no props. `useNumpad()` supplies `handleKey`; every
tap is a fire-and-forget dispatch into whichever field's handler `NumpadContext` currently
has registered (see `NumpadContext.md`). The panel itself has no idea which field is
active or what value it holds.

## Consumers

- `AppShell.tsx` — mounted whenever `NumpadContext`'s `activePanel === 'numpad'`; the only
  place this component is rendered. Individual screens never import it directly — they
  call `useNumpadField('numpad', ...)` and the panel opens/closes on their behalf.

## Related

- [`Keyboard`](Keyboard.md) — the sibling full-QWERTY panel, same `handleKey` dispatch
  pattern, same #100 Tab/Back Tab/Enter changes
- [`NumpadContext`](NumpadContext.md) — owns the active-field routing this panel
  dispatches into
- `useNumpadField` (`apps/floor-app/src/lib/useNumpadField.ts`) — every field's own key
  handler; this is what actually interprets `'⌫'`/`'CLEAR'`/`'Enter'`/`'OK'`/`'Blur'` and
  currently no-ops on `'Tab'`/`'Back Tab'`
