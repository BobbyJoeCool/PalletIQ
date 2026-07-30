# ItemDemoScannerBar

**Category:** shared component (dev/test tooling, not shipped kiosk UI)
**File:** `apps/floor-app/src/components/shared/ItemDemoScannerBar.tsx`

## What it is

DPCI/UPC's Demo Scanner (Feature 9, DPCI/UPC phase) — the generalized 3-button pattern
(**Valid** / **by Filter** / **Invalid**) replacing IID/ISI's old unfiltered good/bad pair
and PAR's old 4-option `DemoPicker` (Valid/Valid w/ Expiration/Valid w/o
Expiration/Invalid). See `DevNotes/DesignPrompts/Feature-9-AppWide-Demo-Scanner.md`'s
"DPCI / UPC" section for the full design — this doc covers the component's own mechanics.

No Status dropdown — `Item` has no status column (confirmed, not worked around); the
middle button reads **"{label} by Filter"**, matching [`LocationDemoScannerBar`](LocationDemoScannerBar.md)'s
own naming for the same reason (multiple independent filter axes, no single status
concept).

DPCI and UPC are two distinct scan types sharing one Item-backed implementation — rather
than build two near-duplicate components, this one takes an `idType` prop that picks which
half of the resolved `{dpci, upc}` pair to deliver.

## Props

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `idType` | `'dpci' \| 'upc'` | yes | Which identifier this instance fills. `fetchValidItem`/`fetchItemByFilter` always resolve both `dpci` and `upc` together (one Item row); `idType` just picks which to hand to `onFill` |
| `onFill` | `(value: string) => void` | yes | Fills the resolved value into the owning field — exactly like a real scanner delivery |
| `label` | `string` | no | Overrides the button/popup text (defaults to `"DPCI"`/`"UPC"` from `idType`). PAR passes `"Item"` — see Consumers below |

## Output

Renders the 3-button bar. **Valid {label}** calls `fetchValidItem` — unfiltered
`GET /api/items/sample`, a fully random item. Unlike Container ID's own "Valid" (which
always filters by Pull Function, a mandatory screen context), DPCI/UPC has no equivalent
required context, so this is a plain unfiltered pick, same shape as Pallet ID's own
default. **Invalid {label}** fills a fixed, guaranteed-nonexistent sentinel
(`INVALID_DPCI`/`INVALID_UPC`) with no network call. **{label} by Filter** opens a popup:

- **Storage Code** dropdown — real, live data (`useStorageCodes()`, not a hardcoded list),
  defaults to "Any" (unfiltered).
- **Requires Expiration** dropdown — tri-state (`EXPIRATION_OPTIONS`: Any / Requires
  Expiration / No Expiration Required), backed by `Item.requiresExpirationDate`.
- **Handling Code** dropdown — tri-state (`HANDLING_OPTIONS`: Any / Conveyable /
  Non-Conveyable), backed by `Item.conveyable` — the one real column behind this
  worker-facing name today (confirmed against `api/prisma/schema.prisma`; no separate,
  richer "handling code" concept exists yet).
- **Find** — calls `fetchItemByFilter` with the three selected filters, fills the result,
  and closes the popup. This is what replaces PAR's old picker's "Valid w/
  Expiration"/"Valid w/o Expiration" options (now the Requires Expiration dropdown) and
  IID/ISI's total lack of filtering.

## Data flow

All network calls go through `apps/floor-app/src/lib/demoScanner.ts` (`fetchValidItem`,
`fetchItemByFilter`) — plain async functions, not hooks, same pattern as every other scan
type's own registry functions. `EXPIRATION_OPTIONS`/`HANDLING_OPTIONS`/`INVALID_DPCI`/
`INVALID_UPC` are also exported from that file as the canonical source of truth. Both
functions hit `GET /api/items/sample` (`api/functions/items.ts`'s `sampleItem`, extended
this phase with `storageCode`/`requiresExpirationDate`/`conveyable` query params) —
PAR's own prior dedicated endpoint, `GET /api/pallets/sample-reinstate`, is retired; its
only real payload (`{dpci, upc}`, optionally filtered by `requiresExpirationDate`) is a
strict subset of what the shared endpoint now does, and its `vcp`/`ssp`/`cartons`/`ssps`
fields were dead — no caller ever read them.

## Consumers

- `IIDPage.tsx` — one instance, switching `idType`/`onFill` based on `upcFields.field.isActive`
  (mirrors the screen's own prior demoScan/demoBad targeting logic)
- `ISIPage.tsx` — same pattern as IID
- `PARPage.tsx` — same switching pattern, but passes `label="Item"` (direct instruction) so
  it renders as a single 3-button group regardless of which identifier is active, rather
  than two separate DPCI/UPC groups. PAR shows its demo bar unconditionally (gated only on
  `isIM`, not on field focus, unlike every other consumer) — 6 simultaneous buttons (3 per
  identifier) would have overflowed the footer's fixed-height, non-wrapping row

## Related

- `apps/floor-app/src/lib/demoScanner.ts` — the plain-data/fetch-function registry this
  component reads from
- [`DemoScannerBar`](DemoScannerBar.md) / [`LocationDemoScannerBar`](LocationDemoScannerBar.md) /
  [`ContainerDemoScannerBar`](ContainerDemoScannerBar.md) — the three earlier scan types'
  own dedicated bar components
- [`useDpciFields`](../../apps/floor-app/src/lib/useDpciFields.ts) /
  [`useUpcField`](../../apps/floor-app/src/lib/useUpcField.ts) — the shared entry-field
  hooks IID/ISI/PAR all build on; see `useUpcField`'s own doc comment for the established
  UPC-resolves-DPCI / DPCI-clears-UPC asymmetric convention (unrelated to this component
  itself, but wired alongside it in the same DPCI/UPC phase)
- [`Dropdown`](../../apps/floor-app/src/components/shared/Dropdown.tsx) — the shared
  box-with-dropdown control the Storage Code/Requires Expiration/Handling Code selectors
  are built from
