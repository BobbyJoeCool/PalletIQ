# Screen Design: SDP — System Directed Put

**Device:** Tablet — iPad Pro 13" landscape, fixed 1366×1024 canvas (kiosk).
**Bucket:** Existing Warehouse App (current production screen).
**Roles:** Worker, IM, Lead Worker, Manager, Admin. Every role can scan a pallet and complete a directed put; **Size** override is available to every role; **Storage Code** and **Zone** overrides, and the **Consolidating** toggle, are IM and above only (IM/Lead/Manager/Admin — "IM+" throughout).

## Flow

1. Worker lands on `/put/directed` in the **entry** state. Aisle may arrive pre-filled from router state (e.g. a row-select hand-off from SAR).
2. Worker enters/scans an **Aisle** (3 digits; a scanned location barcode is truncated to its leading 3 digits rather than rejected). On confirm, the aisle is validated to actually exist (`GET /api/locations/aisle-exists`, via the shared `useAisleField` hook) before advancing. Once resolved, a compact row of freight-type badges appears beneath the Aisle field (issue #169) — one per Storage-Code/Size pair present anywhere in the aisle, each showing its open (staged) location count, aisle-wide totals rather than broken out by zone (same `ZoneCodeBadge` component and column-by-Storage-Code layout as ELZ/STG's Zone Summary panels, sourced from `aisle-exists`'s own breakdown data, issue #166).
   - 2a. Nonexistent aisle → error, field clears and refocuses (no badges shown).
3. IM+ users may optionally set **Size** (any role), **Storage Code** (IM+), and **Zone** (IM+) overrides, each independently "lockable" (🔒) to persist across multiple puts in the same session; IM+ may also toggle **Consolidating** (off by default). Size/Storage Code narrow to what's actually present in the entered aisle once Aisle is filled; Zone's dropdown is never narrowed. **(v1.7.0)** With a Size and/or Storage Code override entered, the "✓ Put"/"✓ Move" footer demo buttons now exclude pallets that already naturally match the entered override(s) from their random pick (`GET /api/demo/pallet`'s new `excludeSize`/`excludeStorageCode` params) — a demo pallet that already happened to be, say, a CR-M pallet wouldn't visibly demonstrate a CR/M override actually redirecting it anywhere. `excludeSize` only affects the Move button (an unlocated, not-yet-put pallet has no Size of its own to exclude on).
4. Worker scans/keys a **Pallet ID**. `POST /api/puts/directed` runs eligibility checks, resolves the effective Size/Storage Code/Zone (an explicit override always wins; otherwise falls back to the pallet's own inherited values, then the Item's intrinsic Storage Code), finds the next eligible location in the aisle, reserves it (`RESERVED` status + a `Reservation` row), and returns the directed location.
   - 4a. Pallet not found / no cartons / no open locations in aisle / blocked by a pending pull / canceled → error; Pallet ID field keeps its value (not cleared) so the worker can adjust Aisle/overrides and resubmit without re-scanning. Also picks up the app-wide red-wash treatment (v1.7.0 — see `DevNotes/DesignPrompts/Feature-8-AppWide-Invalid-Field-Wash.md`) via a `palletInvalid` flag, an individual wash shared by every one of these failure codes since they all leave the same field visible for the same retry. Aisle's own nonexistent-aisle error (2a) isn't washed — that field clears atomically instead, so there's no visible bad value to wash (same reasoning as PIP's PID/UPC/Location).
   - 4b. Pallet already stored somewhere (a move): succeeds normally; message bar shows a "directing as move" note — `warning` tone if Consolidating is off, `info` tone if on.
   - 4c. On success: `SDPVerifyPutModal` (GitHub #151) opens as a screen-blocking popup over the **directed** state — a real modal, not the old inline screen-lock. Back/Home/Jump/Logout are still disabled shell-wide via `useNavLock` for the duration (kept from the old behavior — the modal backdrop alone doesn't stop header taps). A 15-second poll against `GET /api/locations/{id}` starts, to proactively detect the server-side 5-minute reservation timeout. The modal shows the directed-to location prominently (in red, matching the old page-level "Put in" readout it replaces) alongside a Storage Code+Size badge, and the DPCI carries its own Storage Code badge — both color-coded (`STORAGE_CODE_COLORS`, the same palette `AisleGrid`/`ZoneCodeBadge` use). The modal has two bodies, chosen by the response's `directedLocationSize`: **Rack** (everything but XS) shows just Pallet ID/Item/DPCI/Confirm Location; **Hand** (XS) additionally shows a read-only **Carton Quantity** field beside Location, and an **Exists Elsewhere** button once a same-DPCI XS match elsewhere is found. Bulk Put has no modal body of its own — out of scope for #151.
5. Worker resolves the open modal one of up to four ways:
   - 5a. **Confirm** — scans/keys the directed location into the **Confirm Location** 3-box entry. While a live reservation exists, `POST /api/puts/{id}/confirm` compares Aisle+Bin only (level is not checked — physical barcodes only encode Aisle+Bin). On match: pallet is stored (old location cleared atomically if this was a move), reservation deleted, modal closes and screen returns to entry. Once Exists Elsewhere has redirected the put (5d) there's no more reservation to confirm against — Confirm instead compares the scanned value's Aisle+Bin against the current redirected target client-side, then completes via `POST /api/puts/manual/confirm` (`resolution: 'proceed'` if confirming back at the original location, `'consolidate'` if confirming at a redirected-to one).
   - 5b. **Unassign** — releases the reservation with no location scan required (`POST /api/puts/{id}/unassign`); the location reverts to `STAGED` if that's genuinely how it was found, otherwise `EMPTY`. Modal closes; Aisle/overrides retained, Pallet ID cleared. Only offered while a live reservation exists — see **Cancel** below for its no-reservation sibling.
   - 5c. **Hold Location** (#151 — replaces the old "Blocked Put" entirely) — opens a nested modal embedding the shared `HoldPanel` (same component PIP/MNP/WLH already use), targeting the currently-directed location. Placing any hold on a `RESERVED` location already clears it server-side as a side effect (`placeHold`'s Logic Gate `CLEAR_LOCATION` call, #149) — so once `HoldPanel` reports success, the modal just resets to entry. **No auto-continue to a new location** — this is a deliberate behavior change from the old Blocked Put, which always auto-re-reserved a replacement. Only offered while a live reservation exists.
   - 5d. **Exists Elsewhere** (Hand Put only) — opens a popup listing every other same-DPCI XS location with real stock (location, Storage Code badge, and current carton count), fetched via `GET /api/items/dpci/{dpci}/locations` (ISI's own endpoint) and filtered client-side to `size === 'XS'`, `currentCartons > 0` (a zeroed/consolidated pallet whose location was never cleared isn't a real target), and not whichever location is *currently* targeted. **Picking a row retargets the put — it does not complete it.** The original reservation is released (`POST /api/puts/{id}/unassign`) only the *first* time this happens for a given pallet; the modal's Confirm Location panel now points at the picked location instead, and the worker still has to scan/confirm it like any other target (5a) before anything is actually written. Picking a second (or third, etc.) candidate afterward is a pure client-side retarget, no further API call, since there's nothing left to release. Two buttons replace Unassign/Hold Location once this has happened: **Cancel** (resets to entry, no API call — nothing is held server-side to release) and, once the target has moved away from the original, **Return to {original}** (swaps back to the originally-directed location — also a pure client-side swap, since that location was only ever released, never reassigned to anyone else in the meantime).
6. **Reservation expiry** (5-minute server-side timer, checked via the 15s poll or surfaced reactively on the next confirm/unassign attempt returning `NOT_FOUND`) → modal closes, full reset to entry, warning message. Only applies while a live reservation exists — once redirected (5d), there's no reservation left to expire.
7. A right-column session history log tracks every reservation's outcome (`ASSIGNED`/`PUT`/`MOVE`/`RELEASED`/`HELD`) as it resolves.

### Mis-scan / error handling

- Aisle doesn't exist → error, field clears and refocuses.
- Pallet not found (`404 PALLET_NOT_FOUND`) → error, `"Pallet not found"`.
- Pallet has no stored cartons (`409 NO_CARTONS`) → error, `"Invalid Pallet: No Cartons"`.
- Pallet canceled (`409 CANCELED`) → error, `"Invalid Pallet: Canceled"`.
- Pallet has an open pull label against it (`409 BLOCKED_BY_PENDING_PULL`) → error, `"Invalid Pallet: Pull Pending"`.
- No eligible locations in aisle (`409 NO_LOCATIONS`) → error, `"No eligible locations available in aisle {aisle}"`.
- Non-IM supplying `storageCode`/`zone` → `403 FORBIDDEN` (not reachable through the UI itself, since those fields are hidden from non-IM roles).
- Confirm-location mismatch (`400 LOCATION_MISMATCH`) → error, `"Wrong location — directed to {directedLocation}"`; Confirm Location boxes clear/refocus, modal stays open.
- Reservation not found on either confirm or unassign (`404`) → treated as expiry, not a plain error — see Flow step 6.
- Hold Location placement forbidden for the current role (`403 FORBIDDEN`) → error inside the Hold Location sub-modal, which stays open (same `HoldPanel` behavior as PIP/MNP/WLH).
- Exists Elsewhere's own (first-redirect-only) unassign call failing → error, popup stays open, nothing lost (reservation still held) — retryable.
- A redirected Confirm's Aisle+Bin not matching the current target → same `"Wrong location — directed to {directedLocation}"` error as a normal mismatch, checked client-side before any call is made.
- A redirected Confirm's `manual/confirm` call failing → generic `"Confirm failed — please try again"`; fully retryable, since the original reservation was already released well before this call (at the first redirect, not at this attempt) — nothing further is lost by retrying.

### Status / messaging behavior

- Errors persist until the next message-bar update; they are not auto-cleared.
- A successful Confirm shows `success`/`info` depending on whether the destination was already `STAGED` (the preferred outcome — green success) or fell through to `EMPTY` (blue info, with a "location was not staged" note) — per the SDP put hierarchy's rule 4.a.
- Move detection (pallet already stored) plays `warning` tone normally, `info` tone when Consolidating is on — same message text either way, tone is the only difference.
- Reservation-expiry messages always play `warning`.
- **(v1.7.0, issue #95)** A stale error also clears on the next successful action: `handleAisleConfirm`'s successful aisle-existence check and `handlePalletScan`'s success path (right after `setPalletInvalid(false)`) both now call `clearMessage()` — the latter can still be immediately overwritten by the `alreadyStored` info/warning message when that case applies, same tick, no visible flicker.

## Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Header (104px): [Back]* [Home]* [Jump]*   System Directed Put   [Name]      [Logout]* │
│   * disabled/greyed while a reservation is active (nav-locked, modal or not)          │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Message Bar (74px): idle / error / warning / info / success text                      │
├───────────────────────────────────────────────────────────┬──────────────────────────┤
│ Content (792px)                                             │ Put History (456px)     │
│                                                              │                          │
│  Aisle [ 301 ]      Size [_]🔒  Storage [__]🔒  Zone [1]🔒   │  ┌────────────────────┐  │
│  CR-L:12(3) CR-M:5  (Storage/Zone shown IM+ only)             │  │ PID 88213   PUT     │  │
│  ↑ badges (#169)                                              │  │ 030105-08  10:44a   │  │
│                                                              │  └────────────────────┘  │
│  [Consolidating]  Applying Constraints / Size M / Zone 2      │  ┌────────────────────┐  │
│                                                              │  │ ...                 │  │
│  Scan Pallet ID [______________]  (disabled until Aisle set)   │  └────────────────────┘  │
├───────────────────────────────────────────────────────────┴──────────────────────────┤
│ Footer (54px): [Numpad/Keyboard toggle]  [state-aware demo buttons]  [date/time]       │
└──────────────────────────────────────────────────────────────────────────────────────┘

  (once directed — SDPVerifyPutModal, screen-blocking popup over the above, #151)
  ┌────────────────────────────────────────────────────────────┐
  │  Pallet ID   88213                                          │
  │  Item        Widget, Blue, 12ct                             │
  │  DPCI        012-34-5678 (CR)      ← Storage Code badge     │
  │  Move from   [ 030102-04 ]  (only if this is a move)        │
  │  Directed To [ 030105-08 ] (CR-L)  ← Storage Code+Size badge│
  │                                                              │
  │  Confirm Location            Carton Quantity   [Unassign]   │
  │  [Aisle][Bin][Lvl]            [ 14 ] (Hand only) [Hold Loc.] │
  │                                                              │
  │  [⇄ Exists Elsewhere]  (Hand only, shown once a same-DPCI   │
  │                          XS match elsewhere is found)        │
  │                                                              │
  │  (once Exists Elsewhere has redirected at least once:        │
  │   Unassign/Hold Location above replaced by —)                │
  │  [Cancel]  [Return to {original}]  (latter only once away   │
  │             from the original location)                      │
  └────────────────────────────────────────────────────────────┘
```

## Input handling

- Same `NumpadContext`/`useNumpadField` model as PIP: on-screen Numpad/Keyboard bound per-field, hardware scans delivered via `deliverScan()` to whichever field is focused.
- Aisle uses `useNumpadField('numpad', 3, true)` — the `true` pads a short entry on submit (typing "5" + OK is accepted as "005").
- Confirm Location is the shared 3-box `LocationEntryFields` (`size="large"` variant — larger box/text since Unassign/Hold Location sit beside it rather than below), rendered inside `SDPVerifyPutModal` (#151).
- Size/Storage Code use the shared code-picker fields (type a known code, or tap the chevron for a `{code} — {full name}` popup, narrowed to the entered aisle's actual codes); Zone is a plain 1–4 dropdown (never narrowed — no full-name disambiguation needed).
- **Screen-specific override — navigation lock.** `useNavLock(screenState === 'directed')` disables Back/Home/Jump/Logout shell-wide for the duration of an active reservation, regardless of whether the modal is open; this is enforced at the shared `LiveId` component level too (tapping a Pallet ID/Location ID chip elsewhere on screen, e.g. in Put History, does not navigate away while locked — see Behind the Scenes).
- **Hold Location** opens a further nested `ModalOverlay` embedding the shared `HoldPanel` on top of `SDPVerifyPutModal`; **Exists Elsewhere** similarly opens a nested `ModalOverlay` listing candidate rows (Storage Code badge per row, scrollable past ~420px — a popular DPCI can realistically have well over 100 same-DPCI XS matches, seen live). Hold Location's own sub-modal closes back to the Verify-Put Modal (cancel) or all the way to entry (successful placement). Exists Elsewhere's popup closes back to the still-open Verify-Put Modal either way — picking a row never itself closes the parent modal, since it only retargets the put rather than completing it (see Flow step 5d).
- **(Feature 9, Phase 1)** The Pallet ID field's own demo footer content (entry state) is now the generalized Pallet ID Demo Scanner — ✓ Valid Pallet ID / Pallet ID by Status (Status dropdown, defaulting to **Put Pending**, plus Storage Code/Size filter dropdowns) / ✗ Invalid Pallet ID — owned internally by `PalletIdField`'s opt-in `demoScanner` prop, superseding the old dedicated ✓ Put/✓ Move/⚠ Invalid Pallet picker described below in the v1.1.0/v1.7.0 entries. The Location Confirm demo buttons (directed state: ✓/✗ Location) are unchanged and still screen-owned. **✓ Valid Pallet ID is aisle-aware on this screen specifically** (`PalletIdField`'s `demoAisle` prop, passed the currently-entered aisle) — it fetches a Put Pending pallet whose own Storage Code/Size will actually fit the entered aisle, restoring (via the current aisle rather than an exclude-override) the old dedicated buttons' "will actually succeed here" property that the initial Feature 9 migration below dropped. See `Documentation/Components/DemoScannerBar.md`.

## Data

**Reads:**
- `Location` (via `GET /api/locations/aisle-exists`) — to validate an entered aisle exists (Feature 10/#161 — see Change Log).
- `Location` (via `empty-by-zone`) — to narrow Size/Storage Code override options to the entered aisle.
- `Pallet` (by `pid`) — eligibility fields (`status`, `currentCartons`), inherited `storageCode`/`size`/`zone`, current location — via the shared `checkPalletEligibility` helper.
- `Container` — open (non-terminal) container count against the pallet, to detect `BLOCKED_BY_PENDING_PULL`.
- `Location` (candidate search) — `findNextLocation` reads `status`/`holdCategory`/`contraction`/`size`/`storageCode`/`zone` across the aisle to pick the next eligible spot.
- `Reservation` (by id) — read back on every confirm/unassign call to check it still exists and to retrieve its target fields.
- `GET /api/locations/{id}` — polled every 15s while directed, to detect expiry proactively.
- `GET /api/items/dpci/{dpci}/locations` (Hand Put + IM+ only, #151) — ISI's own endpoint, fetched once per directed pallet (not re-fetched on every redirect/return-to-original toggle) to populate Exists Elsewhere; filtered client-side to `size === 'XS'` and `currentCartons > 0` (a zeroed/consolidated pallet whose location was never cleared isn't a real target) at fetch time, then to "not whichever location is currently targeted" at render time on every toggle.
- `GET /api/locations/{id}` (Hold Location, via the shared `HoldPanel`) — the location's current hold state, fetched by `HoldPanel` itself on mount.

**Writes:**
- `Location.status` → `RESERVED` on directed-put success; → `STORED` on confirm (with old location, if a move, atomically set to `EMPTY`); → `STAGED`/`EMPTY` on unassign (whichever it was genuinely found as); → `EMPTY` on Hold Location, as a side effect of `placeHold`'s Logic Gate `CLEAR_LOCATION` call (#149) rather than a write this screen makes directly; `holdCategory` → the picked hold type on Hold Location.
- `Reservation` — created on directed-put; deleted on confirm, unassign, and (indirectly, via the same Gate side effect) Hold Location — never updated in place. Exists Elsewhere deletes the original reservation via the same `unassignPut` call Unassign itself uses, but only the *first* time a given pallet is redirected — every candidate picked after that (including a second, different one, or Return to Original) is a pure client-side retarget with no further write of any kind, since there's nothing left to release and nothing new is ever reserved (the eventual completion lands via `manual/confirm`, which doesn't reserve).
- `Pallet.locationAisle`/`locationBin`/`locationLevel`, `storageCode`/`size`/`zone`, `status`, `putByZ`/`putAt` — set on confirm (`placePallet`), copying the destination location's own Storage Code/Size/Zone onto the pallet as its new inherited values. A redirected Confirm at the *original* location (Return to Original, then confirmed) writes the same fields the same way, just via `manualConfirm`'s own `placePallet` call instead of `confirmPut`'s. A redirected Confirm at a *picked* location instead zeroes the source pallet (`ZERO_PALLET`, status `CONSOLIDATED`) and adds its quantity onto the occupant pallet there — a merge, not a location move.
- `ActivityLog` — `RESERVE` on directed-put; `PUT` on confirm (records `wasMove`, `clearedLocation`, `consolidating`, `wasStaged`, per-field verification method, and any IM+ override actually used) — also written this way for a redirected Confirm back at the original location (`manualConfirm`'s own plain-put branch, `functionCode: 'HP'` rather than SDP's own `'RP'`/consolidated-branch `'HP'`, since it's the same shared endpoint MNP uses regardless of how the worker arrived at it); `UNASSIGN` on unassign; `HOLD_PLACE` on Hold Location (written by `placeHold`, not by this screen); `CONSOLID` on a redirected Confirm at a picked (non-original) location (written by `manualConfirm`'s own consolidate branch, IM+ only — see Behind the Scenes).

**Not written:** The session-local Put History panel is client-side only, reset on navigation away — the `ActivityLog` is the durable record of the same events. A reservation that simply times out server-side writes no `ActivityLog` entry of its own (the timer-triggered clear function updates `Location.status` directly); the worker's own subsequent action against the dead reservation is what surfaces the expiry client-side.

## Screen Flow

Covers: aisle entry/validation, pallet scan success/eligibility failures, the move (already-stored) case under Consolidating on/off, the four Verify-Put Modal resolution paths (Confirm/Unassign/Hold Location/Exists Elsewhere, #151), Exists Elsewhere's redirect-then-confirm shape (not a one-tap complete) with its role gate, Return to Original/Cancel, and reservation timeout.

```mermaid
flowchart TD
    A[Entry: enter Aisle] --> B{Aisle exists?}
    B -->|No| A1[Error: Aisle does not exist] --> A
    B -->|Yes| C[Scan Pallet ID]

    C --> D{POST /api/puts/directed}
    D -->|PALLET_NOT_FOUND / NO_CARTONS / CANCELED / BLOCKED_BY_PENDING_PULL / NO_LOCATIONS| D1[Error, PID field retained] --> C
    D -->|OK, alreadyStored| E1[Move note: warning or info per Consolidating] --> F
    D -->|OK, new put| F[SDPVerifyPutModal opens: Rack or Hand body\nDirected To + Storage Code badges shown\n15s poll starts\nhasReservation = true]

    F --> G{Worker action}
    G -->|Confirm scan\nhasReservation| H{POST /confirm}
    G -->|Unassign\nhasReservation| I[POST /unassign]
    G -->|Hold Location\nhasReservation| N[HoldPanel sub-modal]
    G -->|Exists Elsewhere\nHand + IM+ only, any state| O{Worker picks a row\nnot the current target}

    H -->|LOCATION_MISMATCH| H1[Error: Wrong location] --> F
    H -->|NOT_FOUND expired| K[Expired: warning, full reset] --> A
    H -->|OK| L[PUT: modal closes, history entry] --> A

    I -->|NOT_FOUND expired| K
    I -->|OK| M[RELEASED: modal closes, history entry] --> A

    N -->|Confirm Hold| N1{PATCH /locations/:id/hold}
    N1 -->|FORBIDDEN| N2[Error: no permission] --> N
    N1 -->|OK| N3[HELD: reservation already cleared\nserver-side, Gate CLEAR_LOCATION\nmodal closes, history entry] --> A

    O -->|hasReservation still true\nfirst redirect| P[POST /unassign]
    P -->|Fails| P1[Error: nothing lost, popup stays open] --> O
    P -->|OK| R
    O -->|hasReservation already false\nsubsequent pick| R[Retarget directed at picked row\nhasReservation = false\noriginal snapshot captured on first redirect only\nmodal stays open, Cancel + Return to Original shown]

    R --> G
    G -->|Confirm scan\nnot hasReservation| S{Aisle+Bin matches\ncurrent target?}
    S -->|No| H1
    S -->|Yes, at original| T1[POST /manual/confirm\nresolution: proceed]
    S -->|Yes, at a picked candidate| T2[POST /manual/confirm\nresolution: consolidate]
    T1 -->|Fails| T1F[Error: fully retryable\nnothing lost] --> F
    T1 -->|OK| L
    T2 -->|Fails| T2F[Error: fully retryable\nnothing lost] --> F
    T2 -->|OK| Q2[CONSOLID: modal closes, history entry] --> A

    G -->|Cancel\nnot hasReservation| M
    G -->|Return to Original\nnot hasReservation, away from original| R2[Retarget directed at original\nno API call] --> G

    F -->|15s poll detects non-RESERVED\nonly while hasReservation| K
```

## Behind the Scenes

**Directed-put location search.** `resolveEffectiveCriteria` computes Size/Storage Code/Zone once per request: an explicit IM+ override always wins; Size/Storage Code otherwise fall back to the pallet's own inherited values (set by `placePallet` on every prior completed put), and Storage Code has a third fallback tier — the Item's own intrinsic Storage Code — so a never-stored (`PUT_PENDING`) pallet still gets a real filter on its first put. Zone is only ever a *starting preference*: `findNextLocation` retries from Zone 1 if nothing eligible exists at or above the resolved zone. Within a zone, the fill order is deterministic (highest bin first, then lowest level, before stepping to the next-lower bin) — the same direction Stage Aisle fills from, so the two workflows land in the same aisle-half. STAGED locations are preferred over EMPTY ones unless `consolidating` is set, in which case STAGED is skipped entirely.

**Reservation as the lock primitive.** A `Reservation` row plus the target `Location.status = RESERVED` is what blocks any other worker's Directed Put from landing on the same spot — there's no separate mutex. Confirm/Unassign/Hold Location all operate by reservation id (Hold Location indirectly, via `placeHold`'s Gate side effect — see below), and all treat a missing reservation (`404 NOT_FOUND`) identically: it means the row is gone, either because the 5-minute timer function already cleared it or because it was already resolved by another action. The frontend distinguishes this from an ordinary error by resetting fully (`resetToEntry(true)`) rather than just re-prompting.

**Confirm's atomicity.** `placePallet` (shared with MNP) runs the old-location-clear and new-location-store as one `prisma.$transaction` — a pallet can never appear to exist in two locations at once, even momentarily, including on a crash mid-write. The confirmed level always comes from the Reservation record, never the scanned barcode (which only ever encodes Aisle+Bin) — SDP confirms Aisle+Bin only, unlike PIP's full Aisle+Bin+Level Location match.

**Hold Location needs no API call of its own (#151).** `SDPVerifyPutModal`'s Hold Location button embeds the shared `HoldPanel` exactly as PIP/MNP/WLH do, and `HoldPanel` always calls the same `PATCH /api/locations/:id/hold` regardless of which screen embeds it. `placeHold` (`api/functions/locations.ts`) already calls the Logic Gate's `CLEAR_LOCATION` (override `EMPTY`) whenever it places a hold on a `RESERVED` location — so by the time `HoldPanel`'s `onDone` fires, the Reservation this screen was tracking is already gone server-side. The modal's `onHoldDone` handler only needs to tag the history entry `HELD` and reset to entry; there's nothing left to release. This replaced the old "Blocked Put" entirely — Blocked Put's own re-search-and-re-reserve behavior (auto-continuing to a new location after placing Hold Both) has no equivalent today; Hold Location always stops and returns to entry.

**Exists Elsewhere's role gate.** Hand Put's "Exists Elsewhere" button only renders for IM+ (`SDPVerifyPutModal`'s own `isIM` check), even though Hand Put itself (via the Size override) is reachable by every role. This isn't a UI preference — `manual/confirm`'s `resolution: 'consolidate'` branch is hard-gated `requireRole(auth, 'IM')` server-side (`api/functions/puts.ts`, shared with MNP), so a Worker reaching this button would successfully unassign the original reservation (the redirect step itself needs no role check — it's a plain unassign, same call Unassign already makes) and then get a `403` the moment they later tried to *confirm* the redirected location, orphaning the pallet as `PUT_PENDING` with no reservation. The frontend gate exists purely to keep the button from ever reaching a role that would fail on that eventual confirm.

**Redirect is a retarget, not a shortcut confirm (#151 follow-up, direct instruction post-ship).** The first implementation had Exists Elsewhere call `manual/confirm` itself, immediately, the moment a candidate was tapped — a one-step "pick and it's done." That doesn't match how every other Confirm action on this screen works (the worker always has to scan/type the actual location, not just tap a button on a list), so it was reworked into a real two-step flow: picking a candidate only retargets `directed.directedLocation`/`directedLocationStorageCode` and flips `hasReservation` to `false` — nothing is written until the worker separately confirms the (now-redirected) location through the same Confirm Location panel every other target uses. `hasReservation` is the single flag `handleLocationConfirm` branches on to decide which endpoint owns that eventual write: `confirmPut` (a live Reservation still exists) or `manual/confirm` (it doesn't — this covers both a redirected-to candidate, `resolution: 'consolidate'`, and a worker who used Return to Original to go back to the plain EMPTY/STAGED original, `resolution: 'proceed'`). Since the original location was only ever released, never reassigned to anyone else in the meantime, every retarget after the first (a different candidate, or Return to Original) is a pure client-side swap — no further `unassign` call, and no new `Reservation` row is ever created for a redirected target (an occupied location can't be `RESERVED` in the schema's own status model anyway).

**Directed-to display and Storage Code badges (#151 follow-up).** The modal shows `directed.directedLocation` directly (in red, the same treatment the pre-modal page-level "Put in" readout used) rather than leaving the worker to infer the target purely from the empty Confirm Location boxes. Two badges, both `StorageCodeBadge` (`components/shared/StorageCodeBadge.tsx`, new — a bare identity-only sibling of `ZoneCodeBadge`'s aggregate Zone-Summary badge, same `STORAGE_CODE_COLORS` palette): one next to the directed-to location showing `directedLocationStorageCode`+`directedLocationSize` (the *current* target's own Storage Code — this changes across a redirect, since Exists Elsewhere's candidates aren't filtered by Storage Code, only DPCI/Size), and one next to the DPCI showing `palletStorageCode` (the pallet/item's own Storage Code as resolved by the *original* `directedPut` call — frozen once, never touched by a redirect, since it describes the pallet itself rather than whichever location currently happens to be targeted).

**Navigation lock enforcement.** `useNavLock` disables the Header's own Back/Home/Jump/Logout, but a worker could otherwise navigate away via a tappable `LiveId` chip elsewhere on the page (the "Directed to"/"Move from" chips, or any Put History row). This was a real gap (fixed in v1.0.9) — the lock check now lives inside the shared `LiveId` component itself, so it applies everywhere `LiveId` is rendered, not just on SDP.

**Session persistence via `SDPContext`.** The directed pallet (`directed`, typed `SDPDirectedResult`: reservationId/directedLocation/directedLocationSize/pallet/alreadyStored) lives in `SDPProvider` (mounted in `App.tsx`, alongside all 12 sibling per-screen providers — `StagingProvider`/`PIIProvider`/`ISIProvider`/`LIIProvider`/`PIPProvider`/`MNPProvider`/`IIDProvider`/`PARProvider`/`WLHProvider`/`SARProvider`/`ELAProvider`/`ELZProvider`, all 13 now mounted together wrapping `AppShell`), not local component state, so navigating away from SDP and back restores the last-directed pallet instead of resetting to the empty entry state. The underlying `Reservation` this points at still expires server-side after 5 minutes regardless of navigation — a persisted-but-now-expired `directed` value isn't specially guarded against here, since SDPPage's *existing* expiry detection (the 15-second poll, plus the reactive 404 fallback on a confirm/unassign call) already handles a "resumed a now-expired reservation" exactly the same way it handles the in-session expiry case, so persistence doesn't introduce a new failure mode.

**Polling vs. reactive detection.** The 15-second poll (`GET /api/locations/{id}`, treating any non-`RESERVED` status as expiry) is a proactive convenience — the reservation would also be caught reactively the next time the worker tries to Confirm or Unassign and gets `NOT_FOUND`. The poll reads the *current* reservation via a ref on every tick (not a captured value).

## Open items still remaining

- [#88](https://github.com/BobbyJoeCool/PalletIQ/issues/88) — bad Contraction data on RS/RF/BS/some HS locations could incorrectly exclude otherwise-eligible locations from `findNextLocation`'s search (Contraction is a hard exclusion regardless of mode).

## Change Log

| Date | Change |
|---|---|
| 2026-08-03 ([#166](https://github.com/BobbyJoeCool/PalletIQ/issues/166)/[#169](https://github.com/BobbyJoeCool/PalletIQ/issues/169)) | `GET /api/locations/aisle-exists` now also returns an aisle-wide freight-type/size breakdown (`AisleBreakdownEntry[]`, #166), exposed via `useAisleField`'s new `breakdown` output. SDP is the first consumer: a compact `ZoneCodeBadge` row now renders beneath the Aisle field once it resolves (#169) — aisle-wide totals, not broken out by zone, same column-by-Storage-Code layout ELZ/STG's Zone Summary panels use. Also fixed stale step-2 wording in this doc referring to `empty-by-zone` — the Aisle field switched to `aisle-exists` back in #161 (2026-07-28 entry below), this doc just hadn't been updated to say so until now. |
| 2026-08-02 (GitHub #151 follow-up, direct instruction) | Three post-ship fixes/additions to the Verify-Put Modal, found by the user after the initial #151 ship: **(1)** the modal now shows the directed-to location directly (it previously showed only the empty Confirm Location boxes, with no indication of the target — the page-level "Put in" readout this replaced was hidden behind the modal's own backdrop). **(2)** New `StorageCodeBadge` component — a Storage Code+Size badge next to the directed-to location, a Storage Code-only badge next to the DPCI, both color-coded via the existing `STORAGE_CODE_COLORS` palette. New `directedLocationStorageCode` field on `directedPut`'s response (free, same pattern as `directedLocationSize`) plus a client-only `palletStorageCode` snapshot (frozen at the original directedPut, unlike the location badge's own value which follows redirects). **(3)** **Exists Elsewhere reworked from a one-tap complete into a real redirect-then-confirm flow** — picking a candidate no longer calls `manual/confirm` immediately; it only retargets the modal (`hasReservation` flips to `false`), and the worker still has to scan/confirm the new location like any other target. Unassign/Hold Location replaced by **Cancel** (no API call) and, once away from the original, **Return to {original}** (pure client-side swap) while in this state. See Behind the Scenes for the full mechanics. |
| 2026-08-01 (GitHub #151) | **Verify-Put Modal**: the old inline screen-lock (`screenState === 'directed'` disabling the page in place, red "Screen locked" banner) replaced by `SDPVerifyPutModal`, a real screen-blocking popup, ported into its own file. Two bodies, chosen by a new `directedLocationSize` field on `directedPut`'s response (free — it's exactly `effective.size`, already computed): **Rack** (non-XS) is unchanged Pallet ID/Item/DPCI/Confirm Location; **Hand** (XS) adds a read-only Carton Quantity field beside Location, and an **Exists Elsewhere** button (IM+ only — see Behind the Scenes) once a same-DPCI XS match elsewhere is found via ISI's own `GET /api/items/dpci/:dpci/locations` (no new endpoint). **"Blocked Put" removed entirely** (`blockPut` function + its route deleted from `api/functions/puts.ts`) — replaced by **Hold Location**, which embeds the shared `HoldPanel` (same component PIP/MNP/WLH use) and, unlike Blocked Put, does **not** auto-continue to a new location; it needs no API call of its own beyond `HoldPanel`'s existing `PATCH /hold`, since placing a hold on a `RESERVED` location already clears the reservation server-side (Logic Gate `CLEAR_LOCATION`, #149 — built in an earlier round, this is the first caller to depend on that specific side effect). `HistoryEntry.outcome`'s `'BLOCKED'` replaced with `'HELD'`. Confirm/Unassign are unchanged, just relocated into the new modal. Also fixed a same-session bug this rebuild surfaced: `pickCode`/`tapKeys`-based e2e coverage had never exercised Worker-role Hand Put, which is how `SDPVerifyPutModal` initially shipped with no role check on Exists Elsewhere despite `manual/confirm`'s `resolution: 'consolidate'` being IM+-only server-side — caught before ship via a live-browser walkthrough, not by the automated suite; a new Worker-role test now locks this in. |
| 2026-07-29 (direct instruction — data-integrity fix) | **Directed Put's location search now hard-rejects a pallet with no resolvable Size** instead of silently searching with no Size constraint at all. Storage Code was already always enforced (the Item's own intrinsic Storage Code is a guaranteed fallback); Size had no equivalent fallback, so a pallet reaching the search with a null own Size (and no override) previously matched *any* location regardless of its actual Size — meaning a location's Size stopped meaning anything the moment that happened. New `409 MISSING_SIZE` error (`resolveEffectiveCriteria` in `api/lib/zoneLogic.ts`, shared by `directedPut` and `blockPut`) — recoverable by any role via the existing Size override field, same as before. Message: "This pallet has no Size set — enter a Size override to continue." A pallet is expected to never actually reach this state going forward (Size is now mandatory at every pallet-creation path — see the Feature 9 follow-up entry below), so this is a fail-safe, not an expected everyday path. |
| 2026-07-29 (Feature 9, follow-up, direct instruction) | **✓ Valid Pallet ID** on this screen is now aisle-aware: it fetches a Put Pending pallet whose own Storage Code/Size matches one of the currently-entered aisle's actually-eligible locations, so a one-tap "Valid" demo pallet on SDP specifically will actually succeed when directed, restoring the property the plain Feature 9 migration below had dropped. New `aisle` query param on `GET /api/demo/pallet-status` (`samplePalletByStatus` in `api/functions/samples.ts`, mirrors `samplePallet`'s own aisle-eligibility logic exactly); `demoScanner.ts` gained `fetchValidPalletForAisle`; `DemoScannerBar` gained an `aisle` prop; `PalletIdField` gained a `demoAisle` prop threading it through, passed here as `aisleFields.field.value`. Every other Pallet ID field (PII/MNP, and this screen's own by-status popup) is unaffected — the popup's own Storage Code/Size filters remain the tester-driven equivalent, not aisle-scoped. |
| 2026-07-29 (Feature 9, Phase 1) | The entry-state ✓ Put/✓ Move/⚠ Invalid Pallet footer buttons (and the `demoPut`/`demoMove`/`pickInvalidPallet` handlers, `invalidPalletPickerOpen` state, and the `DemoPicker` import behind them) removed, replaced by `PalletIdField`'s new `demoScanner` opt-in — see Input handling above. The old aisle-constrained/override-excluded filtering those handlers did (`excludeStorageCode`/`excludeSize`, aisle-scoped picks) is **not** carried over: the generic Demo Scanner's Storage Code/Size filters instead let a tester pick the *starting* pallet's own native type directly, while this screen's own Size/Storage/Zone override fields remain the mechanism for redirecting that pallet elsewhere — same underlying capability, reached a different way. Location Confirm's own demo buttons are unaffected. |
| 2026-07-28 (Feature 10 / #161) | Internal-only, plus one minor deliberate behavior tightening: the Aisle field's existence check now uses the shared `useAisleField` hook, switched from `GET /api/locations/empty-by-zone` to the purpose-built `GET /api/locations/aisle-exists` (confirmed identical existence semantics). The one real behavior change: a transient network failure during the check now clears/re-focuses the field the same as a genuine not-found, rather than silently letting the worker proceed to Pallet ID — matches this hook's own (and PAR's pre-existing `checkAisleExists`) "any failure = invalid" convention instead of SDP's previous own narrower "only NOT_FOUND blocks" carve-out. |
| 2026-07-27 (Feature 10 / #158) | Internal-only: the Pallet ID box (`FieldDisplay`/`NumpadFieldBox`) replaced with the shared `PalletIdField` component, matching its existing 72px box size via override props. `handlePalletScan`'s own submit logic, disabled-until-Aisle-filled gating, screen-locked gating, and not-found/canceled/pull-pending/no-locations wash are all unchanged. |
| 2026-07-27 (Feature 10) | Internal-only: the Size/Storage override fields' aisle-narrowing now lives inside `SizeField`/`StorageCodeField` themselves (`aisle`/`storageCode` dependency props) instead of this screen computing narrowed options lists externally. No change to documented behavior. |
| 2026-07-27 | Fixed [#86](https://github.com/BobbyJoeCool/PalletIQ/issues/86) — `placePallet` (shared with MNP) now checks whether a second pallet still occupies a vacated location before clearing it, falling back to `STORED` instead of `EMPTY` if so. |
| 2026-07-27 | Fixed [#85](https://github.com/BobbyJoeCool/PalletIQ/issues/85) — the "✓ Location"/"✗ Location" Confirm Location demo buttons now gate on `LocationEntryFields`' own `onActiveChange` (mirroring PIP's existing `locationActive` pattern) instead of rendering as soon as `screenState` left `'entry'`, closing a race where a fast tap could fire before the panel's key handler was registered and silently drop the delivered value. |
| 2026-07-27 | Fixed [#83](https://github.com/BobbyJoeCool/PalletIQ/issues/83) — confirmed SDP's `directedPut` already returned a correct `404 PALLET_NOT_FOUND` (no FK write beforehand, unlike MNP's `manualScan`); this issue's SDP half wasn't actually reproducible as filed. |
| 2026-07-17 | Rebuilt to the new Screen-Design-Template format, documenting the screen as currently shipped (v1.6.6). The old `DevNotes/Screen-Specs/SDP.md` described a simpler "same-DPCI-in-aisle Zone lookup" and a plain always-EMPTY-vs-STAGED-agnostic search — both fully superseded by the v1.6.2 location-selection hierarchy rebuild; the old doc's `POST /api/puts/directed` response/error shapes and reservation-timeout polling description are also out of date relative to the live code. |
| 2026-07-14 (v1.6.2) | Directed Put's location search rebuilt around a real Storage Code/Size/Zone hierarchy (pallet-inherited values + Item fallback + IM+ override), replacing the old same-DPCI Zone lookup entirely. Worker role gained a Size override (Storage Code/Zone remain IM+ only). Reservation timeout detection made proactive (15s poll) instead of purely reactive. Releasing a reservation now restores `STAGED` (not always `EMPTY`) when that's how it was actually found. Confirm Location rebuilt as the shared 3-box entry. Fixed a silently-masked Prisma Client staleness bug that had been failing every real Directed Put, and a reentrant double-submit bug shared with PIP/PAR/LII/WLH. |
| 2026-07-13 (v1.5.0) | Consolidating/lock-toggle buttons enlarged for tap accuracy; "Applying: …" override summary added next to Consolidating. |
| 2026-07-10 (v1.3.1) | Directed Put now prefers `STAGED` locations over `EMPTY` ones when Consolidating is off (issue #79), so pallets land next to what a GPMer already staged for them instead of scattering into unrelated empties. |
| 2026-07-08 (v1.1.5) | IM+ Size override changed from a free-text-plus-quick-pick hybrid to a plain dropdown, matching the original spec exactly (deliberate behavior change, confirmed with the user — dropped free-text sizes outside the fixed list). Location display moved into a bordered box for visibility. |
| 2026-07-08 (v1.1.0) | Added an "Applying: …" override summary (clarifying overrides combine with AND, not last-one-wins) and fixed the "✗ PID" demo button showing a generic failure instead of "Pallet not found". |
| 2026-07-06 (v1.0.3) | Fixed the Consolidating toggle being silently ignored on the next pallet scan (stale-closure bug — `handlePalletScan` was registered once per entry into the `entry` state and never re-read a later toggle). |
| Initial build — v0.9.0 (2026-07-05) | System Directed Put: zone-aware location assignment with move/consolidation handling, screen-locked reservation flow with Confirm/Unassign/Blocked Put resolution paths.
