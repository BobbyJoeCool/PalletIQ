# useUpcField

**Category:** shared hook
**File:** `apps/floor-app/src/lib/useUpcField.ts`

## What it is

Single-box UPC entry field (issue #160) — numpad-driven, with an internal async
existence-check (endpoint/response fully caller-supplied) replacing what IID/ISI/PAR each
independently re-implemented as their own `loadByUpc`/`upcInvalid`. Mirrors
`useDpciFields`'s hook shape (issue #159) — same `fetch`/`onResolved`/`onNotFound`/
`onBeforeResolve` contract, `loading`/`invalid` state owned internally, a `loadUpc` for
populating-and-resolving in one call (demo buttons, `?upc=` URL params), and a `clear()`.

**Deliberately not adopted by PIP.** PIP's own "UPC field" is a compound
`POST /api/pulls/verify` submit tied to a specific pull label (`labelId` + `pullFunction` +
`upc` together) — not a standalone existence check, the same "compound submit" shape issue
#158 already found for Pallet ID in PIP/MNP. PIP keeps its own `handleUpcVerify` and bare
`useNumpadField` instance untouched; its box already renders through the shared
`NumpadFieldBox` primitive via its own local `FieldDisplay` wrapper, so there was no
rendering gap to close there either — #160's own scope note grouping "ISI/PIP/IID/PAR" as
if all 4 needed the same hook didn't survive contact with PIP's actual submit logic, the
same kind of premise mismatch #158/#159 each found on inspection.

**Found and fixed a real, previously undiscovered bug in PARPage.tsx while being built.**
`doSubmit`'s catch block called `setDpciInvalid(true)` on a server-side `DPCI_NOT_FOUND`
race — but no such function was ever declared anywhere in the file (`dpciFields` only
exposed a read-only `dpciInvalid`, no setter). This would throw a `ReferenceError` at
runtime the one time this exact stale-race path fires, never caught because no existing
e2e test exercises a submit-time DPCI rejection after a successful client-side resolve.
Fixed by adding a `markInvalid()` escape hatch to `useDpciFields` (mirroring the one this
hook needed anyway for its own `UPC_NOT_FOUND` case) rather than reintroducing a raw
setter — the same "genuinely cross-cutting case" escape hatch Feature 10's own doc already
sanctions for exactly this shape of external rejection.

## Props / Hook API

Called as `useUpcField<T>(opts)`, where `T` is the caller's own resolved-data shape:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fetch` | `(upc: string) => Promise<T>` | yes | Resolves a UPC — each screen supplies its own endpoint/response (PAR/IID: item lookup; ISI: locations lookup) |
| `onResolved` | `(data: T, upc: string) => void` | no | Fires on success, with the resolved (trimmed) UPC alongside the data |
| `onNotFound` | `(upc: string) => void` | no | Fires on failure, alongside the hook's own `upcInvalid` flip |
| `onBeforeResolve` | `() => void` | no | Fires immediately before every resolve attempt — clearing a sibling DPCI chain, closing the numpad panel, etc. |

## Output

Returns `{ field, upcInvalid, loading, focusField, loadUpc, clear, markInvalid }`:

- `field` — the `useNumpadField` handle (`.value`/`.isActive`/`.set`/`.clear`/`.focus`)
- `focusField()` — registers the field's numpad handler, wired to resolve on confirm
- `upcInvalid` — true after a failed resolve, false after a successful one
- `loadUpc(value)` — populates the box *and* resolves, for a caller delivering a UPC
  outside the interactive typing path (a demo button, a `?upc=` URL param)
- `clear()` — resets the box and `upcInvalid`
- `markInvalid()` — escape hatch for a rejection discovered *outside* this hook's own
  resolve (a compound submit's stale-race server rejection) — marks invalid without
  running a fetch; a later successful resolve or `clear()` un-marks it

## Data flow

No external `value`/`onChange` — like `useDpciFields`, this hook's own state is the source
of truth for the UPC itself. A screen reads `field.value`/`field.isActive` directly for
rendering (via the shared `NumpadFieldBox` primitive, or a screen's own local box wrapper
built on it), and supplies `fetch`/`onResolved`/`onNotFound`/`onBeforeResolve` to own what
happens around the resolve without owning the field wiring or the async check itself.

Only a single field, unlike `useDpciFields`'s three-box chain, so there's no stale-closure/
ref hazard to guard against — `resolve` always reads the value passed to it directly
(from the numpad's own commit callback, or from `loadUpc`'s argument), never a value read
back off `field` itself.

## Consumers

- `PARPage.tsx` — the create form's UPC entry (also backfills the DPCI boxes on resolve —
  the confirmed asymmetric behavior, UPC never gets populated back)
- `IIDPage.tsx` — the lookup screen's UPC entry
- `ISIPage.tsx` — the storage-inquiry screen's UPC entry

`PIPPage.tsx` is deliberately **not** a consumer — see "What it is" above.

## Related

- [`useDpciFields`](useDpciFields.md) — the precedent this hook's shape mirrors, and the
  sibling hook every consumer here pairs with (each clears the other on resolve)
- [`NumpadFieldBox`](NumpadFieldBox.md) — the shared box primitive IID/ISI now render
  through directly (previously hand-rolled markup); PAR/PIP already routed through it via
  their own local wrapper components
- [`PalletIdField`](PalletIdField.md) — the precedent for the "compound submit, box-only,
  no internal validation" shape PIP's UPC field also follows
