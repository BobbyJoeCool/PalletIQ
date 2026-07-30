# ContainerDemoScannerBar

**Category:** shared component (dev/test tooling, not shipped kiosk UI)
**File:** `apps/floor-app/src/components/shared/ContainerDemoScannerBar.tsx`

## What it is

Container ID's Demo Scanner (Feature 9, CID phase) — the generalized 3-button pattern
(**Valid Label** / **Label by Status** / **Invalid Label**) replacing PIP's old bespoke
`✓/✗ Scan Label` pair plus its dedicated `⚠ Invalid Label` picker (Wrong Function/Pulled/
Canceled/Purged). See `DevNotes/DesignPrompts/Feature-9-AppWide-Demo-Scanner.md` for the
full design — this doc covers the component's own mechanics.

Button labels stay worded around "Label" (the physical printed artifact a worker scans) —
only the underlying entity and its own internal code identifiers renamed to Container as
part of the app-wide Label→Container rename (2026-07-30); see that rename's own log entry
(`DevNotes/Logs/V1.8/version-1_8_0.md` §1.2.45) for the full worker-text-stays/
internal-identifiers-rename split.

Per the design doc's Core Concept section ("Invalid is strictly not-found"), the four old
picker options are now just Status picks in the by-status popup below — **Invalid Label**
is a plain not-found sentinel, same as every other scan type.

PIP is the only consumer today (CII, issue #136, will be the second once built) — matches
[`LocationDemoScannerBar`](LocationDemoScannerBar.md)'s own precedent of building a real
per-scan-type component rather than a per-consumer one, even before a second consumer
exists.

## Props

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `onFill` | `(value: string) => void` | yes | Fills the resolved container id into the owning field — exactly like a real scanner delivery. PIP passes `deliverScan` directly |
| `fn` | `string` | yes | PIP's currently-selected Pull Function. Required, not optional — PIP only accepts a container whose own `pullFunction` matches it, so (unlike Pallet ID's aisle filter, SDP-only) there's no "omitted" case to design around; every consumer has this context |

## Output

Renders the 3-button bar. **Valid Label** calls `fetchValidContainer(token, fn)` —
`GET /api/demo/container?fn={fn}`, a PRINTED container matching the given Pull Function
(unlike Pallet ID's unfiltered "Valid" button, this filter isn't optional here, since a
container that doesn't match the selected function would immediately fail PIP's own
`FN_CHECK` step). **Invalid Label** fills a fixed, guaranteed-nonexistent sentinel
(`INVALID_CONTAINER_ID`, `'INVALID-CID-000'`, matching the `INVALID-PID-000` convention)
with no network call. **Label by Status** opens a popup:

- **Status** dropdown — the real 6-value `ContainerStatus` enum (`CONTAINER_STATUS_OPTIONS`),
  defaults to `Printed` — the normal scannable state (matches `sampleContainer`'s own
  default), the most useful starting point for a worker demoing a real pull.
- **Pull Function** dropdown — `PULL_FUNCTIONS` (CA/CF/FP), defaults to "Any" (unfiltered),
  same default-blank convention every other filter in this feature uses.
- **Find** — calls `fetchContainerByStatus` with the selected Status + optional Pull
  Function, fills the result, and closes the popup. This is what replaces the old picker's
  Wrong Function (pick a Pull Function different from the selected one, any status),
  Pulled/Canceled/Purged (pick that status, any function) options — all reachable as plain
  Status/Pull-Function combinations now.

## Data flow

All network calls go through `apps/floor-app/src/lib/demoScanner.ts`
(`fetchValidContainer`, `fetchContainerByStatus`) — plain async functions, not hooks, same
pattern as Pallet ID's own registry functions. `CONTAINER_STATUS_OPTIONS`/
`INVALID_CONTAINER_ID`/`PULL_FUNCTIONS` are also exported from that file as the canonical
source of truth — `PULL_FUNCTIONS` itself moved there from `PIPPage.tsx` (previously
screen-local) since this component needs the same list for its own dropdown.

## Consumers

- `PIPPage.tsx` — renders `<ContainerDemoScannerBar onFill={deliverScan} fn={pullFunction} />`
  directly inside its own `demoSlot` `useMemo`, gated on `containerField.isActive` — PIP's
  Label field has no shared field component of its own (single consumer, unlike Pallet
  ID/Location ID), so this bar is wired screen-side rather than registered internally by a
  field component the way `DemoScannerBar`/`LocationDemoScannerBar` are

## Related

- `apps/floor-app/src/lib/demoScanner.ts` — the plain-data/fetch-function registry this
  component reads from
- [`DemoScannerBar`](DemoScannerBar.md) / [`LocationDemoScannerBar`](LocationDemoScannerBar.md) —
  the two earlier scan types' own dedicated bar components, same 3-button shape
- [`Dropdown`](../../apps/floor-app/src/components/shared/Dropdown.tsx) — the shared
  box-with-dropdown control the Status/Pull Function selectors are built from
