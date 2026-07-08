# PalletIQ — Functional Outline

## Table of Contents

- [Purpose](#purpose)
- [Design Philosophy](#design-philosophy)
- [Roles and Permissions](#roles-and-permissions)
- [Authentication](#authentication)
- [Home Screen](#home-screen)
- [Core Data Concepts](#core-data-concepts)
- [Pull](#pull)
- [Put](#put)
- [Pallet ID Screen](#pallet-id-screen)
- [Location ID Screen](#location-id-screen)
- [Location Hold](#location-hold)
- [Empty Locations by Aisle](#empty-locations-by-aisle)
- [Empty Locations by Zone](#empty-locations-by-zone)
- [Stage Aisle](#stage-aisle)
- [Activity Log](#activity-log)
- [Explicitly Out of Scope (This Demo)](#explicitly-out-of-scope-this-demo)

---

## Purpose

PalletIQ is an Inventory Management System (IMS) for the operational interior of a warehouse — put-aways, moves, pulls, and location-level inventory control. It is designed as a focused improvement on real-world warehouse management systems, incorporating operational knowledge from distribution center and retail inventory control experience.

This document describes **what the system does and how it behaves**. It does not describe build order or implementation steps — see `tasks.md` for that.

---

## Design Philosophy

These principles apply across every screen in the system, not just the ones where they're explicitly mentioned.

- **Touch-first navigation.** Every Location ID and every Pallet ID rendered anywhere in the app is a tap target. Tapping a Location ID navigates to the Location ID screen for that location. Tapping a Pallet ID navigates to the Pallet ID screen for that pallet. This eliminates the need for most explicit "go to" hotkeys.
- **Non-blocking feedback.** The system communicates through a persistent message bar and audio alerts, not modal dialogs. Blocking dialogs are reserved for the most severe cases only. A worker should rarely, if ever, have to dismiss a pop-up to keep working.
- **Numeric input first.** Because the device has no physical keyboard, every field that can reasonably be numeric (pallet IDs, location barcodes, quantities, aisle numbers, PINs) uses an on-screen numpad rather than a full keyboard. Full keyboard entry is reserved for cases where it's genuinely necessary (free-text notes, search).
- **Device target.** The interface is designed for a touchscreen device roughly the size of an iPad Pro in landscape orientation. The whole app renders at a fixed 1366×1024 canvas and scales to fit whatever screen it's actually on (`src/components/shell/ScaleToFit.tsx`); on a narrower device held in portrait (e.g. a phone, for testing), the canvas rotates 90° in software to keep reading as landscape, since true orientation locking isn't available to a plain browser tab on iOS Safari (fixed in `[1.0.6]`).
- **Back navigation.** Every screen has a back button that returns to the previous screen.
- **Scope discipline.** Inbound receiving, outbound shipping, vendor/supplier management, customer/order management, procurement, multi-warehouse support, and warehouse/location setup are explicitly out of scope. Where a feature touches one of these boundaries, the system exposes only the interior-operations side of it.

---

## Roles and Permissions

Roles are strictly hierarchical — each role inherits every permission of the role(s) below it and adds its own.

| Role | Inherits | Adds |
|---|---|---|
| **Worker** | — | Pulls; directed and manual puts; view Pallet ID and Location ID screens; place Hold Both; unassign their own active reservation |
| **Inventory Manager (IM)** | Worker | Edit Pallet ID fields (DPCI, VCP, SSP, quantity); place and remove Hold Inbound and Hold Outbound; remove Hold Both |
| **Lead Worker** | IM | Place and remove Hold Permanent; aisle/warehouse setup (not built in this demo — stubbed); assign the IM role to user accounts |
| **Manager** | Lead Worker | Assign the Lead Worker role to user accounts |
| **System Admin** | Manager | Create user accounts |

Permission checks happen at the field and action level, not the screen level — every role can navigate to every screen from the home menu. A Worker can open the Pallet ID screen but cannot enter edit mode on it, for example.

---

## Authentication

On opening the app, the user is always prompted to log in first — there is no unauthenticated state that reaches the Home screen.

**Login sequence:**

1. **Identifier entry.** A single field accepts either a badge scan (barcode or RFID) or a manually typed 8-digit employee number — there is no mode toggle; the field simply accepts whichever input arrives. Manual entry uses the on-screen numpad and exists as a fallback for damaged or missing badges.
2. **Lookup.** The system looks up the identifier.
   - **Not found:** audio alert, message bar shows an error, the field clears, and the worker is prompted to try again on the same screen.
   - **Found:** the system displays `Welcome: {name}, enter your PIN` and advances to PIN entry.
3. **PIN entry.** A 4-digit PIN is entered on the on-screen numpad.
   - **No match:** audio alert, message bar shows an error, the PIN field clears, and the worker retries — the identified user's name remains shown; the flow does not return to step 1.
   - **Match:** the session starts and the worker lands on the Home screen.

**Session timeout:** 15 minutes of inactivity logs the user out automatically. This is a shared-terminal security measure.

**Implementation note:** Auth is implemented as a fully custom DB-backed flow. Badge/PIN verification runs directly against the application database (PIN stored as a bcrypt hash, zNumber as the lookup key). On successful login the API issues a signed JWT (HS256, 15-minute expiry) returned to the client and stored in localStorage. AD B2C is not used. Two endpoints handle the two-step flow: `POST /api/auth/identify` (zNumber lookup, returns name) and `POST /api/auth/login` (zNumber + PIN, returns JWT + user). The login field accepts a zNumber typed as digits + a 'P' key tap (the leading 'z' and the letter between digit segments are handled by the UI — the server stores and matches the full zNumber string, e.g. `z002p25`).

---

## Home Screen

After login, the user lands on a menu of function buttons:

- Pull
- Put
- Pallet ID
- Location ID
- Empty Locations by Aisle
- Empty Locations by Zone
- Stage Aisle

All buttons are visible to all roles. Restricted functionality within a screen is gated inside that screen, not by hiding the entry point.

---

## Core Data Concepts

- **DPCI** — Item code broken into three segments: Department, Class, Item. Functions as the canonical item identifier.
- **UPC** — Tied to the DPCI; updates automatically if the DPCI on a pallet is changed.
- **VCP (Vendor Case Pack)** — Quantity of items in one carton. Set per pallet at receiving time, not fixed at the item level — the same DPCI can have a different VCP across different pallets (e.g. different vendor shipments or pack configurations).
- **SSP (Store Ship Pack)** — Quantity of items that ship to a store as a unit; equal to VCP for a full case, but distinct when a partial carton exists. Like VCP, set per pallet at receiving time.
- **Pallet ID** — Uniquely tied to exactly one location in the warehouse at any given time. Scanning a pallet ID is how the system finds where it currently lives.
- **Location ID** — Composed of Aisle, Bin, and Level. The physical barcode encodes all three (see Location Barcode Handling below).
- **Quantity granularity** — Inventory at any location/pallet is tracked in three units simultaneously: **Pallets**, **Cartons**, and **SSPs**. In most cases Pallets and SSPs will be zero (most locations hold partial cartons of a single pallet), but Bulk locations can have multiple full pallets, and Breakpack locations can have loose SSPs, so all three must always be present in the data model.

### Location Barcode Handling

A location barcode encodes Aisle (3 digits) + Bin (3 digits) + Level (2 digits) — 8 digits total, e.g. `30105608` for Aisle 301, Bin 056, Level 08.

Because handheld scanners cannot always reach upper levels, **the system reads only the first 6 digits (Aisle + Bin) of any scanned location barcode and discards the level.** A put or pull is confirmed at the bin level, not the specific level, regardless of which level's barcode was physically scanned.

**Exception — PIP Alternate ID on a Full Pallet (FP) pull.** Because FP takes every carton and empties the location entirely, and a single bin can have several stacked levels each potentially holding a different pallet/DPCI, PIP's Alternate ID verification checks that the level matches too when the pull function is FP, once aisle + bin already match. CA and CF keep the bin-level-only rule described above regardless of what level (if any) was scanned.

If the scanned level doesn't match the pallet's actual level on an FP pull, the worker isn't rejected outright — PIP shows a confirm dialog ("Level doesn't match — you scanned Level X, actual is Level Y") so they can either back out (treated as an ordinary invalid Alternate ID) or confirm the pull anyway, in case the level markings are stale or the barcode was misread. A true aisle/bin mismatch is still rejected immediately with no confirm step, on any pull function.

---

## Pull

A single screen handles all pull types: Carton Air, Full Pallet, Bulk, and Carton Floor. Pull types differ in the physical pattern used to traverse the aisle when labels are printed (Carton Air zigzags bin-by-bin and side-to-side; Full Pallet, Bulk, and Carton Floor move straight down the aisle by bin) — this patterning happens at label-generation time and is out of scope for the pull screen's behavior itself.

### Pull Functions

Each label is assigned a pull function at generation time based on the physical characteristics of its source location and whether the pull will empty it:

| Code | Name | Rule |
| --- | --- | --- |
| CA | Carton Air | XS-size locations (all levels), OR non-XS locations above Level 1 where the pull does **not** empty the location |
| CF | Carton Floor | Level 1 non-XS locations where the pull does **not** empty the location |
| FP | Full Pallet | Non-XS, non-BK locations where the pull takes **every** carton (empties the location) |
| BK | Bulk | Locations designated as bulk storage — identified by **Level 00** in the location composite key |

XS-size locations are always CA regardless of level. Pull function selection on the pull screen acts as a filter: only labels matching the selected function can be scanned in that session.

**Bulk (BK) implementation note:** Bulk locations are flagged by level = 00 in the `Location` composite PK. The system can identify them as bulk automatically without a separate field. BK pull logic (multi-pallet moves, different label format) is out of scope for this demo and deferred to a future phase. The data model and level-00 convention are in place; no additional code is required.

### Pull Labels

- One label exists per carton being pulled. Any of the labels for a multi-carton pull can be scanned to initiate that pull's transaction — for this system, all labels for a pull behave identically and the system does not currently track which physical carton diverts to which destination store. **This is a deliberate scope decision; the data model should not preclude adding individual carton/label-level divert tracking in a future iteration.**
- A label carries: pull function (CA/CF/FP), number of cartons, location, DPCI, batch date (date requested), purge date (7 days after batch date), and destination store.
- **Label statuses:** Printed (valid, ready to pull), Pulled (completed), Canceled (manually canceled), Purged (past the 7-day purge date and automatically invalidated).

### Pull Screen Behavior

**State 1 — Ready.** After selecting a pull function, the screen shows its layout with no data and no messages.

**State 2 — Label scanned.** The screen displays:

- Location
- Product description (short)
- DPCI
- Quantity to pull (Pallets / Cartons / SSPs)
- Quantity in location (Pallets / Cartons / SSPs)
- Quantity remaining after pull (Pallets / Cartons / SSPs)

If the scanned label's status is not Pending, the system plays an audio alert and the message bar shows `Invalid status: {status}`. The screen does not advance to State 2 in this case.

**State 3 — Verification.** Two distinct fields handle pull confirmation:

- **Pallet ID field** (auto-focused after a label scan) — accepts only the pallet ID associated with the label's location. A mismatch triggers an audio alert and message bar text `Incorrect Pallet ID`.
- **Alternate ID field** — accepts the item's UPC, a scanned location barcode, or a manually typed location. A mismatch triggers an audio alert and message bar text `Invalid Alternate ID`.

Either field completing successfully confirms the pull — they are two paths to the same outcome, not sequential steps.

On successful verification:

- Quantity to pull and quantity remaining are removed from the screen.
- Quantity in location updates to reflect the post-pull amount (Pallets / Cartons / SSPs).
- The label status changes from Pending to Pulled.
- The message bar updates to: `Last Pull {location} — {updated quantity in location}`. This persists on screen through the next label scan so the worker can verify their previous pull while already moving to the next one.

---

## Put

Put covers both new put-aways and moves of already-stored pallets, since in this system a move is simply a put-away of a pallet that happens to currently be stored somewhere else. There are two distinct screens: **Directed Put** (system-suggested location) and **Manual Put** (worker-declared location).

### Pallet Eligibility for Put

When a pallet ID is scanned in either put screen, the system checks:

1. **Does the pallet exist?** If not, error.
2. **Does it have cartons in Stored status?** A pallet that has been fully pulled or zeroed out (no stored cartons remaining) cannot be put. The system blocks the action with an audio alert and message bar text such as `Pallet {ID} has no stored cartons — cannot put`. The worker is not blocked from scanning a different pallet next.
3. **Is it currently stored somewhere?** If yes, the system plays an audio alert and shows `This pallet is stored in: {location}` in the message bar — this is informational only and does not block the transaction. Because a pallet ID is always tied to exactly one location, putting an already-stored pallet is treated as a move: the put proceeds normally, and upon confirmation, the old location is automatically cleared in the same transaction that sets the new location. This is atomic — a pallet ID can never appear to exist in two locations at once, even momentarily.

### Directed Put

1. The worker enters the **aisle** they are working in. This is mandatory for both new put-aways and moves.
2. The worker may optionally override **Size** and **Storage Code** (e.g. Food, Non-Food, Conveyable, Non-Conveyable). This override is restricted to Inventory Managers and above.
3. The worker may optionally override **Zone**. By default, the system determines the starting zone using this logic: if the pallet (by its DPCI) is already stored elsewhere in the entered aisle, the system starts looking in that zone; otherwise it starts at Zone 1 and proceeds through Zone 2, 3, 4 in order. This default exists because an aisle can only be staged from one end, so filling zone-by-zone keeps the aisle usable mid-stage. The zone override exists specifically for Inventory Managers working around a partially staged aisle, or who want to intentionally place a single pallet at a specific point in the aisle (e.g. forcing Zone 4) without disrupting what's already staged. Zone override is restricted to Inventory Managers and above.
4. The worker scans the pallet ID. The eligibility checks above run.
5. The system directs the worker to a single location — not a list. The location becomes **Reserved**, which blocks any other put from being directed to that same location.
6. **The worker's screen is locked to this transaction** until it resolves. No other function can be navigated to while a put is in a Reserved state.
7. The worker has three ways to resolve a Reserved state:
   - **Confirm:** scan the location barcode (system reads Aisle+Bin only, per Location Barcode Handling above). On match, the location's status changes from Reserved to Stored, the pallet's location record updates (clearing any prior location automatically), the screen unlocks, and the message bar shows `Put complete — location {######}`.
   - **Unassign:** the worker presses a dedicated Unassign button if they want to back out without completing the put. The location returns to Empty and the screen unlocks.
   - **Blocked Put:** if the directed location is physically inaccessible or otherwise unusable, the worker presses a dedicated Blocked Put button, which requires confirmation. On confirmation, the location is placed on Hold Inbound with reason code "Blocked Put," and the system automatically directs the worker to the next available location, restarting the Reserved cycle.
8. **Automatic timeout:** if a Reserved location is not resolved within 5 minutes, the server automatically clears the reservation and returns the location to Empty. If the worker is still logged in, their screen updates to reflect this and unlocks. If they are not (device reboot, crash, etc.), the location still clears on the server side regardless.

### Manual Put

Used for correcting location data or recording a put-away that doesn't go through directed logic.

1. The worker scans the pallet ID. **This scan is logged to the activity log** — this is the one place outside the standard transactional events where a scan itself is recorded, separate from the eventual put completion, since Manual Put is the override path and more error-prone than Directed Put.
2. The same eligibility checks apply (stored cartons, already-stored informational alert).
3. The worker manually enters the destination location.
4. If the entered location is not Empty, the system raises an audio alert and a non-blocking warning message rather than proceeding silently.
5. On confirmation, the pallet's location updates; if it was previously stored elsewhere, that location clears automatically in the same transaction.

This screen is also how Pallet ID location corrections are made — the Pallet ID screen itself does not allow direct editing of location.

---

## Pallet ID Screen

Accessed via a dedicated menu entry (manual entry or scan of a pallet ID), or by tapping any Pallet ID rendered elsewhere in the app, per the global touch-first navigation rule.

**Visible to all users:**

- DPCI
- UPC (derived from DPCI)
- VCP
- SSP
- Full cartons on pallet
- SSPs on pallet
- Current location (current state only — no location history)
- Who put the pallet and when
- Who last pulled from the pallet and when
- Who received the pallet and when

**Editable — Inventory Manager and above only, and only after an explicit "Edit" keypress** (role alone does not unlock editing; the additional keypress prevents accidental edits on what is normally a read-only lookup screen):

- DPCI (changes the item; UPC updates automatically to match)
- VCP / SSP (correcting receiving errors)
- Quantity (correcting missing or extra cartons)

**Not editable from this screen under any role:** location (use Manual Put instead), timestamps, user attribution fields.

**Navigation:** a button on this screen jumps to the Location ID screen, auto-populated with this pallet's current location.

---

## Location ID Screen

Accessed via a dedicated menu entry (manual entry or scan of a location barcode, Aisle+Bin read per the barcode handling rule above), or by tapping any Location ID rendered elsewhere in the app, per the global touch-first navigation rule.

**Shows current state only** (no history of past pallets stored there):

- Aisle, Bin, Level, Zone, Size, Storage Code — all set at warehouse setup and read-only on this screen under every role
- Pallet ID currently in the location (null if empty)
- Status: Pull Pending, Stored, Empty, Reserved, Hold (Inbound/Outbound/Both/Permanent), etc.

**Navigation:** a button jumps to the Pallet ID screen for the pallet currently in this location (if any). A second button opens the Hold action for this location, consistent with the Hold quick-actions present on Put and Pull screens.

---

## Location Hold

Holds communicate that something is operationally wrong with a location and gate what can happen there. A location's hold status is tracked independently of its occupancy status — a location can simultaneously be Stored (occupied) and on Hold Outbound, for example, since Hold Outbound blocks new label generation, not the fact that a pallet already sits there.

| Hold Type | Blocks | Who Can Place | Who Can Remove |
|---|---|---|---|
| Hold Inbound | Puts | IM and above | IM and above |
| Hold Outbound | New label generation for that location only — labels already generated can still be verified and pulled | IM and above | IM and above |
| Hold Both | Puts and new label generation | Any user | IM and above |
| Hold Permanent | Everything — location is effectively out of service (e.g. structural damage) | Lead Worker and above only | Lead Worker and above only |

- A reason code is required to place any hold. The worker selects from a dropdown or, if known, types the code directly.
- Any user can place Hold Both, which is the standard "something's wrong here, stop and look" action — this is intentionally low-friction since it's how floor problems get flagged.
- Quick-hold actions exist on the Put and Pull screens (and via the Hold button on the Location ID screen) so a worker doesn't have to navigate away to flag a problem location.

---

## Empty Locations by Aisle

The worker enters a **Storage Code** and a **Size**. The system returns, per aisle, a count of empty locations matching those criteria.

From a result, the worker can select an aisle and choose to:

- View the Zone Map for that aisle (Empty Locations by Zone, pre-populated)
- Go to Stage Aisle for that aisle (pre-populated)

---

## Empty Locations by Zone

The worker enters an **Aisle** and a **Storage Code**. The screen shows a visual grid representing the aisle's physical layout:

- **Columns:** Zone 1 through Zone 4, each split into an Odd-side column and an Even-side column (8 columns total), reflecting that every aisle has 4 zones with bins typically numbered odd on one side and even on the other.
- **Rows:** one row per physical level in the aisle, with Level 1 (ground) at the bottom of the grid and the highest level at the top, mirroring the physical aisle.
- **Each cell** represents one level within one zone/side and displays that location's `{Storage Code}-{Size}` designation.
- The only status color-coding on the grid is **Contraction** — a Lead+ designation (managed outside this app, via Aisle Setup) that blocks staging and putting for that zone-side/level. Occupied, empty, staged, and reserved states are not reflected in the grid; the per-zone summary panel below is where empty/staged counts are surfaced.

Below or alongside the grid, a **per-zone summary** (combining both odd and even sides of that zone) shows counts of each open `{Storage Code}-{Size}` combination — this is the actionable number a General Pallet Mover (GPMer) uses to decide where to stage incoming pallet stacks.

**Navigation:** a button on this screen jumps to Stage Aisle for the current aisle (pre-populated).

---

## Stage Aisle

**New feature, not present in the legacy system being improved upon.** Fully designed and built (Phase 7; redesigned to a pallet-rider-triple graphic in Phase 11.2) — see `DevNotes/Screen-Specs/STG.md` for the complete spec.

- Entry points: Home menu, Empty Locations by Aisle (per-aisle button), Empty Locations by Zone (per-aisle button) — all pre-populate the aisle.
- Purpose: a General Pallet Mover (GPMer) brings multiple pallet stacks into an aisle at once (three stacks at a time via a fork-truck graphic). The worker enters the Storage Code, Size, and quantity for each stack, and the system assigns each pallet a destination location, marking it `STAGED` rather than `STORED` — a placeholder reservation that a subsequent Put confirms.
- Staging always fills an aisle from the back forward (highest bin, lowest level first) — the reverse of Directed Put's front-to-back zone fill — so the two workflows can operate on the same aisle from opposite ends without colliding.
- `STAGED` locations are valid Directed Put candidates alongside `EMPTY` ones (excluded only when the putting worker has Consolidating mode on). A Manual Put onto a `STAGED` location is allowed but shows a non-blocking warning.
- IM and above can Unstage (clear) or Restage an aisle's `STAGED` locations via a modal on the Stage Aisle screen.

---

## Activity Log

A persistent, queryable record of transactional events — not a flat file, stored as a database table (or small set of tables) alongside the rest of the application's data so it can be filtered by location, pallet ID, DPCI, or user, and so logged pallet/location references can link back to live records.

**Logged events** include, at minimum: put confirmed, pull confirmed, pallet moved, hold placed, hold removed, pallet field edited, location unassigned, blocked put, and the Manual Put pallet-ID scan described above.

Each entry captures, at minimum: timestamp, acting user, action type, and the relevant pallet ID / location ID / DPCI, with action-specific details (e.g. old value/new value on an edit, hold reason code) captured in a flexible field rather than a rigid fixed-column structure.

---

## Explicitly Out of Scope (This Demo)

- Inbound receiving and purchase orders
- Outbound shipping and order fulfillment / sorter integration
- Vendor or supplier management
- Customer or order management
- Purchasing or procurement
- Multi-warehouse support
- Warehouse/aisle/location setup (seeded directly into the database instead)
- User account creation and role assignment (seeded directly into the database instead)
- Individual carton/label-level divert tracking within a multi-carton pull
