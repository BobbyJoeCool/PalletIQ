# PalletIQ — Roadmap

Source: adopted from `DevNotes/PalletIQ-Roadmap-Outline.md` (2026-08-02) and placed here as
the project's standing roadmap doc. Every GitHub Issue number below was checked against live
issue state (`gh issue view`) on **2026-08-02** at incorporation time, not just quoted from
the source outline or from `apps/floor-app/CHANGELOG.md`'s own Roadmap/Unreleased sections —
several turned out to disagree with each other (see Verification Notes at the end). Re-check
before relying on any "currently open" list below if this doc is being read a while after
that date; issue state moves faster than this file will be updated.

## Where things stand

- floor-app is at **v1.8.6** (`apps/floor-app/package.json`). api is at **v1.2.0**
  (`api/package.json`). desktop-app is at **v1.0.0**, scaffold only — no Electron, no
  frontend, no schema changes yet (`apps/desktop-app/README.md`,
  `apps/desktop-app/CHANGELOG.md`).
- `apps/floor-app/CHANGELOG.md`'s own "Roadmap — Planned Versions" section still frames
  v1.9.0 as "IRP, PRQ, CII + open-issue cleanup," but IRP already shipped (`built: true` in
  `jumpCodes.ts`, confirmed `DevNotes/Logs/V1.8/version-1_8_0.md` §1.2.48). PRQ and CII are
  still unbuilt.
- Four Major Feature issues were filed after that CHANGELOG roadmap section was last edited
  and haven't been folded into it: **WTP** (#170), **OCC** (#171), **LRP** (#173), and
  **Display Field Consolidation** (#172) — all `major-feature-addition`. Of these, only OCC
  has an explicit target version (v1.10.0, per its own design doc). WTP, LRP, and Display
  Field Consolidation are **not milestone-assigned**.
- Three more Major Feature issues were filed the same day as this doc's adoption, also not
  yet folded into any CHANGELOG milestone: **#194** (Numeric CID Format), **#195** (Breakpack
  Pull & Overpack Workflow), **#196** (CII — five-type redesign). #196 substantially
  redefines and extends the scope of the existing, still-open **#136** ("Major Feature: CII —
  Container ID Inquiry") — see Verification Notes.
- The **Main Menu reorg** (#174, shipped v1.8.4, issue closed) reserved jump codes for CII,
  LRP, WTP, and OCC — all four show an info-toned "not yet available" message when tapped.
  The buttons exist; the screens don't.
- **WTP is explicitly gated** on the Desktop app's Prod Goal/Daily Plan screen (#146) being
  real and in use (issue #170, labeled `distant-future`). WTP can't ship before Desktop
  ships far enough to have a working Daily Plan screen.
- `Browser-Screen-Briefs.md` / `Handheld-Screen-Briefs.md` (and their Design-Spec
  companions), describing a larger browser/laptop screen set and a 3-bucket handheld plan,
  exist in project knowledge but **not in this repo** — nothing under `DevNotes/` or
  `Documentation/` matches them as of this doc's adoption. This is a real gap worth
  resolving before locking version numbers for the Handheld (step 6) and Desktop (step 8)
  milestones below — see Open Questions.

## Planned versions

Numbered to match the version scheme `apps/floor-app/CHANGELOG.md` has already committed to
(`v1.9.0` for the IRP/PRQ/CII cleanup wave, `v1.10.0` for Bulk Pull + OCC). Each step below
that's tied to specific GitHub Issues has its currently-open ones listed explicitly — verified
live, not copied from any file that could have drifted out of sync (see Verification Notes:
this drift turned out to be a real, not hypothetical, problem).

### 1. v1.8.x (current) — finish bug fixing and open issues

**This step's issue list needed a full rewrite during adoption.** The source outline (and
`apps/floor-app/CHANGELOG.md`'s own "Unreleased — Reported Issues" section) both list
#92, #86, #85, #84, #83, #95, #93, #91, #100, #99, #96, #94, #89, #90, #88, #29 as the
current open backlog. Checked live: **#83, #85, #86, #88, #91, #92, #93, #94, #95, #96, #99
are already closed.** The CHANGELOG's list was not kept in sync with actual issue closures. There's also a
second gap the other direction — a number of open issues filed more recently aren't reflected
in that CHANGELOG section at all.

**Currently open, general (non-major-feature) backlog, verified live:**

| # | Severity | Issue |
| --- | --- | --- |
| [#175](https://github.com/BobbyJoeCool/PalletIQ/issues/175) | major | PIP: Pull Function dropdown renders stuck open on fresh page load, blocking all clicks |
| [#177](https://github.com/BobbyJoeCool/PalletIQ/issues/177) | major | SDP: Worker role currently sees Size/Storage/Zone/Consolidating override fields (should be IM+ only) |
| [#84](https://github.com/BobbyJoeCool/PalletIQ/issues/84) | major | Reason codes should be a database table with per-department/role restrictions — needs a product conversation; the new CII five-type work (#196) introduces a first real `ReasonCode` table scoped narrowly to its own four actions, which doesn't resolve this issue's broader per-department/role ask on its own |
| [#133](https://github.com/BobbyJoeCool/PalletIQ/issues/133) | major | IRP: add a consolidated totals row at the bottom of the report |
| [#165](https://github.com/BobbyJoeCool/PalletIQ/issues/165) | major | VCP/SSP entry + SSPs-per-Carton display should be a shared component |
| [#166](https://github.com/BobbyJoeCool/PalletIQ/issues/166) | major | Aisle field should also verify + return what freight type/size is stored there |
| [#89](https://github.com/BobbyJoeCool/PalletIQ/issues/89) | blocker | PII Edit Mode will need per-pallet-vs-partial quantity editing once Bulk Pull ships — held for v1.10.0, not this wave |
| [#152](https://github.com/BobbyJoeCool/PalletIQ/issues/152) | minor | SDP e2e: "an aisle with no eligible locations" test hits a strict-mode violation typing an all-same-digit aisle |
| [#153](https://github.com/BobbyJoeCool/PalletIQ/issues/153) | minor | SDP e2e: "Applying summary" test uses `selectOption` on Zone, which is now a custom button widget |
| [#155](https://github.com/BobbyJoeCool/PalletIQ/issues/155) | minor | PAR e2e: 4 tests reference demo buttons ("✓ Create", "✗ Bad DPCI", etc.) that no longer exist |
| [#157](https://github.com/BobbyJoeCool/PalletIQ/issues/157) | minor | WLH e2e suite: 6 tests broken — `selectOption()` against a non-native Reason Code picker |
| [#167](https://github.com/BobbyJoeCool/PalletIQ/issues/167) | minor | Partial/loose SSPs should be a shared component (validates against SSPs-per-carton) |
| [#168](https://github.com/BobbyJoeCool/PalletIQ/issues/168) | minor | Printer should be a shared component, backed by a real Printer table |
| [#176](https://github.com/BobbyJoeCool/PalletIQ/issues/176) | minor | SDP: Zone override field is a custom button, not a native `<select>` |
| [#179](https://github.com/BobbyJoeCool/PalletIQ/issues/179) | minor | ReasonCodeField: ambiguous aria-label breaks `getByLabel('Reason Code')` in WLH tests |
| [#180](https://github.com/BobbyJoeCool/PalletIQ/issues/180) | minor | LII: ambiguous "Hold" text breaks `getByText` exact-match test assertion |
| [#181](https://github.com/BobbyJoeCool/PalletIQ/issues/181) | minor | `par.spec.ts`: describe block predates v1.6.11 redesign, references buttons that no longer exist |
| [#184](https://github.com/BobbyJoeCool/PalletIQ/issues/184) | minor | Home/Back buttons unresponsive on IID/PAR/ISI until the DPCI field has attempted a lookup |
| [#189](https://github.com/BobbyJoeCool/PalletIQ/issues/189) | minor | MNP: add Storage Code/Size badges after DPCI and Pallet ID displays |
| [#190](https://github.com/BobbyJoeCool/PalletIQ/issues/190) | minor | MNP: Pallet ID/Location fields should persist through errors, clear only on confirmed put |
| [#193](https://github.com/BobbyJoeCool/PalletIQ/issues/193) | minor | STG: Master Control Storage Code rejects any value if Aisle isn't set yet |
| [#100](https://github.com/BobbyJoeCool/PalletIQ/issues/100) | nice-to-have | Numpad: add a 4th column (Backspace/Tab/Back Tab/Enter), a Clear button, and rename OK to Enter |
| [#169](https://github.com/BobbyJoeCool/PalletIQ/issues/169) | nice-to-have | SDP — show freight-type badges with open/staged counts under the Aisle field |
| [#118](https://github.com/BobbyJoeCool/PalletIQ/issues/118) | nice-to-have | Refactor: "random sample row" query pattern repeated ~14x |
| [#154](https://github.com/BobbyJoeCool/PalletIQ/issues/154) | needs-triage | SDP e2e: "Worker does not see IM+ override fields" test fails — 14 unrelated "Size" text matches |
| [#90](https://github.com/BobbyJoeCool/PalletIQ/issues/90) | needs-triage | Add per-record audit trail to PII, LII, and a future Container ID screen — not milestone-assigned |
| [#29](https://github.com/BobbyJoeCool/PalletIQ/issues/29) | distant-future | Warehousing Menu restructure — add Inbound, Outbound, ICQA, and Manager menus |

### 2. v1.9.0 — PRQ + CII, plus the open-issue cleanup wave

Scoped to what `apps/floor-app/CHANGELOG.md`'s Roadmap section actually says targets this
version — not CII/OCC together, since OCC is separately targeted at v1.10.0 by its own design
doc.

**Currently open issues for this step:**

- [#135](https://github.com/BobbyJoeCool/PalletIQ/issues/135) — Major Feature: PRQ — Pull
  Request by Aisle/Workstation. Designed (`DevNotes/DesignPrompts/PRQ.md`), not yet built.
- [#136](https://github.com/BobbyJoeCool/PalletIQ/issues/136) — Major Feature: CII —
  Container ID Inquiry. **Note:** its scope is now substantially redefined by the newer
  five-type CII redesign (#196, plus its prerequisites #194/#195) filed 2026-08-02 — #136
  predates that redesign and describes the original single-type screen. Worth an explicit
  decision on whether #136 stays open as the umbrella issue with #194/#195/#196 as its
  breakdown, or gets closed in favor of them, rather than leaving both trails open
  indefinitely.
- Most of Step 1's general backlog above is also implicitly in scope for this "cleanup wave,"
  per the CHANGELOG's own framing — not re-listed here to avoid a third copy of the same
  table.

### 3. v1.9.x — bug sweep

No issues are pre-assigned to this step — a bug-sweep version absorbs whatever's still open
in the general backlog (Step 1) once v1.9.0's features ship, not a fixed list decided ahead
of time.

### 4. v1.10.0 — Bulk Pull + OCC

Bulk Pull design is well underway across three docs (`Bulk-Pull-design.md`,
`Bulk-Pull-Design-Prompt-v2.md`, `Shared-Infrastructure-Design-Spec.md`) but has an
outstanding blocker: a Consolidation Guard audit against the current `manualConfirm` code.

**Currently open issues for this step:**

- [#137](https://github.com/BobbyJoeCool/PalletIQ/issues/137) — Major Feature: Bulk Pull —
  multi-pallet/partial location occupancy.
- [#171](https://github.com/BobbyJoeCool/PalletIQ/issues/171) — Major Feature: OCC —
  Overpack Carton Create.
- [#89](https://github.com/BobbyJoeCool/PalletIQ/issues/89) — PII Edit Mode per-pallet-vs-
  partial quantity editing, explicitly held for this version.
- ~~#149~~ — Shared Infrastructure: Logic Gate. **Closed 2026-08-02** — confirmed shipped in
  API v1.1.0 (commit `69bc750`); no longer open work.
- ~~#150~~ — Shared Infrastructure: statusExpiry. **Closed 2026-08-02** — same commit as
  #149.
- ~~#151~~ — SDP: Verify-Put Modal. **Closed 2026-08-02** — confirmed shipped in floor-app
  v1.8.6 (commit `5a2b489`).

**Not in the source outline's list but currently homeless — no target version at all:**

- [#172](https://github.com/BobbyJoeCool/PalletIQ/issues/172) — Major Refactor: consolidate
  display fields into reusable components.
- [#173](https://github.com/BobbyJoeCool/PalletIQ/issues/173) — Major Feature: LRP —
  Container Reprint.

Worth deciding now whether either rides along with this wave or gets its own slot — leaving
them unassigned means they'll keep drifting.

### 5. v1.10.x — bug sweep

Same as Step 3 — no issues pre-assigned.

### 6. v2.0.0 — Handheld screens

`apps/floor-app/CHANGELOG.md`'s roadmap section still says "not yet designed," but
`Browser-Screen-Briefs.md`/`Handheld-Screen-Briefs.md` in project knowledge describe a
substantial design pass already (3 buckets: Inbound, Outbound, and a redesign of ~16 existing
tablet screens) that isn't in this repo. These two sources disagree on how much groundwork
already exists — see Open Questions before treating this as a clean, undesigned slate.

No GitHub Issues are filed against this milestone yet, so there's nothing to flag as open
here beyond the design-gap question itself.

### 7. v2.0.x — bug sweep

Same as Step 3 — no issues pre-assigned.

### 8. Desktop v1.0.0 → real Manager screens

desktop-app is already versioned independently starting at 1.0.0 (currently scaffold-only) —
this isn't a new version to add, it's the app finishing what 1.0.0 already started, then
moving to 1.1.0+ as screens ship. Eight screens are tracked as GitHub issues, matching
`apps/desktop-app/README.md` and `apps/desktop-app/CHANGELOG.md`'s Roadmap section.
`Browser-Screen-Briefs.md` (project knowledge, not in this repo) describes a larger set —
adds Contraction Management, Yard Queue, Door Assignment, and a broader role set including
Clerical — not reflected in the 8-screen list below. Same gap as Step 6.

**This is also where WTP unblocks** — WTP (#170) is gated on #146 (Prod Goal/Ramping
Override/Daily Plan) being built and in use.

**Currently open issues for this step (all 8 are still open — none built yet):**

- [#140](https://github.com/BobbyJoeCool/PalletIQ/issues/140) — Major Feature: DESKTOP App
  v1.0.0 — Manager screens (umbrella issue)
- [#141](https://github.com/BobbyJoeCool/PalletIQ/issues/141) — Desktop: Embedded Floor App
- [#142](https://github.com/BobbyJoeCool/PalletIQ/issues/142) — Desktop: DPCI Setup Edit
- [#143](https://github.com/BobbyJoeCool/PalletIQ/issues/143) — Desktop: Location Setup Edit
  (Contraction Management folded in)
- [#144](https://github.com/BobbyJoeCool/PalletIQ/issues/144) — Desktop: Hung
  Pallet/Location Resolution
- [#145](https://github.com/BobbyJoeCool/PalletIQ/issues/145) — Desktop: Job/Function
  Assignment
- [#146](https://github.com/BobbyJoeCool/PalletIQ/issues/146) — Desktop: Prod Goal / Ramping
  Override / Daily Plan — **the WTP dependency; see Step 10**
- [#147](https://github.com/BobbyJoeCool/PalletIQ/issues/147) — Desktop: Team Prod Summary
- [#148](https://github.com/BobbyJoeCool/PalletIQ/issues/148) — Desktop: Universal
  Audit/Cross-Reference (Audit Tool)

### 9. Desktop v1.0.x — bug sweep

Same as Step 3 — no issues pre-assigned.

### 10. FloorApp: Add WTP (v2.1.0)

Only buildable once the Desktop Daily Plan dependency (Step 8, #146) is satisfied — worth
sequencing explicitly rather than assuming it slots in cleanly at v2.1.0 regardless of
Desktop's progress.

**Currently open issues for this step:**

- [#170](https://github.com/BobbyJoeCool/PalletIQ/issues/170) — Major Feature: WTP —
  Warehouse Team Reporting. Labeled `distant-future`; explicitly gated on #146.

### 11. v2.1.x — bug sweep

Same as Step 3 — no issues pre-assigned.

## Open questions before this roadmap is final

- Do you want **LRP** (#173) and **Display Field Consolidation** (#172) assigned to a
  specific version now, or left as floating backlog until they naturally attach to other
  work?
- The Browser/Handheld briefs in project knowledge aren't in this repo yet. Should those get
  merged into `DevNotes/` and reconciled against the Desktop app's existing 8-screen scope
  and the repo's "not yet designed" handheld note before Steps 6 and 8 are treated as scoped
  correctly? Right now there are two different pictures of how much design work already
  exists for both.
- Should WTP's dependency on Desktop's Daily Plan screen (#146) be made explicit in the
  CHANGELOG roadmap section itself, since it currently isn't captured there at all?
- Should **#136** (the original single-type CII major feature issue) be closed in favor of
  **#194/#195/#196** (the five-type redesign filed 2026-08-02), or kept open as an umbrella
  issue those three break down into? Surfaced during this doc's adoption, not part of the
  original outline. (Unlike #149/#150/#151 below, this one was **not** auto-resolved as
  "already done" — #136 isn't shipped, it's superseded/overlapping, which is a scope
  decision, not a verification fact — so it's still an open question.)

## Verification notes (this adoption pass, 2026-08-02)

This document was originally drafted as `DevNotes/PalletIQ-Roadmap-Outline.md`. Moving it
into `Documentation/` as the standing roadmap prompted a live re-check of every GitHub Issue
number it or `apps/floor-app/CHANGELOG.md`'s own Roadmap/Unreleased sections cite, rather than
trusting either as current. Findings:

- **11 issues cited as open in both the source outline and the CHANGELOG's "Unreleased —
  Reported Issues" section are actually already closed**: #83, #85, #86, #88, #91, #92, #93,
  #94, #95, #96, #99. The CHANGELOG's own text says that section is "kept in sync as issues
  are filed or closed" — it wasn't, at least not for these.
- **Conversely, a substantial number of currently-open issues aren't reflected in that
  CHANGELOG section at all** — see Step 1's table above for the full current list (#118,
  #133, #152–#157, #165–#169, #175–#181, #184, #189, #190, #193).
- **Three issues referenced in recent commit messages as shipped were still open on
  GitHub**: #149, #150, #151. **Closed 2026-08-02**, each with a comment citing the shipping
  commit, once confirmed against `git log` rather than assumed from the roadmap text alone.
- **#136 predates and now overlaps with #194/#195/#196**, filed the same day this doc was
  adopted, for a substantially expanded version of the same screen (five container types
  instead of one). Not resolved here — flagged for a decision (see Open Questions); #136 was
  left open since it isn't "already done," just superseded/overlapping, which is a scope
  call for the user, not something to auto-resolve.

**Actions taken this pass (2026-08-02):** closed #149, #150, #151 (confirmed shipped, each
closed with a comment citing the shipping commit). Commented the expected target version on
every other currently-open issue referenced in this doc's Planned Versions section (46
issues total — the general v1.8.x backlog in Step 1, #135/#136 in Step 2, #137/#171/#172/#173
in Step 4, all nine Desktop issues in Step 8, #170 in Step 10, and #194/#195/#196) — each
comment names the expected version, in-between/general-backlog items as `v1.8.x` per
instruction, milestone-tied items with their specific target version, and unassigned items
(#172, #173) flagged as not-yet-assigned candidates rather than given a fabricated version.
No issue content beyond version expectations was edited, and no issue was closed except the
three confirmed-shipped ones above.
