# Changelog

All notable changes to PalletIQ are documented here. Loosely follows [Keep a Changelog](https://keepachangelog.com) conventions.

## Table of Contents

- [Future Versions — Major Features](#future-versions--major-features)
- [Unreleased — Reported Issues](#unreleased--reported-issues)
- [1.0.5 — 2026-07-06](#105--2026-07-06)
- [1.0.4 — 2026-07-06](#104--2026-07-06)
- [1.0.3 — 2026-07-06](#103--2026-07-06)
- [1.0.2 — 2026-07-06](#102--2026-07-06)
- [1.0.1 — 2026-07-06](#101--2026-07-06)
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
[DevNotes/ReportTemplate.md](DevNotes/ReportTemplate.md) land here. Items without a tag below
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
  `DevNotes/Logs/Pre-V1_0_0/phase-11.md`'s 11.2 entry); the follow-up work for that redesign is tracked
  separately right below rather than folded into the old-layout items above.

### STG Redesign Follow-Ups

- [ ] Update `DevNotes/Screen-Specs/STG.md` to describe the new layout (fork graphic, pallet-box
      fields, Master Control's 4-column structure, the bottom zone map, relocated Log Panel)
- [ ] Rewrite `tests/e2e/stg.spec.ts` against the new DOM — replaces the two old-layout items
      above rather than fixing them in place; add new coverage for Master Control's Aisle field
      feeding "Fill All" and for the zone map's idle → loaded states

---

## [1.0.5] — 2026-07-06

### 1.0.5 — Fixed

All 6 items filed against STG in `Documentation/Bug-Reports/v0.9.1-BugReport.md`'s STG section:

- **Master info didn't fully pull in when navigating to STG from ELZ/ELA.** Both screens' "Stage
  Aisle" navigation only ever passed `{ aisle }` in router state, even though ELZ already had
  Storage Code in scope and ELA had Storage Code *and* Size — STG's own pre-population effect
  already fully supported both, just never received them. `ELZPage.tsx` and `ELAPage.tsx` now
  pass their Storage Code (and, for ELA, Size) along; STG's gate loosened from requiring both
  fields together to accepting Storage Code alone (ELZ's case) or with Size (ELA's case).
- **Second/third stacks conflicted with the first stack's location, and fork updates didn't
  propagate to other stacks.** Both bugs shared one root cause: each fork stack's live
  destination-location preview queried the backend independently, with no notion of "already
  claimed by a sibling stack's uncommitted preview" — so two stacks sharing an Aisle/Storage
  Code/Size (e.g. via Fill All) computed identical candidate lists, and neither ever refreshed
  when a sibling changed or staged. Fixed with client-side priority-order exclusion: Stack 0
  outranks Stack 1 outranks Stack 2 (matching the fork graphic's left-to-right layout) — each
  stack's location fetch now excludes whatever a higher-priority sibling currently holds, and
  re-fetches whenever that sibling's holdings change (including clearing to none after that
  sibling stages). One-directional by design, to avoid two stacks' effects invalidating each
  other in a loop; documented as a known, accepted limitation that a lower stack changing
  *after* a higher one already computed its list won't retroactively invalidate the higher one
  — display-only, since the stage endpoint re-validates every location as still empty at write
  time and never double-books.
  - Caught and fixed during implementation: the exclusion loop was initially bounded by attempt
    count rather than results actually kept, which would have inflated `shortfall` by the
    exclusion count alone — corrected to bound by results length instead.
  - Caught and fixed during live verification: the exclusion computation's own dependency array
    initially (and incorrectly) included a stack's *own* locations for the two higher-indexed
    stacks, creating a self-triggering refetch loop that perpetually cancelled the lowest-priority
    stack's fetch before it could ever apply — fixed by deriving each stack's dependency from
    only its lower-priority siblings' locations, never its own.
- **Fill All button never reflected quantity entry.** Its enabled state depended only on Master
  Control's Aisle/Storage Code/Size, never on whether the stacks it fills still needed anything —
  so it stayed identically enabled no matter how many stacks already had a Quantity, even once
  there was nothing left for it to do. Now also disables once every stack already has a Quantity.
- **Dynamic sizing for staging locations; bold red final location** (Feature Change). The
  per-stack "Pallets Go To" list had no size variation and no distinction for the last entry.
  Now renders larger when 4 or fewer total locations are requested, and bolds+reddens the final
  assigned location.
- **Narrower rows for the STG zone map** (Feature Change). `AisleGrid` (shared with ELZ) had a
  single hardcoded row height that fit ELZ's full-page pane but not STG's shorter bottom-half
  one. Added an optional `dense` prop (default off, so ELZ is pixel-identical); STG's zone map
  now passes it for visibly narrower rows.

### 1.0.5 — Notes

- No API/backend or schema changes — all six fixes are frontend-only.
- Verified live against the running dev server via scripted Playwright sessions (real login, real
  staging data — not the full e2e suite, so no shared-live-DB mutation risk beyond the staging
  actions themselves, which are a normal part of using the screen): confirmed Storage Code/Size
  carryover from both ELZ and ELA, confirmed Fill All's disabled state responds to quantity entry,
  confirmed three stacks configured identically via Fill All now get three genuinely distinct
  destination locations with no overlap, confirmed a staged stack resets and its message bar text
  is correct, and confirmed the zone map's rows are visibly narrower than ELZ's.

---

## [1.0.4] — 2026-07-06

### 1.0.4 — Fixed

- **Focused-field highlighting was inconsistent app-wide.** ELZ, ELA's Storage Code field, PII's
  Pallet ID field, and IID's DPCI/UPC fields showed no active-state indicator at all — the field
  you were about to type into looked identical to every other field. Every numpad/keyboard-driven
  field now turns its border red (`border-[#CC0000]`) in addition to the existing blinking-cursor
  treatment while it's the active input target, applied consistently across every screen
  (`MNPPage.tsx`, `SDPPage.tsx`, `PARPage.tsx`, `STGPage.tsx`, `PIPPage.tsx`,
  `LocationEntryFields.tsx`, and the four previously-missing screens above).
- **The on-screen keyboard/numpad could stay open (or a field could stay highlighted) after a
  screen was "done" with it.** Several submit handlers (e.g. ELZ's Aisle/Storage Code confirm)
  called `hidePanel()` to close the panel but never cleared `NumpadContext`'s active-field
  handler/ID, so the just-submitted field kept showing as "focused" indefinitely — the highlight
  and the panel's open/closed state could drift out of sync depending on which of the two a given
  screen remembered to call. Fixed at the root: `NumpadContext`'s `setKeyHandler(null)` (what
  `hidePanel()` now calls) always clears both the active field *and* the panel together, so "no
  field is focused" and "no panel is showing" can no longer disagree. No per-screen call sites
  needed to change.
- **LII/WLH's three-field Aisle/Bin/Level entry didn't actually auto-advance**, despite both
  screens' specs (`DevNotes/Screen-Specs/LII.md`, `WLH.md`) already calling for it ("auto-advances
  ... when the expected digit count is reached") — the existing code only checked the digit count
  inside the OK/Enter submit handler, so a worker still had to tap OK after typing each 3-digit
  Aisle/Bin or 2-digit Level instead of it happening automatically. Added an optional `maxLength`
  to `useNumpadField()`: once typed input reaches that length, the field auto-submits (and the
  screen's existing focus-chaining takes it to the next field) without waiting for OK. Applied
  only to `LocationEntryFields.tsx`'s Aisle(3)/Bin(3)/Level(2) — the one spot in the app where a
  field's length is already a hard contract in the code, not inferred. Guarded by a new
  `isScanningRef` on `NumpadContext` so this doesn't clip a full 8-digit barcode scanner override
  mid-injection: `deliverScan()` marks itself as scanning while it injects a value character by
  character, and `maxLength` auto-submit is suppressed for the duration.

### 1.0.4 — Notes

- Scope was intentionally limited to fields with a length already enforced in code
  (`LocationEntryFields.tsx`). Other fields that are *probably* fixed-length in practice (8-digit
  location barcodes elsewhere, DPCI format) don't currently enforce that length in the frontend —
  the API validates instead — so auto-advancing them would have been a guess rather than a known
  contract; left alone rather than risk truncating a field that turns out to accept a different
  length than assumed.
- Verified all three behaviors live against the running dev server with a scripted Playwright
  session (real login, no mocking): confirmed ELZ's Aisle field highlights on focus and
  un-highlights when focus moves to Storage Code, confirmed the numpad panel closes on navigating
  to Home, and confirmed LII's Bin field auto-highlights immediately after typing "123" into Aisle
  with no OK tap. Screenshots and script discarded after verification (scratch only, not
  committed).

---

## [1.0.3] — 2026-07-06

### 1.0.3 — Fixed

- **Alert sound delay (~1s gap between message and sound).** `playAlert()` built a fresh
  `new Audio(src)` on every call with no preload, so the browser had to fetch/decode the mp3
  before playback could start. Now each tone's `HTMLAudioElement` is created once at module load
  with `preload = 'auto'` and reused — `playAlert()` just resets `currentTime` and calls `play()`
  on the cached element.
- **SDP: "Consolidating" toggle silently ignored on the next pallet scan**, causing the
  already-stored move message to render with the `warning` tone instead of the spec'd `info`
  tone whenever consolidating was on (filed as a tone bug in the Unreleased backlog, but the tone
  was a symptom, not the cause). Root cause: `handlePalletScan` is registered with `palletField`
  once per entry into `entry` state (`focusPalletField`'s registration effect depends only on
  `screenState`), so it never picked up a `consolidating` toggle that happened after that
  registration — same stale-closure hazard the file already works around for `aisleValueRef`.
  Fixed by reading `consolidating` through a ref (`consolidatingRef`), same pattern.
- **MNP: "✗ PID" demo button showed "Scan failed" instead of "Pallet not found."** It delivered
  the non-numeric string `'INVALID-PID-000'`, which fails the API's `parseInt` numeric check
  (`INVALID_INPUT`, 400) before ever reaching the not-found lookup (`PALLET_NOT_FOUND`, 404).
  Every other "not found" demo button in the app (LII, PII, WLH, IID, PAR) uses a numeric
  placeholder ID that simply doesn't exist in the DB instead. Changed MNP's to `'999999999'` to
  match.
- **ELZ: zone summary panel's StorageCode-Size rows had no defined sort order**, per a
  previously-filed Feature Change in `Documentation/Bug-Reports/v1.0.0-BugReport.md`. The
  `/api/locations/empty-by-zone` handler now sorts each zone's breakdown ascending by size
  (`XS, HS, S, M, L`, matching the canonical `SIZES` order already used by `ELAPage.tsx` and
  `STGPage.tsx`); storage code doesn't vary within a zone's breakdown since it's already scoped
  to the queried Storage Code.

---

## [1.0.2] — 2026-07-06

### 1.0.2 — Fixed

- **Alert sounds (`playAlert()` — Error/Warning/Info tones) never played in production** (filed
  as a Major bug in `Documentation/Bug-Reports/v1.0.0-BugReport.md`). Root-caused to
  `staticwebapp.config.json`'s `navigationFallback.exclude` list: every other static asset
  extension (`css, js, ico, png, jpg, gif, svg, woff, woff2`) was excluded from the SPA fallback
  rewrite, but `mp3` wasn't. Per Azure Static Web Apps' own documented behavior, a request for a
  path whose extension isn't in the exclude list gets rewritten to `/index.html` **even if a real
  file exists at that path** (confirmed against Microsoft's own example, where an existing
  `icon.svg` file is overridden by the fallback purely because `svg` isn't in that example's
  filter) — so every request for `/assets/Error-*.mp3` etc. was silently served `index.html`
  instead of the actual audio file. The browser then failed to decode HTML as audio, and
  `playAlert()`'s `.catch()` swallowed the rejection silently, matching the reported symptom
  exactly (worked in local dev, which doesn't have this SPA-fallback layer at all).
  - Fix: added `mp3` to `staticwebapp.config.json`'s `navigationFallback.exclude` list.
  - Verified the real built mp3 files serve correctly (`Content-Type: audio/mpeg`, `200`) via the
    Azure Static Web Apps CLI emulator against the fixed config. Could not fully reproduce the
    *broken* state locally — the emulator is more lenient than real production and serves
    existing files directly regardless of the exclude list (it explicitly warns "may not match
    the cloud environment exactly") — so the root-cause diagnosis relies on Microsoft's
    documented routing behavior rather than a local repro of the failure. Recommend confirming
    sound plays correctly once this is deployed to production.

---

## [1.0.1] — 2026-07-06

### 1.0.1 — Added

- **"Wake database" link on the login screen.** A small, low-emphasis link below the badge-scan/
  zNumber panels that hits a new unauthenticated `GET /api/health` endpoint (runs a trivial
  `SELECT 1`) to force Azure SQL serverless to resume if it's currently auto-paused. Shows a
  spinner + "Waking up database… this can take up to a minute" while in flight (a cold resume can
  take 15–60+ seconds), then "Database ready" or an error message. Added directly in response to
  the Azure SQL auto-pause/resume timeouts that caused real production login failures during
  `[0.9.0]`–`[0.9.7]`'s deployment work — this gives a worker a way to pre-warm the database
  instead of the identify/login calls themselves timing out cold.

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
