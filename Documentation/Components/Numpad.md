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

**Renders at `z-[60]` (issue #84 fix, 2026-08-03)** — every full-screen dialog in the app
(`ModalOverlay`, `HotJump`) tops out at `z-50`; this panel and `Keyboard` previously had no
z-index at all, so any `ModalOverlay`-wrapped dialog needing keyboard/numpad input (e.g.
`HoldPanel`'s Reason Code entry, opened inside a modal on PIP/MNP/SDP) rendered this panel
fully blocked/unreachable underneath it. Fixed once at the panel level rather than patched
per-dialog, so it applies to every current and future modal automatically.

**Tab/Back Tab** dispatch `'Tab'`/`'Back Tab'` key strings, which `NumpadContext.handleKey`
intercepts before the active field's own handler and routes to the screen's `useTabOrder`
hook (issue #199). Each screen declares its ordered field slots; Tab advances forward,
Back Tab backward, wrapping at both ends. Screens without a `useTabOrder` call ignore
both keys silently.

## Props / Hook API

None — `Numpad` takes no props. It calls `useNumpad()` internally for `handleKey`.

## Output

Renders the 4×4 (3+1-spanning) button grid described above. Every tap calls
`handleKey(dispatch)`, where `dispatch` is:

| Button label | Dispatched key | Notes |
| --- | --- | --- |
| `7`–`9`, `0`–`1`–`2`–`3`, `4`–`6` | the digit itself | unchanged from the old layout |
| `⌫` | `'⌫'` | same key/label as before — just moved from the old bottom-left slot to the 4th column |
| `Tab` | `'Tab'` | intercepted by NumpadContext, routed to `useTabOrder` (issue #199) |
| `Back Tab` | `'Back Tab'` | intercepted by NumpadContext, routed to `useTabOrder` (issue #199) |
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
