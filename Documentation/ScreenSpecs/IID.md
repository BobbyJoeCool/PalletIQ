# Screen Design: IID — Item ID Lookup

**Device:** Tablet — iPad Pro 13" landscape, fixed 1366×1024 canvas (kiosk)
**Bucket:** Existing Warehouse App (current production screen)
**Roles:** All roles (Worker, IM, Lead Worker, Manager, Admin) — the screen itself is fully read-only, no edit capability under any role (item data is managed outside this app). One role-gated element as of v1.6.8: the "Reinstate Pallet" hot button only renders for IM+ (see Flow item 7) — it navigates elsewhere rather than editing anything on this screen.

## Flow

1. Worker arrives at `/item` via Home, HotJump ("IID"), or by tapping any DPCI/UPC chip elsewhere in the app (navigates here with `?dpci=` or `?upc=`).
2. The Dept box of the DPCI entry auto-focuses ~50ms after mount.
3. Worker resolves an item one of two independent ways:
   - 3a. **DPCI entry:** types Dept (3 digits, auto-advances), then Class (2 digits, auto-advances), then Item (4 digits, auto-resolves the lookup). The three display boxes are also populated directly (bypassing the typed chain) when the whole DPCI arrives at once — via `?dpci=`, a demo button, or a UPC-lookup fallback — so they never show stale `—` placeholders despite a loaded item.
   - 3b. **UPC entry:** types/scans into the UPC field (keyboard-driven), confirms, resolves the lookup independently of the DPCI boxes.
4. On confirm, the corresponding endpoint is called: `GET /api/items/dpci/:dpci` or `GET /api/items/upc/:upc`.
   - 4a. **Found:** item data renders below the entry fields. Whichever field *wasn't* used to look the item up is cleared (a DPCI lookup clears UPC; a UPC lookup clears the three DPCI boxes).
   - 4b. **Not found:** see Mis-scan handling below.
5. Both entry paths remain live after a successful load — typing a new value into either resolves a new item without navigating away.
6. A "View Storage Locations" button (v1.6.8, `DevNotes/Fixes/IID/01`) sits below the read-only field list once an item is loaded — navigates to `/storage-inquiry?dpci=` for the loaded item's DPCI, which ISI resolves automatically on arrival (see ISI.md's deep-link support, also added in v1.6.8).
7. A "Reinstate Pallet" button (v1.6.8) sits alongside it, but only for IM+ roles (same `isIM` check as PARPage.tsx's own role gate) — navigates to `/pallet/reinstate?dpci=`, which PAR resolves into its DpciField on arrival. A Worker never sees this button at all, even though the route itself would still block them with PAR's own Access Denied message if they somehow reached it another way.

### Mis-scan / error handling

- `GET /api/items/dpci/:dpci` or `/upc/:upc` 404: `playAlert('error')`, message bar `"Item not found"`, item data cleared. The field(s) that were used **stay visible with the bad value** (v1.6.8 — previously cleared; changed per direct feedback so the worker can see what didn't resolve).
- A DPCI whose digit count doesn't total 9 across the three boxes never reaches the API at all — each box only auto-advances/resolves once it hits its own fixed length (3/2/4), so an incomplete entry simply sits waiting for more input rather than erroring.

### Status / messaging behavior

- Error messages use the shared MessageBar — non-blocking, persists until the next message or navigation.
- A `"Loading…"` pulsing placeholder shows while the fetch is in flight, hiding any previously-loaded item data during that window.

## Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ‹ Back   ⌂ Home   >_ Jump   ☰ Activity      ITEM ID LOOKUP      J. Smith  Logout │  104px Header
├──────────────────────────────────────────────────────────────────────────────┤
│                              (Message Bar — success/error text)                │  74px
├──────────────────────────────────────────────────────────────────────────────┤
│  DPCI                                   UPC                                   │
│  ┌─────┐ - ┌────┐ - ┌──────┐            ┌──────────────┐                      │
│  │ 123 │   │ 45 │   │ 6789 │            │ 001234567890 │                      │
│  └─────┘   └────┘   └──────┘            └──────────────┘                      │
│  (Dept)    (Class)  (Item, auto-resolves)  (keyboard-driven, independent)     │
│                                                                                 │
│  DPCI              123-45-6789                                                │
│  UPC               001234567890                                               │
│  Name              Widget, 12-Pack                                            │
│  Short Description WIDGET 12PK                                                │
│  Description       Widget, standard 12-pack case                              │
│  Retail Price      $19.99                                                     │
│  Cost              $8.42                                                      │
│  Unit Weight       4.25 lbs               ← v1.6.8, "—" if item hasn't been weighed │
│  Storage Code      CR                                                         │
│  Conveyable        Yes                                                        │
│                                                                                 │
│  [View Storage Locations]  [Reinstate Pallet]  ← Reinstate is IM+ only (v1.6.8) │
│                                                                                 │  content: 792px
├──────────────────────────────────────────────────────────────────────────────┤
│ [123 Keypad] [ABC Keyboard]    ✓ Scan DPCI   ✗ Bad DPCI      BD 26198 7/17 3:41 PM │ 54px Footer
└──────────────────────────────────────────────────────────────────────────────┘
```

## Input handling

- Dept/Class/Item boxes: numpad-driven via `useNumpadField('numpad', maxLength, padOnSubmit=true)` — 3/2/4 digits respectively, each auto-submitting the instant its fixed length is reached (no explicit OK required), and left-zero-padded if an explicit shorter confirm is given (e.g. typing "5" and hitting OK on Dept submits "005").
- UPC field: numpad-driven (`useNumpadField('numpad')`, no fixed length — switched from the full Keyboard panel in v1.1.5/issue #56 since UPCs are always numeric; this section's older wording still said "keyboard-driven" until this correction), requires an explicit confirm (Enter/OK), or an atomic hardware-scanner `deliverScan()`.
- The Dept→Class→Item auto-advance chain uses refs (`deptValueRef`/`classValueRef`), not direct reads of the field hook's `.value`, to avoid a stale-closure hazard: the chain's handlers are registered once at mount and would otherwise always see the values frozen at that render.
- All buttons/fields meet the 72px+ min touch target convention used app-wide (each entry box is 64px tall, matching PII's Pallet ID box sizing).
- Footer demo buttons target whichever entry method currently has focus (v1.6.8): by default (DPCI boxes focused, or nothing focused yet) they read "✓ Scan DPCI"/"✗ Bad DPCI"; the instant the UPC field is focused they relabel to "✓ Scan UPC"/"✗ Bad UPC" and route through `loadByUpc` instead. "Scan" fetches a real random DPCI+UPC pair from `/api/items/sample` and looks up whichever one matches the focused field; "Bad" looks up a guaranteed-nonexistent value (`999-99-9999` for DPCI, `999999999999` for UPC).

## Data

**Reads:**

- `Item` (by composite `DPCI` key, or by `upc` unique key) — dept, class, item, upc, name, desc, descShort, retailPrice, cost, unitWeight (v1.6.8), packingZoneCode, storageCode, conveyable

**Writes:** None — IID is fully read-only under every role; there is no PATCH/edit endpoint for `Item` reachable from this screen or anywhere else in the app. Item data is managed outside PalletIQ entirely.

**Not written:** No `ActivityLog` entry is produced by looking up an item here — IID performs no state-changing action, so nothing is logged.

## Screen Flow

Covers: DPCI lookup (found/not found), UPC lookup (found/not found), `?dpci=`/`?upc=` pre-population, and the mutual-clear behavior between the two entry paths.

```mermaid
flowchart TD
    A[Arrive at /item] --> B{?dpci= or ?upc= present?}
    B -- dpci --> D1[loadByDpci]
    B -- upc --> D2[loadByUpc]
    B -- neither --> C[Ready: focus Dept box]
    C --> S1[Type Dept 3 digits] --> S2[Auto-advance Class]
    S2 --> S3[Type Class 2 digits] --> S4[Auto-advance Item]
    S4 --> S5[Type Item 4 digits] --> D1
    C -.independently, type/scan UPC.-> D2
    D1 --> E1{Found?}
    D2 --> E2{Found?}
    E1 -- no --> F1[playAlert error, 'Item not found', bad DPCI stays visible]
    E2 -- no --> F2[playAlert error, 'Item not found', bad UPC stays visible]
    F1 --> C
    F2 --> C
    E1 -- yes --> G[Loaded: clear UPC field, show item data]
    E2 -- yes --> H[Loaded: clear DPCI boxes, show item data]
    G --> I{Worker enters new value}
    H --> I
    I -- DPCI --> D1
    I -- UPC --> D2
```

## Behind the Scenes

**Two independent lookup paths converge on the same display.** `loadByDpci` and `loadByUpc` are separate callbacks hitting separate endpoints (`/api/items/dpci/:dpci` vs `/api/items/upc/:upc`), each clearing the *other* entry method's field(s) on invocation (not just on success) — so switching entry methods always leaves exactly one method's fields populated, never both or neither.

**Whole-DPCI callers still populate all three boxes.** `loadByDpci` explicitly splits a dash-joined DPCI string and calls `.set()` on all three field hooks before the fetch resolves — this exists because callers that supply a whole DPCI at once (the demo button, the `?dpci=` URL param) would otherwise leave the three display boxes showing their `—` placeholder even though the item successfully loaded; only the manual typed-entry chain naturally fills them one box at a time as the worker types.

**Bad value stays visible on error, demo buttons target whichever field has focus (v1.6.8):** Both changed per direct feedback. Since `loadByDpci`/`loadByUpc` already populate their fields with the attempted value *before* the fetch resolves (see above), the only change needed was removing the `.clear()` calls from each `catch` block — a 404 now simply leaves what was already displayed instead of wiping it back to `—`. `demoScan`/`demoBad` both read `upcField.isActive` at call time to decide whether to fetch/attempt a DPCI or a UPC, and the footer's `demoSlot` label reads the same flag, so focusing the UPC field relabels the buttons and retargets them together rather than as two independently-maintained pieces of state. Required extending `GET /api/items/sample` to also return `upc` alongside `dpci` (previously DPCI-only).

**The Item model has no VCP/SSP fields**, despite the original `DevNotes/Screen-Specs/IID.md` spec's read-only field table listing them — a documented mismatch in the current code (`IIDPage.tsx`'s own top-of-file comment calls this out directly): VCP/SSP are set per-pallet at receiving time in this data model, not fixed at the item level. This screen displays the Item model's real fields instead (retail price, cost, unit weight, packing zone code, storage code, conveyable) — see the source comment referencing "phase-9 log" for the original investigation.

**Unit Weight (v1.6.8)** — `Item.unitWeight`, a nullable `Decimal(10,2)` in pounds, added alongside the ISI fix-list round in the same version. Nullable since not every item in the catalogue has been weighed; renders as `"—"` rather than `"0.00 lbs"` when null, same convention as every other optional field on this screen. No edit capability, consistent with the rest of IID — set outside this app like every other Item field.

**"View Storage Locations" button (v1.6.8, closes `DevNotes/Fixes/IID/01`)** — navigates to `/storage-inquiry?dpci=` using `item.dpci` directly (the already-formatted, dash-joined string the API returns), relying on ISI's own `?dpci=` query-param handling to auto-resolve on arrival rather than passing router state. ISI didn't actually support any pre-population before this version despite its own spec claiming otherwise (see ISI.md's Behind the Scenes) — both sides of this fix landed together in v1.6.8.

**"Reinstate Pallet" button (v1.6.8) is a client-side convenience gate, not the actual enforcement.** `isIM` is computed identically to `PARPage.tsx`'s own check (`['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '')`), duplicated rather than shared since no common role-check utility exists yet anywhere in the app (every screen with an IM+ gate computes its own `isIM` locally — see PARPage.tsx, PIIPage.tsx, SDPPage.tsx, STGPage.tsx). Hiding the button from a Worker is purely UX; PARPage independently re-enforces the same gate itself (Access Denied render) and the API's `reinstatePallet` handler enforces it server-side regardless of what the client shows, so there's no security reliance on this button's visibility. Like "View Storage Locations," it navigates via `?dpci=` (`/pallet/reinstate?dpci=${item.dpci}`) rather than router state — PAR's mount effect (`useSearchParams`) reads it into `DpciField`'s state, reusing the same `parseDpciString` helper PAR's own sample-reinstate demo button already used.

**No session-local history on this screen.** Like LII, IID keeps no in-screen log of prior lookups — a new resolve simply replaces whatever item was previously displayed, and nothing is written to the app-wide Activity Log overlay since no state changes.

## Open items still remaining

- The Item model/data mismatch versus the original `IID.md` spec (VCP/SSP listed there but not present on the model) has been resolved in code but never formally back-ported into a corrected written spec until this rebuild — flagging here in case any other document still references the stale field list.
- No GitHub issue is currently open specifically against IID (see CHANGELOG's "Unreleased — Reported Issues" section as of this writing).

## Change Log

| Date | Change |
|---|---|
| 2026-07-18 (v1.6.8) | Added `Unit Weight` (nullable, lbs) to the read-only field list — new `Item.unitWeight` schema column. Added the "View Storage Locations" button (closes `DevNotes/Fixes/IID/01`), navigating to ISI pre-populated via `?dpci=`; ISI's own side of this (actually consuming the param) was built in the same version — see ISI.md. Two further live-feedback fixes: a bad DPCI/UPC now stays visible in the entry field(s) on a not-found error instead of being cleared, and the "Scan"/"Bad" footer demo buttons relabel to target UPC whenever the UPC field has focus (required extending `GET /api/items/sample` to also return `upc`). Also corrected this doc's stale "UPC field is keyboard-driven" line (it's been numpad-driven since v1.1.5/issue #56 — the wording just never caught up). Added a second hot button, "Reinstate Pallet," IM+ only, navigating to PAR pre-populated via `?dpci=` — PAR gained matching `?dpci=` pre-population support in the same round (see PAR.md). |
| 2026-07-17 | Rebuilt onto the new standard template from `DevNotes/Screen-Specs/IID.md`, grounded directly in the current `IIDPage.tsx`/`items.ts` code. Corrected the read-only field list to match the actual Item model (no VCP/SSP — see Behind the Scenes) rather than repeating the stale spec table. No behavioral changes made as part of this rebuild. |
| 2026-07-11 (v1.6.1) | Every fixed-width numeric field, including IID's Dept/Class/Item boxes, now accepts a short entry on explicit submit, left-zero-padded (e.g. "5" + OK submits "005"). |
| 2026-07-08 (v1.1.5) | UPC field switched from opening the full on-screen Keyboard to the Numpad, since UPCs are always numeric (issue #56). |
| 2026-07-08 (v1.1.0) | DPCI entry split into three separate Dept/Class/Item boxes with auto-advance, replacing one combined field (issue #16) — same pattern later reused by ISI; fixed a bug where the three display boxes stayed on `—` placeholders after a demo scan or `?dpci=` link despite the item loading successfully. |
| 2026-07-06 (v1.0.4) | Fixed missing focused-field (red border) highlighting on the DPCI/UPC fields. |
| Initial build — v0.9.0 (2026-07-05) | IID shipped as part of the initial feature-complete build: read-only item lookup for all roles by DPCI or UPC, no edit capability. |
