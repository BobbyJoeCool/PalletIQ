# NumpadContext

**Category:** shared hook
**File:** `apps/floor-app/src/context/NumpadContext.tsx`

## What it is

The shared on-screen input panel's routing layer — manages which panel (`numpad` /
`keyboard` / `none`) is showing and dispatches every key event (a `Numpad`/`Keyboard`
button tap, or a `deliverScan` injection) to whichever field currently holds logical
focus. Fields never talk to `Numpad`/`Keyboard` directly, and `Numpad`/`Keyboard` never
know which field is active — this context is the only thing that does, via `useNumpadField`
registering a handler through `setKeyHandler`.

Only one field is ever "active" at a time; registering a new handler replaces the prior
one. When focus actually moves — a different field registers, or the panel is dismissed
with no new field taking over — the field being left gets a synthetic `'Blur'` key
first, giving it a chance to auto-submit whatever it currently holds (matches pressing
Enter on it), but only if something was actually typed since it was last focused
(`useNumpadField`'s own `freshFocusRef` gate) — a field that was refocused but left
untouched (e.g. a stale value deliberately kept after a failed submission, per issue #190's
MNP persist-through-error pattern) does nothing on `Blur` and keeps its value as-is.

No doc existed for this component prior to issue #100 — filled in as part of that issue's
own research. Tab/Back Tab field navigation was implemented in issue #199 via `useTabOrder`
(see below).

## Props / Hook API

`NumpadProvider` takes a single `children: React.ReactNode` prop and wraps the app once
(inside `AppShell`). Consumed via `useNumpad()`, which throws if called outside the
provider.

`useNumpad()` returns:

| Name | Type | Description |
| --- | --- | --- |
| `activePanel` | `'numpad' \| 'keyboard' \| 'none'` | Which panel `AppShell` should render |
| `activeFieldId` | `string \| null` | Stable ID (from `useId`) of whichever field is currently active — lets a field component show its own visual active state |
| `showNumpad` / `showKeyboard` | `() => void` | Opens the matching panel |
| `hidePanel` | `() => void` | Closes whichever panel is open and clears the active field/handler (`setKeyHandler(null)`) |
| `setKeyHandler` | `(handler: ((key: string) => void) \| null, fieldId?: string \| null) => void` | Registers a field's key handler and marks it active; called by `useNumpadField`'s own `focus()`, not directly by screens |
| `handleKey` | `(key: string) => void` | Dispatches one key string to whichever handler is currently registered — what `Numpad`/`Keyboard` call on every button tap. Intercepts `'Tab'`/`'Back Tab'` and routes them to the screen's `tabHandlerRef` before reaching the active field's own handler |
| `setTabHandler` | `(handler: TabHandler \| null) => void` | Registers a screen-level Tab/Back Tab handler (issue #199). Called by `useTabOrder`'s own effect — not by screens directly |
| `deliverScan` | `(value: string) => void` | Injects a complete scanned value character-by-character (clears the field, types each character, then fires `'Enter'`) — used by the hardware scanner listener and every demo-scanner button |
| `isScanningRef` | `React.RefObject<boolean>` | True for the duration of a `deliverScan` injection — lets `useNumpadField`'s `maxLength` auto-submit stand down mid-scan so a longer scanner override (e.g. a full 8-digit barcode into a 3-digit Aisle field) isn't cut short |

## Output

No rendered markup of its own — a pure context provider. `AppShell` reads `activePanel`
to decide whether to mount `Numpad`, `Keyboard`, or neither.

## Data flow

`keyHandlerRef`/`activeFieldIdRef` (refs, not state) are the actual routing source of
truth — `activeFieldId` state exists only so a field component can re-render on its own
active/inactive transition; the refs are what `setKeyHandler`/`handleKey`/`deliverScan`
read and write synchronously, since a `useCallback` closure over `useState` would go stale
mid-call. `firingSyntheticRef` guards the synthetic-`'Blur'` dispatch against re-firing
itself when the field being left calls `hidePanel()` as its own last step (a reentrant
`setKeyHandler(null)` call).

## Consumers

- `AppShell.tsx` — wraps the app in `NumpadProvider`; reads `activePanel` to mount
  `Numpad`/`Keyboard`; calls `hidePanel()`/`setKeyHandler(null)` on route change and on a
  background tap outside any button
- `useNumpadField` (`apps/floor-app/src/lib/useNumpadField.ts`) — every numeric/text field
  in the app registers through this via `focus()` calling `setKeyHandler`
- `Numpad`/`Keyboard` — call `handleKey` on every button tap

## Tab / Back Tab (issue #199)

`handleKey` intercepts `'Tab'` and `'Back Tab'` before they reach the active field's own
handler, routing them to the screen's `tabHandlerRef` (set via `setTabHandler`). Each
screen declares its tab order via the `useTabOrder` hook
(`apps/floor-app/src/lib/useTabOrder.ts`), which registers a `TabHandler` callback with
NumpadContext on mount and clears it on unmount. The hook accepts an ordered array of
`TabSlot` entries (`{ fieldId, activate, enabled? }`); Tab advances forward, Back Tab
backward, wrapping at both ends. Slots with `enabled: false` are skipped. When no
`useTabOrder` is registered (or no slots are enabled), Tab/Back Tab are silent no-ops.

The `useTabOrder` hook uses a ref pattern (`slotsRef.current = slots` on every render) so
activate closures are always current without re-registering the handler. This avoids stale
closures — a common hazard in this codebase's useCallback-heavy field registration pattern.

## Related

- [`Numpad`](Numpad.md) / [`Keyboard`](Keyboard.md) — the two panels that call `handleKey`
- `useNumpadField` (`apps/floor-app/src/lib/useNumpadField.ts`) — every field's own key
  interpretation (`'⌫'`/`'CLEAR'`/`'Enter'`/`'OK'`/`'Blur'`, plus digits/characters)
- `useTabOrder` (`apps/floor-app/src/lib/useTabOrder.ts`) — per-screen Tab/Back Tab
  navigation hook
