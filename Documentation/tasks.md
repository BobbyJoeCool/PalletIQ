# PalletIQ — Build Plan

## Table of Contents

- [How to Use This Document](#how-to-use-this-document)
- [Phase 1 — Project Setup](#phase-1--project-setup)
- [Phase 2 — Data Layer](#phase-2--data-layer)
- [Phase 3 — Authentication](#phase-3--authentication)
- [Phase 4 — Core API](#phase-4--core-api)
- [Phase 5 — Core UI Shell](#phase-5--core-ui-shell)
- [Phase 6 — Pull](#phase-6--pull)
- [Phase 7 — Put](#phase-7--put)
- [Phase 8 — Pallet ID and Location ID Screens](#phase-8--pallet-id-and-location-id-screens)
- [Phase 9 — Location Hold](#phase-9--location-hold)
- [Phase 10 — Empty Locations](#phase-10--empty-locations)
- [Phase 11 — Activity Log](#phase-11--activity-log)
- [Phase 12 — Deployment](#phase-12--deployment)
- [Deferred — Stage Aisle](#deferred--stage-aisle)

---

## How to Use This Document

This is a build plan, not a functional spec — see `outline.md` for what the system is supposed to do. Each phase below breaks into features, and each feature breaks into concrete build steps. Work top to bottom; later phases assume earlier ones are complete (e.g. the API phase assumes the data layer exists).

**Enum maintenance (ongoing):** Any time a new enum or new enum value is added — regardless of phase — update `Documentation/Flowcharts-ERDs/enums.mmd` to match. `ActionType` in particular is intentionally left empty at schema creation and must be expanded as each feature that writes to the activity log is built.

**Smoke test (required at end of every phase):** No phase is complete until its endpoints and/or UI flows have been verified to work end-to-end in the local environment. API phases: curl each new endpoint. UI phases: exercise the flow in the browser. Mixed phases: both. Log the results in `DevNotes/Logs/phase-N.md`.

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

- [ ] Write seed script for warehouse structure (aisles, zones, bins, levels — per `outline.md`, this replaces a real setup UI for the demo)
- [ ] Write seed script for a representative set of items (DPCIs, UPCs, name/desc — no VCP/SSP here, those are per-pallet)
- [ ] Write seed script for pallets distributed across seeded locations, each with its own VCP/SSP values
- [ ] Write seed script for a handful of labels in varying statuses, each tied to a pallet (not a location)
- [ ] Write seed script for demo users covering all four roles
- [ ] Verify seed data is internally consistent (e.g. every stored pallet is reflected via the owning `Location.palletId`, not a field on Pallet itself)

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

- [ ] Build app shell with persistent back button
- [ ] Build Home screen grid menu (Pull, Put, Pallet ID, Location ID, Empty by Aisle, Empty by Zone, Stage Aisle)
- [ ] Build reusable on-screen numpad component
- [ ] Build reusable full-keyboard component (for the rarer free-text cases)
- [ ] Build persistent message bar component (non-blocking, supports success/info/error styling)
- [ ] Build audio alert utility (distinct tones for error vs. informational, per `outline.md`)
- [ ] Build global tap-to-navigate behavior: any rendered Pallet ID or Location ID is clickable and routes to its detail screen

### 5.2 Design System

- [ ] Establish Tailwind theme tokens sized for iPad Pro landscape touch targets
- [ ] Build core reusable components (button, input field, data row, status badge)

---

## Phase 6 — Pull

### 6.1 API

- [ ] `GET /api/labels/:id` — label lookup by scan; includes status validation; resolves the label's pallet via `Label.palletId`, then resolves that pallet's *current* location via `Location.palletId` (the label does not store a location directly — per `database.mmd`, a label is tied to a pallet, and the pallet's current location is looked up fresh at scan time so a pallet that moved after the label was generated still resolves correctly)
- [ ] `POST /api/pulls/verify` — accepts label ID + (pallet ID or alternate ID), validates, executes pull, updates quantities, writes activity log
- [ ] Enforce label status rules (Pending only proceeds; Pulled/Canceled/Purged return invalid-status error)

### 6.2 UI

- [ ] Build Pull screen — State 1 (ready, function selected, no data)
- [ ] Build State 2 (label scanned: location, description, DPCI, quantity to pull/in location/remaining, each in Pallets/Cartons/SSPs)
- [ ] Build invalid-status handling (audio alert + message bar, stay in State 1)
- [ ] Build Pallet ID verification field (auto-focused, pallet-ID-only validation)
- [ ] Build Alternate ID verification field (UPC / location barcode / typed location)
- [ ] Build State 3 transition on successful verification (collapse to-pull/remaining fields, update quantity in location)
- [ ] Build "Last Pull" persistent message bar behavior across label scans
- [ ] Wire up audio alerts for Incorrect Pallet ID / Invalid Alternate ID

---

## Phase 7 — Put

### 7.1 Shared Put Logic (API)

- [ ] Build pallet eligibility check (exists → has stored cartons → already-stored lookup) as a shared function used by both Directed and Manual Put endpoints
- [ ] Build zone-determination logic (DPCI already in aisle → start at that zone; otherwise Zone 1 → 2 → 3 → 4)

### 7.2 Directed Put — API

- [ ] `POST /api/puts/directed` — accepts aisle (+ optional Size/StorageCode/Zone overrides, IM+ only), pallet ID; runs eligibility checks; finds and reserves a location; returns directed location
- [ ] `POST /api/puts/:reservationId/confirm` — accepts scanned location (6-digit Aisle+Bin); on match, clears old location (if any), sets new location to Stored, writes activity log
- [ ] `POST /api/puts/:reservationId/unassign` — clears reservation, returns location to Empty
- [ ] `POST /api/puts/:reservationId/block` — places Hold Inbound with reason "Blocked Put" on the location, clears reservation, returns next directed location
- [ ] Build timer-triggered Azure Function: scan for Reserved locations older than 5 minutes, clear them, log the auto-clear

### 7.3 Directed Put — UI

- [ ] Build Directed Put screen: aisle entry, optional Size/StorageCode override (IM+ gated), optional Zone override (IM+ gated)
- [ ] Build pallet ID scan step with eligibility-check feedback (audio + message bar for each case in `outline.md`)
- [ ] Build "already stored" informational alert (audio + message bar, non-blocking, proceeds as a move)
- [ ] Build directed-location display and screen-lock behavior while Reserved
- [ ] Build Confirm action (location scan)
- [ ] Build Unassign button
- [ ] Build Blocked Put button with confirmation step
- [ ] Build client-side handling for server-driven timeout clearing (screen unlocks if still logged in when the timer fires)
- [ ] Build "Put complete — location ######" message bar state

### 7.4 Manual Put — API

- [ ] `POST /api/puts/manual/scan` — logs the pallet ID scan event specifically for this screen, runs eligibility checks
- [ ] `POST /api/puts/manual/confirm` — accepts manually entered destination location; warns (does not block) if occupied; clears old location if applicable; writes activity log

### 7.5 Manual Put — UI

- [ ] Build Manual Put screen: pallet ID scan field
- [ ] Build destination location entry (numeric pad)
- [ ] Build occupied-location warning (audio + non-blocking message)
- [ ] Build confirmation and success state

---

## Phase 8 — Pallet ID and Location ID Screens

### 8.1 Pallet ID Screen

- [ ] Build read-only display of all pallet fields per `outline.md`
- [ ] Build IM+ "Edit" keypress gate (separate from role check alone)
- [ ] Build editable fields in edit mode: DPCI (with UPC auto-update), VCP, SSP, quantity
- [ ] Wire edit submission to `PATCH /api/pallets/:id`, write activity log entry with old/new values
- [ ] Build "go to Location ID" navigation button, pre-populated

### 8.2 Location ID Screen

- [ ] Build read-only display of all location fields per `outline.md`
- [ ] Build "go to Pallet ID" navigation button (if occupied)
- [ ] Build quick Hold action button (opens hold placement/removal, not a single-tap toggle — hold has 4 distinct types)

---

## Phase 9 — Location Hold

### 9.1 API

- [ ] `PATCH /api/locations/:id/hold` — set `holdType` on the Location record (place a hold), independent of and without altering the location's occupancy `Status`; enforce who-can-place rules per type; write an ActivityLog entry whose `details` field captures the reason code (reason code is not a stored column — it lives only in the log, per `database.mmd`)
- [ ] `DELETE /api/locations/:id/hold` — clear `holdType` back to null (remove a hold); enforce who-can-remove rules per type; write an ActivityLog entry
- [ ] Enforce hold-type blocking rules in Put and Pull endpoints (e.g. Hold Inbound blocks Directed Put location-finding; Hold Outbound blocks new label generation but not verification of existing labels)

### 9.2 UI

- [ ] Build Hold placement modal/panel: type selection, reason code dropdown + manual code entry
- [ ] Gate hold type options by current user's role (Hold Permanent only visible to Lead Worker+, etc.)
- [ ] Build quick-hold buttons on Put and Pull screens
- [ ] Build hold display on Location ID screen

---

## Phase 10 — Empty Locations

### 10.1 Empty Locations by Aisle

- [ ] `GET /api/locations/empty-by-aisle?storageCode=&size=` — returns per-aisle counts
- [ ] Build UI: Storage Code + Size entry, results list per aisle
- [ ] Build per-result navigation: "View Zone Map" and "Stage Aisle" buttons, pre-populated

### 10.2 Empty Locations by Zone

- [ ] `GET /api/locations/empty-by-zone?aisle=&storageCode=` — returns per-level, per-zone/side grid data plus per-zone summary counts
- [ ] Build the visual grid UI (8 columns: Zone 1–4 × Odd/Even; rows: Level 1 at bottom up to highest level)
- [ ] Build cell rendering: `{StorageCode}-{Size}` label, color-coded by status
- [ ] Build per-zone summary panel (combined odd+even counts per open Storage Code-Size)
- [ ] Build "Stage Aisle" navigation button, pre-populated

---

## Phase 11 — Activity Log

### 11.1 Logging Infrastructure

- [ ] Confirm every state-changing endpoint from Phases 6–10 writes through the shared activity-log helper built in Phase 4
- [ ] Verify the Manual Put scan-logging special case (Phase 7.4) is in place

### 11.2 Querying (if pursued for the demo)

- [ ] `GET /api/activity?location=&palletId=&dpci=&user=` — filtered activity log query
- [ ] Decide and build (or explicitly defer) a UI screen for browsing the log, based on final scope decision

---

## Phase 12 — Deployment

- [ ] Configure GitHub Actions workflow for Azure Static Web Apps deployment
- [ ] Set production environment variables/secrets in Azure
- [ ] Run production Prisma migration against production Azure SQL
- [ ] Run production seed (or a trimmed demo-safe version)
- [ ] Verify `/api/*` routing works end-to-end in the deployed environment
- [ ] Smoke-test each major flow (login, pull, directed put, manual put, pallet lookup, location lookup, hold, empty locations) in production

---

## Deferred — Stage Aisle

Per `outline.md`, Stage Aisle requires a dedicated design session before it can be broken into build steps. Once designed, its phase will be inserted here covering:

- API for multi-pallet-stack placement logic
- UI for stack entry and sequenced location guidance
- Integration with the Reserved-location/timeout mechanics already built in Phase 7
