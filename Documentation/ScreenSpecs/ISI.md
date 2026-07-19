# Screen Design: ISI — Item Storage Inquiry

**Device:** Tablet — iPad Pro 13" landscape, fixed 1366×1024 canvas (kiosk)
**Bucket:** Existing Warehouse App (current production screen)
**Roles:** All roles (Worker, IM, Lead Worker, Manager, System Admin) — read-only lookup, no role gate anywhere in the flow

## Flow

1. Worker navigates to ISI (route `/storage-inquiry`) via the Location Management home menu, HotJump (`ISI`), a `?dpci=`/`?upc=` deep link from another screen (e.g. IID's "View Storage Locations" button), or by returning to the screen after having searched earlier this session (see Behind the Scenes — search state persists across navigation).
2. The screen auto-focuses the Dept box on mount (50ms after render, same pattern as IID).
3. Worker resolves an item one of two independent ways:
   - **3a. DPCI entry:** three separate boxes — Dept (3 digits), Class (2 digits), Item (4 digits) — using the on-screen Numpad. Each box auto-advances to the next once its fixed length is reached, and the Item box auto-resolves the lookup once it reaches 4 digits — no separate "OK"/submit tap needed for the overall search. Typing fewer digits than a box's full length and tapping OK is accepted and left-zero-padded (e.g. "5" → "005" for Dept), consistent with every other fixed-width numeric code in the app.
   - **3b. UPC entry (v1.6.8):** a keyboard-driven (numeric numpad) field alongside the DPCI boxes — types or scans a UPC and confirms, resolving the lookup independently of the DPCI boxes. Entering one method clears the other's fields, mirroring IID's own dual-entry-path behavior.
4. On lookup, the screen calls `GET /api/items/dpci/:dpci/locations` or `GET /api/items/upc/:upc/locations`.
   - **4a — Item not found:** see Mis-scan / error handling below.
   - **4b — Item found, zero locations:** the results panel shows "No locations currently storing this item" — a valid, non-error empty state, distinct from a bad DPCI/UPC.
   - **4c — Item found, one or more locations:** the item's Short Description renders once above the results (v1.6.8 — every row is the same item, so this is shown once rather than repeated per row), followed by a scrollable table-style list, one row per stored pallet of that item, sorted ascending by aisle → bin → level.
5. Worker taps a row to select it (tapping an already-selected row deselects it — `toggleSelect`). Selecting a row reveals two hot buttons next to the DPCI/UPC entry: "Go to Location ID" and "Go to Pallet ID," which navigate to `/location?id=` / `/pallet?id=` for that row's values.
6. Nothing on this screen is ever written — it is a pure lookup, same spirit as IID (Item ID Lookup) and read-only PII/LII views.

### Mis-scan / error handling

- **DPCI/UPC has no matching Item** (API returns 404 `NOT_FOUND`): `playAlert('error')`, message bar shows `Item not found`. The field(s) used **stay visible with the bad value** (v1.6.8 — previously cleared back to empty; changed per direct feedback so the worker can see what didn't resolve rather than it vanishing) — the worker can retype over it directly rather than starting from scratch. The results/search state is cleared (`setSearch(null)`) rather than showing a stale prior lookup.
- **Malformed/partial DPCI or missing UPC reaching the API** (should not normally happen given the fixed-length auto-advance, but the API itself independently validates): `400 INVALID_INPUT` — surfaces the same generic failure path as a 404 in the current UI (both hit the same `catch` block).
- A `?dpci=`/`?upc=` deep link or a demo-button scan that supplies a whole DPCI at once populates all three display boxes directly (`deptField.set`/`classField.set`/`itemField.set`) rather than leaving them on their `—` placeholders — this was a real bug (fixed in v1.1.0) where the fields stayed blank despite the item loading successfully.

### Status / messaging behavior

- The message bar is non-blocking; an error message (`Item not found`) persists until the worker's next action clears it (a fresh field edit doesn't auto-clear it).
- A `Loading…` (animated, muted) placeholder shows between submitting the lookup and the response returning; it replaces the results area, not the message bar.
- There is no "success" message bar text on a normal lookup — the results list appearing *is* the success state. No audio plays for a normal successful hit, only for the error case.

## Layout (landscape, full app shell)

```
┌───────────────────────────────────────────────────────────────────────────┐  104 px  Header
│ ‹ Back | ⌂ Home | JUMP   ·· ITEM STORAGE INQUIRY ··   J. Smith | ☰ Activity | Logout │
├───────────────────────────────────────────────────────────────────────────┤   74 px  Message Bar
│  ● (idle / "Item not found" / etc.)                                       │
├───────────────────────────────────────────────────────────────────────────┤  792 px  Content
│  DPCI                                     UPC        [Go to Location ID] [Go to Pallet ID]│ (hot buttons shown once a row is selected)
│  ┌──────┐ - ┌────┐ - ┌───────┐            ┌────────────────┐             │
│  │ 322  │   │ 04 │   │ 1187  │            │  001234567890  │             │
│  └──────┘   └────┘   └───────┘            └────────────────┘             │
│                                                                            │
│  S/S Necklace 18in Chain            ← Short Description, once, same size/weight as the │
│                                        DPCI/UPC entry boxes (26px font-data) so it reads │
│                                        as prominently as the fields above it            │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐      │
│  │ LOCATION              PALLETS · CARTONS · SSPS    STORAGE-SIZE  │ ← header row, sticky │
│  │                       (blank on this line)                      │   (stays pinned while │
│  │ 303-035-05                                              BS-S    │    the rows scroll)   │
│  │ Pallet 45195540       0 · 11 · 0                        12 / 12 │ ← row, line 2 (VCP / SSP) │
│  │ (scrollable, up to max-w-[720px], no vertical column dividers)  │      │
│  └─────────────────────────────────────────────────────────────────┘      │
│                                                                            │
│                              (Numpad: 436×482 px, bottom-right, on focus) │
├───────────────────────────────────────────────────────────────────────────┤   54 px  Footer
│  123 Keypad   ABC Keyboard   [✓ Scan DPCI] [✗ Bad DPCI]   BD YYDDD | date | time │
└───────────────────────────────────────────────────────────────────────────┘
```

## Input handling

- All three DPCI boxes use `useNumpadField('numpad', maxLength, padOnSubmit=true)` — tapping any box focuses it and opens the on-screen Numpad (436×482px, bottom-right of the content slot); the hardware barcode scanner can also deliver a full DPCI via `deliverScan()`, handled the same as manual entry once resolved into `loadByDpci`.
- The UPC field (v1.6.8) uses `useNumpadField('numpad')` — numeric only, no fixed length, requires an explicit confirm (Enter/OK) or a hardware scan, same as IID's own UPC field (issue #56 — UPC fields open the Numpad, not the full Keyboard, since UPCs are always numeric).
- Each box shows a blinking caret (`animate-pulse`) and a red (`#CC0000`) border while active; inactive boxes show a grey border and a muted `—` placeholder when empty.
- Touch targets: each DPCI/UPC box is 64px tall (below the 72px general minimum, consistent with other Dept/Class/Item field sets like IID); the "Go to Location ID"/"Go to Pallet ID" buttons and each result row are ≥56/≥64px respectively — result rows are tappable across their full width.
- Footer demo buttons target whichever entry method currently has focus (v1.6.8): by default (DPCI boxes focused, or nothing focused yet) they read "✓ Scan DPCI"/"✗ Bad DPCI"; the instant the UPC field is focused they relabel to "✓ Scan UPC"/"✗ Bad UPC" and route through `loadByUpc` instead. "Scan" fetches a real random DPCI+UPC pair from `/api/items/sample` and looks up whichever one matches the focused field (may legitimately return zero locations); "Bad" looks up a guaranteed-nonexistent value (`999-99-9999` for DPCI, `999999999999` for UPC) to exercise the error path.

## Data

**Reads:**

- `Item` — looked up by composite DPCI (`dept`/`class`/`item`) or by `upc` to confirm the item exists (404 if not); `descShort` is returned once alongside the location list (v1.6.8)
- `Pallet` — every row where `dept`/`class`/`item` match and `locationAisle` is non-null (i.e. currently stored somewhere); selects `pid`, `locationAisle`/`Bin`/`Level`, `storageCode`, `size`, `currentPallets`, `currentCartons`, `currentSSPs`, `vcp`, `ssp` (v1.6.8 — fix-list item 03 extended the original `pid`/location-only select)

**Writes:** None. ISI performs no database writes and is not logged to the Activity Log — it is a pure read/lookup screen, same as IID.

**Not written:** Nothing about a lookup itself (which DPCIs/UPCs a worker searched, how often) is tracked anywhere.

## Screen Flow

Covers: DPCI/UPC entry → resolve, item-not-found, item-found-empty, item-found-with-results → row select → navigate away → return (state restored).

```mermaid
flowchart TD
    A[Screen mounts, Dept box auto-focused] --> B{?dpci=/?upc= present, or prior search in ISIContext?}
    B -- dpci param --> E[GET .../dpci/:dpci/locations]
    B -- upc param --> E2[GET .../upc/:upc/locations]
    B -- prior search, no param --> R[Restore DPCI/UPC display boxes from ISIContext, no re-fetch]
    B -- none --> C[Ready: worker types Dept/Class/Item or UPC]
    C -->|3 digits| C1[Auto-advance to Class] --> C2[Auto-advance to Item] --> E
    C -.independently, type/scan UPC.-> E2
    E -->|404 Item not found| F[Error tone + 'Item not found', bad value stays visible, search state cleared]
    E2 -->|404| F
    F --> C
    E -->|200, locations: []| G[Show 'No locations currently storing this item']
    E2 -->|200, locations: []| G
    E -->|200, locations: [...]| H[Render Short Description + table rows, store in ISIContext]
    E2 -->|200, locations: [...]| H
    H --> I[Worker taps a row]
    I --> J[Row selected in ISIContext — reveal 'Go to Location ID' / 'Go to Pallet ID']
    I -->|tap same row again| K[Row deselected — hot buttons hidden]
    J -->|Go to Location ID| L[navigate /location?id=]
    J -->|Go to Pallet ID| M[navigate /pallet?id=]
    H -->|worker navigates away, then back| B
```

## Behind the Scenes

**DPCI entry / auto-advance:** Each box is an independent `useNumpadField` instance; the Dept/Class values are additionally captured into refs (`deptValueRef`/`classValueRef`) rather than read off component state, because the Item box's `handleItemConfirm` closure needs the *current* Dept/Class values at the moment Item resolves, and relying on React state directly in a `useCallback` with a stale closure risked reading pre-update values (same reasoning documented in IIDPage's identical pattern).

**UPC entry (v1.6.8):** Wired identically to IID's own UPC field — `useNumpadField('numpad')`, no fixed length, confirms via `loadByUpc` on Enter/OK or a hardware scan. Entering a UPC clears the three DPCI boxes and vice versa, matching IID's mutual-clear behavior.

**Search state lives in `ISIContext`, not local `useState` (v1.6.8 — fix-list item 01):** `ISIProvider` is mounted once inside the authenticated route tree (`App.tsx`, alongside `StagingProvider`/`PIIProvider`), holding `{ mode: 'dpci' | 'upc', query, descShort, locations, selected }`. Navigating away from ISI and back restores the last search (display boxes + result rows + selection) instead of resetting to an empty entry screen. Deliberately scoped to ISI only, not a shared context with PII/LII — same per-screen-context decision made for `PIIContext` (see that file's docstring); LII's own version of this fix, when picked up, should follow the same shape rather than a shared context, per that same direct product decision.

**`?dpci=`/`?upc=` deep-link support (v1.6.8):** Previously ISI accepted no pre-population at all despite the original spec describing one — a genuine doc/code mismatch (this rebuild's initial pass copied the claim from IID's own behavior without verifying against `ISIPage.tsx`, which had no `useSearchParams` usage at that point). Actually implemented in v1.6.8 to support IID's new "View Storage Locations" button (`navigate('/storage-inquiry?dpci=' + dpci)`), reusing the same `?dpci=`/`?upc=` param pattern IID already used. The mount effect checks the URL params first; if neither is present, it falls back to restoring from `ISIContext` if a prior search exists.

**Lookup:** `loadByDpci`/`loadByUpc` set `loading=true` before the request; the previous search's selection is implicitly cleared since a successful response always writes a fresh `ISISearchState` with `selected: null`.

**Item-not-found:** The endpoint validates DPCI/UPC existence explicitly (fixed in v1.1.0 for DPCI — previously a bogus DPCI silently returned `{ locations: [] }`, indistinguishable from "valid item, nothing stored"). Only after confirming the Item row exists does it query `Pallet`.

**Sort order:** Sorting happens in the Prisma query itself (`orderBy: [locationAisle, locationBin, locationLevel]`), not client-side — the API contract guarantees ascending aisle/bin/level order regardless of insertion order.

**Row layout — table-style columns, not flex-spaced text (v1.6.8):** Each row (and the header above the list) uses the same `grid-cols-[180px_1fr_140px]` template so values line up vertically under their column label across every row — the original single-line layout (and an early two-line draft using `flex justify-between`) produced an inconsistent left/center/right-looking spread since each row's flex box spaced its own text nodes independently rather than sharing fixed column positions. Two grid rows per pallet entry: Location / (blank) / Storage-Size, then Pallet ID / Pallets·Cartons·SSPs / VCP·SSP — the header row uses an identical 6-cell grid (blank cell included) so its labels sit directly above the correct data cells. No vertical divider lines between columns; only a horizontal `border-b` separates one pallet's two-line entry from the next.

**Sticky header row (v1.6.8):** The header is `sticky top-0` *within* the results list's own `overflow-y-auto` container (not the page), with an opaque background (`bg-[#0A0A0A]`, matching the Numpad panel's own background) and a `z-10` so scrolled-past rows don't show through underneath it, plus a `border-b` separating it from whichever row is currently scrolled up against it. Added after live feedback that a long result list otherwise scrolled the column labels out of view along with the first several rows, leaving the unlabeled numbers below meaningless without scrolling back up.

**Description sized to match the entry boxes (v1.6.8):** The Short Description originally rendered as small muted `font-ui` text (`text-[15px] text-[#9A9A9A]`) — easy to miss against the DPCI/UPC boxes' own `26px` `font-data` white text above it. Changed to the identical `font-data text-[26px] font-medium text-white` treatment per live feedback ("the same size as the entry boxes so you know it's there").

**Bad value stays visible on error, demo buttons target whichever field has focus (v1.6.8):** Both changed per direct feedback. `loadByDpci`/`loadByUpc` already populate the boxes with the attempted value *before* the fetch resolves (needed regardless, so a whole-DPCI/UPC caller like a demo button or deep link doesn't leave the boxes on their `—` placeholder) — the only change was removing the `.clear()` calls from each `catch` block, so a 404 simply leaves what was already displayed instead of wiping it. `demoScan`/`demoBad` both read `upcField.isActive` at call time to decide whether to fetch/attempt a DPCI or a UPC, and the footer's `demoSlot` label reads the same flag — so focusing the UPC field relabels the buttons and retargets them in one shared check, not two independently-maintained pieces of state. This required extending `GET /api/items/sample` to also return `upc` alongside `dpci` (previously DPCI-only, since only IID's/ISI's DPCI-mode demo button consumed it).

**Row select/deselect:** Selection is the `selected` field on the shared `ISISearchState`, keyed by `palletId` — persists across navigation same as the rest of the search (see above), a change from the pre-v1.6.8 behavior where it was local `useState` and never survived leaving the screen.

## Open items still remaining

- None of ISI's original 3 fix-list items remain open as of v1.6.8 — all three closed in this version (state persistence, UPC search, Pallet/Carton/SSP counts). See Change Log.

## Change Log

| Date | Change |
| --- | --- |
| 2026-07-18 (v1.6.8) | Fix-list items 01–03 closed together: search state (DPCI/UPC entry, results, selection) now lives in a new `ISIContext` and survives navigating away and back; added a UPC search path alongside DPCI (`GET /api/items/upc/:upc/locations`, mirroring the existing DPCI-keyed endpoint); each result row now also shows Pallets/Cartons/SSPs and VCP/SSP, plus the pallet's inherited Storage Code-Size, alongside the item's Short Description shown once above the list. Also implemented genuine `?dpci=`/`?upc=` deep-link support (the previous spec's claim that this already worked was inaccurate — see Behind the Scenes) so IID's new "View Storage Locations" button can pre-populate a search. Row layout redesigned twice in the same session: first to a two-line-per-row format per direct instruction, then to labeled `grid` table columns (with a header row) after live feedback that the initial `flex justify-between` spacing read as inconsistent left/center/right text rather than real table columns. Three further live-feedback passes: the header row is now `sticky` within the results list so it stays visible while scrolling; the Short Description was resized to match the DPCI/UPC entry boxes' own text size/weight so it doesn't read as easy-to-miss muted text; and a bad DPCI/UPC now stays visible in the entry field(s) on a not-found error instead of being cleared, with the "Scan"/"Bad" footer demo buttons relabeling to target UPC whenever the UPC field has focus. |
| 2026-07-17 | Initial design — rebuilt to the new standard template from the old-format spec at `DevNotes/Screen-Specs/ISI.md` (unchanged in substance) plus current code, `api/functions/items.ts`, and the three open `DevNotes/Fixes/ISI/*` items. ISI shipped in v1.1.0 (2026-07-08, issue #13), replacing SAR's old slot in the Location Management menu column; its only subsequent change was the v1.1.0-internal fix validating DPCI-not-found (issue tracked in the same release) and the demo/`?dpci=` population fix — no further versions have touched this screen. |
