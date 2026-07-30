# usePalletIdField

**Category:** shared hook
**File:** `apps/floor-app/src/lib/usePalletIdField.tsx`

## What it is

Self-validating Pallet ID entry field (Feature 9, Phase 1) — for the one current consumer
whose Pallet ID scan is a genuine "does this pallet exist, fetch its data" check (PII).
Mirrors `useUpcField`'s shape exactly: same `fetch`/`onResolved`/`onNotFound`/
`onBeforeResolve` contract, `invalid`/`loading` state owned internally, a `loadPalletId` for
populating-and-resolving in one call, and a `clear`.

**Not** for a compound-submit consumer like SDP/MNP (Pallet ID + Aisle/overrides -> one
directed-put or manual-scan request) or PIP (Pallet ID + Container -> one verify request) —
those stay on the plain, render-only [`PalletIdField`](PalletIdField.md) component with
their own screen-owned submit handler, the same established precedent as PIP's UPC field
staying off `useUpcField` for the identical reason (see that hook's own docstring). This
distinction was checked directly against PII's and SDP's actual `onChange` handlers before
building anything — PII's `loadPallet` turned out to be a clean existence-check-and-fetch;
SDP's `handlePalletScan` turned out to be a compound submit, structurally identical to
PIP's UPC field.

**Owns its own Demo Scanner registration internally**, keyed off its own `field.isActive` —
calls `useDemoSlot(...)` with a memoized `<DemoScannerBar onFill={loadPalletId} />` exactly
when the field is focused. PII no longer builds any Pallet-ID-specific demo slot of its own
(no more `STATUS_PICKER_OPTIONS`/`pickStatus`/`demoScan`/`demoBad`/`useDemoSlot` call in
`PIIPage.tsx`).

## Props / Hook API

Called as `usePalletIdField<T>(opts)`:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fetch` | `(pid: string) => Promise<T>` | yes | Resolves a Pallet ID against the API — PII wires `GET /api/pallets/:id` |
| `onResolved` | `(data: T, pid: string) => void` | no | Fires on a successful resolve, with the resolved (trimmed) Pallet ID alongside the data |
| `onNotFound` | `(pid: string) => void` | no | Fires on a failed resolve, in addition to the hook's own `invalid` flip |
| `onBeforeResolve` | `() => void` | no | Fires immediately before every resolve attempt — PII uses this to `hidePanel()`/`clearMessage()` and discard in-progress Edit mode |

## Output

Returns `{ field, invalid, loading, focusField, loadPalletId, clear }` — same shape as
`useUpcField`'s equivalent members.

## Data flow

No external `value`/`onChange` — this hook's own state is the source of truth, same as
`useUpcField`/`useDpciFields`. A screen reads `field.value`/`field.isActive` directly to
render its own `NumpadFieldBox` (PII sizes it via `PalletIdField`'s own exported
`PALLET_ID_SIZE_PRESETS.default`, rather than duplicating the literal Tailwind classes), and
supplies `fetch`/`onResolved`/`onNotFound`/`onBeforeResolve` to own what happens around the
check without owning the field wiring itself.

## Consumers

- `PIIPage.tsx` — `fetch` wired to `GET /api/pallets/:id` (typed `PIIPalletData`);
  `onBeforeResolve` closes the numpad panel, clears the message bar, and discards in-progress
  Edit mode (reading current `screenState` via a ref, since the hook's own `resolve` doesn't
  re-subscribe to these callbacks on every render — same convention as `useUpcField`);
  `onResolved` sets the loaded pallet and `screenState`; `onNotFound` shows "Pallet not
  found" and resets to `ready`.

## Related

- [`useUpcField`](useUpcField.md) — the precedent this hook's shape mirrors
- [`PalletIdField`](PalletIdField.md) — the render-only component SDP/MNP/PIP still use for
  their own compound-submit Pallet ID scans
- [`DemoScannerBar`](DemoScannerBar.md) — the Demo Scanner this hook owns internally
