# Changelog

All notable changes to PalletIQ are documented here. Loosely follows [Keep a Changelog](https://keepachangelog.com) conventions.

## Table of Contents

- [Unreleased — Planned Fixes](#unreleased--planned-fixes)
- [0.9.5 — 2026-07-06](#095--2026-07-06)
- [0.9.4 — 2026-07-06](#094--2026-07-06)
- [0.9.3 — 2026-07-06](#093--2026-07-06)
- [0.9.2 — 2026-07-06](#092--2026-07-06)
- [0.9.1 — 2026-07-06](#091--2026-07-06)
- [0.9.0 — 2026-07-05](#090--2026-07-05)

---

## Unreleased — Planned Fixes

Every item below was found during the 2026-07-05 full Playwright run (61 passed / 21 failed) —
see [DevNotes/TestLogs/playwright-run-2026-07-05.md](DevNotes/TestLogs/playwright-run-2026-07-05.md)
for full detail, error text, and reproduction steps. Grouped by screen.

### Empty Locations (ELA / ELZ)

- [ ] **ELA** — "a valid Storage Code + Size loads a results table" asserts against a hidden
      `<option>` element instead of the visible size-column header text — a test-locator fix,
      not necessarily an app bug (`ela.spec.ts:52`)
- [ ] **ELA** — "Stage Aisle" navigation doesn't show "STG" jump-code text after arriving at
      `/stage` (`ela.spec.ts:109`) — **superseded**: STG's layout is being fully redesigned (see
      the Stage Aisle section below); re-verify against the new implementation
- [ ] **ELZ** — "Stage Aisle" navigation button click times out — an on-screen numpad/keyboard
      panel from a prior field entry doesn't fully dismiss and intercepts the click
      (`elz.spec.ts:65`)

### Location ID Info (LII)

- [ ] Strict-mode locator collision on "Hold" — a field label and the Hold button both match the
      same text (`lii.spec.ts:19`) — test-locator fix (scope to role)

### Manual Put (MNP)

- [ ] "Pallet not found" error message doesn't appear for an unknown pallet ID (`mnp.spec.ts:36`)
- [ ] Strict-mode collision on the "9" numpad button — two numeric keypads appear to be mounted
      at once (`mnp.spec.ts:53`)

### Pallet Reinstate (PAR)

- [ ] Success message ("Pallet … created — stored at …") doesn't appear after creating a located
      pallet (`par.spec.ts:30`)
- [ ] "location is not empty" validation error doesn't appear on a bad-location submit
      (`par.spec.ts:44`)

### Pallet ID Pull (PIP)

- [ ] "scanning a label for a different pull function" passes `undefined` into `hardwareScan()` —
      looks like a missing test fixture, not yet confirmed as an app bug (`pip.spec.ts:35`)
- [ ] "✗ Alt ID" button never becomes clickable while verifying (`pip.spec.ts:111`)
- [ ] "✓ Alt ID" button never becomes clickable while verifying (`pip.spec.ts:123`)

### Staged Aisle Report (SAR)

- [ ] Neither the empty-state message nor result rows render for the "most staged" column
      (`sar.spec.ts:20`) — may be seed-data dependent rather than a code bug

### System Directed Put (SDP)

- [ ] "Pallet not found" error message doesn't appear for an unknown pallet ID (`sdp.spec.ts:61`)
- [ ] Strict-mode collision on the "9" numpad button, same family as the MNP one above
      (`sdp.spec.ts:70`)
- [ ] Consolidating-move message renders with `warning` tone instead of the spec'd `info` tone
      (`sdp.spec.ts:96`)
- [ ] "Wrong location — directed to …" error doesn't appear on an incorrect confirm
      (`sdp.spec.ts:105`)
- [ ] "Put complete — …" success message doesn't appear on a correct confirm (`sdp.spec.ts:114`)

### Stage Aisle (STG)

- [ ] Stage button never becomes enabled after filling Aisle/Storage/Size/Quantity
      (`stg.spec.ts:62`, `:67`, `:101`)
- [ ] Strict-mode collision on "Unstage Aisle" — the button label and the modal heading share the
      same text (`stg.spec.ts:111`)
- **Note:** the two items above are against STG's *old* layout. STG is mid-redesign as of this
  writing (pallet-rider-triple graphic, Master Control restructure — see
  `DevNotes/Logs/phase-11.md`'s 11.2 entry); the follow-up work for that redesign is tracked
  separately right below rather than folded into the old-layout items above.

### STG Redesign Follow-Ups

- [ ] Update `DevNotes/Screen-Specs/STG.md` to describe the new layout (fork graphic, pallet-box
      fields, Master Control's 4-column structure, the bottom zone map, relocated Log Panel)
- [ ] Rewrite `tests/e2e/stg.spec.ts` against the new DOM — replaces the two old-layout items
      above rather than fixing them in place; add new coverage for Master Control's Aisle field
      feeding "Fill All" and for the zone map's idle → loaded states

The two groups below aren't test failures or redesign follow-ups — they're the remaining
`Documentation/tasks.md` Phase 11 work items needed before a 1.0 release.

### Audio System (Phase 11.1)

- [ ] Design the audio tone system: at minimum an error tone (loud, repeated) and an
      informational tone; finalize actual audio clips (sourcing macOS `.aiff` files) vs. a Web
      Audio API generation approach
- [ ] Replace the `playAlert()` no-op stub in `src/lib/audio.ts` with the real implementation
- [ ] Verify every audio call site (Incorrect Pallet ID, Invalid Alternate ID, invalid label
      status, zNumber not found, PIN mismatch, hold actions) fires the correct tone

### Deployment (Phase 11.2)

- [ ] Configure a GitHub Actions workflow for Azure Static Web Apps deployment
- [ ] Set production environment variables and secrets in Azure
- [ ] Run the production Prisma migration against production Azure SQL
- [ ] Run the production seed (or a trimmed demo-safe version)
- [ ] Verify `/api/*` routing works end-to-end in the deployed environment
- [ ] Smoke-test each major flow in production: login, pull, directed put, manual put, pallet
      lookup, location lookup, hold, empty locations by aisle, empty locations by zone

---

## [0.9.5] — 2026-07-06

### 0.9.5 — Fixed

- **The real, complete root cause of the production API being down.** Got the actual Azure
  build log for the first time (previously only visible via the GitHub Actions UI, not the
  REST API, which 403s without auth) and it showed `tsc -p tsconfig.json` failing outright
  during the API's build step — `Module '"@prisma/client"' has no exported member
  'PrismaClient'` in `lib/prisma.ts`, plus real `noImplicitAny` errors. Oryx does **not** fail
  the deploy when this happens — it logs "Oryx was unable to determine the build steps.
  Continuing assuming the assets in this folder are already built," then zips up and deploys
  whatever's there anyway, with no working `dist/`. That's why every prior deploy reported
  "success" in GitHub Actions despite shipping a non-functional API, confirmed by the Azure
  Portal's Functions blade showing zero registered functions.
  - Fix: added `prisma generate` to the `build` script itself
    (`"build": "prisma generate && tsc -p tsconfig.json"`), not `postinstall` — this runs
    during the second, full `npm install` phase (in `api/` proper, where `prisma/schema.prisma`
    is actually present), not the isolated `.oryx_prod_node_modules` production-only install
    from `[0.9.4]`.
  - The `noImplicitAny` errors on `functions/activity.ts:71`, `functions/reporting.ts:27`, and
    the one-off `api/prisma/{fix-pallet-counts,seed-labels,seed-pending-pallets}.ts` scripts
    were all downstream artifacts of the missing Prisma Client (an unresolved `any`-typed
    `prisma` client cascades into `noImplicitAny` failures on its query results) — verified by
    a clean, zero-error, isolated build once the client is generated. No `tsconfig.json` or
    `functions/*.ts` changes were needed.

## [0.9.4] — 2026-07-06

### 0.9.4 — Fixed

- **Reverted `[0.9.3]`'s `postinstall` fix — it was wrong and broke the production deploy.**
  Oryx (Azure's build system) runs a separate, isolated `npm install --production` into
  `api/.oryx_prod_node_modules` — a side directory containing only `node_modules`, not the
  project's `prisma/` source folder. The `postinstall: prisma generate` script added in
  `[0.9.3]` fired during that isolated install and failed outright
  (`Error: Could not find Prisma Schema`), aborting the whole build. Confirmed via the actual
  GitHub Actions build log (local reproduction with a plain `npm install` had missed this,
  since it doesn't replicate Oryx's two-phase install). Oryx has its own native Prisma
  detection and generates the client itself, in the correct directory, as a build snippet
  separate from any npm script — which is why the API built successfully for months with no
  explicit generate step at all. Removed `postinstall` from `api/package.json`; the
  environment-variable fix from `[0.9.3]` was the actual (and only) fix needed.

## [0.9.3] — 2026-07-06

### 0.9.3 — Fixed

- **Production API was completely non-functional** — every `/api/*` route 404'd on the live
  site. Root-caused to two compounding gaps in Phase 11.2's deployment checklist, neither of
  which had actually been done despite being listed:
  - The Static Web App's Production environment variables (`DATABASE_URL`, `JWT_SECRET`) were
    never set in Azure, and `api/lib/prisma.ts` constructs its Prisma client eagerly at module
    load time — with `DATABASE_URL` unset, every function file's import of `lib/prisma.js`
    (chained through `api/index.ts`, which imports all function files in one shot) throws
    during Functions host startup, so no routes ever get registered. Fixed by the user adding
    both settings in the Azure Portal.
  - `api/package.json` had no `postinstall` script, so a plain `npm install` (what Azure's Oryx
    build runs) never generates the Prisma Client — confirmed by reproducing a clean install in
    an isolated copy of `api/`, which left `node_modules/.prisma/client` missing and made
    `npm run build` fail with `Module '"@prisma/client"' has no exported member 'PrismaClient'`.
    Added `"postinstall": "prisma generate"` to `api/package.json`'s scripts — the standard
    Prisma-recommended pattern for this exact scenario. Re-verified in a second clean install:
    Prisma Client now generates automatically and `npm run build` succeeds.
- Production database was also never seeded (`Documentation/tasks.md`'s Phase 11.2 checklist —
  see `[0.9.2]` above for the seed script changes made first). All three gaps together are why
  logging in with `z002p25` on the live site returned "znumber not found."

## [0.9.2] — 2026-07-06

### 0.9.2 — Added

- **Demo staging data** — the Prisma seed script (`api/prisma/seed.ts`) now stages a portion
  of 8 non-XS aisles' empty locations (`STAGED` status) instead of leaving them all `EMPTY`,
  filling back-to-front the same way `POST /api/staging/stage` does, so ELZ/STG have
  realistic staged aisles to show immediately after a reseed. Aisle 304 is fully staged; the
  other 7 are staged at varied percentages.

### 0.9.2 — Fixed

- `Documentation/outline.md`'s "Stage Aisle" section still described it as *Design Pending*
  and listed it under "Explicitly Out of Scope" — stale since Phase 7 actually built and
  shipped it (`tasks.md` had already flagged this drift but the fix was never applied).
  Rewritten to describe the shipped behavior and reference `DevNotes/Screen-Specs/STG.md`.

---

## [0.9.1] — 2026-07-06

### 0.9.1 — Added

- **Scale-to-fit rendering** (`src/components/shell/ScaleToFit.tsx`) — the app renders at its
  native 1366×1024 iPad Pro canvas and scales it with a CSS transform to fit whatever device
  it's actually running on (e.g. a regular iPad's smaller landscape resolution), recomputed on
  resize/orientation change, rather than clipping off-screen. Wired in at `src/main.tsx`.

---

## [0.9.0] — 2026-07-05

Feature-complete core application (Phases 1–10 of `Documentation/tasks.md`, plus Phase 11.0's
documentation pass). Remaining before 1.0: the audio alert implementation, production deployment,
and clearing the Unreleased fix backlog above.

### 0.9.0 — Added

- Full authentication flow: badge/zNumber identify → PIN entry → session, 15-minute idle timeout,
  role-based access (Worker, IM, Lead, Admin)
- **Pull (PIP)** — unified pull screen for every pull type, with two-path verification (Pallet ID
  or Alternate ID/UPC)
- **Put** — System Directed Put (SDP), zone-aware location assignment with consolidation
  handling; Manual Put (MNP), worker-directed with safety checks
- **Lookup** — Pallet ID Info (PII) and Location ID Info (LII), with in-place IM+ editing on PII
- **Empty Locations** — aisle-level summary (ELA) and a visual zone-by-zone map (ELZ), sharing
  the `AisleGrid` component
- **Stage Aisle (STG)** — a new feature not present in the legacy system this project improves
  on, for pre-staging pallets into an aisle ahead of put-away; given a full visual redesign this
  session around a pallet-rider-triple graphic (still being finished — see Unreleased above)
- **Inventory management** — Pallet Reinstate (PAR, IM+), Item ID Lookup (IID)
- **Location management** — Warehouse Location Hold (WLH) placement/removal with role-gated hold
  types, via a shared `HoldPanel` used inline from PIP/SDP/MNP
- **Reporting** — Staged Aisle Report (SAR)
- Shared app shell: Home/Back/Jump header navigation, persistent non-blocking message bar,
  on-screen numpad/keyboard input system, hot-jump-by-code overlay
- 82-test Playwright e2e suite covering every built screen

### 0.9.0 — Known Issues

- 21 items from the latest full Playwright run — see Unreleased above
- `playAlert()` in `src/lib/audio.ts` is still a no-op stub (Phase 11.1)
- Not yet deployed (Phase 11.2)
