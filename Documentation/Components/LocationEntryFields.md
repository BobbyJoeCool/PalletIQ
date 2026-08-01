# LocationEntryFields

**Category:** entry field (chrome + partial validation ownership)
**File:** `apps/floor-app/src/components/shared/LocationEntryFields.tsx`

## What it is

Shared three-field Aisle/Bin/Level entry with auto-advance, plus an always-on full 8-digit
barcode-scan override (or 6-digit, when `levelOptional`) — genuinely, fully adopted
everywhere Location ID is entered: WLH, LII, MNP, PIP, SDP, PAR, and STG's own render of it
where applicable. Predates Feature 10 (this doc was written retroactively, issue #162) —
originally pure rendering, taking `invalid`/`aisleInvalid`/`binInvalid`/`levelInvalid`/
`groupInvalid` as caller-supplied booleans with no endpoint call of its own.

**Issue #162 gave it optional internal ownership of the Aisle/Bin progressive existence
checks** (not the full Level resolution — see Data flow below) — but only PAR opted in
this round, per direct instruction (a deliberate, confirmed scope decision, not an
oversight): LII/MNP/PIP/SDP/WLH each either have no per-box check today, or push their
"is this valid" question onto a compound domain endpoint (MNP's confirm, PIP's verify) that
isn't a pure existence check at all — extending internal ownership to them was deferred,
not attempted. `checkAisle`/`checkAisleBin` are additive, optional props; every existing
caller's own `aisleInvalid`/`binInvalid` external-prop usage keeps working unchanged when
those props are omitted.

## Props / Hook API

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `onResolved` | `(locationId: string, wasScanned: boolean, demoLevel?: number) => void` | yes | | Fires once a full Aisle+Bin(+Level) value resolves, by scan, by completing every non-locked manual field, or by the built-in Demo Scanner. `demoLevel` (Feature 9, Phase 2) is populated only for a `levelOptional` demo fill (MNP) — the exact level the Demo Scanner picked, which its 6-digit value can't itself carry |
| `autoFocus` | `boolean` | no | `true` | Auto-focuses the first non-locked field on mount |
| `value` | `string` | no | | External prefill/clear — `''` clears all three boxes, an 8-digit string fills them directly. Also clears internal Aisle/Bin invalid state (see Data flow) |
| `highlight` | `boolean` | no | `false` | Legacy border-only whole-group highlight, unused by any current caller |
| `onActiveChange` | `(active: boolean) => void` | no | | Fires whenever the aggregate active state (any of the 3 boxes focused) changes |
| `lockedAisle` / `lockedLevel` | `string` | no | | Locks a box to a fixed value, shown disabled |
| `size` | `'default' \| 'large'` | no | `'default'` | `'large'` is SDP's Confirm Location panel |
| `levelOptional` | `boolean` | no | `false` | A manually-typed Aisle+Bin (no Level) is sufficient to resolve — used by MNP, whose Level comes from its own modal |
| `checkAisle` | `(aisle: string) => Promise<{exists: boolean}>` | no | | **Issue #162.** When provided, the component owns the Aisle existence check internally instead of a caller computing its own `aisleInvalid` |
| `checkAisleBin` | `(aisle: string, bin: string) => Promise<unknown>` | no | | Same internal-ownership shape, one box further in; skipped while Aisle is already known invalid |
| `onAisleValidityChange` / `onBinValidityChange` | `(invalid: boolean) => void` | no | | Fires when the internal check's result changes — only meaningful alongside `checkAisle`/`checkAisleBin` |
| `aisleInvalid` / `binInvalid` | `boolean` | no | `false` | External override — ignored for whichever box has its own internal check active |
| `levelInvalid` | `boolean` | no | `false` | Always externally supplied — the full Level resolution stays screen-owned (see Data flow) |
| `groupInvalid` | `boolean` | no | `false` | Whole-group wash for a caller whose failure can't be attributed to one box (WLH's whole-location lookup) |
| `demoScanner` | `boolean` | no | `false` | **Feature 9, Phase 2.** Opts into the built-in Location ID Demo Scanner — registered via the shared footer demo-slot only while one of the three boxes has focus, mirroring `PalletIdField`'s own `demoScanner` prop. WLH/LII/MNP/PAR opt in; PIP/SDP don't — their own Location ✓/✗ buttons stay screen-owned |
| `demoItemStorageCode` | `string` | no | | PAR's own "Wrong Storage Type" Demo Scanner option — the already-resolved item's own Storage Code, passed through to `LocationDemoScannerBar` |
| `demoScannedPalletId` | `number` | no | | MNP's own "Consolidate" Demo Scanner option — the already-scanned pallet's own id, passed through to `LocationDemoScannerBar` |
| `disabled` | `boolean` | no | `false` | **Issue #188 (PIP).** Disables all three boxes; auto-focus is skipped while true |
| `onLockedMismatch` | `(message: string) => void` | no | | **Issue #183's follow-up.** Fires instead of `onResolved` when a scanned/demo-filled value's Aisle or Level segment disagrees with `lockedAisle`/`lockedLevel` — a locked field is a known-correct value, so this short-circuits before ever reaching the server. Delivers a ready-to-display message, e.g. `"Scanned Location incorrect Aisle (316)"`, meant for the caller's message bar — the locked box itself keeps showing its own known-correct value throughout, unchanged (2026-08-01 — an earlier version instead swapped the box's own display to the scanned wrong value; found confusing on a greyed-out/disabled-looking box and reverted). Omit for a caller with no locked fields (LII/WLH) |

## Output

Renders the 3-box Aisle/Bin/Level chain. No return value (it's a component, not a hook).

## Data flow

Deliberately split ownership, not all-or-nothing:

- **Aisle/Bin progressive existence** (`checkAisle`/`checkAisleBin`) — internal when
  provided, mirroring `useAisleField`/`useUpcField`'s `fetch` contract exactly. A full
  8-digit (or 6-digit, `levelOptional`) barcode-scan override, or a fresh `value` prefill,
  clears any internal invalid state left over from a prior manual attempt — the same
  "override bypasses the interactive chain, and stale per-box state no longer means
  anything" reasoning `useDpciFields`/`useUpcField` already established.
- **Full Level resolution** — deliberately **not** absorbed into this component, even for
  PAR. Every caller's own "what does a fully-resolved location actually mean" question is
  irreducibly different: PAR fetches rich occupied/held/contraction status for a
  warn-then-allow popup; WLH does a plain existence lookup to gate its Hold panel; MNP
  defers the entire question to a server confirm call with occupied/contracted/hold gates;
  PIP has no client-side check at all, just a compound pull-verify POST. Forcing a single
  shape onto all of that would either lose real behavior or turn this component into a
  kitchen-sink API. Each caller keeps its own final resolve logic and passes `levelInvalid`
  in externally, unchanged by issue #162.
- **Demo Scanner fills** (Feature 9, Phase 2) — `LocationDemoScannerBar` always resolves a
  6-digit Aisle+Bin id plus the exact `level` of the row it picked (the demo endpoint never
  returns a full 8-digit id itself), except the Invalid sentinel, already a complete
  8-digit override with no level to splice in. `levelOptional` determines the assembly,
  mirroring what a real scan of that length would do: deliver the 6-digit id as-is (plus
  `demoLevel`, for MNP's Level Confirmation pre-fill) when the field accepts that;
  otherwise splice `level` in to form a full 8-digit value before calling `onResolved`.
- **Locked-field mismatch short-circuit** (issue #183's follow-up) — a full-value
  scan/demo-fill still splits and displays across the *editable* boxes, matching what was
  actually scanned. A locked box never changes what it displays, whether or not it matches —
  it's a known-correct value already, so there's nothing to show — but if its own segment of
  the scanned value disagrees with `lockedAisle`/`lockedLevel`, `onLockedMismatch` fires with
  a ready-to-display message and `onResolved` is never called: a mismatched locked field is
  definitively wrong (it's the pallet's own known-real value), so there's nothing the server
  could usefully add. Only Aisle is checked before Level (same "attribute to the
  first/smallest checkable unit" convention every other box in this component already
  follows) — a value wrong in both only ever reports Aisle.

## Consumers

- `PARPage.tsx` — full internal Aisle/Bin ownership (`checkAisle`/`checkAisleBin`, issue
  #162); own `levelInvalid` via `checkLocation`; `demoScanner` + `demoItemStorageCode`
- `LIIPage.tsx` — plain rendering, single external `onResolved`, no per-box props;
  `demoScanner`
- `MNPPage.tsx` — `levelOptional`, no invalid-wash props (message-bar + remount instead);
  `demoScanner` + `demoScannedPalletId`
- `PIPPage.tsx` — `lockedAisle`/`lockedLevel`, `onActiveChange`, `disabled` (issue #188 —
  gated on CID status), `onLockedMismatch` (issue #183's follow-up), `groupInvalid` (issue
  #185 — whole-value server mismatch); own Location ✓/✗ buttons stay screen-owned, no
  `demoScanner`
- `SDPPage.tsx` — `size="large"`, `onActiveChange`, no invalid-wash props; own Location ✓/✗
  buttons stay screen-owned, no `demoScanner`
- `WLHPage.tsx` — `groupInvalid` (the prop's own original motivating example); `demoScanner`
- `STGPage.tsx` — does not use this component at all (Aisle-only, no Bin/Level concept —
  see `useAisleField`'s own doc)

## Related

- [`useAisleField`](useAisleField.md) — the bare single-box Aisle filter this component's
  own 3-box chain is explicitly distinct from; its `checkAisle`/`checkAisleBin` props
  mirror that hook's `fetch` contract
- [`useDpciFields`](useDpciFields.md) / [`useUpcField`](useUpcField.md) — the precedent for
  an override/prefill clearing stale internal invalid state
- [`LocationDemoScannerBar`](LocationDemoScannerBar.md) — the component this field owns the
  registration of (Feature 9, Phase 2)
