# Screen Design: ISI — Item Storage Inquiry

**Device:** Tablet — iPad Pro 13" landscape, fixed 1366×1024 canvas (kiosk)
**Bucket:** Existing Warehouse App (current production screen)
**Roles:** All roles (Worker, IM, Lead Worker, Manager, System Admin) — read-only lookup, no role gate anywhere in the flow

## Flow

1. Worker navigates to ISI (route `/storage-inquiry`) via the Location Management home menu, HotJump (`ISI`), or a `?dpci=` deep link from another screen's clickable DPCI/UPC.
2. The screen auto-focuses the Dept box on mount (50ms after render, same pattern as IID).
3. Worker enters the item's DPCI as three separate boxes — Dept (3 digits), Class (2 digits), Item (4 digits) — using the on-screen Numpad. Each box auto-advances to the next once its fixed length is reached:
   - Dept confirms and advances to Class once exactly 3 digits are entered.
   - Class confirms and advances to Item once exactly 2 digits are entered.
   - Item confirms and, once exactly 4 digits are entered, immediately resolves the full DPCI lookup — no separate "OK"/submit tap needed for the overall search.
   - Typing fewer digits than a box's full length and tapping OK is accepted and left-zero-padded (e.g. "5" → "005" for Dept), consistent with every other fixed-width numeric code in the app.
4. On lookup, the screen calls `GET /api/items/dpci/:dpci/locations`.
   - **3a — Item not found:** see Mis-scan / error handling below.
   - **3b — Item found, zero locations:** the results panel shows "No locations currently storing this item" — a valid, non-error empty state, distinct from a bad DPCI.
   - **3c — Item found, one or more locations:** a scrollable list renders, one row per stored pallet of that DPCI, sorted ascending by aisle → bin → level. Each row shows the formatted Location ID and "Pallet {id}".
5. Worker taps a row to select it (tapping an already-selected row deselects it — `toggleSelect`). Selecting a row reveals two hot buttons next to the DPCI entry: "Go to Location ID" and "Go to Pallet ID," which navigate to `/location?id=` / `/pallet?id=` for that row's values.
6. Nothing on this screen is ever written — it is a pure lookup, same spirit as IID (Item ID Lookup) and read-only PII/LII views.

### Mis-scan / error handling

- **DPCI has no matching Item** (API returns 404 `NOT_FOUND`): `playAlert('error')`, message bar shows `Item not found`, and all three Dept/Class/Item boxes are cleared back to empty so the worker can retry from scratch. The results list is cleared (`null`) rather than showing a stale prior lookup.
- **Malformed/partial DPCI reaching the API** (should not normally happen given the fixed-length auto-advance, but the API itself independently validates): `400 INVALID_INPUT` if the combined value isn't exactly 9 digits — surfaces the same generic failure path as a 404 in the current UI (both hit the same `catch` block).
- A `?dpci=` deep link or a demo-button scan that supplies a whole DPCI at once populates all three display boxes directly (`deptField.set`/`classField.set`/`itemField.set`) rather than leaving them on their `—` placeholders — this was a real bug (fixed in v1.1.0) where the fields stayed blank despite the item loading successfully.

### Status / messaging behavior

- The message bar is non-blocking; an error message (`Item not found`) persists until the worker's next action clears it (a fresh field edit doesn't auto-clear it — the field-clear on error is what resets the visible state).
- A `Loading…` (animated, muted) placeholder shows between submitting the lookup and the response returning; it replaces the results area, not the message bar.
- There is no "success" message bar text on a normal lookup — the results list appearing *is* the success state. No audio plays for a normal successful hit, only for the error case.

## Layout (landscape, full app shell)

```
┌───────────────────────────────────────────────────────────────────────────┐  104 px  Header
│ ‹ Back | ⌂ Home | JUMP   ·· ITEM STORAGE INQUIRY ··   J. Smith | ☰ Activity | Logout │
├───────────────────────────────────────────────────────────────────────────┤   74 px  Message Bar
│  ● (idle / "Item not found" / etc.)                                       │
├───────────────────────────────────────────────────────────────────────────┤  792 px  Content
│  DPCI                                     [Go to Location ID] [Go to Pallet ID]│  (shown once a row is selected)
│  ┌──────┐ - ┌────┐ - ┌───────┐                                            │
│  │ 322  │   │ 04 │   │ 1187  │   ← Dept / Class / Item boxes (64px tall)   │
│  └──────┘   └────┘   └───────┘                                            │
│                                                                            │
│  ┌─────────────────────────────────────────────────┐                      │
│  │ 322-101-08                         Pallet 40021  │  ← result row       │
│  │ 322-104-02                         Pallet 40077  │  ← selected (tinted)│
│  │ 322-118-01                         Pallet 40103  │                     │
│  │ (scrollable, up to max-w-[720px])                │                      │
│  └─────────────────────────────────────────────────┘                      │
│                                                                            │
│                              (Numpad: 436×482 px, bottom-right, on focus) │
├───────────────────────────────────────────────────────────────────────────┤   54 px  Footer
│  123 Keypad   ABC Keyboard   [✓ Scan DPCI] [✗ Bad DPCI]   BD YYDDD | date | time │
└───────────────────────────────────────────────────────────────────────────┘
```

## Input handling

- All three DPCI boxes use `useNumpadField('numpad', maxLength, padOnSubmit=true)` — tapping any box focuses it and opens the on-screen Numpad (436×482px, bottom-right of the content slot); the hardware barcode scanner can also deliver a full DPCI via `deliverScan()`, handled the same as manual entry once resolved into `loadByDpci`.
- Each box shows a blinking caret (`animate-pulse`) and a red (`#CC0000`) border while active; inactive boxes show a grey border and a muted `—` placeholder when empty.
- Touch targets: each DPCI box is 64px tall (below the 72px general minimum, consistent with other Dept/Class/Item field sets like IID); the "Go to Location ID"/"Go to Pallet ID" buttons and each result row are ≥56/≥48px respectively — result rows are tappable across their full width.
- Footer demo buttons: "✓ Scan DPCI" (fetches a real random DPCI from `/api/items/sample` and looks it up, simulating a scan — may legitimately return zero locations) and "✗ Bad DPCI" (looks up `999-99-9999`, guaranteed not to exist, to exercise the error path).

## Data

**Reads:**
- `Item` — looked up by composite DPCI (`dept`/`class`/`item`) to confirm the item exists (404 if not)
- `Pallet` — every row where `dept`/`class`/`item` match and `locationAisle` is non-null (i.e. currently stored somewhere); selects `pid`, `locationAisle`, `locationBin`, `locationLevel`

**Writes:** None. ISI performs no database writes and is not logged to the Activity Log — it is a pure read/lookup screen, same as IID.

**Not written:** Nothing about a lookup itself (which DPCIs a worker searched, how often) is tracked anywhere.

## Screen Flow

Covers: DPCI entry → resolve, item-not-found, item-found-empty, item-found-with-results → row select → navigate away.

```mermaid
flowchart TD
    A[Screen mounts, Dept box auto-focused] --> B[Worker enters Dept]
    B -->|3 digits| C[Auto-advance to Class]
    C -->|2 digits| D[Auto-advance to Item]
    D -->|4 digits| E[GET /api/items/dpci/:dpci/locations]
    E -->|404 Item not found| F[Error tone + 'Item not found', clear all 3 boxes, results cleared]
    F --> B
    E -->|200, locations: []| G[Show 'No locations currently storing this item']
    E -->|200, locations: [...]| H[Render sorted result rows]
    H --> I[Worker taps a row]
    I --> J[Row selected — reveal 'Go to Location ID' / 'Go to Pallet ID']
    I -->|tap same row again| K[Row deselected — hot buttons hidden]
    J -->|Go to Location ID| L[navigate /location?id=]
    J -->|Go to Pallet ID| M[navigate /pallet?id=]
```

## Behind the Scenes

**DPCI entry / auto-advance (B–D):** Each box is an independent `useNumpadField` instance; the Dept/Class values are additionally captured into refs (`deptValueRef`/`classValueRef`) rather than read off component state, because the Item box's `handleItemConfirm` closure needs the *current* Dept/Class values at the moment Item resolves, and relying on React state directly in a `useCallback` with a stale closure risked reading pre-update values (same reasoning documented in IIDPage's identical pattern).

**Lookup (E):** `loadByDpci` sets `loading=true` and `selected=null` before the request, guaranteeing any previously-selected row's hot buttons disappear immediately rather than staying visible against new (or no) results while the request is in flight.

**Item-not-found (F):** The endpoint validates DPCI existence explicitly (fixed in v1.1.0 — previously a bogus DPCI silently returned `{ locations: [] }`, indistinguishable from "valid item, nothing stored"). Only after confirming the Item row exists does it query `Pallet`.

**Sort order (H):** Sorting happens in the Prisma query itself (`orderBy: [locationAisle, locationBin, locationLevel]`), not client-side — the API contract guarantees ascending aisle/bin/level order regardless of insertion order.

**Row select/deselect (I–K):** Selection is local `useState`, keyed by `palletId`; it is not persisted anywhere and does not survive navigating away and back (see Open items below) — returning to ISI after visiting LII/PII starts from a blank DPCI entry, not the prior search.

## Open items still remaining

- **Search results don't persist across navigation** — leaving ISI (e.g. via a hot button to LII/PII) and returning loses the prior DPCI entry and result list entirely, since state is plain component-local `useState`. Flagged as a cross-cutting issue shared with PII and LII; the suggested fix shape is a shared session-level context mirroring `StagingContext.tsx`'s existing pattern for STG, rather than three separate one-off fixes. (`DevNotes/Fixes/ISI/01-state-not-persisted-across-navigation.md`)
- **No UPC search path** — entry is DPCI-only (three Dept/Class/Item boxes); a worker who only has a UPC has no way to search ISI directly, even though `GET /api/items/upc/:upc` already exists and resolves UPC → item elsewhere (IID). Likely fix: either a new `GET /api/items/upc/:upc/locations` endpoint, or resolve UPC → DPCI client-side first, then call the existing DPCI-locations endpoint, plus a UPC entry field on `ISIPage.tsx` alongside the DPCI boxes. (`DevNotes/Fixes/ISI/02-upc-search-path.md`)
- **Result rows don't show Pallet/Carton/SSP quantities** — each row currently shows Location ID + Pallet ID only. Extending the endpoint's Prisma query to also select `pallets`/`cartons`/`ssps` off each matched `Pallet` row (and rendering them as additional columns) is the proposed fix. (`DevNotes/Fixes/ISI/03-pallet-carton-ssp-counts-per-row.md`)

## Change Log

| Date | Change |
|---|---|
| 2026-07-17 | Initial design — rebuilt to the new standard template from the old-format spec at `DevNotes/Screen-Specs/ISI.md` (unchanged in substance) plus current code, `api/functions/items.ts`, and the three open `DevNotes/Fixes/ISI/*` items. ISI shipped in v1.1.0 (2026-07-08, issue #13), replacing SAR's old slot in the Location Management menu column; its only subsequent change was the v1.1.0-internal fix validating DPCI-not-found (issue tracked in the same release) and the demo/`?dpci=` population fix — no further versions have touched this screen. |
