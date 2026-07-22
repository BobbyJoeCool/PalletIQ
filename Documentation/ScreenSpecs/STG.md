# Screen Design: STG — Stage Aisle

**Device:** Tablet — iPad Pro 13" landscape, fixed 1366×1024 canvas (kiosk).
**Bucket:** Existing Warehouse App (current production screen).
**Roles:** All roles for staging itself; **Unstage Aisle** and the Unstage/Restage modal's
Apply action are gated to IM, Lead, Manager, Admin (hidden from Worker). Clear Forks and
each stack's own per-stack Fill/Clear are available to every role (they only touch local,
unsubmitted entry fields, never anything already staged).

Route: `/stage` · Jump code: `STG` · Component: `src/pages/STGPage.tsx`

This is the most heavily-revised screen in the app — full graphic/layout redesigns
shipped in v1.3.0 (single front-stack), v1.4.1 (reverted to three independent stacks), and
v1.6.6 (current fork-graphic/Master-Control/per-stack reorganization). Everything below
describes the **current, v1.6.6 end state**; see the Change Log for the lineage.

## Concept: Stack Queue (On Deck / Next / Staging)

STG models a fork-truck "triple" carrying up to three independent pallet stacks at once.
Each stack is a slot — **On Deck** (leftmost, closest to the mast/operator), **Next**
(middle), **Staging** (rightmost, "the end of the forks," closest to the Locations
panel) — holding its own Aisle/Storage Code/Size/Quantity. Only the **Staging** slot
(index 0 in `StagingContext`) ever computes destination locations or can be staged;
On Deck/Next are pure data entry for what's queued up behind it. When Staging stages
and clears, the queue **compacts forward**: whichever of Next/On Deck is filled slides
all the way into Staging, skipping past an empty slot in between if one exists (e.g. if
Next is empty but On Deck has data, On Deck jumps straight to Staging). If nothing was
queued behind it, the newly-emptied Staging slot inherits the just-staged stack's own
Aisle/Storage Code/Size for convenience (a repeat stage into the same aisle/type then
only needs a new Quantity). **(v1.7.0)** When there *was* something queued behind it,
each of Aisle/Storage Code/Size — independently — carries forward into whatever slot the
compaction newly opens up, but only if all three stacks (Staging, Next, On Deck) held the
*exact same value* for that field before staging (e.g. all three on Storage Code CR but
different Sizes persists only CR, not a Size). Distinct from the "nothing queued behind
it" case just above, which always persists every one of the staged stack's own fields
regardless of whether Next/On Deck had anything to compare against. See `compactStacks`
and `resetStackAfterStage` in `src/context/StagingContext.tsx`.

This queue — plus **Master Control** (a separate, independent Aisle/Storage Code/Size
used to drive the Live Info Panel below and to "Fill" stacks on request) and the
session's staging **Log** — is held in `StagingContext`, mounted once app-wide (in
`App.tsx`, not on this page), so navigating away from STG and back restores the forks
exactly as left. State clears only when the authenticated route tree unmounts (logout).

## Flow

1. Worker opens STG directly, or arrives pre-populated from ELA's/ELZ's "Stage Aisle"
   button (`{ aisle, storageCode, size? }` in router state). Pre-population **only ever
   fills Master Control** (never a fork/stack slot directly) and only applies once per
   navigation, gated on Master Control's own Aisle still being empty (v1.6.4 — see
   Behind the Scenes).
2. **Master Control** (top bar): worker fills Aisle (3-digit numpad, auto-commits/pads),
   Storage Code and Size (both `CodePickerField`-family, `strict` — a value typed that
   isn't actually valid clears itself and posts `"Master Control - Storage Code/Size -
   Invalid Entry"`). These three fields independently drive the **Live Info Panel** at
   the bottom of the screen (see step 6) regardless of whether Fill All has been used.
3. Worker fills each of the three stack boxes (**On Deck**, **Next**, **Staging**, left
   to right) with its own Aisle/Storage Code/Size/Quantity — either by hand, or:
   - **Fill All** (Master Control, top-left) — applies Master Control's current
     Aisle/Storage Code/Size to every stack slot that doesn't have a Quantity yet; never
     overwrites a slot the worker has already started entering a Quantity into.
   - Each stack's own **Fill** pill — pulls Master Control's Aisle/Storage Code/Size into
     just that one stack, independent of the other two.
   - Each stack's own **Clear** pill, or the Cab's **Clear Forks** button — clears that
     one stack's (or all three stacks') Aisle/Storage Code/Size/Quantity/computed
     locations; never touches Master Control.
4. Once the **Staging** slot's Aisle + Storage Code + Size + Quantity are all filled, the
   **Locations panel** (right of the stack boxes) fetches and displays up to Quantity
   destination locations as tappable bubbles (`{Aisle}-{Bin}-{Level}` format), laid out
   into 1/2/3 columns depending on count, sized dynamically to fill the panel's own
   measured space. If fewer locations are available than Quantity, the shortfall renders
   as red "No Location" bubbles — staging is still permitted for whatever is available.
5. Worker taps **STAGE** (only enabled once Staging's four fields are filled and at
   least one location is available): calls `POST /api/staging/stage`, marking every
   listed location `STAGED`, writing a log entry, and fetching a next-location
   look-ahead for that log entry's text. On success, the Staging slot clears and the
   queue compacts forward per the Concept section above.
   - 5a. If fewer locations were available than requested, the message bar shows a
     warning and the log entry is flagged; staging still proceeds for what was found.
6. **Live Info Panel** (below the stack-box row, full width): driven purely by Master
   Control's own Aisle/Storage Code/Size —
   - Nothing filled, or only Size filled → empty-state placeholder.
   - **Aisle present** (alone or with Storage Code/Size) → the literal ELZ display format
     (grid + zone summary), read-only, plus the session's own staging Log rendered inline
     in the space beside the zone summary. If every location in the aisle is `XS`, shows
     *"Cannot stage XS aisles"* instead.
   - **Storage Code present without an Aisle** (alone or with Size) → the literal same
     sortable `AisleSizeTable` ELA's own page uses; tapping a row commits that Aisle
     straight to Master Control (no separate confirm button, unlike ELA's own
     toggle-then-navigate flow).
7. **Log panel** — collapsed strip pinned to the bottom of the content slot, showing the
   most recent log entries; only rendered here while Master Control's Aisle is empty
   (once an Aisle is entered, the Log renders inline inside the Live Info Panel's own
   zone-summary column instead, so it never shows twice). Tapping either variant opens a
   full scrollable modal of the whole session's log.
8. **Refresh** (Master Control, right side) — manually re-triggers the Live Info Panel
   and the Staging slot's own location suggestion, independent of the automatic
   field-commit-triggered refresh.
9. **Unstage Aisle** (IM+ only, Master Control left side, red outline) — opens a modal
   listing every freight type currently present in the aisle (empty, staged, *or*
   already `STORED`), one row per type, each with an active/inactive toggle (the
   Storage-Code-Size bubble itself is the toggle), a Quantity field (numpad, clamped to
   that row's `empty + staged` max), a Max button, and a Clear Restage button. **Apply**
   clears every active row's currently-STAGED locations of that exact type, then stages
   the first `quantity` EMPTY locations of that type from the back — logged as one
   combined "restage" entry, reported in the message bar as a per-type summary (e.g.
   `"Cleared CR-M · Restaged 6 CR-L"`).
10. **Location suggestion reject/hold flow** — **every** bubble in the Staging slot's
    suggested-location queue is a tap target (v1.7.0, issue #97 — previously only the
    first bubble and the final/green bubble were tappable, per #77; reversed since
    rejecting any bubble always triggers the same full server-side re-suggestion
    regardless of which position was rejected, so there was never a queue-compaction
    reason tied to position). Tapping a bubble does **not** stage anything: it opens a
    confirmation popup ("Reject suggested location?") defaulting the reason code to
    `B05` ("Blocked", editable via the shared `ReasonCodeField` — an entry-with-dropdown-
    helper field as of v1.6.7, not a plain dropdown; type a code or tap the chevron for a
    popup of known ones).
    Confirming places a Hold Both on that location and recalculates a new suggestion.
    Cancelling leaves the original suggestion untouched. If no valid location remains
    after a rejection, the message bar reports `"No valid location available to
    suggest"`. The final/green bubble (Quantity fully satisfied) keeps its distinct green
    styling — every other bubble, including the first, shares the same blue style.

### Mis-scan / error handling

- A typed Storage Code, Size, or Aisle (on any stack, or on Master Control) that isn't
  actually valid clears itself and posts `"{Stack} Stack - Storage Code/Size/Aisle -
  Invalid Entry"` (or `"Master Control - ..."`) in the message bar. Per-stack Storage
  Code/Size validation (`strict`) is skipped while the narrowing reference data (the
  stack's own Aisle's freight types, or the full Storage Code list) hasn't loaded yet, so
  a value typed before that data arrives isn't falsely rejected.
  **App-wide red-wash audit (v1.7.0):** no field on this screen picked up the red-wash
  treatment (`DevNotes/DesignPrompts/Feature-8-AppWide-Invalid-Field-Wash.md`) — every one
  of these fields clears itself atomically on an invalid entry (`PalletCodePicker`'s own
  `strict` handling calls `field.clear()` before `onInvalid`; per-stack/Master Aisle both
  clear via `updateStack(index, { aisle: '' })` / equivalent), so there's never a moment
  where a bad value sits visibly in a box to wash — same finding, and same reasoning, as
  MNP's audit.
- A per-stack Aisle that doesn't actually exist (checked live against `GET
  /api/locations/empty-by-zone`) is cleared with `"{Stack} Stack - Aisle - Invalid
  Entry"`.
- Insufficient destination locations for the requested Quantity → shortfall renders as
  red "No Location" bubbles; staging still proceeds for whatever is available, and the
  post-stage message bar/log both report the shortfall as a warning.
- API failure on stage/restage/hold → message bar `"Staging failed"`/`"Restage failed"`/
  `"Hold placement failed — please try again"`; nothing is mutated.

### Status / messaging behavior

Message bar text persists until the next `setMessage` call replaces it (no auto-clear).
Successful stage/restage/hold actions also always play an audio tone (`playAlert('info'
| 'warning' | 'error')`) and write a log entry, independent of the message bar text.

**(v1.7.0, issue #95)** A stale error also clears on the next successful aisle confirm —
per-stack `handleAisleConfirm` now calls `clearMessage()` right after its
`empty-by-zone` existence check succeeds, so a prior invalid-entry error doesn't linger
through a subsequent valid one.

## Layout

```
┌──────────────────────────────── Header (104px) ─────────────────────────────────┐
├────────────────────────────── Message Bar (74px) ────────────────────────────────┤
├──────────────────────────── Content slot (792px) ────────────────────────────────┤
│              Master Control                                                     │
│ [Fill All][Unstage▲]   [Storage▾][Aisle][Size▾]         [Refresh]              │
│ ┌────────────────────────────────────────────┐ ┌─────────────────────────────┐  │
│ │ [Cab img]│ On Deck │  Next  │ Staging(blue) │ │ Locations                   │  │
│ │ Clear    │ Fill/Clr│Fill/Clr│  Fill/Clr     │ │  (bubbles, 1-3 cols,        │  │
│ │ Forks    │ Aisle   │ Aisle  │  Aisle        │ │   dynamic size)             │  │
│ │          │ Storage │Storage │  Storage      │ │                             │  │
│ │          │ Size    │ Size   │  Size         │ │                             │  │
│ │          │ Qty     │ Qty    │  Qty          │ │        [STAGE]              │  │
│ │──────────┴─────────┴────────┴───────────────│ └─────────────────────────────┘  │
│ │           (forks strip graphic, shelf)       │                                │
│ └───────────────────────────────────────────────────────────────────────────────┘  │
│ ┌───────────────────────────────────────────────────────────────────────────────┐  │
│ │ Live Info Panel: ELZ-format grid+summary+log (Aisle present)                 │  │
│ │        — or —  ELA-format sortable aisle table (Storage Code only)          │  │
│ │        — or —  empty-state placeholder                                      │  │
│ └───────────────────────────────────────────────────────────────────────────────┘  │
│ [ Log strip — only rendered while Master Control's Aisle is empty ]              │
├──────────────────────────────── Footer (54px) ───────────────────────────────────┤
└───────────────────────────────────────────────────────────────────────────────────┘
```

Note: On Deck/Next render at the two leftmost stack positions and Staging at the
rightmost (closest to the Locations panel) — index 2/1/0 left-to-right in code terms,
matching "front of the forks = furthest from the operator" regardless of the graphic's
own flipped orientation.

## Input handling

- **Master Control Aisle** and each **stack's Aisle**: numpad-driven (`useNumpadField`),
  3-digit auto-commit/pad (Master Control) or plain confirm-driven (stack boxes, via
  `handleAisleConfirm`, which also validates existence).
- **Master Control Storage Code/Size** and each **stack's Storage Code/Size**: both use
  the type-or-tap-chevron code-picker pattern — Master Control via the shared
  `StorageCodeField`/`SizeField` components; each stack via a local `PalletCodePicker`
  (a dedicated reimplementation of the same field+popup logic inside the pallet-slat
  visual chrome `PalletBox` uses, since `CodePickerField`'s own `size` variants don't
  match that box's rounding/height/label position). Both are `strict` once their
  narrowing data has loaded.
- **Quantity** (each stack) and **Unstage/Restage's per-type Quantity**: plain numpad
  fields.
- Physical barcode scanner input (`deliverScan()`) is available as a shared app
  capability but has no STG-specific scan target — this screen has no location/pallet
  barcode field of its own to scan into.
- All primary tap targets (Fill All, Unstage Aisle, Clear Forks, per-stack Fill/Clear,
  location bubbles, STAGE, Refresh) meet or exceed the app's 72px minimum touch-target
  height where they're a primary action; the per-stack Fill/Clear pills and PalletBox
  fields are deliberately compact (this screen packs far more controls into one row than
  any other screen) but remain individually tappable at their rendered size.

## Data

**Reads:**
- `Location.aisle/.bin/.level/.zone/.storageCode/.size/.status/.contraction/.holdCategory`
  — read across `GET /api/staging/next-location` (candidate search),
  `GET /api/staging/staged-types` (Unstage/Restage row set),
  `GET /api/locations/empty-by-zone` (Live Info Panel's ELZ mode, per-stack Aisle
  validation, and `useAisleFreightTypes`'s dropdown narrowing),
  `GET /api/locations/empty-by-aisle` (Live Info Panel's ELA mode).
- `StorageCode.id`/`.desc` — full reference list for un-narrowed popups.

**Writes:**
- `POST /api/staging/stage` — sets `Location.status: 'STAGED'` on every location in the
  submitted `locationIds` list (re-validated as still `EMPTY`+non-contracted at write
  time; a location that no longer qualifies is silently skipped and counted toward
  `shortfall` rather than failing the whole request). Writes one `ActivityLog` `STAGE`
  entry per successfully staged location, plus one combined `STAGE_SUM` entry for the
  whole action.
- `POST /api/staging/restage` — for each active freight type: clears every currently
  `STAGED` location of that exact type back to `EMPTY`, then stages the first `quantity`
  `EMPTY` locations of that type from the back. Writes per-location `STAGE` entries
  (method: `RESTAGE`) plus one combined `RESTAGE` `ActivityLog` entry for the whole
  action. IM+ only (`requireRole(auth, 'IM')`, 403 otherwise).
- `PATCH /api/locations/:id/hold` (reused, not STG-specific) — sets `holdCategory:
  'HOLD_BOTH'` on the rejected location with the chosen reason code, via the reject/hold
  flow.

**Not written:** Master Control's own Aisle/Storage Code/Size, and every stack's own
Aisle/Storage Code/Size/Quantity, live only in client-side `StagingContext` (session
state) — nothing about "what's currently queued on the forks" is persisted server-side
until a `STAGE`/`RESTAGE` call actually commits a location's status change. The staging
Log is likewise session-local and not the same thing as the app-wide 12-hour Activity Log
overlay (both exist independently).

## Screen Flow

Covers: pre-population from ELA/ELZ, Fill All / per-stack Fill / Clear Forks / per-stack
Clear, Staging-slot location computation and shortfall, Stage → queue compaction,
Unstage/Restage (IM+), reject/hold flow, Live Info Panel's three display modes, field
validation errors.

```mermaid
flowchart TD
    A[STG opens] --> B{Router state from ELA/ELZ, Master Control Aisle empty?}
    B -- Yes --> C[Pre-fill Master Control aisle/storageCode/size]
    B -- No --> D[Restore StagingContext session state as-is]
    C --> E[Master Control filled]
    D --> E
    E --> F{Worker fills stacks?}
    F -- Fill All / per-stack Fill --> G[Stack(s) get Master Control's aisle/storageCode/size]
    F -- Manual entry --> H[Worker types each field directly]
    G --> I{Staging slot has Aisle+Storage+Size+Qty?}
    H --> I
    I -- No --> J[Locations panel empty / STAGE disabled]
    I -- Yes --> K[Fetch next-location candidates]
    K --> L{Enough locations for Qty?}
    L -- No --> M[Shortfall shown as red No Location bubbles]
    L -- Yes --> N[Bubbles shown, next+last tappable]
    M --> O[Worker taps STAGE]
    N --> O
    O --> P[POST /api/staging/stage]
    P --> Q[Queue compacts forward; log entry written]
    N --> R[Worker taps next/last bubble]
    R --> S[Reject/hold confirm popup]
    S -- Confirm --> T[PATCH hold; recompute suggestion]
    S -- Cancel --> N
    E --> U{IM+ taps Unstage Aisle?}
    U -- Yes --> V[Modal: per-type rows from staged-types]
    V --> W[Worker sets quantities/toggles rows]
    W --> X[Apply -> POST /api/staging/restage]
    E --> Y[Live Info Panel driven by Master Control fields]
    Y --> Z{Aisle present?}
    Z -- Yes --> AA[ELZ-format grid+summary+log]
    Z -- No --> AB{Storage Code present?}
    AB -- Yes --> AC[ELA-format sortable table, tap row -> fills Aisle]
    AB -- No --> AD[Empty-state placeholder]
```

## Behind the Scenes

**Pre-population gate (B/C):** The pre-fill effect checks `!state?.aisle || master.aisle`
— it only ever applies once per navigation, using Master Control's own empty Aisle as the
"not yet applied" signal, and never writes to any stack slot directly (v1.6.4 product
decision, reversing v1.4.1's "auto-fill all three slots" behavior — see
`DevNotes/Fixes/ELA/03` and `STG/05`).

**Queue compaction (Q):** `resetStackAfterStage` clears index 0, then calls
`compactStacks` on `[empty, prev[1], prev[2]]` — compaction is a pure re-derivation from
"whichever slots are non-empty," not a persisted slot identity, which is what makes
"On Deck slides straight to Staging if Next is empty" fall out for free rather than
needing special-case logic. If the whole queue is now empty, the new Staging slot
inherits the just-staged Aisle/Storage Code/Size (not Quantity) for staging convenience.

**Location list fetch (K):** `GET /api/staging/next-location` takes a `count` param
(added v1.4.2/#75) so the server walks the bin/level cursor internally in one round trip
instead of the frontend issuing one HTTP call per pallet in Quantity — this was the fix
for a previously slow-feeling automatic refresh on every field commit.

**Dynamic bubble sizing (L/N):** Column count buckets off total bubble count (≤4 → 1
column, ≤8 → 2, else 3). Each bubble's width/height is computed from the Locations
panel's own `ResizeObserver`-measured content-box size, *minus* the actual rendered gap
space between columns/rows, divided by column/row count, then clamped to width ∈
[1/3, 1/2] and height ∈ [1/5, 1/3] of that gap-adjusted space. Two real bugs were fixed
getting here (both documented inline in `STGPage.tsx`): (1) the Locations panel's own
height was only ever set via flex `items-stretch`, making it a function of its own
bubble sizes — which were in turn computed from that same measured height, a closed
loop that grew bubbles without bound at 3+ pallets; fixed by anchoring the panel's height
to the (genuinely content-independent) Master-Control-plus-graphic column via
`useElementSize`/an explicit `height` prop. (2) the sizing math initially divided the
raw measured size by column/row count without subtracting the actual `gap-2`/`gap-1.5`
rendered between bubbles, so N bubbles + gaps summed to more than the container's real
size, clipping the last row/column.

**Stage write (O/P):** `stageLocations` re-validates every submitted location as still
`status: 'EMPTY', contraction: false` at write time (not just at candidate-fetch time) —
a location that another worker staged into in the meantime is silently skipped and
counted toward `shortfall`, not treated as a hard failure of the whole request. One
`STAGE`-type `ActivityLog` row is written per successfully staged location (not one
combined row) specifically so SAR's "Staged Longest" report column can query
per-location staged timestamps without re-parsing a JSON blob.

**Unstage/Restage (U-X):** `getStagedTypes` (v1.6.6) unions `EMPTY`+`STAGED`+`STORED`
rows so a freight type appears as a row even if nothing of it is currently staged yet
(broadened from STAGED-only, since this endpoint has exactly one caller — this modal —
so the contract was safe to change in place). `restageAisle` requires IM+
(`requireRole(auth, 'IM')`); a type simply absent from the submitted `types` array is
left completely untouched (not cleared, not restaged).

**Reject/hold flow (R/S/T):** Calls the same `PATCH /api/locations/:id/hold` endpoint
WLH uses, with `holdType: 'HOLD_BOTH'` — no STG-specific hold endpoint exists. The
`expectingSuggestionRef` flag is set right before the recompute this triggers, so only
*that* specific fetch resolution (not an ordinary shortfall from a large Quantity) is
allowed to report "No valid location available to suggest" as an error.

**Live Info Panel modes (Y-AD):** `InfoPanel`'s `mode` is purely `aisle ? 'elz' : storageCode
? 'ela' : 'none'` — Size alone never changes the mode. The `elz` branch additionally
special-cases an all-`XS` aisle (checked against every cell in the grid response, not
just the narrowed summary) to show "Cannot stage XS aisles" instead of rendering the
grid — since staging can't target XS locations at all. The `ela` branch renders the
literal same `AisleSizeTable` component ELA's own page uses (extracted in v1.6.6 so the
two can never diverge into two different sort implementations); tapping a row here
commits straight to `setMaster({ aisle })` rather than ELA's own select-then-navigate
flow, since there's no second screen to jump to from inside STG.

**Log panel dual rendering (7):** Rendered as the bottom-pinned `LogPanel` (`variant:
'bottom'`) only while Master Control's Aisle is empty; once an Aisle is entered, an
`inline`-variant `LogPanel` renders instead, inside `ElzFormat`'s own zone-summary
column — this is a deliberate v1.6.6 change to fill space that would otherwise sit empty
next to the zone summary, not a bug where the log renders twice (it's the same
`LogExpandedModal` either way when tapped).

## Open items still remaining

- **GitHub #88** — bad Contraction data (every RS/RF/BS location, plus some HS locations
  on Levels 2-9, incorrectly flagged as contracted) shows as incorrectly
  blocked/red/non-stageable on STG's own embedded Zone Map. Cross-referenced under ELZ
  too. Needs a data correction, not a code fix.
- **App-Wide v1.7.0 backlog items relevant to STG:**
  - Add whole-level Contraction support (mark an entire level contracted at once) — today
    per zone-side/level cell only.
  - Activity Log detail-line rework for STG-specific entries (staged/unstaged counts per
    freight type) is still on the app-wide backlog, separate from STG's own session-local
    Log panel described above.
  - Reason codes (used by the reject/hold flow's dropdown) don't yet match the documented
    Department+Code scheme — no DB-backed `HoldType` table or per-role department
    restriction (GitHub #84, flagged as needing a product conversation before any code
    change).
  - "Add screen persistence across the app" is partially already true for STG (via
    `StagingContext`, mounted app-wide) but the item as filed is broader than STG alone.
- **GitHub #83/#85/#86** (SDP/MNP-focused, not STG-specific) are adjacent but do not
  touch this screen's own code paths.
- No STG-specific open fix-list items remain from the v1.6.6 round itself — all 7
  original items plus several found live were shipped in that version (see Change Log
  and `DevNotes/Fixes/MASTER-CHECKLIST.md`'s STG section for the full item-by-item
  record).

## Change Log

| Date | Change |
|---|---|
| 2026-07-17 (v1.6.6) | Full layout/graphic redesign: two-piece Cab + Forks-strip crop replacing the old single small image; Master Control reorganized (Fill All/Unstage Aisle left, fields center, Refresh right) with a new all-roles "Clear Forks" button on the Cab graphic; per-stack Fill/Clear buttons added; per-stack Storage Code/Size converted to entry-with-dropdown-helper fields scoped to that stack's own Aisle; field validation added everywhere (invalid typed Storage Code/Size/Aisle now clears itself and posts an explicit message-bar error instead of silently committing); STG/ELZ Zone Summary switched to color-coded `ZoneCodeBadge` pills; dynamic Locations-panel bubble sizing (1/2/3 columns based on count, sized to available space) replacing the old fixed 5-per-column/112×32px bubbles; Unstage/Restage modal now lists every freight type present (not just currently-staged), with the type bubble itself as the active/inactive toggle; "no Aisle" bottom info panel switched onto the literal shared `AisleSizeTable` ELA's own page uses; final assigned bubble is green and tappable (not red/dead); Staging stack sits in its own blue-bordered box. Fixed several bugs found live: bubbles not clearing on valid→invalid Quantity; Unstage/Restage's Apply dropping an unconfirmed typed quantity; "Fill All" incorrectly disabled when arriving from ELZ; contracted Storage Code/Size never appearing in dropdown-helper popups (also fixed on ELZ/SDP); bubbles growing without bound at 3+ pallets (a self-referential height/bubble-size measurement loop); bubbles slightly oversized at 3+ per column/3 columns (gap space not subtracted from the sizing math). |
| 2026-07-16 (v1.6.4) | Pre-population from ELA/ELZ's "Stage Aisle" now only fills Master Control — no fork/stack slot is written directly; the worker fills stacks themselves via Fill All or a per-stack fill button (reverses v1.4.1/#81's "auto-fill all three slots" behavior; product decision made while fixing ELA/03 and STG/05). |
| 2026-07-11 (v1.4.2) | `GET /api/staging/next-location` gained a `count` param — the server now walks the bin/level cursor internally across up to `count` locations in one request, instead of the frontend issuing one HTTP round-trip per pallet in Quantity (#75). |
| 2026-07-11 (v1.4.1) | **Redesign:** restored three independent stack-entry boxes (On Deck/Next/Staging) after v1.3.0/#77's single-stageable-front-stack model turned out not to match how staging actually works physically (filed as a production Blocker/Major bug). Only Staging computes locations/can be staged; queue compaction (skipping empty slots) added. Destination-location list moved into a dedicated bubble-grid Locations panel (5 per column, wrapping to more columns); graphic shrunk further, `object-contain` instead of `object-fill` to stop `Triple.png` distorting. Master Control's Fill All and ELA/ELZ's "Stage Aisle" pre-population both restored to filling every slot again (later reversed in v1.6.4, see above). |
| 2026-07-11 (v1.4.0) | App-wide code-picker fields (type-or-tap-chevron) rolled out to Master Control's Storage Code/Size, narrowed to what's present in the entered aisle via the existing `empty-by-zone` endpoint (#80). |
| 2026-07-10 (v1.3.1) | SDP-side change with STG relevance: Directed Put now prefers STAGED locations over EMPTY ones when Consolidating mode is off, so pallets a GPMer staged land next to what was already staged for them rather than scattering (#79). |
| 2026-07-10 (v1.3.0) | **Redesign:** collapsed the three-independent-fork-stacks model down to a single stageable **front stack** (only stack, "front" = furthest from operator, fixed regardless of graphic orientation); graphic flipped so forks point right and shortened; Fill All/Unstage Aisle moved onto the graphic itself, top-left over the operator's compartment; added the location-suggestion reject/hold flow (tap the next suggestion to place a Hold Both with a reason code — default "Blocked" — and get a new suggestion, without staging); added the manual Refresh button (#76); Unstage Aisle button enlarged/reddened (#74) (later superseded by v1.4.1's three-stack restoration and v1.6.6's further graphic/button reorganization, though the reject/hold flow and manual Refresh both persist unchanged through every later redesign). |
| 2026-07-09 (v1.2.0) | Old all-or-nothing "Unstage Aisle" modal replaced entirely by the per-freight-type popup (one row per type actually staged, deactivate to skip, quantity clamped to `empty+staged` max, one combined Apply) (#58). Added the Live Info Panel (Feature 2) — Master Control's Aisle/Storage Code/Size now surface a live ELZ-format or ELA-format display at the bottom of the screen, replacing the old single static aisle map (#57). Also fixed: Master Control's Storage Code/Aisle fields now auto-commit at their fixed lengths, matching every other screen. |
| 2026-07-07 (v1.0.6) | Fixed: STG's zone map (and other screens) redrew more often than their inputs actually changed — root-caused to `MessageBarContext`'s `setMessage`/`clearMessage` not being memoized, so STG's zone-map fetch effect re-ran on every message-bar update anywhere in the app, not just its own aisle/storage-code changes. |
| 2026-07-06 (v1.0.5) | Fixed (all 6 items filed against STG in the v0.9.1 bug report, frontend-only): master info now fully pulls in when navigating to STG from ELZ/ELA; second/third stack location-collision and no-propagation bugs fixed via client-side priority-order exclusion between sibling stacks (a since-superseded architecture, replaced by v1.3.0/v1.4.1's single-computing-stack model); Fill All's disabled state now responds to quantity entry; dynamic sizing + bold red final location added to the per-stack "Pallets Go To" list; STG's embedded zone map (`AisleGrid`, `dense` prop) made visibly narrower than ELZ's own full-page rendering (the `dense` prop itself was later retired entirely in v1.6.6, once STG's info panel was expanded to `flex-1`). |
| 2026-07-06 (v1.0.4) | Fixed: STG showed no active-state (focused-field) indicator at all on several of its fields — every numpad/keyboard-driven field, including STG's, now turns its border red while active. |
| 2026-07-05 (v0.9.0) | Initial build — v0.9.0 (2026-07-05). Shipped as a new feature not present in the legacy system this project improves on: three independent fork-truck stack positions (Aisle/Storage Code/Size/Quantity each), a pallet-rider-triple graphic (already flagged mid-session for a further visual redesign), Master Control's Fill All, per-stack live destination-location list with dynamic sizing, IM+ Unstage Aisle, and a collapsible session log — largely superseded in presentation by every redesign listed above, but establishing the core staging/queue/back-to-front-fill model that has persisted through all of them. |
