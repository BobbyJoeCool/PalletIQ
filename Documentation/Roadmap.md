# PalletIQ — Roadmap

Source: adopted from `DevNotes/PalletIQ-Roadmap-Outline.md` (2026-08-02) and placed here as
the project's standing roadmap doc. Every GitHub Issue number below was checked against live
issue state (`gh issue view`) on **2026-08-02** at incorporation time, not just quoted from
the source outline or from `apps/floor-app/CHANGELOG.md`'s own Roadmap/Unreleased sections —
several turned out to disagree with each other (see Verification Notes at the end). Re-check
before relying on any "currently open" list below if this doc is being read a while after
that date; issue state moves faster than this file will be updated.

## Process note — shipping verification (2026-08-03)

Per direct instruction: the Playwright e2e suite is no longer run automatically as a ship
gate before a version bump. Going forward, the developer does a manual visual smoke test of
the built app instead — `npm run test:e2e` is still available and useful for isolated
debugging, but its full-suite run is no longer part of the standard end-of-version
checklist. (This session's own run, right before the policy changed, confirmed the
suite's existing ~21-failure baseline is unchanged/pre-existing — see
`DevNotes/Logs/V1.8/version-1_8_6.md` §1.12 for the detail.)

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

**This step's issue list needed a full rewrite during adoption**, then a second pass after a
2026-08-02 triage round closed/relabeled/consolidated several of these. Current state below
is post-triage.

**Currently open, general (non-major-feature) backlog, verified live:**

| # | Severity | Issue |
| --- | --- | --- |
| [#198](https://github.com/BobbyJoeCool/PalletIQ/issues/198) | blocker | New — SDP: consolidating an XS put sets a 5-second expiration timer instead of 5 minutes (should extend to 15 min on consolidate); "Unassign" button should stay "Unassign," not switch to "Cancel" |
| [#175](https://github.com/BobbyJoeCool/PalletIQ/issues/175) | major | PIP: Pull Function dropdown renders stuck open on fresh page load, blocking all clicks — reporter unable to reproduce; more repro info requested, left open |
| [#84](https://github.com/BobbyJoeCool/PalletIQ/issues/84) | major | Reason codes should be a database table with per-department/role restrictions — design doc written (`DevNotes/DesignPrompts/ReasonCode-design.md`); 6 open decisions flagged (department-letter mapping, multi-department user support, domain-shared vs. domain-scoped codes, relationship to #196's flat `ReasonCode` proposal, `HoldType` migration, no code-management UI yet) |
| [#133](https://github.com/BobbyJoeCool/PalletIQ/issues/133) | major | IRP: add a consolidated totals row at the bottom of the report |
| [#165](https://github.com/BobbyJoeCool/PalletIQ/issues/165) | major | VCP/SSP entry + SSPs-per-Carton display should be a shared component — investigated, confirmed no such component exists today; build together with #167, they are coupled |
| [#197](https://github.com/BobbyJoeCool/PalletIQ/issues/197) | major | New — e2e: rewrite affected suites (SDP/PAR/WLH) to test every Pick-by-Status combination against expected results; supersedes #152/#153/#154/#155/#157 (closed) |
| [#167](https://github.com/BobbyJoeCool/PalletIQ/issues/167) | minor | Partial/loose SSPs should be a shared component (validates against SSPs-per-carton) — build together with #165, they are coupled |
| [#168](https://github.com/BobbyJoeCool/PalletIQ/issues/168) | nice-to-have | Printer should be a shared component, backed by a real Printer table — relabeled minor → nice-to-have; needs a real Printer table first, punted down the road |
| [#179](https://github.com/BobbyJoeCool/PalletIQ/issues/179) | minor | ReasonCodeField: ambiguous aria-label breaks `getByLabel('Reason Code')` in WLH tests — under review, not yet folded into #197 |
| [#180](https://github.com/BobbyJoeCool/PalletIQ/issues/180) | minor | LII: ambiguous "Hold" text breaks `getByText` exact-match test assertion — under review, not yet folded into #197 |
| [#181](https://github.com/BobbyJoeCool/PalletIQ/issues/181) | minor | `par.spec.ts`: describe block predates v1.6.11 redesign, references buttons that no longer exist — under review, not yet folded into #197 |
| [#184](https://github.com/BobbyJoeCool/PalletIQ/issues/184) | minor | Home/Back buttons unresponsive on IID/PAR/ISI until the DPCI field has attempted a lookup |
| [#193](https://github.com/BobbyJoeCool/PalletIQ/issues/193) | minor | STG: Master Control Storage Code rejects any value if Aisle isn't set yet — resolution confirmed: accept any valid Storage Code regardless of aisle availability; surface the mismatch as an error in the Zone Summary instead of an invalid box state |
| [#118](https://github.com/BobbyJoeCool/PalletIQ/issues/118) | nice-to-have | Refactor: "random sample row" query pattern repeated ~14x |

**Closed this pass (2026-08-03):** issue #190 (MNP field persistence, floor-app v1.8.7),
issue #166 (Aisle field freight breakdown, api v1.2.1), issue #169 (SDP freight-type badges,
floor-app v1.8.7), issue #100 (Numpad/Keyboard redesign, floor-app v1.8.7 — UI portion;
remaining Tab/Back Tab navigation work split off to new issue
[#199](https://github.com/BobbyJoeCool/PalletIQ/issues/199)), and issue #189 (MNP
DPCI/Move-from Storage Code badges, floor-app v1.8.7 + api v1.2.1 — shipped with one scope
difference from its filed text, see the issue's own closing comment; its "Hold button red
when a hold is active" scope addition was **not** implemented and isn't tracked anywhere
else — worth a fresh issue if still wanted). See `DevNotes/Logs/V1.8/version-1_8_6.md`
§§1.9–1.13 for full detail.

**Closed this pass (2026-08-02, second triage round):** #177 (could not reproduce — Worker
role only ever saw Size), #176 (verified Zone override works), #29 (closed per direction),
the five e2e issues #152, #153, #154, #155, and #157 (superseded by #197, e2e rewrite), and
finally #89 (folded into #137 — see Step 4).

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
- [#90](https://github.com/BobbyJoeCool/PalletIQ/issues/90) — Add per-record audit trail to
  PII, LII, and a future Container ID screen. **Retargeted here 2026-08-02** (was general
  v1.8.x backlog) — confirmed as a major feature (already labeled `major`/`feature-change`).
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
  multi-pallet/partial location occupancy. **Now explicitly includes #89's ask** (PII
  Edit Mode per-pallet-vs-partial quantity editing) — #89 closed 2026-08-02, folded in here
  per direction rather than left as a separately-tracked, merely-related issue.
- [#171](https://github.com/BobbyJoeCool/PalletIQ/issues/171) — Major Feature: OCC —
  Overpack Carton Create.
- ~~#89~~ — PII Edit Mode per-pallet-vs-partial quantity editing. **Closed 2026-08-02**,
  folded into #137 (see above).
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

- **#84**: the instruction "Create a design doc for Claude Mobile for this" is not clear
  enough to act on — "Claude Mobile" does not match anything in this repo or this project's
  conventions (no product, screen, or doc by that name). Possible readings: (a) a dictation
  artifact for something else entirely, (b) a request to write the design doc as a
  `DevNotes/DesignPrompts/` doc the way this project normally settles a feature before
  filing/building it, per the Design Session Workflow this project already uses. Holding off
  on writing anything for #84 until this is clarified, rather than guessing and producing a
  doc that has to be redone.

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

## Second triage round (2026-08-02)

Direct, item-by-item triage of the Step 1 backlog table above, applied live:

- **Closed** (9): #177, #176, #29 (verified/decided directly), plus #152/#153/#154/#155/#157
  (consolidated into new issue #197) and #89 (folded into #137).
- **New issues filed** (2): [#197](https://github.com/BobbyJoeCool/PalletIQ/issues/197) —
  rewrite the SDP/PAR/WLH e2e suites to test every `DemoScannerBar` Pick-by-Status
  combination against expected results, superseding the five e2e issues closed above.
  [#198](https://github.com/BobbyJoeCool/PalletIQ/issues/198) — new bug, labeled
  `bug`/`blocker`: SDP's consolidation-put expiration timer fires in 5 seconds instead of 5
  minutes, and should extend to 15 minutes on a consolidation; the "Unassign" button should
  not switch to "Cancel" during one.
- **Relabeled**: #168 `minor` → `nice-to-have` (needs a not-yet-built Printer table first;
  punted).
- **Retargeted**: #90 moved from Step 1's general v1.8.x backlog to Step 2 (v1.9.0),
  confirmed as a major feature.
- **Scope added via comment** (issue stays open, no status change): #165/#167 (confirmed
  coupled, build together — no existing VCP/SSP component found), #166 (SDP per-aisle
  storage-code/size badge row), #189 (Hold button turns red when a location has an active
  hold), #193 (Storage Code should accept any valid value regardless of aisle availability;
  surface the mismatch in the Zone Summary instead of an invalid box state).
- **Left open, no change** (explicitly "Open" with no new information, or explicitly
  "Unsure"): #175 (comment requesting repro info), #133, #179, #180, #181, #184, #190, #100,
  #169, #118.
- **Not yet actioned:** #84 — see Open Questions below; the instruction to "create a design
  doc for Claude Mobile for this" was not clear enough to act on without guessing, so no
  design doc was written and #84 was left as-is (no comment posted).
