# DemoScannerBar

**Category:** shared component (dev/test tooling, not shipped kiosk UI)
**File:** `apps/floor-app/src/components/shared/DemoScannerBar.tsx`

## What it is

Pallet ID's Demo Scanner (Feature 9, Phase 1) — the generalized 3-button pattern (**Valid
Pallet ID** / **Pallet ID by Status** / **Invalid Pallet ID**) replacing every screen's own
hand-rolled Pallet ID demo buttons (PII's old `STATUS_PICKER_OPTIONS`/`DemoPicker`, SDP's old
`✓ Put`/`✓ Move`/`⚠ Invalid Pallet` picker, MNP's old `✓ Put`/`✓ Move`/`✗ PID`). See
`DevNotes/DesignPrompts/Feature-9-AppWide-Demo-Scanner.md` for the full design — this doc
covers the component's own mechanics.

Owned internally by the Pallet ID field itself — [`usePalletIdField`](usePalletIdField.md)
(PII) and [`PalletIdField`](PalletIdField.md)'s opt-in `demoScanner` prop (SDP/MNP) each
register this component into the footer's demo slot whenever their own field is focused, not
wired per screen. Not a consumer of any registry file parameterized over multiple scan
types — deliberately Pallet-ID-specific, matching every later scan type's own choice to
build a dedicated bar component rather than generalize this one: `LocationDemoScannerBar`
(Location ID, Phase 2), `ContainerDemoScannerBar` (Container ID, CID phase), and
`ItemDemoScannerBar` (DPCI/UPC phase) each followed the same "one component per scan type"
precedent instead — `ItemDemoScannerBar` covers two scan types (DPCI and UPC) with one
implementation since they share 100% of the underlying Item-lookup logic, differing only in
which resolved field to deliver.

## Props / Hook API

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `onFill` | `(value: string) => void` | yes | Fills the resolved pallet id into the owning field — exactly like a real scanner delivery |
| `aisle` | `string` | no | SDP's own aisle-aware **Valid Pallet ID** (direct instruction) — when given, that button fetches a Put Pending pallet whose own Storage Code/Size will actually fit *this* aisle, instead of the generic unfiltered pick. Omitted by every other consumer (PII/MNP have no aisle context) |

## Output

Renders the 3-button bar. **Valid Pallet ID** calls `fetchValidPallet` (unfiltered
`GET /api/demo/pallet`, default status `stored`) — unless the `aisle` prop is given, in
which case it calls `fetchValidPalletForAisle` instead: a Put Pending pallet whose own
Storage Code/Size matches one of the given aisle's actually-eligible (EMPTY/STAGED, not
contracted, not held-blocking) locations, the same aisle-eligibility criteria Directed
Put's own default search already uses (`samplePalletByStatus`'s new `aisle` param — see
`api/functions/samples.ts`). **Invalid Pallet ID** fills a fixed,
guaranteed-nonexistent sentinel (`INVALID_PALLET_ID`, `'999999999'`) with no network call —
Invalid is strictly not-found (see the design doc's Core Concept section). **Pallet ID by
Status** opens a popup (unaffected by `aisle` — that popup's own Storage Code/Size filters
are the tester-driven equivalent, not aisle-scoped):

- **Status** dropdown — the real 7-value `PalletStatus` enum (`PALLET_STATUS_OPTIONS`),
  **defaults to `Put Pending`, not `Stored`** (direct instruction) — a not-yet-placed
  pallet is the more useful default starting point for SDP/MNP's own put-oriented flows,
  now that `PUT_PENDING` pallets reliably carry a real Storage Code/Size (see
  `reinstatePallet`/`reseedTestData`/`seed-pending-pallets.ts`'s own fixes).
- **Storage Code** / **Size** dropdowns — real, live data (`useStorageCodes()`/`useSizes()`,
  not a hardcoded list), each defaulting to "Any" (unfiltered). These pick the *starting*
  pallet's own native type (e.g. "give me an FD-L pallet"); a screen's own override fields
  (SDP's Size/Storage/Zone overrides, entirely outside this component) are the separate
  mechanism for redirecting that pallet elsewhere.
- **Find** — calls `fetchPalletByStatus` with the selected Status + optional Storage
  Code/Size, fills the result, and closes the popup.

**No quick-preset shortcuts** — an earlier revision had `Put`/`Move` one-tap buttons here
(pre-filling Status and firing Find immediately), resolving SDP's old two-dedicated-button
UX question generically. Removed by direct instruction once the Status dropdown's own
default (`Put Pending`) made a dedicated "Put" shortcut redundant, and "Move" is one dropdown
selection (`Stored`) away.

## Data flow

All network calls go through `apps/floor-app/src/lib/demoScanner.ts` (`fetchValidPallet`,
`fetchPalletByStatus`) — plain async functions, not hooks, so a future Playwright suite can
import and drive them directly without mounting a component. `PALLET_STATUS_OPTIONS`/
`INVALID_PALLET_ID` are also exported from that file as the canonical, single source of
truth for Pallet ID's own registry entry.

## Consumers

- `usePalletIdField.tsx` — registers `<DemoScannerBar onFill={loadPalletId} />` internally
  when `field.isActive`
- `PalletIdField.tsx` — registers `<DemoScannerBar onFill={fillFromDemo} />` internally when
  `demoScanner && field.isActive` (`fillFromDemo` reads the latest `onChange` via a ref so
  the registration doesn't need the caller's `onChange` to be memoized)

## Related

- `apps/floor-app/src/lib/demoScanner.ts` — the plain-data/fetch-function registry this
  component reads from
- [`usePalletIdField`](usePalletIdField.md) / [`PalletIdField`](PalletIdField.md) — the two
  field shapes that own this component's registration
- [`Dropdown`](../../apps/floor-app/src/components/shared/Dropdown.tsx) — the shared
  box-with-dropdown control the Status/Storage Code/Size selectors are built from
