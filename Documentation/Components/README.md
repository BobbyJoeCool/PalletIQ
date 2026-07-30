# Component Documentation

One file per shared entry-field/display-field component or hook, covering what it is,
its full props/hook API, what it outputs (rendered markup, callbacks, internal state
owned), how data flows through it, and who currently consumes it.

Written incrementally as part of Feature 10 (`DevNotes/DesignPrompts/Feature-10-AppWide-
Field-Component-Architecture.md`) — a doc is added/updated the same session a component
is built or migrated, not as a deferred batch pass. Treat a missing doc for an existing
shared component as a gap to fill, not evidence the component doesn't matter.

## Template

Each doc follows this shape:

```markdown
# {ComponentName}

**Category:** entry field | display field | shared hook | chrome wrapper
**File:** `apps/floor-app/src/...`

## What it is
One paragraph — purpose, and why it exists as its own component/hook rather than being
inline per-screen.

## Props / Hook API
Table: name | type | required | default | description

## Output
What it renders (for a component) or returns (for a hook) — including internal state it
owns and callbacks it fires, and when.

## Data flow
How a value gets in, how it gets out, what's owned internally vs. supplied externally —
per Feature 10's contract, this should read as "owns its own validation," not "screen
computes and hands down."

## Consumers
Every current screen/component using this, with file:line.

## Related
Sibling components/hooks (e.g. a chrome wrapper's underlying behavior hook).
```

## Index

- [`useCodePickerField`](useCodePickerField.md) — shared hook behind every
  type-or-pick-from-popup field
- [`CodePickerField`](CodePickerField.md) — the filter-bar-style chrome wrapper
- [`StorageCodeField`](StorageCodeField.md)
- [`SizeField`](SizeField.md)
- [`ZoneField`](ZoneField.md)
- [`useExpirationDateFields`](useExpirationDateFields.md) — Month/Day/Year chain
- [`vcpSspValidation`](vcpSspValidation.md) — VCP/SSP/SSPs-on-Pallet shared rules (pure functions, not a hook)
- [`useLocationRangeFields`](useLocationRangeFields.md) — Bin/Level range (WLH)
- [`WorkstationField`](WorkstationField.md)
- [`PalletIdField`](PalletIdField.md)
- [`NumpadFieldBox`](NumpadFieldBox.md) — shared box primitive several fields build on
- [`useDpciFields`](useDpciFields.md) — Dept/Class/Item chain (PAR/IID/ISI/PII)
- [`useUpcField`](useUpcField.md) — single-box UPC entry (PAR/IID/ISI)
- [`useAisleField`](useAisleField.md) — bare single-box Aisle filter (ELA/WLH/SDP/STG)
- [`LocationEntryFields`](LocationEntryFields.md) — the 3-box Aisle/Bin/Level chain (8 screens)
- [`DataRow`](DataRow.md) — display
- [`StatusBadge`](StatusBadge.md) — display
- [`ZoneCodeBadge`](ZoneCodeBadge.md) — display
- [`LiveId`](LiveId.md) — display + navigation
- [`usePalletIdField`](usePalletIdField.md) — self-validating Pallet ID entry (PII)
- [`DemoScannerBar`](DemoScannerBar.md) — Feature 9 Phase 1's generalized Pallet ID demo/test scanner
- [`LocationDemoScannerBar`](LocationDemoScannerBar.md) — Feature 9 Phase 2's generalized Location ID demo/test scanner (WLH/LII/MNP/PAR)
- [`ContainerDemoScannerBar`](ContainerDemoScannerBar.md) — Feature 9's CID phase generalized Container ID (Label) demo/test scanner (PIP)
- [`ItemDemoScannerBar`](ItemDemoScannerBar.md) — Feature 9's DPCI/UPC phase generalized Item demo/test scanner (IID/ISI/PAR)
