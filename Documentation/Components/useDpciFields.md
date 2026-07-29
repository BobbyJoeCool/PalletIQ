# useDpciFields

**Category:** shared hook
**File:** `apps/floor-app/src/lib/useDpciFields.ts`

## What it is

Dept/Class/Item DPCI entry chain (issue #159) — numpad-driven, auto-advancing, with an
internal async existence-check (endpoint/response fully caller-supplied) replacing what
PAR/IID/ISI each independently re-implemented. `DpciField.tsx` (plain native inputs, built
for a hypothetical infrequent-admin-edit context) had zero real consumers when this hook
was built — PAR and PII each hand-rolled their own numpad-driven boxes instead — so this
hook is the pattern all 4 real DPCI-entry screens (PAR, IID, ISI, and PII's Edit mode)
actually need.

**Checks completeness (and resolves) after *every* box's confirm, not just Item's.**
PAR/IID/ISI's original independent implementations only checked on Item, since their flows
always fill Dept→Class→Item in order from empty. PII's Edit mode lets a worker retype just
*one* box within an already-full DPCI (e.g. fixing Dept alone), which never touches Item at
all — checking after every confirm handles both shapes with one rule, and is a strict
superset of the original behavior when boxes fill in order from empty.

**Fixed a real, previously undiscovered bug in PAR's own shipped code while being built.**
`focusClassField`/`focusItemField` only ever get (re-)registered via a chain of
`setTimeout`-scheduled calls, all originally scheduled from `handleDeptConfirm` — a closure
captured at Dept's own initial tap, before any typing happened, never refreshed on a later
render. Reading a field's `.value` directly when checking completeness (PAR's own v1.6.11
fix for a *different* bug — external `.set()` calls bypassing a ref only the chain's own
handlers updated) is therefore itself broken: by the time `handleItemConfirm` fires, its
closure over `deptField`/`classField` is frozen at their pre-typing (empty) values, silently
no-op'ing the resolve. Confirmed empirically — typing a real DPCI through PAR's on-screen
boxes produced zero network requests, pre-fix. This hook avoids both failure modes at once
by reading from a ref kept in sync via `useEffect` on `.value`: it updates on any value
change regardless of source, and every closure (however stale) shares the same mutable ref
object.

## Props / Hook API

Called as `useDpciFields<T>(opts)`, where `T` is the caller's own resolved-data shape:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fetch` | `(dpci: string) => Promise<T>` | yes | Resolves a 9-digit DPCI (no dashes) — each screen supplies its own endpoint/response (PAR/IID: item lookup; ISI: locations lookup; PII: the same item lookup, used only to confirm existence) |
| `onResolved` | `(data: T, dpci: string) => void` | no | Fires on success, with the resolved DPCI in canonical `"ddd-cc-iiii"` form (e.g. for `search.query`-style state) |
| `onNotFound` | `(dpci: string) => void` | no | Fires on failure, alongside the hook's own `dpciInvalid` flip |
| `onBeforeResolve` | `() => void` | no | Fires immediately before every resolve attempt — clearing a sibling UPC field, closing the numpad panel, etc. |

## Output

Returns `{ deptField, classField, itemField, dpciInvalid, loading, focusDeptField,
focusClassField, focusItemField, setFromDpci, loadDpci, clear }`:

- `*Field` — `useNumpadField` handles for each of the 3 boxes
- `focusDeptField()` — the chain's entry point; `focusClassField`/`focusItemField` are
  reached via auto-advance, but each box is still independently tappable
- `dpciInvalid` — true after a failed resolve, false after a successful one
- `setFromDpci(formatted)` — populates all 3 boxes from a `"ddd-cc-iiii"` string without
  resolving (PAR's UPC-resolves-DPCI backfill, PII's edit-mode seed) — a one-time
  imperative populate, not a reactive sync, mirroring `useExpirationDateFields`'s
  `setFromIso`
- `loadDpci(input)` — populates all 3 boxes *and* resolves, for a caller delivering a
  whole DPCI outside the interactive chain (a demo button, a `?dpci=` URL param); accepts
  either dash-joined or concatenated digits
- `clear()` — resets all 3 boxes and `dpciInvalid`

## Data flow

No external `value`/`onChange` — like `useLocationRangeFields`, this hook's own state is
the source of truth for the DPCI itself. A screen reads `deptField.value` etc. directly for
rendering, and supplies `fetch`/`onResolved`/`onNotFound`/`onBeforeResolve` to own what
happens around the resolve (populating an `item` state, clearing a sibling field, showing a
message) without owning the chain wiring or the completeness check itself.

## Consumers

- `PARPage.tsx` — the create form's DPCI entry
- `IIDPage.tsx` — the lookup screen's DPCI entry
- `ISIPage.tsx` — the storage-inquiry screen's DPCI entry
- `PIIPage.tsx` — Edit mode's DPCI correction (the one consumer with no standalone lookup
  need of its own before this — added per direct instruction, not inferred; see this
  screen's own Change Log entry for the resulting behavior change)

## Related

- [`useExpirationDateFields`](useExpirationDateFields.md) — the precedent for a shared
  multi-box chain hook with a `setFromXxx` one-time-populate method
- [`useLocationRangeFields`](useLocationRangeFields.md) — another hook that owns its own
  state rather than taking a controlled `value`/`onChange`
