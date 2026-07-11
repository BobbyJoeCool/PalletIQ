# Changelog

All notable changes to PalletIQ are documented here. Loosely follows [Keep a Changelog](https://keepachangelog.com) conventions.

## Table of Contents

- [Future Versions — Major Features](#future-versions--major-features)
- [Unreleased — Reported Issues](#unreleased--reported-issues)
- [1.3.1 — 2026-07-10](#131--2026-07-10)
- [1.3.0 — 2026-07-10](#130--2026-07-10)
- [1.2.0 — 2026-07-09](#120--2026-07-09)
- [1.1.5 — 2026-07-08](#115--2026-07-08)
- [1.1.0 — 2026-07-08](#110--2026-07-08)
- [1.0.10 — 2026-07-08](#1010--2026-07-08)
- [1.0.9 — 2026-07-08](#109--2026-07-08)
- [1.0.6 — 2026-07-07](#106--2026-07-07)
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
- **PRQ — Pull Request by Label.** Not yet designed.

---

## Unreleased — Reported Issues

Bugs and feature requests are now tracked as [GitHub Issues](https://github.com/BobbyJoeCool/PalletIQ/issues) on this repo, not as file-based reports — see `.claude/CLAUDE.md`'s Bug Report Conventions. Severity is a label (`blocker`/`major`/`minor`/`nice-to-have`/`distant-future`/`needs-triage`); closing an issue is what marks it done, so a closed issue's fix is documented in whichever version below actually shipped it rather than listed again here. This section is just the current open backlog, grouped by severity, kept in sync as issues are filed or closed.

### Major/Important

- [#14](https://github.com/BobbyJoeCool/PalletIQ/issues/14) — Add ability to put ranges on hold (WLH)
- [#15](https://github.com/BobbyJoeCool/PalletIQ/issues/15) — Add helper bar button to select a location on hold (WLH)
- [#65](https://github.com/BobbyJoeCool/PalletIQ/issues/65) — SDP: enlarge the Consolidating and lock toggle buttons
- [#72](https://github.com/BobbyJoeCool/PalletIQ/issues/72) — PIP: Full Pallet Alt-ID wrong-level popup should collect the correct level instead of just confirming/rejecting

### Minor

- [#55](https://github.com/BobbyJoeCool/PalletIQ/issues/55) — ID field should defocus/blur after scan or entry (PII, LII, IID) — reopened: still reselects on the very first scan of a session
- [#64](https://github.com/BobbyJoeCool/PalletIQ/issues/64) — SDP: "Applying Size" indicator should sit next to the Consolidation button instead of shifting the screen
- [#66](https://github.com/BobbyJoeCool/PalletIQ/issues/66) — PII: block Save on edit-pallet when no fields actually changed
- [#68](https://github.com/BobbyJoeCool/PalletIQ/issues/68) — PAR: DPCI entry should be split into 3 boxes
- [#69](https://github.com/BobbyJoeCool/PalletIQ/issues/69) — PAR: Location entry should be split into 3 boxes
- [#75](https://github.com/BobbyJoeCool/PalletIQ/issues/75) — STG: refresh of forks elements on defocus is slow

### Nice-to-have/Cosmetic

- [#46](https://github.com/BobbyJoeCool/PalletIQ/issues/46) — Persist team member activity log across screens for the last 12 hours
- [#52](https://github.com/BobbyJoeCool/PalletIQ/issues/52) — Demo reseed should generate randomly-staged aisles with realistic timestamps, so SAR looks realistic in demos
- [#61](https://github.com/BobbyJoeCool/PalletIQ/issues/61) — PIP/SDP: double the font size of the location display
- [#62](https://github.com/BobbyJoeCool/PalletIQ/issues/62) — PIP/SDP: combine "Pull Quantity" and "Remaining" rows to save space
- [#63](https://github.com/BobbyJoeCool/PalletIQ/issues/63) — ELA: add a subtle divider between size columns
- [#70](https://github.com/BobbyJoeCool/PalletIQ/issues/70) — PAR: Demo Helper autofill for Location doesn't fill the Level field
- [#71](https://github.com/BobbyJoeCool/PalletIQ/issues/71) — PAR: "Cartons" label should read "Cartons per Pallet"
- [#73](https://github.com/BobbyJoeCool/PalletIQ/issues/73) — STG: move Fill All and Unstage Aisle buttons onto the operator compartment
- [#76](https://github.com/BobbyJoeCool/PalletIQ/issues/76) — STG: add a manual Refresh button

### Distant Future

- [#29](https://github.com/BobbyJoeCool/PalletIQ/issues/29) — Warehousing Menu restructure — add Inbound, Outbound, ICQA, and Manager menus

---

## [1.3.1] — 2026-07-10

### 1.3.1 — Added

- **SDP: prefer Staged-flagged locations over empty ones when not consolidating.**
  Directed-put location-finding used to treat STAGED and EMPTY locations as equally
  valid candidates, picked by proximity order alone. Now, whenever Consolidating mode is
  off, every eligible STAGED location is considered before any EMPTY one (proximity
  ordering still applies within each group) — a location can end up empty for reasons
  unrelated to staging (a hold lifted, a pull, etc.), so new pallets should land next to
  what was already staged for them rather than scattering into those. Consolidating
  mode's own logic (EMPTY only) is unchanged.
  ([#79](https://github.com/BobbyJoeCool/PalletIQ/issues/79))

## [1.3.0] — 2026-07-10

### 1.3.0 — Added

- **STG: simplified triple graphic with a single front-stack box and a location
  suggestion reject/hold flow.** The old three-independent-fork-stacks model — each with
  its own Aisle/Storage Code/Size/Quantity and its own destination-location list — is
  replaced by one stageable **front stack** ("front" = furthest from the operator, fixed
  regardless of the graphic's on-screen orientation). The triple graphic is flipped so the
  forks point right and shortened to reclaim vertical space; "Fill All" and "Unstage
  Aisle" move onto the graphic itself, top-left over the operator's compartment. The front
  stack's next suggested destination location is now a button: tapping it opens a
  confirm/cancel popup to put that location on hold (reason code defaults to "Blocked",
  editable via dropdown) and get a new suggestion, without staging anything. Holds placed
  this way persist until released elsewhere (e.g. WLH) and are not tied to unstaging.
  ([#77](https://github.com/BobbyJoeCool/PalletIQ/issues/77))
- **STG: manual Refresh button.** Reloads the live info panel and the front stack's
  suggested location on demand, independent of the automatic refresh already triggered by
  field commits. ([#76](https://github.com/BobbyJoeCool/PalletIQ/issues/76))
- **Shared field components** for Storage Code, Size, Pallet ID, DPCI (edit mode), and
  Reason Code (`src/components/shared/{StorageCodeField,SizeField,PalletIdField,
  DpciField,ReasonCodeField}.tsx`), each with `compact`/`default` size variants instead of
  free className passthrough. Migrated STG, ELA, ELZ, HoldPanel, and PII as representative
  usages; broader rollout across the rest of the app is left as follow-up.
  ([#78](https://github.com/BobbyJoeCool/PalletIQ/issues/78))

### 1.3.0 — Fixed

- [#74](https://github.com/BobbyJoeCool/PalletIQ/issues/74) — STG: Unstage Aisle button is now larger and red, given its destructive nature (folded into the #77 redesign above)
- [#6](https://github.com/BobbyJoeCool/PalletIQ/issues/6) — Reason code "Type a code…" free-text fields (HoldPanel, PII edit mode) now use the app's own on-screen keyboard instead of popping the iPad's native keyboard — a side effect of consolidating both onto the new shared `ReasonCodeField`
- [#67](https://github.com/BobbyJoeCool/PalletIQ/issues/67) — STG hot-jump-fills-only-one-of-three-stacks bug is moot now that there's only one stageable stack

## [1.2.0] — 2026-07-09

First two features of the v1.2.0 batch (see `DevNotes/DesignPrompts/v1.2.0-feature-design-
prompt.md`) — the remaining three (WLH range holds, WLH held-location picker, app-wide
activity log) are still to come in a later version:
[#57](https://github.com/BobbyJoeCool/PalletIQ/issues/57),
[#58](https://github.com/BobbyJoeCool/PalletIQ/issues/58).

### 1.2.0 — Added

- **STG: per-freight-type unstage/restage.** The old "Unstage Aisle" modal was all-or-nothing
  across every freight type staged in an aisle — clearing or restaging a mixed aisle meant
  touching everything, with no way to isolate one Storage Code + Size combination. It's
  replaced by a single popup with one row per freight type actually staged in the aisle
  (dynamic, 1-6 rows): each row can be deactivated to leave that type completely untouched, or
  given a quantity (clamped to that type's `empty + staged` max) to clear and re-stage just that
  type. One Apply commits every active row in one action, logged as a single combined entry.
  ([#58](https://github.com/BobbyJoeCool/PalletIQ/issues/58))
- **STG: live matching-aisle and zone info.** Entering a Storage Code, Aisle, and/or Size in
  Master Control now surfaces relevant info live at the bottom of the screen, replacing the old
  single-aisle physical map: a Storage Code alone lists every matching aisle (tap one to fill
  Aisle); an Aisle (alone or combined with Storage Code/Size) shows that aisle's physical layout
  alongside a zone summary narrowed by whichever fields are filled. Previously there was no way
  to see which aisles even had a given storage code without leaving the screen.
  ([#57](https://github.com/BobbyJoeCool/PalletIQ/issues/57))

### 1.2.0 — Fixed

- **STG's Storage Code and Aisle fields (Master Control) now auto-commit at their fixed
  lengths** (2 and 3 characters), matching every other screen's identical fields. Previously
  they required an explicit Enter/OK, which the new live info panel's "updates as you type, no
  submit step" behavior depended on.

## [1.1.5] — 2026-07-08

Closes the last open blocker plus a batch of small, contained bug fixes:
[#1](https://github.com/BobbyJoeCool/PalletIQ/issues/1),
[#3](https://github.com/BobbyJoeCool/PalletIQ/issues/3),
[#4](https://github.com/BobbyJoeCool/PalletIQ/issues/4),
[#6](https://github.com/BobbyJoeCool/PalletIQ/issues/6),
[#53](https://github.com/BobbyJoeCool/PalletIQ/issues/53),
[#54](https://github.com/BobbyJoeCool/PalletIQ/issues/54),
[#55](https://github.com/BobbyJoeCool/PalletIQ/issues/55),
[#56](https://github.com/BobbyJoeCool/PalletIQ/issues/56), and
[#59](https://github.com/BobbyJoeCool/PalletIQ/issues/59).

### 1.1.5 — Fixed

- **Sessions no longer expire mid-use.** The signed JWT issued at login had a fixed, absolute
  15-minute expiration with no renewal path, so any active kiosk session was forced back to
  "UNAUTHORIZED" exactly 15 minutes after login regardless of activity — a completely separate
  15-minute *idle* timeout already existed client-side (`AuthContext.tsx`) and was working
  correctly, but the two timers weren't connected. The JWT's expiration is now 12 hours (long
  enough to outlast a full shift); the client-side idle timeout remains the actual mechanism
  that ends a session after genuine inactivity. ([#1](https://github.com/BobbyJoeCool/PalletIQ/issues/1))
- **IID's UPC field now opens the number pad instead of the full keyboard**, since UPCs are
  always numeric. ([#56](https://github.com/BobbyJoeCool/PalletIQ/issues/56))
- **ELA's Storage Code field now auto-commits at 2 characters**, matching ELZ's identical field
  (all storage codes are exactly 2 characters). Previously the field only committed on an
  explicit Enter/OK, so switching straight to the Size dropdown without pressing Enter left the
  typed storage code uncommitted and the on-screen keyboard open — fixing both of those reported
  symptoms with the one change. ([#3](https://github.com/BobbyJoeCool/PalletIQ/issues/3),
  [#59](https://github.com/BobbyJoeCool/PalletIQ/issues/59))
- **PII's Pallet ID field now blurs/defocuses after a scan or manual entry**, dismissing the
  on-screen number pad so it no longer covers the pallet info that just loaded. LII and IID
  already did this correctly — PII was the only screen missing the fix.
  ([#55](https://github.com/BobbyJoeCool/PalletIQ/issues/55))
- **PIP's and SDP's Location display now sits inside a bordered box** so it stands out at a
  glance instead of blending into the surrounding data rows.
  ([#53](https://github.com/BobbyJoeCool/PalletIQ/issues/53))
- **ELA now shows every size present in a matching aisle, not just the searched-for size** —
  e.g. searching CR-S now returns HS/S/M/L columns for any matching CR aisle, matching what
  `ELA.md`'s spec already described. The aisle still only qualifies as a match if the *searched*
  size has a non-zero empty/staged count there; the fix widens the columns shown, not which
  aisles show up. Backend-only change (`getLocationsEmptyByAisle`); the frontend was already
  built to render however many size columns the API returns.
  ([#4](https://github.com/BobbyJoeCool/PalletIQ/issues/4))
- **SDP's IM+ Size override is now a plain dropdown**, matching `SDP.md`'s spec exactly. This
  removes the small quick-pick buttons and the free-text keyboard entry the old hybrid allowed
  — a deliberate behavior change (not just a restyle), confirmed with the user first since it
  drops the ability to type a size outside the fixed list.
  ([#54](https://github.com/BobbyJoeCool/PalletIQ/issues/54))
- **PII's edit-pallet screen now requires a reason code** whenever a save actually changes a
  field — a dropdown of common codes (Damaged, Mis-scan, Relabel, Quantity correction, Quality
  issue) plus a "Type a code…" free-text escape hatch, mirroring the existing Hold reason-code
  UX. Like hold reason codes, it's never stored as a column — only written into the
  ActivityLog's existing flexible details field. Deliberately a flat, ungated list for now — a
  role-gated Warehousing/Inbound code split was requested but depends on the Inbound access
  model from issue #29, which is explicitly distant-future/unscheduled; revisit gating once
  that lands. ([#6](https://github.com/BobbyJoeCool/PalletIQ/issues/6))

---

## [1.1.0] — 2026-07-08

Closes the entire Nice-to-Have and Minor backlog plus several Major items:
[#2](https://github.com/BobbyJoeCool/PalletIQ/issues/2),
[#5](https://github.com/BobbyJoeCool/PalletIQ/issues/5),
[#7](https://github.com/BobbyJoeCool/PalletIQ/issues/7),
[#8](https://github.com/BobbyJoeCool/PalletIQ/issues/8),
[#10](https://github.com/BobbyJoeCool/PalletIQ/issues/10),
[#11](https://github.com/BobbyJoeCool/PalletIQ/issues/11),
[#13](https://github.com/BobbyJoeCool/PalletIQ/issues/13),
[#16](https://github.com/BobbyJoeCool/PalletIQ/issues/16),
[#18](https://github.com/BobbyJoeCool/PalletIQ/issues/18),
[#19](https://github.com/BobbyJoeCool/PalletIQ/issues/19),
[#20](https://github.com/BobbyJoeCool/PalletIQ/issues/20),
[#21](https://github.com/BobbyJoeCool/PalletIQ/issues/21),
[#22](https://github.com/BobbyJoeCool/PalletIQ/issues/22),
[#25](https://github.com/BobbyJoeCool/PalletIQ/issues/25),
[#26](https://github.com/BobbyJoeCool/PalletIQ/issues/26),
[#27](https://github.com/BobbyJoeCool/PalletIQ/issues/27),
[#28](https://github.com/BobbyJoeCool/PalletIQ/issues/28),
[#45](https://github.com/BobbyJoeCool/PalletIQ/issues/45),
[#47](https://github.com/BobbyJoeCool/PalletIQ/issues/47),
[#48](https://github.com/BobbyJoeCool/PalletIQ/issues/48),
[#49](https://github.com/BobbyJoeCool/PalletIQ/issues/49),
[#50](https://github.com/BobbyJoeCool/PalletIQ/issues/50), and
[#51](https://github.com/BobbyJoeCool/PalletIQ/issues/51).

### 1.1.0 — Added

- **ISI — Item Storage Inquiry**, a new screen replacing SAR's old slot in the Location
  Management menu column. Worker enters a DPCI (three separate Dept/Class/Item fields, same
  auto-advancing pattern as IID) and sees every location currently storing that item; selecting a
  row enables "Go to Location ID"/"Go to Pallet ID" hot buttons. Backed by a new endpoint,
  `GET /api/items/dpci/:dpci/locations`. ([#13](https://github.com/BobbyJoeCool/PalletIQ/issues/13))
- **Reports menu restructure** ([#10](https://github.com/BobbyJoeCool/PalletIQ/issues/10)): SAR
  (Staged Aisle Report) moved from Location Management to the top of Reporting Functions; the
  "Other Reporting Functions" (RPT) placeholder slot is removed entirely.
- **SAR shows a freight-type badge per aisle** (StorageCode-Size, e.g. `CR-M`) and selecting a row
  enables "Directed Put"/"Stage Aisle" hot buttons that carry the aisle over to SDP/STG via router
  state. ([#11](https://github.com/BobbyJoeCool/PalletIQ/issues/11),
  [#26](https://github.com/BobbyJoeCool/PalletIQ/issues/26))
- **PIP FP Alt-ID level mismatch now prompts a confirm dialog instead of rejecting outright.**
  Alternate ID verification already checked aisle+bin for every pull function; FP additionally
  checks level ([#48](https://github.com/BobbyJoeCool/PalletIQ/issues/48)) — but a Full Pallet pull
  is done from floor level, so requiring the worker to scan the *actual* (possibly high-rack)
  level's barcode isn't physically viable. A level mismatch on an otherwise-matching aisle+bin now
  shows "Level doesn't match" with the scanned vs. actual level, and the worker can confirm the
  pull anyway. ([#49](https://github.com/BobbyJoeCool/PalletIQ/issues/49))
- **SDP shows an "Applying: …" summary** listing every active Size/Storage Code/Zone override
  once at least one is set, confirming they combine (AND) rather than only the last one taking
  effect. ([#50](https://github.com/BobbyJoeCool/PalletIQ/issues/50) — investigated as a possible
  logic bug; the backend already combined overrides correctly, so this ships as a UI
  clarification rather than a logic change)
- **App-wide: DPCI and UPC values are now clickable**, jumping to IID pre-populated via
  `?dpci=`/`?upc=` — applied to LII, MNP, PIP, PII (both DPCI and UPC), and SDP's directed-pallet
  display. ([#47](https://github.com/BobbyJoeCool/PalletIQ/issues/47))
- **WLH: hold status and current location are larger and color-coded** — blue for
  `HOLD_IN`/`HOLD_OUT`, amber for `HOLD_BOTH`, red for `HOLD_PERM` — instead of uniform white text.
  ([#27](https://github.com/BobbyJoeCool/PalletIQ/issues/27),
  [#28](https://github.com/BobbyJoeCool/PalletIQ/issues/28))
- **ELZ's zone map is split into 4 zone groups with Odd/Even sub-columns and dividers**, instead
  of one flat header row. ([#25](https://github.com/BobbyJoeCool/PalletIQ/issues/25))
- **PII**: Received/Put/Last Pulled By show zNumbers instead of names
  ([#7](https://github.com/BobbyJoeCool/PalletIQ/issues/7)); a "Full Pallets" quantity field
  ([#19](https://github.com/BobbyJoeCool/PalletIQ/issues/19)); the cartons field is labeled "Total
  Cartons" everywhere instead of "cartons per pallet"
  ([#20](https://github.com/BobbyJoeCool/PalletIQ/issues/20)); DPCI is edited as three separate
  Dept/Class/Item fields ([#21](https://github.com/BobbyJoeCool/PalletIQ/issues/21)); the
  read-only view is a two-column layout ([#22](https://github.com/BobbyJoeCool/PalletIQ/issues/22)).
- **IID**: DPCI entry is three separate Dept/Class/Item fields instead of one combined field, same
  auto-advancing pattern used by ISI. ([#16](https://github.com/BobbyJoeCool/PalletIQ/issues/16))
- **LII**: a second column shows the located pallet's info alongside the location detail, instead
  of stacking everything in one narrow column. ([#18](https://github.com/BobbyJoeCool/PalletIQ/issues/18))
- **App-wide: a focused field clears on the first keystroke of a fresh focus** instead of
  appending onto whatever value it already held. ([#2](https://github.com/BobbyJoeCool/PalletIQ/issues/2))
- **PIP's scanned location display is larger, bold, and red** (24px), matching the Pull History
  log's existing styling, instead of blending in as regular text.
  ([#8](https://github.com/BobbyJoeCool/PalletIQ/issues/8))
- **PIP: a "⚠ Wrong Function" demo button** in the Label field's footer helpers, to exercise the
  "scanned a label for a different pull function" error path on demand.
- **New Playwright coverage**: `tests/e2e/home.spec.ts`, `tests/e2e/isi.spec.ts`, plus new/updated
  cases across `pii.spec.ts`, `sar.spec.ts`, `elz.spec.ts`, `pip.spec.ts`, `sdp.spec.ts`,
  `iid.spec.ts` for every fix in this release.

### 1.1.0 — Fixed

- **PIP's status bar updated on every plain rescan while verifying, capable of stomping a
  still-relevant previous message**, even outside the specific "message overwritten" case fixed in
  1.0.9. The status bar now only updates on a rescan if there's actually an error to show — a
  plain rescan silently reloads the new label's data. ([#45](https://github.com/BobbyJoeCool/PalletIQ/issues/45))
- **PIP's Alternate ID demo buttons ("✓ Alt ID"/"✗ Alt ID") required focusing the Alternate ID
  field first** — already-correct behavior (Pallet ID auto-focuses on entering verifying, but Alt
  ID doesn't), just previously undocumented and untested; now covered directly in
  `pip.spec.ts`.
- **IID and ISI's Dept/Class/Item display fields stayed on their `—` placeholders after a demo
  scan or a `?dpci=` link**, despite the item loading successfully — `loadByDpci` never populated
  the three fields when called with a whole DPCI string rather than typed in one digit at a time.
  Both now parse and populate all three fields regardless of entry path.
- **`GET /api/items/dpci/:dpci/locations` (ISI's endpoint) never validated that the DPCI
  corresponds to a real Item**, so a bogus DPCI silently returned an empty location list (200)
  instead of 404 — indistinguishable from "valid item, nothing currently stored." Now checks Item
  existence first, matching `getItemByDpci`'s behavior.
- **SDP's "✗ PID" demo button showed a generic failure instead of "Pallet not found"** — same root
  cause already fixed for MNP (a non-numeric placeholder value fails the API's numeric validation
  before ever reaching the not-found check); applied the identical fix.
- **The in-app "Reseed Test Data" button could fail with a foreign key error and abort the whole
  reseed** ([#51](https://github.com/BobbyJoeCool/PalletIQ/issues/51)) — it deleted `PUT_PENDING`
  pallets without first clearing `Reservation`/`ActivityLog` rows referencing them, so an
  abandoned reservation or a routine log entry from a prior session (e.g. a crashed or
  interrupted test run) blocked every future reseed. The same root cause also blocked the
  standalone `prisma db seed` script, which was missing a `Reservation` clear before its own
  pallet wipe. Both fixed by clearing the referencing rows first.

### 1.1.0 — Test Infrastructure

- **`tapKeys` (the Playwright helper that taps on-screen keys) searched the whole page for a
  button by label**, which is ambiguous once a field's own displayed value happens to match the
  next key (e.g. typing a repeated digit like "99" — after the first "9", the field's own button
  is also named "9"). Scoped it to the numpad/keyboard panel via new `data-testid` attributes on
  `Numpad.tsx`/`Keyboard.tsx`.

---

## [1.0.10] — 2026-07-08

### 1.0.10 — Added

- **App version number on the login screen** — a small, muted label in the bottom-right corner,
  sourced from `package.json` at build time so it can never drift out of sync with an actual
  release.

---

## [1.0.9] — 2026-07-08

### 1.0.9 — Added

- **"Reseed Test Data" dev-tools control on the login screen**, above the badge scanner, alongside
  a relocated and enlarged "Wake Database" button — both styled in amber, deliberately outside the
  app's red/navy palette, so the row reads as a testing utility rather than normal app
  functionality. Reseed wipes every `PUT_PENDING` pallet and not-yet-pulled label
  (`AVAILABLE`/`PRINTED`), then regenerates 24 pending put pallets per storage-code/size combo and
  up to 24 pull labels per storage-code/pull-function combo — labels follow the same CA/CF/FP
  realism rules as the existing seed scripts (XS always CA; level 1 non-XS non-emptying is CF; an
  emptying non-XS pull is FP; anything else non-XS is CA), sourced only from pallets already
  stored at a real location.

### 1.0.9 — Fixed

- **LII and WLH manually typed locations always reported "location not found."** The shared
  Aisle→Bin→Level entry component's auto-advance chain registered its handlers once, at mount, so
  the final Aisle+Bin+Level concatenation always read stale, frozen-empty values regardless of
  what was actually typed. Scanning a full barcode was unaffected (it resolves off a single
  field's own value). Fixed by reading the accumulated Aisle/Bin values from refs that stay live
  across the whole entry, instead of the stale field objects.
- **ELA's storage code field didn't blur or dismiss the keyboard after entry.** Unlike every other
  field in the app, its confirm handler never released the shared input panel. ELZ was already
  correct; only ELA needed the fix.
- **PIP's pull-verification success message could be overwritten by a spurious "Label not
  verified" warning** even when the previous pull had already verified successfully. Root cause:
  the screen relied on a 50ms delayed re-focus to register the next label scan, and a fast enough
  scan of the next label could land on the just-cleared, still-registered previous field instead.
  Now re-focuses synchronously on verification success, closing the race window.
  ([#45](https://github.com/BobbyJoeCool/PalletIQ/issues/45))
- **PIP's Alternate ID verification on Full Pallet (FP) pulls didn't check level** — only aisle+bin
  were compared, same as Carton Air/Carton Floor, even though FP empties the entire location and a
  bin can hold several stacked levels. FP now requires the full 8-digit barcode and checks level
  too; CA/CF are unchanged. ([#48](https://github.com/BobbyJoeCool/PalletIQ/issues/48))
- **SDP's Zone field summoned the native iPad keyboard instead of the app's on-screen numpad.**
  It was the only field on the screen built as a raw HTML `<input>` instead of going through the
  app's virtual-field system, which is why every other field never had this problem. Converted to
  match every other field's pattern.
- **SDP allowed navigating away from an active reservation via any Pallet ID/Location ID chip**
  (the "Directed to" and "Move from" chips, and every row in the persistent Put History log),
  bypassing the screen lock meant to prevent exactly that — Header's Back/Home/Jump/Logout were
  already correctly disabled during an active reservation, but these chips navigate directly and
  had no lock check at all. Fixed at the shared `LiveId` component level, so the fix applies
  everywhere `LiveId` is used, not just SDP.

### 1.0.9 — Changed

- **PIP** — the currently scanned label's Location is now bolded.
- **SDP** — Aisle now auto-submits at 3 digits (auto-advance to Pallet ID already worked once
  submitted). Storage Code now auto-submits at 2 characters and advances to Pallet ID (previously
  neither happened). Size gained a row of quick-pick buttons for the 5 standard sizes, in addition
  to the field's existing free-text entry.
- **MNP** — the "✓ Empty"/"~ Occupied" demo destination buttons now pre-fill the Level
  Confirmation modal with the actual level of the location they fetched, since the system already
  knows it and the worker otherwise has no way to. A real scanned destination still requires
  manual level entry, unchanged.

---

## [1.0.6] — 2026-07-07

### 1.0.6 — Fixed

All 3 items filed in `Documentation/Bug-Reports/bug-report-V1_0_5.md`:

- **Tab-out/blur on a filled field now submits it, same as OK** (Feature Change). Previously,
  moving to a different field (by tapping it) silently dropped whatever was typed into the field
  you left, unless OK had been pressed first. Root cause: the shared on-screen-input plumbing
  (`NumpadContext`) only ever routed key events to a *single* active field, and switching that
  active field to a new one simply replaced the handler — the outgoing field's typed value was
  never submitted. Fixed at the shared-infrastructure level (`NumpadContext.setKeyHandler`), so
  it applies to every field on every screen, not just STG: switching to a different field now
  sends the outgoing field's handler a synthetic `'Enter'` before installing the new one,
  submitting whatever it currently holds exactly as if OK had been pressed.
- **Zone map (and other screens) redrew more often than their inputs actually changed** (Feature
  Change, STG-reported). Root cause: `MessageBarContext`'s `setMessage`/`clearMessage` were
  recreated on every provider render, so any effect that listed `setMessage` as a dependency
  (e.g. STG's `ZoneMap`, which fetches `/api/locations/empty-by-zone`) re-ran on *every* message
  bar update anywhere in the app — not just when its own aisle/storage code changed. Fixed by
  memoizing `setMessage`/`clearMessage` with `useCallback` and the context value with `useMemo`,
  so their identity is now stable across renders; STG's zone map (and everything else with a
  `setMessage` dependency) now only re-fetches when its actual inputs change.
- **App didn't lock to landscape orientation on iPhone** (Bug). True orientation locking isn't
  available to a plain browser tab on iOS Safari (Apple doesn't implement the Screen Orientation
  Lock API there, install-to-homescreen or not), so there's no way to prevent the phone itself
  from being held in portrait. `ScaleToFit` (already the single place the whole app — including
  the login/PIN screens — gets scaled to fit the viewport) now detects a portrait viewport and
  rotates its canvas 90° with a CSS transform, with the fit-scale math swapped accordingly, so
  the app reads as landscape regardless of how the phone is physically oriented.

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
