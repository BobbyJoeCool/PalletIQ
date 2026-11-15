# Screen Design: PRQ — Pull Request

**Device:** Tablet — iPad Pro 13" landscape, fixed 1366×1024 canvas (kiosk)
**Bucket:** Existing Warehouse App (new screen, v1.8.10)
**Roles:** All roles, identical content for all

## Overview

PRQ shows pull activity for an aisle, workstation, or aisle range — broken down by pull function and batch date — with three levels of progressive drill-down: summary → per-aisle → per-location → pull detail popup.

**Route:** `/reporting/pull-request`
**Jump code:** `PRQ`

## Container Status Scope

Only three container statuses are queryable: **Available**, **Printed**, **Verified**. **(v1.10.0, #213)** "Verified" filters on the stored status `PULLED` (shared `PRQ_STATUS_FILTERS`). Before this change it queried a `VERIFIED` status nothing writes, so it always came back empty. The pull-detail popup labels PULLED containers "VERIFIED". The status filter dropdown is limited to these three — Diverted, Canceled, and Purged containers cannot be looked up on this screen. The pull-detail popup's container list shows all six statuses since it reflects the full record for one specific pull.

## Entry Filters

- **Aisle** (numpad, 3-digit) — uses shared `useAisleField` hook with existence check.
- **End Aisle** (optional, numpad, 3-digit) — defines a range. Must be higher than Start Aisle; an End Aisle with no Start Aisle is rejected with the same error (v1.9.1). Range checks share `lib/rangeValidation.ts`'s `isRangeEndValid`.
- **Workstation** (keyboard, CodePickerField via `WorkstationField`) — mutually exclusive with Aisle fields. Entering a workstation clears the aisle fields, and vice versa.
- **Status** (dropdown) — required, defaults to unselected. Available / Printed / Verified only.

Until both Aisle-or-Workstation **and** Status are filled, the screen shows an empty-state prompt.

**Live filtering:** results populate as soon as a valid filter combination exists; no separate search button.

## Drill-Down Levels

### Level 1 — Summary

Groups containers by **Batch Date × Pull Function** (fixed order: CA, CF, FP, BK). Workstation/range mode sums across all aisles in the range.

Per-function row content:
- **CA / CF / FP:** `Cartons: ## Locations: ## Density: ##.#`
- **BK (Bulk):** Full Pallets, Pallet Density, Loose Cartons, Carton Density, Locations

**Sort:** Batch Date ascending, then function in fixed order.

**Select-then-zoom-in:** tapping a row highlights it; double-tap or Zoom In button drills to L2 (range/workstation) or L3 (single aisle).

### Level 2 — Per-Aisle Breakdown

Shown only for range/workstation-scoped queries. Same batch-date/function totals broken out per aisle.

**Row header:** Aisle number. **Row body:** same format as L1 for that function, scoped to one aisle.

### Level 3 — Location-Level

Shows individual locations with container quantity totals.

**Additional filters:** Bin range (start/end), Level, Carton count range (Cartons Min / Cartons Max).

**(v1.9.1, #135 gap-fill)**
- **Bin End** must be higher than Bin Start ("End bin must be higher than the start bin."); a Bin End with no Bin Start is rejected the same way. Changing Bin Start to a value that invalidates the current Bin End clears Bin End.
- **Cartons Min / Max** — inclusive range on each location's total pull cartons for this batch/function (API `cartonMin`/`cartonMax`). Either bound may be used alone; Min = Max expresses an exact count. Max below Min is rejected ("Max cartons must be at least the min cartons.").
- **Function** and **Batch Date** dropdowns appear at L2 and L3, pre-filled by zoom-in and editable (Batch Date options are the current L1 summary's distinct batch dates).
- Every L2/L3 filter change re-queries live. Previously, editing Bin/Level after arriving at L3 never re-fetched.
- **Deferred:** PRQ.md's Breakpack row (Conveyable / Breakpack Cartons / Loose SSPs) and a true Bulk row wait on #195 (Breakpack workflow) and #137 (Bulk Pull). Breakpack-Workflow.md later ruled out a separate BKP pull function.

**Row:** `{Aisle-Bin-Level}` — `Cartons: ## Pallets: ## SSPs: ##`

**Sort:** Aisle, Bin, Level ascending.

Select-then-zoom-in opens the pull-detail popup.

## Pull Detail Popup

Full-screen overlay showing complete detail for one pull:

**Header — three columns (tappable links):**
| Location → LII | DPCI → IID | Pallet → PII |
|---|---|---|
| Location status | UPC, description, storage code | Pallet status, quantity, VPC/SSP |

**Pull metadata:** Pull type, Batch Date, pull quantity (pallet/carton/SSP).

**Container list:** every container ID attached to this pull, each with status badge and quantity breakdown. Tapping a CID navigates immediately to CII (no select-then-zoom-in — direct jump). Back button returns to the popup.

## API Endpoints

- `GET /api/pulls/summary` — query params: `aisleStart`, `aisleEnd`, `workstation`, `status`, `batchDate`, `pullFunction`, `byAisle`. Returns `{ rows: SummaryRow[] }`.
- `GET /api/pulls/detail` — query params: same as summary plus `aisle`, `binStart`, `binEnd`, `level`, `cartonMin`, `cartonMax` (non-negative integers; 400 `INVALID_INPUT` otherwise). Returns `{ locations: DetailLocation[] }`.

## State Persistence

`PRQContext` / `PRQProvider` persists filter state, current drill-down level, and selected row index across navigation within the session. Cleared on logout (provider unmounts with ProtectedRoute).

## Files

- `apps/floor-app/src/pages/PRQPage.tsx` — main page with filter bar, 3 level tables, zoom-in button, pull detail popup
- `apps/floor-app/src/context/PRQContext.tsx` — filter/level/selection state
- `api/functions/pullRequest.ts` — summary + detail API endpoints

## Tab Order

Tab / Back Tab navigates between numpad-driven fields in this order (wraps in
both directions), inside the `PRQFilterBar` component:

1. Aisle
2. End Aisle
3. Workstation
4. Bin Start *(Level 3 drill-down only)*
5. Bin End *(Level 3 drill-down only)*
6. Level *(Level 3 drill-down only)*
7. Cartons Min *(Level 3 drill-down only)*
8. Cartons Max *(Level 3 drill-down only)*

Fields 4-8 are enabled only when the current drill-down level is L3
(location-level).
