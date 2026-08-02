# API Changelog

All notable changes to the PalletIQ **API** (`api/` — Azure Functions backend + Prisma/MySQL) are documented here. Loosely follows [Keep a Changelog](https://keepachangelog.com) conventions. This is a **separate version/changelog track from the apps that consume it** — see [`apps/floor-app/CHANGELOG.md`](../apps/floor-app/CHANGELOG.md) (tablet/SYMBOL) and [`apps/desktop-app/CHANGELOG.md`](../apps/desktop-app/CHANGELOG.md) (Manager desktop). All three live in this one repo and share this API, but ship and version independently.

## Table of Contents

- [1.2.0 — 2026-08-02](#120--2026-08-02)
- [1.1.0 — 2026-08-02](#110--2026-08-02)
- [1.0.0 — 2026-07-26](#100--2026-07-26)

---

## [1.2.0] — 2026-08-02

Backend half of SDP's Verify-Put Modal (floor-app's own `[1.8.6]` entry) — GitHub #151,
built on this file's own `[1.1.0]` Logic Gate work. Full detail:
`DevNotes/Logs/V1.8/version-1_8_0.md` §1.2.56.

### 1.2.0 — Added

- `directedPut`'s response gained `directedLocationSize` (the directed location's own
  Size) — free, already computed for the location search; lets the frontend pick a Rack
  vs. Hand Put modal body without a second request.

### 1.2.0 — Removed

- **`blockPut` and its route (`POST /puts/:reservationId/block`) removed entirely** — "Blocked
  Put" is retired in favor of Hold Location, which reuses the existing `PATCH
  /locations/:id/hold` (unchanged) rather than a dedicated endpoint. Any client still
  calling this route gets a 404.

## [1.1.0] — 2026-08-02

### 1.1.0 — Added

- **Logic Gate** (`api/lib/logicGate.ts`, GitHub #149) — a single shared module now owns
  every status write to `Location` and `Pallet`; no handler writes `status` (or
  `Location.holdCategory`'s reservation-clearing side effect) directly anymore outside
  `demo-reseed.ts`, an explicit carve-out (see the module's own doc comment). All 9 intents
  from `DevNotes/DesignPrompts/Shared-Infrastructure-Design-Spec.md`'s Intent Reference
  tables are implemented — `RECEIVE_PALLET`, `ZERO_PALLET`, `PUT_COMPLETE`, `COMPLETE_PULL`
  (Pallet-side); `CLEAR_LOCATION`, `RESERVE_PUT`, `RESERVE_BULK`, `RESERVE_REINSTATE`,
  `STAGE_LOCATION` (Location-side) — migrated onto every currently-existing real call site:
  SDP's `directedPut`/`confirmPut`/`unassignPut`/`blockPut`, MNP's `manualConfirm`
  consolidate branch, PIP's `verifyPull`, PAR's `reinstatePallet`, STG's
  `stageLocations`/`restageAisle`, and `reservationTimer.ts`'s own cron-based revert.
  `RECEIVE_PALLET`/`RESERVE_BULK`/`RESERVE_REINSTATE` have no live caller yet (no receiving
  flow, Bulk Pull #137, and a future PAR redesign respectively) — implemented per spec,
  ready for whoever builds those.
- **`statusExpiry`** (GitHub #150) — `Location.statusExpiry`/`revertStatus` columns, written
  by `RESERVE_PUT` and cleared by `CLEAR_LOCATION`/`PUT_COMPLETE`. A Gate-managed mirror,
  not a replacement for the pre-existing `Reservation` table + `reservationTimer.ts`'s
  5-minute cron (the codebase's only prior expiry mechanism, which the original design
  session didn't account for) — that cron remains the sole active enforcer; these columns
  exist for design-doc conformance and future lazy-check use.
- **WLH: placing a hold now clears an active reservation** (`placeHold`, single-location
  only) — previously a hold placed on a `RESERVED` location left it reserved-but-unusable;
  now it force-reverts to `EMPTY` via `CLEAR_LOCATION`'s override-revert parameter,
  regardless of what the reservation would otherwise have reverted to. Matches the design
  doc's own "placing a hold also calls the Gate" requirement, newly wired in — the
  codebase never had this before. Not wired into the range-hold endpoints (a bulk
  operation across many locations with no natural single-location Gate-call shape — a rare
  edge case left as a deliberate scope line for a future pass).
- **`RESERVE_PUT`'s new race-safety check** — re-validates a location's hold/contraction
  state at write time, not just at search time (`findNextLocation`'s own filter already
  excluded held/contracted candidates, but the reserve write itself never re-checked
  before now). A genuine correctness improvement, not just a refactor.

### 1.1.0 — Changed

- Schema migration `20260801234810_add_location_status_expiry` — see `statusExpiry` above.

No request/response contract changes — every migrated endpoint keeps its existing shape;
this release is a write-path implementation swap underneath already-shipped behavior, not
a new feature surface. Full detail: `DevNotes/Logs/V1.8/version-1_8_0.md` §1.2.54.

---

## [1.0.0] — 2026-07-26

**Version reset — start of independent API versioning.** Prior to this release, `api/package.json`'s version simply mirrored the floor-app's own version number (most recently 1.8.0) inside one shared root `CHANGELOG.md`. As of this version, the API is versioned and changelogged on its own, physically separated per this repo's new directory structure (`api/`, `apps/floor-app/`, `apps/desktop-app/`, each owning their own `package.json`/`CHANGELOG.md`).

The reset to `1.0.0` (rather than continuing from `1.8.0`) marks two real things happening at the same time, not just a bookkeeping restart:

1. **The database engine migration** — Azure SQL Server → self-hosted MySQL for the demo phase (cost-driven; see GitHub #139). This changed the Prisma schema's provider/types, the driver adapter (`@prisma/adapter-mssql` → `@prisma/adapter-mariadb`), the migration history, and every script that talks to the database directly. Full detail (what was migrated, what was audited/fixed afterward, why) is recorded in the pre-split history: `apps/floor-app/CHANGELOG.md`'s `[1.8.0]` entry, and `DevNotes/Logs/V1.7/version-1_7_9.md` §1.9–§1.11.
2. **The API becoming a genuinely shared backend**, not just "the tablet app's backend" — a second frontend (`apps/desktop-app/`) now depends on it too, with its own schema needs (see the ~15 new Prisma models drafted across the Desktop app's design docs, not yet applied).

Nothing else changed in this release beyond the versioning/changelog split itself and the tooling that comes with it:

- New `api/eslint.config.js` — previously `api/**/*.ts` was linted via a block inside the (now floor-app-owned) root `eslint.config.js`; api/ now owns its own config and its own `npm run lint` script, matching how it already owned its own `package.json`/build/start scripts.
- New devDependencies to support that: `@eslint/js`, `eslint`, `eslint-config-prettier`, `globals`, `typescript-eslint` (same versions the floor-app already used, for consistency).

For everything that happened to this codebase before this reset, see `apps/floor-app/CHANGELOG.md`'s full history (versions 0.9.0 through 1.8.0) — that file is the moved, unmodified continuation of what used to be this repo's single root `CHANGELOG.md`.
