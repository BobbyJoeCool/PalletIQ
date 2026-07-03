# PalletIQ — Build Plan

## Table of Contents

- [How to Use This Document](#how-to-use-this-document)
- [Phase 1 — Project Setup](#phase-1--project-setup)
- [Phase 2 — Data Layer](#phase-2--data-layer)
- [Phase 3 — Authentication](#phase-3--authentication)
- [Phase 4 — Core API](#phase-4--core-api)
- [Phase 5 — Core UI Shell](#phase-5--core-ui-shell)
- [Phase 6 — Production](#phase-6--production)
- [Phase 7 — GPM Functions](#phase-7--gpm-functions)
- [Phase 8 — Reporting](#phase-8--reporting)
- [Phase 9 — Inventory Management](#phase-9--inventory-management)
- [Phase 10 — Location Management](#phase-10--location-management)
- [Phase 11 — Completion](#phase-11--completion)

---

## How to Use This Document

This is a build plan, not a functional spec — see `outline.md` for what the system is supposed to do. Each phase below breaks into features, and each feature breaks into concrete build steps. Work top to bottom; later phases assume earlier ones are complete (e.g. the API phase assumes the data layer exists).

**Enum maintenance (ongoing):** Any time a new enum or new enum value is added — regardless of phase — update `Documentation/Flowcharts-ERDs/enums.mmd` to match. `ActionType` in particular is intentionally left empty at schema creation and must be expanded as each feature that writes to the activity log is built.

**Smoke test (required at end of every phase):** No phase is complete until its endpoints and/or UI flows have been verified to work end-to-end in the local environment. API phases: curl each new endpoint. UI phases: exercise the flow in the browser. Mixed phases: both. Log the results in `DevNotes/Logs/phase-N.md`.

**Phase structure (Phases 6–10):** Each function phase maps to one column of the Home screen. Each phase has a `.0` scaffolding subphase for any app-wide infrastructure needed at that point, followed by one numbered subphase per screen in that column. Screens marked *design session required* have no build steps yet — they must be designed against `outline.md` before tasks can be added.

---

## Phase 1 — Project Setup

### 1.1 Repository and Tooling

- [X] Initialize the monorepo (`palletiq/`) with `package.json` at the root
- [X] Scaffold the React app with Vite (`npm create vite@latest`) inside `src/`
- [X] Configure TypeScript (`tsconfig.json`) for the frontend
- [X] Install and configure TailwindCSS
- [X] Create the `api/` folder at root for Azure Functions
- [X] Initialize Azure Functions project inside `api/` (TypeScript/Node runtime)
- [X] Create the `shared/` package for cross-cutting TypeScript types
- [X] Configure TypeScript path aliases so `src/` and `api/` can both import from `shared/`
- [X] Set up `staticwebapp.config.json` at root with `/api/*` routing
- [X] Add `.env.local` (gitignored) and a `.env.example` template
- [X] Set up ESLint and Prettier shared config across `src/` and `api/`
- [X] Initial commit and `.gitignore`

### 1.2 Azure Resources

- [X] Create Azure resource group for the project
- [X] Provision Azure SQL database (dev tier)
- [X] Provision Azure Static Web Apps resource
- [X] Provision Azure AD B2C tenant (or confirm custom-auth approach per `outline.md` Authentication section)
- [X] Store connection strings and secrets in local `.env.local` and in Azure Static Web Apps configuration

---

## Phase 2 — Data Layer

### 2.1 Prisma Setup

- [X] Install Prisma in `api/`
- [X] Configure Prisma to connect to Azure SQL
- [X] Initialize `schema.prisma`

### 2.2 Core Schema

- [X] Define `Item` model (DPCI as composite PK: department/class/item, UPC, name, desc, descShort)
- [X] Define `Location` model (Aisle/Bin/Level as composite PK using a named Prisma compound key, Zone, Status, HoldType (nullable, independent of Status), StorageCode, Size, nullable `palletId` FK → Pallet)
- [X] Define `Pallet` model (Pallet ID as PK, DPCI FK → Item, quantities in Pallets/Cartons/SSPs, VCP and SSP set per-pallet at receiving, Status, received/put/last-pulled user + timestamp fields)
- [X] Define `Label` model (Label ID as PK, `palletId` FK → Pallet — **not** a location reference; the pallet's current location is resolved via `Location.palletId` at pull time — DPCI FK, quantity, batch date, purge date, destination store, status)
- [X] Define `User` model (id as zNumber PK, PIN hash, role)
- [X] Define `ActivityLog` model (timestamp, userId FK, action type, nullable palletId/locationId/dpci references, flexible details field)
- [X] Define enums: `Role`, `LocationStatus`, `HoldType`, `LabelStatus` — note `PalletStatus` enum values are an open decision, deferred per `database.mmd`
- [X] Confirm the `Location` composite primary key is defined with a named compound key (e.g. `@@id([aisle, bin, level], name: "locationId")`) so application code can query it as a single object without adding a surrogate column
- [X] Run first migration
- [X] Generate Prisma client and verify types resolve in both `src/` and `api/` via `shared/`

### 2.3 Seed Data

- [X] Write seed script for warehouse structure (aisles, zones, bins, levels — per `outline.md`, this replaces a real setup UI for the demo)
- [X] Write seed script for a representative set of items (DPCIs, UPCs, name/desc — no VCP/SSP here, those are per-pallet)
- [X] Write seed script for pallets distributed across seeded locations, each with its own VCP/SSP values
- [X] Write seed script for a handful of labels in varying statuses, each tied to a pallet (not a location)
- [X] Write seed script for demo users covering all four roles
- [X] Verify seed data is internally consistent (e.g. every stored pallet is reflected via the owning `Location.palletId`, not a field on Pallet itself)

---

## Phase 3 — Authentication

### 3.1 Badge + PIN Flow

- [X] Resolve the open implementation decision from `outline.md` (custom DB-backed auth vs. AD B2C custom policy) and document the choice
- [X] Build identifier-lookup endpoint (Azure Function) accepting either a badge scan value or a manually typed 8-digit employee number through a single input — no separate endpoints or modes for the two input methods
- [X] Build PIN verification (hashed comparison) as a second step keyed to the identified user
- [X] Issue session token on successful PIN match
- [X] Implement 15-minute idle timeout (client-side inactivity detection + server-side session expiry)

### 3.2 Frontend Auth

- [X] Build Login screen: single field accepting badge scan or manually typed employee number (numpad), no mode toggle
- [X] Build identifier-not-found handling: audio alert, message bar error, clear field, retry on the same screen
- [X] Build PIN screen: `Welcome: {name}, enter your PIN` message, 4-digit numpad
- [X] Build PIN-mismatch handling: audio alert, message bar error, clear PIN field, retry on the same screen (does not return to identifier entry)
- [X] Build auth context/provider for the React app
- [X] Wire up protected routing (no access to function screens without a valid session)
- [X] Implement idle-timeout detection and auto-redirect to login

**Flowchart:**

- [X] Create `Documentation/Flowcharts-ERDs/auth-flow.mmd` — badge/zNumber identify → PIN → JWT issue; includes all error paths

### 3.3 Role-Based Permission Checks

- [X] Build a shared permission-check utility usable both client-side (UI gating) and server-side (API enforcement) — server-side is the source of truth
- [X] Define the role hierarchy (Worker → IM → Lead Worker → System Admin) as inheritable permission sets per `outline.md`

---

## Phase 4 — Core API

### 4.1 Shared Infrastructure

- [X] Build Prisma client singleton for Azure Functions cold-start reuse
- [X] Build standard API response/error format
- [X] Build activity-log write helper (used by every state-changing endpoint)
- [X] Build location-barcode parser (8-digit input → Aisle+Bin, discarding Level, per `outline.md`)

### 4.2 Pallet and Location Lookup Endpoints

- [X] `GET /api/pallets/:id` — pallet detail lookup
- [X] `PATCH /api/pallets/:id` — pallet field edit (DPCI/VCP/SSP/quantity), IM+ only
- [X] `GET /api/locations/:id` — location detail lookup (accepts 6 or 8-digit input, normalizes)

---

## Phase 5 — Core UI Shell

### 5.1 Layout and Navigation

- [X] Build app shell with persistent back button
- [X] Build Home screen grid menu (Pull, Put, Pallet ID, Location ID, Empty by Aisle, Empty by Zone, Stage Aisle)
- [X] Build reusable on-screen numpad component
- [X] Build reusable full-keyboard component (for the rarer free-text cases)
- [X] Build persistent message bar component (non-blocking, supports success/info/error styling)
- [X] Build audio alert utility (distinct tones for error vs. informational, per `outline.md`) — stubbed as no-op; real tone design deferred to Phase 11.1
- [X] Build global tap-to-navigate behavior: any rendered Pallet ID or Location ID is clickable and routes to its detail screen

### 5.2 Design System

- [X] Establish Tailwind theme tokens sized for iPad Pro landscape touch targets
- [X] Build shell, input, and login components (ZnumPad, PinPad, LiveId, Header, Footer, MessageBar, Numpad, Keyboard, HotJump, AppShell)
- [ ] Generic data-row and status-badge components — deferred to Phase 9.0

---

## Phase 6 — Production

### 6.0 Production Scaffolding

- [X] Build shared pallet-eligibility check helper (pallet exists → has stored cartons → already-stored informational check) used by both Directed and Manual Put endpoints
- [X] Build zone-determination logic (DPCI already in aisle → start at that zone; otherwise Zone 1 → 2 → 3 → 4) used by Directed Put
- [X] Wire hardware barcode-scanner input into the app shell — rapid sequential keypresses ending in Enter (below a latency threshold) should be treated as a scanner event and routed to the active field, distinct from manual numpad entry
- [X] Add `deliverScan(value: string)` to NumpadContext — delivers a complete string to the active field's registered handler in one shot; used by both real scanner input and the demo scan buttons below
- [X] Add a demo-action slot to the Footer component — screens register content via `FooterDemoContext`; `useDemoSlot()` hook mounts/unmounts on screen enter/exit
- [X] `GET /api/labels/sample` — returns a random Pending label ID; used by the "Scan Label" demo button
- [X] `GET /api/pallets/sample` — returns a random stored pallet ID; used by "Scan PID" demo buttons on SDP, MNP, and PII
- [X] `GET /api/locations/sample` — returns a random location ID by status (empty/occupied); used by MNP demo buttons (added per screen spec requirement)
- [X] Add `Reservation` model to Prisma schema + manual migration file; regenerated Prisma client

### 6.1 PIP — Pallet ID Pull

**API:**

- [X] `GET /api/labels/:id` — label lookup by scan; validates label status; resolves the label's pallet via `Label.palletId`, then resolves that pallet's current location via `Location.palletId` (a label does not store a location directly — the pallet's current location is looked up fresh at scan time so a pallet that moved after the label was generated still resolves correctly)
- [X] `POST /api/pulls/verify` — accepts label ID + (pallet ID or alternate ID), validates match, executes pull, updates quantities, writes activity log
- [X] Enforce label status rules: Pending proceeds; Pulled / Canceled / Purged return an invalid-status error

**UI:**

- [X] Build Pull screen — State 1 (ready, function selected, no data)
- [X] Build State 2 (label scanned): display location, short product description, DPCI, quantity to pull / in location / remaining, all in Pallets / Cartons / SSPs
- [X] Build invalid-status handling: audio alert + `Invalid status: {status}` in message bar, stay in State 1
- [X] Build Pallet ID verification field (auto-focused after label scan, pallet-ID-only validation; mismatch → audio alert + `Incorrect Pallet ID`)
- [X] Build Alternate ID verification field (accepts UPC / scanned location barcode / typed location; mismatch → audio alert + `Invalid Alternate ID`)
- [X] Build State 3 transition on successful verification: collapse to-pull and remaining fields, update quantity in location
- [X] Build `Last Pull {location} — {updated quantity}` persistent message bar state (persists through the next label scan)
- [X] Add "Scan Label" demo button to the footer (visible on PIP screen only) — calls `GET /api/labels/sample`, fires result through `deliverScan()`

**Flowchart:**

- [X] Create `Documentation/Flowcharts-ERDs/pip-flow.mmd` — selectFunction → ready → verifying; label scan, PID verify, Alt ID verify; all error and success paths

### 6.2 SDP — System Directed Put

**API:**

- [X] `POST /api/puts/directed` — accepts aisle + optional Size/StorageCode/Zone overrides (IM+ only) + pallet ID; runs shared eligibility check; finds and reserves a location; returns the directed location
- [X] `POST /api/puts/:reservationId/confirm` — accepts scanned location (Aisle+Bin, 6 digits); on match, clears old location if applicable, sets new location to Stored, writes activity log; atomic — pallet cannot appear in two locations at once
- [X] `POST /api/puts/:reservationId/unassign` — clears reservation, returns location to Empty, writes activity log
- [X] `POST /api/puts/:reservationId/block` — places Hold Both (not Hold Inbound per screen spec) with reason "Blocked Put" on the directed location, clears reservation, writes activity log, returns the next available directed location (restart of the Reserved cycle)
- [X] Build timer-triggered Azure Function: scan for Reserved locations older than 5 minutes, clear each reservation, return location to Empty, write activity log entry per auto-cleared location

**UI:**

- [X] Build Directed Put screen: aisle entry, optional Size/StorageCode override (IM+ gated), optional Zone override (IM+ gated), pallet ID scan field
- [X] Build eligibility-check feedback for each case per `outline.md` (audio + message bar)
- [X] Build already-stored informational alert (audio + non-blocking message bar, flow continues as a move)
- [X] Build directed-location display and screen-lock: no other navigation while a put is Reserved
- [X] Build Confirm action (location barcode scan)
- [X] Build Unassign button
- [X] Build Blocked Put button with confirmation step
- [X] Build client-side timeout handling: if the timer-triggered function clears the reservation while the worker is still logged in, the screen unlocks and the message bar updates
- [X] Build `Put complete — location {######}` message bar state
- [X] Add "Scan PID" demo button to the footer (visible on SDP screen only) — calls `GET /api/pallets/sample`, fires result through `deliverScan()`

**Flowchart:**

- [X] Create `Documentation/Flowcharts-ERDs/sdp-flow.mmd` — entry → directed; pallet scan, eligibility, reservation; confirm, unassign, blocked put; expiry detection; all error and success paths

### 6.3 MNP — Manual Put

**API:**

- [X] `POST /api/puts/manual/scan` — logs the pallet ID scan event to the activity log regardless of outcome (this specific scan is always recorded — Manual Put is the override path and more error-prone than Directed Put), then runs the shared eligibility check
- [X] `POST /api/puts/manual/confirm` — accepts manually entered destination location + level; warns (audio + non-blocking message bar) if occupied rather than blocking; clears old location if applicable; writes activity log

**UI:**

- [X] Build Manual Put screen: pallet ID scan field
- [X] Build destination location entry (numpad, Aisle+Bin) and level confirmation modal (blocking — worker selects which level the pallet was placed at; resolves the exact Location record from aisle+bin+level composite PK)
- [X] Build occupied-location warning (audio + non-blocking message bar)
- [X] Build confirmation and success state
- [X] Add "Scan PID" demo button to the footer (visible on MNP screen only) — calls `GET /api/pallets/sample`, fires result through `deliverScan()`

**Flowchart:**

- [X] Create `Documentation/Flowcharts-ERDs/mnp-flow.mmd` — ready → pallet_scanned → level_modal; MNP_SCAN unconditional log, location validation, level selection, confirm; occupied-warning path; all error and success paths

---

## Phase 7 — GPM Functions

### 7.0 GPM Scaffolding

- [X] Build reusable aisle-grid component: 8 columns (Zone 1–4 × Odd/Even sides), one row per physical level (Level 1 at bottom, highest level at top), each cell displays `{StorageCode}-{Size}` — shared between ELZ (7.2) and STG (7.3). Built per `DevNotes/Screen-Specs/ELZ.md`'s explicit spec: cells show only the StorageCode-Size designation and a Contraction highlight, not location-status coloring (see phase-7 log for why this supersedes the status-coloring line originally in `outline.md`)
- [X] Added `Location.contraction` (Boolean, default false) to the Prisma schema — not listed in `tasks.md` originally; required by ELZ's grid to display Contraction per `DevNotes/Screen-Specs/ELZ.md`. See phase-7 log.

### 7.1 ELA — Empty Locations by Aisle

**API:**

- [X] `GET /api/locations/empty-by-aisle?storageCode=&size=` — returns a count of empty (and staged) locations per aisle matching the given Storage Code and Size

**UI:**

- [X] Build Storage Code + Size entry fields
- [X] Build per-aisle results list (aisle number + empty count)
- [X] Build per-result actions: "View Zone Map" (navigates to ELZ pre-populated with this aisle) and "Stage Aisle" (navigates to STG pre-populated with this aisle)

### 7.2 ELZ — Empty Locations by Zone

**API:**

- [X] `GET /api/locations/empty-by-zone?aisle=&storageCode=` — returns per-level, per-zone/side grid data plus per-zone summary counts of each open StorageCode-Size combination

**UI:**

- [X] Build Aisle + Storage Code entry fields
- [X] Build visual aisle grid using the shared grid component from 7.0
- [X] Build per-zone summary panel (combined odd+even sides per zone, showing counts of each open StorageCode-Size)
- [X] Build "Stage Aisle" navigation button (navigates to STG pre-populated with this aisle)

### 7.3 STG — Stage Aisle

Fully specced in `DevNotes/Screen-Specs/STG.md` (was marked "design session required" here and in `outline.md`, which are now stale — see phase-7 log).

- [X] Confirm Location status set includes EMPTY, STAGED, STORED, RESERVED (done Phase 6/7). Contraction is `Location.contraction: Boolean`, not a status value — resolved Phase 7, see phase-7 log

**API:**

- [X] `POST /api/staging/stage` — mark the N assigned locations as STAGED; write activity log; return next-location look-ahead
- [X] `POST /api/staging/restage` — IM+ auth; clear all STAGED locations in the aisle; if count > 0, restage the first N from the back (bin descending, level ascending), skipping contracted locations; write activity log
- [X] `GET /api/staging/next-location` — find the next available EMPTY location in the aisle after a given bin/level, skipping contracted locations

**UI:**

- [X] Implement session-level persistence for fork state (per-stack Aisle, StorageCode, Size, Quantity, assigned location list); restore on screen re-entry, clear on logout — `StagingContext`, mounted app-wide so it survives navigation and unmounts (clearing state) on logout
- [X] Build the STG screen: full-width fork graphic — operator compartment at bottom center, three independent stacks with filled/empty pallet slot visuals
- [X] Build the master control bar: StorageCode + Size fields + "Fill All" (fills only stacks with no Quantity entered yet)
- [X] Build per-stack inputs: Aisle (numpad), StorageCode (keyboard), Size (dropdown), Quantity (numpad); live destination-location list fetch on input change; red "No location available" slots for any shortfall
- [X] Build the per-stack "Stage" button: calls `POST /api/staging/stage`; clears the stack visually; writes a log entry; fetches the next-location look-ahead
- [X] Build the collapsible log panel above the operator compartment (collapsed by default, 1–2 entries visible; tap to expand a full scrollable overlay; warning entries for shortfall and restage)
- [X] Build the "Unstage Aisle" button (IM+ only, hidden from Workers) — opens a modal with Clear Aisle and Restage options; calls `POST /api/staging/restage`
- [X] Wire pre-population from ELA/ELZ router state: `aisle` → Stack 1's Aisle field; `storageCode` + `size` (if present) → master control bar, auto-triggering "Fill All"
- [X] Confirm MNP shows a non-blocking warning when a manual put lands on a STAGED location (coordinate with MNP)
- [X] Confirm SDP's directed-location logic treats STAGED and EMPTY as equally valid candidates, excludes STAGED when Consolidating is on, and always excludes contracted locations (coordinate with SDP)

---

## Phase 8 — Reporting

### 8.0 Reporting Scaffolding

- [X] `GET /api/activity?location=&palletId=&dpci=&user=` — filtered activity log query endpoint; needed by all reporting screens
- [X] Confirm every state-changing endpoint from Phases 6–7 writes through the shared activity-log helper built in Phase 4 — reviewed `pulls.ts`, `puts.ts`, `staging.ts`, `reservationTimer.ts`, `pallets.ts`; all already log correctly, no gaps found

### 8.1 IRP — Individual Reporting

**Blocked — not built.** `IRP.md` is a complete screen spec, but its own Dependencies
section flags a hard blocker: per-worker function assignments (lead/manager assigns a
worker to a function with a start/end time), queryable per worker per date, don't exist
anywhere in this data model, and building that model isn't scoped anywhere in this plan
— it's a new concept (who's on what job, when), not an extension of an existing one.
Without it, "time in function" (the denominator of every productivity number this screen
shows) can't be computed, so there's nothing real to build. Implementing it would mean
inventing a `FunctionAssignment` model, an assignment UI for leads/managers (not
speced anywhere), and seed data for it — a materially bigger, unscoped decision than
anything else in this phase. See phase-8 log.

- [ ] **Blocked:** function assignments (lead/manager assigns a worker to a function with a start/end time), queryable per worker per date — no data model exists; needs a design decision before this screen can be built
- [ ] **Data requirement (coordinate with Phase 6 pull/put endpoints):** confirm the activity log captures both carton count and pallet count per pull event, and pallet size per put event (for the XS vs. non-XS split)
- [ ] **Data requirement (coordinate with Phase 7 STG):** confirm the staging activity log captures palletId/quantity, storageCode, size, and workerId per stage event
- [ ] `GET /api/reporting/individual` — per-function productivity for the logged-in worker over a date/time range; caps time-in-function at now (or the end of the last assignment block for past dates); splits Put counts into XS/non-XS; calculates unitsPerHour and goalPercent server-side against the fixed prod-goal table in `IRP.md`
- [ ] `GET /api/reporting/individual/staging` — per-StorageCode-Size staging counts for the logged-in GPMer over the same date/time range
- [ ] Build the IRP screen: date/time filter bar (date required; time range optional, defaulting to the first/last assignment block); function tabs (only functions with data shown; GPMer sees a single "Staging" tab instead)
- [ ] Build the function detail panel: summary row (total units, units/hr, time in function); gradient progress bar (red→green, fill sits in the red zone below 80%, supports over-100% display); unit breakdown; Puts split into separate XS/non-XS rows with their own bars
- [ ] Build the GPMer staging panel: total pallets staged; StorageCode+Size breakdown table sorted by count descending; running total
- [ ] Implement empty/no-data states (no assignments for date; assignments with zero activity; GPMer with no staging activity)

### 8.2 PRQ — Pull Request by Label

*Design session required before build steps can be added. Extend `outline.md` with the full screen spec before implementation. No file exists yet in `DevNotes/Screen-Specs/` — confirmed absent during the Phase 7 audit (see phase-7 log) and again while working Phase 8.*

### 8.3 RPT — Other Reporting Functions

*Design session required before build steps can be added. Extend `outline.md` with the full screen spec before implementation. No file exists yet in `DevNotes/Screen-Specs/` — confirmed absent during the Phase 7 audit (see phase-7 log) and again while working Phase 8.*

---

## Phase 9 — Inventory Management

### 9.0 Inventory Management Scaffolding

- [X] Build generic data-row component (label + value pair, used on Pallet ID and Location ID detail screens) — deferred from Phase 5.2
- [X] Build generic status-badge component (used across Pallet, Location, and Label status displays) — deferred from Phase 5.2
- [X] `GET /api/items/:id` — item lookup by DPCI or UPC; needed by the IID screen and for auto-UPC-update when DPCI is changed on the PII screen. Implemented as split `GET /api/items/dpci/:dpci` and `GET /api/items/upc/:upc` routes per IID.md's more specific contract, satisfying both this step and 9.2

### 9.1 PII — Pallet ID Info

**API:**

`PATCH /api/pallets/:id` was built in Phase 4; confirmed it writes an activity log entry with old and new values (does not currently auto-update UPC on DPCI change server-side beyond the FK relation — the client re-fetches the pallet after save, which reflects the new UPC via the Item join).

**UI:**

- [X] Build pallet entry: field accepting a pallet ID scan or manual numpad entry
- [X] Build read-only display of all pallet fields per `outline.md` (DPCI, UPC, VCP, SSP, full cartons on pallet, SSPs on pallet, current location, who received/put/last-pulled + when)
- [X] Build "Edit" keypress gate (IM+ only; role alone does not unlock editing — explicit keypress is required to prevent accidental edits on a lookup screen)
- [X] Build editable fields in edit mode: DPCI, VCP, SSP, quantity (Cartons/SSPs on pallet — matches PII.md's field list; full-pallet count is not exposed for editing here, matching PII.md, though the backend supports it)
- [X] Wire edit submission to `PATCH /api/pallets/:id`
- [X] Build "go to Location ID" navigation button, pre-populated with this pallet's current location
- [X] Add "Scan PID" demo button to the footer (visible on PII screen only) — calls `GET /api/demo/pallet`, loads directly rather than round-tripping through `deliverScan()`

### 9.2 IID — Item ID Lookup

Fully specced in `DevNotes/Screen-Specs/IID.md`. Built with the Item model's actual fields (name, descriptions, retail price, cost, storage code, conveyable) rather than the VCP/SSP fields IID.md's table lists — Item has no vcp/ssp column; those are set per-pallet at receiving time, not at the item level (see `outline.md`'s Core Data Concepts and `api/prisma/schema.prisma`). See phase-9 log.

**API:**

- [X] `GET /api/items/dpci/:dpci` and `GET /api/items/upc/:upc` — full Item record lookup by either key
- [X] `GET /api/items/sample` — demo helper, returns a random item's DPCI

**UI:**

- [X] Build the IID screen: two independent entry fields (DPCI via numpad, UPC via keyboard) — either can load an item; confirming one clears the other
- [X] Build the read-only item display, driven off the Item model's actual fields
- [X] Build not-found error handling: clear whichever field was used, message bar + audio error
- [X] Add "Scan DPCI" / "Bad DPCI" demo buttons to the footer

### 9.3 PAR — Pallet Reinstate

Fully specced in `DevNotes/Screen-Specs/PAR.md`.

**API:**

- [X] `POST /api/pallets/reinstate` — IM+ auth; validate the DPCI exists; validate the destination location is EMPTY if one is provided; generate a unique Pallet ID; create the pallet as PUT_PENDING (no location) or STORED (with location); write activity log
- [X] Confirm `PUT_PENDING` exists as a pallet status value — already present
- [X] `GET /api/pallets/sample-reinstate` — demo helper, returns a valid DPCI/VCP/SSP/quantity set

**UI:**

- [X] Build the PAR screen with a role gate: Worker sees access denied; IM+ see the form
- [X] Build the single-form layout: DPCI (keyboard, confirms DPCI exists on blur — VCP/SSP are not on the Item model so cannot be pre-filled, see IID note above), VCP, Pallets, Cartons, SSPs quantity (all numpad), optional Location (numpad)
- [X] Wire "Create Pallet" submission to `POST /api/pallets/reinstate`; success message shows the generated Pallet ID, with distinct wording for the PUT_PENDING vs. STORED outcome
- [X] Build error states: DPCI not found, location not found, location not EMPTY (highlight the location field; the specific blocking status isn't shown — see the code comment on `withHandler`'s fixed error envelope in `api/functions/pallets.ts`)
- [X] Add the four demo buttons per spec (✓ Create, ✓ To Location, ✗ Bad DPCI, ✗ Bad Location)

---

## Phase 10 — Location Management

### 10.0 Location Management Scaffolding

- [X] Wire hold-enforcement checks into the Directed Put location-finding endpoint: locations on Hold Inbound, Hold Both, or Hold Permanent are skipped; Hold Outbound remains eligible (it only blocks label generation, not puts). Required a schema fix first — see phase-10 log's "Location.holdCategory" note
- [X] Wire hold-enforcement checks into label-generation logic — label generation itself is out of scope, but the same `holdCategory` field now exists for it to check when built
- [X] Seed or hard-code the hold reason-code list used by the WLH placement panel — hard-coded in `src/lib/holdReasonCodes.ts`

### 10.1 LII — Location ID Info

Also specced in `DevNotes/Screen-Specs/LII.md`, consistent with the build steps already listed below; that doc adds two demo-helper buttons this list was missing.

**API:**

`GET /api/locations/:id` was built in Phase 4 as a narrow MNP-only lookup (aisle+bin only, no status/hold/pallet fields). Extended in Phase 10 to also support an exact 8-digit Aisle+Bin+Level lookup and return the fields LII needs (status, holdCategory, pallet summary) — backward compatible, since MNP never reads any field from the response. See phase-10 log.

**UI:**

- [X] Build location entry: three-field (Aisle/Bin/Level) manual entry with auto-advance between fields, plus a barcode-scan input active at all times that populates all three and loads immediately (Aisle+Bin, 6 or 8-digit input) — built as a shared `LocationEntryFields` component, reused by WLH
- [X] Build read-only display of all location fields per `outline.md` (Aisle, Bin, Level, Zone, Size, Storage Code, current Pallet ID, Status, Hold status); pallet summary section shown only when occupied
- [X] Build "go to Pallet ID" navigation button (visible only when location is occupied)
- [X] Build Hold quick-action button that opens WLH for this location

### 10.2 WLH — Warehouse Location Hold

Also specced in `DevNotes/Screen-Specs/WLH.md`, consistent with the build steps already listed below; that doc adds two demo-helper buttons this list was missing.

**API:**

- [X] `PATCH /api/locations/:id/hold` — sets `holdCategory` on the Location record (not `holdTypeCode` — see phase-10 log's schema note); enforces who-can-place rules per hold type; writes activity log entry with the reason code in the `details` field (reason code is not a stored column — it lives only in the log)
- [X] `DELETE /api/locations/:id/hold` — clears `holdCategory` to null; enforces who-can-remove rules per hold type; writes activity log entry

**UI:**

- [X] Build Hold placement panel: hold-type selection filtered by current user's role, reason-code dropdown with manual code entry fallback; replacing an existing hold shows a confirmation note — built as the shared `HoldPanel` component
- [X] Build hold-removal action (role-gated per hold type)
- [X] Build hold status display on the Location ID screen (LII)
- [X] Build quick-hold access points on the Put (SDP / MNP) and Pull (PIP) screens, as a shared inline panel (not a full navigation) that returns to the originating screen with state intact — `HoldPanel` rendered in an overlay, keyed to whatever location is contextually relevant on each screen (PIP: the scanned label's location; SDP: the directed location; MNP: the scanned pallet's current location)
- [X] Add "✓ Load Location" / "✗ Bad Location" demo buttons to the footer

### 10.3 SAR — Staged Aisle Report

Fully specced in `DevNotes/Screen-Specs/SAR.md` (was marked "design session required" here; that note is stale — see phase-7 log). `SAR.md`'s own overview paragraph still says "ARP gives GPMers..." — a leftover from an earlier, abandoned jump code; `DevNotes/Screen-Specs/ARP.md` confirms ARP was superseded by SAR and is not a distinct screen.

**API:**

- [X] `GET /api/reporting/staged-aisle` — per-aisle staged-location count and oldest-staged-location age, for every aisle with at least one staged location; response is unsorted, client sorts each list independently. Required fixing Phase 7's staging endpoints to log per-location (not per-action) STAGE entries — see phase-10 log

**UI:**

- [X] Build the SAR screen: two-column read-only layout — "Most Staged" (left, sorted by staged count descending) and "Staged Longest" (right, sorted by oldest-staged age descending); both omit aisles with zero staged locations; tie-break by aisle number ascending
- [X] Implement age formatting (seconds → `Xd Xh` / `Xh Xm` / `Xm`)
- [X] Implement the empty state ("No staged locations in system") for both columns
- [X] Data loads on screen open only — no auto-refresh

---

## Phase 11 — Completion

### 11.1 Audio System

- [ ] Design the audio tone system: at minimum an error tone (loud, repeated) and an informational tone; finalize actual audio clips or Web Audio API generation approach
- [ ] Replace the `playAlert()` no-op stub in `src/lib/audio.ts` with the real implementation
- [ ] Verify every audio call site (Incorrect Pallet ID, Invalid Alternate ID, invalid label status, zNumber not found, PIN mismatch, hold actions) fires the correct tone

### 11.2 Deployment

- [ ] Configure GitHub Actions workflow for Azure Static Web Apps deployment
- [ ] Set production environment variables and secrets in Azure
- [ ] Run production Prisma migration against production Azure SQL
- [ ] Run production seed (or a trimmed demo-safe version)
- [ ] Verify `/api/*` routing works end-to-end in the deployed environment
- [ ] Smoke-test each major flow in production: login, pull, directed put, manual put, pallet lookup, location lookup, hold, empty locations by aisle, empty locations by zone
