# LocationDemoScannerBar

**Category:** shared component (dev/test tooling, not shipped kiosk UI)
**File:** `apps/floor-app/src/components/shared/LocationDemoScannerBar.tsx`

## What it is

Location ID's Demo Scanner (Feature 9, Phase 2) — the generalized pattern (**Valid
Location** / **Location by Filter** / **Invalid Location**, plus two host-supplied
escape-hatch options) replacing WLH/LII/MNP/PAR's own hand-rolled Location ID demo buttons
(WLH's old `✓ Load Location`/`✗ Bad Location`/`Find Held Location`/`Find Available
Location`; LII's old `✓ Scan Location`/`Find by Status` `DemoPicker`/`✗ Bad Location`; MNP's
old `✓ Empty`/`~ Occupied`/`⛔ Contraction`/`⇄ Consolidate`; PAR's old `Location` button
opening its own `empty`/`occupied`/`invalid`/`held`/`contracted`/`wrongType` `DemoPicker`).
See `DevNotes/DesignPrompts/Feature-9-AppWide-Demo-Scanner.md` for the full design — this
doc covers the component's own mechanics.

PIP and SDP's own Location ✓/✗ buttons are **not** replaced by this component — both test
"does this scan match what's already loaded" (PIP replays the label's own resolved
location; SDP replays the already-directed location), not "find a location matching these
filters," a fundamentally different semantic no filter combination can express. They stay
screen-owned, the same precedent PIP's Pallet ID/UPC fields kept in Phase 1.

Owned internally by [`LocationEntryFields`](LocationEntryFields.md)'s opt-in `demoScanner`
prop — registers this component into the footer's demo slot whenever one of its three
boxes has focus, not wired per screen.

## Props

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `onFill` | `(locationId: string, level?: number) => void` | yes | Fills the resolved location — a 6-digit Aisle+Bin id plus the exact level of the row actually picked (real results), or an already-complete 8-digit id with `level` omitted (the Invalid sentinel, which needs no assembly). `LocationEntryFields` owns turning this into `onResolved`'s call, splicing `level` in or passing it through as `demoLevel` depending on its own `levelOptional`. |
| `itemStorageCode` | `string` | no | PAR's own **Wrong Storage Type** option — only rendered when the host screen supplies the already-resolved item's own Storage Code; omitted (WLH/LII/MNP) hides the option entirely rather than showing something that can't run. |
| `scannedPalletId` | `number` | no | MNP's own **⇄ Consolidate** option — only rendered when the host screen supplies the already-scanned pallet's own id; omitted (WLH/LII/PAR) hides the option entirely. |

## Output

Renders the button bar. **✓ Valid Location** calls `fetchValidLocation` (unfiltered
`GET /api/demo/location`, no query params — a genuinely random real location, matching
what a physical barcode scan could actually land on). **✗ Invalid Location** fills a fixed,
guaranteed-nonexistent 8-digit sentinel (`INVALID_LOCATION_ID`, `'99999999'`) with no
network call. **Location by Filter** opens a popup with four independent axes plus five
column filters:

- **Status** dropdown (`LOCATION_STATUS_OPTIONS`) — `Any` (default) | `Empty` | `Stored` |
  `Staged` | `Reserved` | `Pull Pending`. Defaults to `Any` (not a real status) so the Hold
  axis alone can reproduce WLH's retired "Find Held/Available Location" buttons' original
  status-agnostic query — those never cared about occupancy at all.
- **Hold** dropdown (`HOLD_OPTIONS`) — independent of Status (`Location.holdCategory`):
  `Any` (default) | `Not Held` | `Hold Any` | `Hold In` | `Hold Out` | `Hold Both` |
  `Hold Perm`.
- **Contraction** dropdown (`CONTRACTION_OPTIONS`) — independent, tri-state: `Any`
  (default) | `Contracted` | `Not Contracted`.
- **Multi-Occupant** dropdown (`MULTI_OCCUPANT_OPTIONS`) — independent, tri-state: `Any`
  (default) | `Multiple Pallets` | `Single Pallet or Empty`.
- **Storage Code** / **Size** dropdowns — real, live data (`useStorageCodes()`/
  `useSizes()`), each defaulting to "Any."
- **Zone** / **Aisle** / **Level** — free-text numeric inputs (no small fixed set to choose
  from), each blank = unfiltered.
- **Find** — calls `fetchLocationByFilter` with every selected value, fills the result, and
  closes the popup.

Two extra buttons render conditionally: **Wrong Storage Type** (only when `itemStorageCode`
is given) calls `fetchWrongTypeLocation` — an EMPTY location whose own Storage Code
deliberately does *not* match, exercising PAR's Storage-Code mismatch warn-then-allow flow
on demand. **⇄ Consolidate** (only when `scannedPalletId` is given) calls
`fetchConsolidateLocation` — a location whose stored occupant shares the scanned pallet's
DPCI, exercising MNP's combine popup on demand.

## Data flow

All network calls go through `apps/floor-app/src/lib/demoScanner.ts`
(`fetchValidLocation`/`fetchLocationByFilter`/`fetchWrongTypeLocation`/
`fetchConsolidateLocation`) — plain async functions, not hooks, mirroring the Pallet ID
registry's own shape. `LOCATION_STATUS_OPTIONS`/`HOLD_OPTIONS`/`CONTRACTION_OPTIONS`/
`MULTI_OCCUPANT_OPTIONS`/`INVALID_LOCATION_ID` are exported from that same file as the
canonical source of truth for Location ID's own registry entry. The backend endpoint
(`GET /api/demo/location`, `sampleLocation` in `api/functions/samples.ts`) never returns a
full 8-digit id itself — only a 6-digit Aisle+Bin plus the exact `level` of the row it
picked — so every real fetch's result needs the caller (here, `LocationEntryFields`) to
decide how to assemble or deliver that.

## Consumers

- `LocationEntryFields.tsx` — registers `<LocationDemoScannerBar onFill={handleDemoFill}
  itemStorageCode={demoItemStorageCode} scannedPalletId={demoScannedPalletId} />`
  internally when `demoScanner && isActive`

## Related

- `apps/floor-app/src/lib/demoScanner.ts` — the plain-data/fetch-function registry this
  component reads from (shared file, also holds the Pallet ID registry entries)
- [`LocationEntryFields`](LocationEntryFields.md) — the field that owns this component's
  registration and the `onResolved`/`demoLevel` assembly logic
- [`DemoScannerBar`](DemoScannerBar.md) — Pallet ID's Phase 1 equivalent, the pattern this
  component mirrors
- [`Dropdown`](../../apps/floor-app/src/components/shared/Dropdown.tsx) — the shared
  box-with-dropdown control every fixed-option selector is built from
