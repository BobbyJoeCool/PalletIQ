# Changelog

All notable changes to PalletIQ are documented here. Loosely follows [Keep a Changelog](https://keepachangelog.com) conventions.

## Table of Contents

- [Future Versions — Major Features](#future-versions--major-features)
- [Unreleased — Reported Issues](#unreleased--reported-issues)
- [1.0.0 — 2026-07-06](#100--2026-07-06)
- [0.9.7 — 2026-07-06](#097--2026-07-06)
- [0.9.6 — 2026-07-06](#096--2026-07-06)
- [0.9.5 — 2026-07-06](#095--2026-07-06)
- [0.9.4 — 2026-07-06](#094--2026-07-06)
- [0.9.3 — 2026-07-06](#093--2026-07-06)
- [0.9.2 — 2026-07-06](#092--2026-07-06)
- [0.9.1 — 2026-07-06](#091--2026-07-06)
- [0.9.0 — 2026-07-05](#090--2026-07-05)

---

## Future Versions — Major Features

Not yet designed or scheduled to a phase — placeholder codes reserved in `HomePage.tsx`/
`App.tsx` (rendering as `PlaceholderPage` today) or newly proposed. Each gets its own design
conversation and build plan when picked up.

- **IRP — Individual Reporting.** Personal productivity dashboard for the logged-in worker:
  pull/put performance by function (units, units/hour, time in function, goal progress), or a
  staging summary for GPMers. Leads/Managers get a separate cross-worker reporting screen; IRP
  always shows only the logged-in user's own data.
- **ISI — Item Storage Inquiry.** Looks up an item by DPCI or UPC (like IID) and lists every
  location currently storing it, ordered by location. Selecting a row jumps to that location's
  LII screen, or to the pallet's PII screen.
- **PRQ — Pull Request by Label.** Not yet designed.

---

## Unreleased — Reported Issues

Grouped by screen. Each item is either a bug (something's broken) or a feature change (works
today, wanted differently) — tagged `[Bug]` or `[Feature Change]`. Reports filed via
[DevNotes/Bug-Reports/ReportTemplate.md](DevNotes/Bug-Reports/ReportTemplate.md) land here. Items without a tag below
predate that convention and were found during the 2026-07-05 full Playwright run (61 passed / 21
failed) — see
[DevNotes/TestLogs/playwright-run-2026-07-05.md](DevNotes/TestLogs/playwright-run-2026-07-05.md)
for full detail, error text, and reproduction steps.

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
  `DevNotes/Logs/version-1_0_0.md`'s 11.2 entry); the follow-up work for that redesign is tracked
  separately right below rather than folded into the old-layout items above.

### STG Redesign Follow-Ups

- [ ] Update `DevNotes/Screen-Specs/STG.md` to describe the new layout (fork graphic, pallet-box
      fields, Master Control's 4-column structure, the bottom zone map, relocated Log Panel)
- [ ] Rewrite `tests/e2e/stg.spec.ts` against the new DOM — replaces the two old-layout items
      above rather than fixing them in place; add new coverage for Master Control's Aisle field
      feeding "Fill All" and for the zone map's idle → loaded states

---

## [1.0.0] — 2026-07-06

### 1.0.0 — Added

- **Real audio alert system (Phase 11.1)** — `playAlert()` in `src/lib/audio.ts` no longer a
  no-op stub. Plays a distinct mp3 per severity (`src/assets/Error.mp3`, `Warning.mp3`,
  `Info.mp3`), each at its own fixed volume (Error 1.0, Warning 0.7, Info 0.5) so the tones read
  as loudest-to-quietest by severity. No call site changes needed — every existing
  `playAlert('error' | 'warning' | 'info')` call across Login/PIN/MNP/PAR/STG/PII/PIP/IID/WLH/
  SDP and `HoldPanel` already passed the correct tone; verified in-browser via Playwright against
  the real dev server (each tone resolves to the right file, the right volume, and plays without
  a decode error).

This closes out `Documentation/tasks.md`'s Phase 11.1, the last unchecked item in the original
11-phase build plan — Phases 1–11 are now complete. That build plan is archived as-is at
[`Documentation/Development/initialBuildTasks.md`](Documentation/Development/initialBuildTasks.md)
for history. There is no replacement `tasks.md`: from here on, this changelog's
**Unreleased — Reported Issues** section above is the live list of what's left to do.

---

## [0.9.7] — 2026-07-06

### 0.9.7 — Fixed

- **Every authenticated action in production returned "unauthorized," even immediately after a
  successful login.** With the API finally up and running (`[0.9.6]`), this was the next
  blocker. Root-caused by temporarily dumping the raw `Authorization` header value inside
  `requireAuth` in production: the header Azure delivered to our code wasn't our token at all —
  it was a completely different JWT, issued by `scm.azurewebsites.net` with audience
  `azurefunctions`. Azure Static Web Apps' Managed Functions proxy uses the `Authorization`
  header for its own internal system-to-system auth (from the SWA edge to the hidden backing
  Function App) and overwrites whatever the client sends before the request reaches our code —
  our own Bearer token never arrives. Confirmed with full SHA-256 hashes that the JWT signing
  secret was identical between sign-time and verify-time throughout, and that a production-signed
  token verified successfully when checked locally — ruling out every other theory (secret
  mismatch, stale instances, bad secret value) before landing on this one.
  - Fix: use a custom `X-Auth-Token` header instead of `Authorization` for the app's own session
    token, on both sides — `api/lib/permissions.ts`'s `requireAuth` now reads
    `req.headers.get('x-auth-token')`, and `src/lib/api.ts`'s `apiFetch` now sends
    `'X-Auth-Token': token` instead of `Authorization: Bearer ${token}`.
  - Removed all temporary diagnostic code (secret hashes, raw header dumps) added while
    root-causing this.

## [0.9.6] — 2026-07-06

### 0.9.6 — Fixed

- **The actual, final root cause — `[0.9.5]`'s fix worked at build time but was silently
  discarded before deploy.** Got the real API build log for the `[0.9.5]` deploy and found that
  Oryx, as its very last packaging step for Azure Functions apps, overwrites `api/node_modules`
  with an earlier snapshot captured *before* the build ran (`Copying production dependencies
  from '.../api/.oryx_prod_node_modules/node_modules' to '.../api/node_modules'`) — a
  hardcoded step to strip devDependencies from the deployed bundle, not something controllable
  from `package.json`. Since that snapshot predates `prisma generate`, the generated client
  never survives into the actual deployed artifact, even though the build itself succeeds.
  Confirmed via the Azure Portal's Functions blade (still empty after `[0.9.5]`) and by
  reproducing Oryx's exact multi-phase install/build/swap sequence in an isolated copy of
  `api/` — proved the swap really does erase `node_modules/.prisma/client`.
  - Fix: generate the Prisma Client to a custom path outside `node_modules`
    (`prisma/schema.prisma`'s `generator client` block now has `output = "../generated/prisma"`)
    since Oryx's swap only touches `node_modules`, never sibling directories. Updated all 5
    import sites (`lib/prisma.ts`, `prisma/seed.ts`, `prisma/fix-pallet-counts.ts`,
    `prisma/seed-labels.ts`, `prisma/seed-pending-pallets.ts`) from `'@prisma/client'` to
    `'../generated/prisma/index.js'`.
  - This surfaced a second issue: `tsc`'s `outDir` nests compiled output one level deeper than
    source (`api/lib/prisma.ts` → `api/dist/lib/prisma.js`), so a relative import correct at the
    source level resolves to the wrong location once compiled (`dist/generated/...` instead of
    the real `api/generated/...`). Added `"postbuild": "cp -r generated dist/generated"` to
    `api/package.json` so the compiled output has its own copy at the depth its compiled imports
    actually expect.
  - Verified with a full reproduction of Oryx's real pipeline in an isolated copy: production
    install → copy → full install → build → **the destructive swap** → `node -e
    "import('./dist/index.js')"` — all 12 function files imported cleanly post-swap, and a live
    query against the production database (`prisma.user.findUnique({ where: { zNumber:
    'z002p25' } })`) succeeded end-to-end through the exact post-swap runtime state.
  - Both `.gitignore` files already had `generated/prisma` entries from a prior session that
    anticipated this exact fix but never wired it up.

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
