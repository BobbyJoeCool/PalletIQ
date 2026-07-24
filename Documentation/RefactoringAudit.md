# Refactoring Audit — Duplicated UI & Logic Patterns

**Date:** 2026-07-24
**Scope:** `src/pages/`, `src/components/`, `src/context/`, `api/functions/`, `api/lib/`, `api/prisma/seed.ts`
**As of:** v1.7.0

This audit was requested to catalog patterns (entry fields, dropdowns, labels, database calls, etc.) that
currently exist in multiple places across the codebase and could be consolidated into shared
components/helpers, along with a cost/benefit read on whether each is worth doing.

Findings are grouped frontend first, then backend. Every finding was spot-checked against the actual
source (file/line references below) rather than taken on estimate.

---

## How to read the cost/benefit columns

- **Effort** — rough size of the refactor itself (touching call sites + building/adjusting the shared piece).
- **Risk** — chance of regressing a kiosk screen that's already shipped and hand-tested (this app has no
  broad component test coverage; verification is manual per the project's `feedback_user_tests_manually`
  workflow).
- **Payoff** — value of doing it: lines removed, future bug-surface reduced, consistency gained.
- **Recommendation** — Do now / Do opportunistically (next time that file is touched anyway) / Defer.

---

## Frontend (`src/`)

### F1. Labeled numpad-entry box reinvented 7 times — no shared component exists

A "label above a bordered box, red border + blinking caret when active, optional invalid-red wash" field is
independently defined per page instead of living next to `PalletIdField`/`CodePickerField` in
`src/components/shared/`:

| File | Function | ~Lines |
|---|---|---|
| `src/pages/PIPPage.tsx:145` | `FieldDisplay` | 35 |
| `src/pages/SDPPage.tsx:71` | `FieldDisplay` (adds a `size` variant) | 40 |
| `src/pages/MNPPage.tsx:81` | `FieldDisplay` | 30 |
| `src/pages/STGPage.tsx:76` | `FieldDisplay` (compact/centered variant) | 20 |
| `src/pages/PARPage.tsx:59` | `FieldBox` | 20 |
| `src/pages/PIIPage.tsx:111` | `EditBox` | 15 |
| `src/pages/WLHPage.tsx:26` | `RangeNumBox` | 18 |

All seven share the identical inner shape: uppercase gray label span, a `<button>` whose border flips to
`#CC0000` when active, a `font-data` value span, and an `animate-pulse` caret when active. **~180
duplicated lines total.**

- **Effort:** Medium — one new component (`NumpadFieldBox`) with `width`/`size`/`invalid` props, then swap
  7 call sites plus their local `useNumpadField` wiring.
- **Risk:** Medium — these are the most-interacted-with elements in the app (every numeric/code entry on
  every screen funnels through one of them); a visual/behavioral regression here is maximally visible on
  the kiosk.
- **Payoff:** High — this is the single largest duplicated block in the frontend, and any future field
  styling change ("make the caret faster," "add a disabled state") currently requires editing 7 files
  identically instead of 1.
- **Recommendation:** **Do now**, but as its own isolated PR with a manual smoke pass across all 7 screens
  before shipping — not bundled into the next per-screen version pass, since it cuts across every screen
  at once and doesn't fit the "one screen per version" cadence in `CLAUDE.md`.

### F2. `DataRow` was extracted into `shared/` but is still locally reinvented in 3 pages

`src/components/shared/DataRow.tsx` exists and is correctly imported by `PIIPage.tsx`, `LIIPage.tsx`, and
`IIDPage.tsx` — but three other pages define their own byte-for-byte (or near-identical) copy instead of
importing it:

- `src/pages/MNPPage.tsx:61-69` — identical to the shared version
- `src/pages/SDPPage.tsx:47-55` — identical to the shared version
- `src/pages/PIPPage.tsx:119-127` — near-identical (different label column width)

`DataRow.tsx`'s own docstring already flags this ("existing screens keep their own local copies rather
than being refactored to this one"). **~27 duplicated lines.**

- **Effort:** Low — delete 3 local functions, add a `labelWidth` prop to the shared component to cover
  PIPPage's variant, update imports.
- **Risk:** Low — purely presentational, easy to visually diff.
- **Payoff:** Medium — small in line count, but it's the exact kind of drift ("we built the shared version
  and some call sites just never got migrated") that compounds if left alone, since it signals the shared
  component isn't trustworthy as the source of truth.
- **Recommendation:** **Do now** — cheapest, lowest-risk item in this report, good first cut at this audit.

### F3. Modal/dialog overlay chrome reinvented instead of composing `ConfirmDialog`

`src/components/ui/ConfirmDialog.tsx` defines the standard backdrop (`bg-black/80` full-screen) + card
(`#0D0D0D` background, rounded, bordered) chrome, and is correctly used by 5 pages. But the identical
chrome is hand-rolled again in:

- `src/pages/MNPPage.tsx:179` `LevelModal` — custom numpad body, own overlay markup
- `src/pages/MNPPage.tsx:261` `OccupiedLocationDialog` — legitimately needs a 3rd button `ConfirmDialog`
  doesn't support, but the backdrop/card wrapper is copy-pasted
- `src/pages/MNPPage.tsx:303` `CombineDialog` — a plain title+message+confirm/cancel dialog that is
  structurally *exactly* `ConfirmDialog` and uses none of its own logic
- `src/pages/PIPPage.tsx:223` `LevelCorrectionDialog` — near-duplicate of MNP's `LevelModal`
- `src/pages/MNPPage.tsx:1056` and `src/pages/PIPPage.tsx:981` — an identical one-off overlay wrapper
  around `<HoldPanel>`

`ConfirmDialog.tsx`'s own docstring notes it "matches the overlay style used by MNP's `LevelModal`" —
i.e., MNP's dialog was the model for the shared component but was never migrated to actually use it.
**~90 duplicated lines** of backdrop/card chrome across 5 sites.

- **Effort:** Medium — `CombineDialog` (MNPPage.tsx:303-345) is a direct drop-in replacement with
  `ConfirmDialog` today (near-zero effort, ~40 lines deleted). The numpad-body dialogs
  (`LevelModal`/`LevelCorrectionDialog`) and the `HoldPanel` wrapper need a new lower-level
  `ModalOverlay`/`ModalCard` primitive that `ConfirmDialog` itself could be rebuilt on top of.
- **Risk:** Medium — modals gate destructive/important actions (combine, level correction, occupied-location
  override); a broken confirm/cancel wiring here has real consequences on the floor.
- **Payoff:** Medium-High — `CombineDialog` alone is a free win. The `ModalOverlay` extraction pays off
  every time a new dialog is added in future versions (there is a steady cadence of new screens per the
  "one screen per version" plan, and each has tended to add at least one dialog).
- **Recommendation:** `CombineDialog` → `ConfirmDialog`: **do now** (trivial, isolated). The
  `ModalOverlay` primitive + migrating `LevelModal`/`LevelCorrectionDialog`/`HoldPanel` wrapper: **do
  opportunistically**, next time MNP or PIP is touched for other reasons.

### F4. Numeric keypad-entry modal duplicated wholesale (MNP ↔ PIP)

`MNPPage.tsx:149-228` (`LevelModal`) and `PIPPage.tsx:223-292` (`LevelCorrectionDialog`) are ~90%
identical: same 3×N digit-grid keypad, same `pressDigit`/`backspace`/`confirm` handlers, same "what
level..." title shape, same value-readout box. **~140 duplicated lines combined.**

- **Effort:** Medium — extract a generic `NumericKeypadModal` (title, value, onDigit/onBackspace/onConfirm)
  and layer it under both existing dialogs; can be combined with F3's `ModalOverlay` work since they touch
  the same two functions.
- **Risk:** Medium — same reasoning as F3 (gates a real inventory-correction action).
- **Payoff:** Medium-High — the two dialogs already visibly drift in small ways (title wording, digit
  count) which is exactly the kind of bug that copy-paste siblings accumulate over time.
- **Recommendation:** **Do opportunistically**, bundled with F3's dialog work since it's the same two call
  sites.

### F5. Per-page "session history" side panel duplicated 4×

A right-column history panel (fixed width, header bar, empty-state message, scrollable timestamped rows,
each row pairing an ID with a status/outcome tag) is independently built in:

- `src/pages/MNPPage.tsx:959-1012` — "Put History" (`w-[456px]`)
- `src/pages/PIPPage.tsx:948-974` — "Pull History" (`w-[456px]`)
- `src/pages/SDPPage.tsx:1020-1054` — "Put History" (`w-[456px]`)
- `src/pages/PARPage.tsx:1372-1403` — "Reinstate Log" (`w-[420px]`)

PARPage's own comment says this outright: "same convention as PIP's Pull History / MNP's Put History."
**~150 duplicated lines.**

- **Effort:** Medium — extract a generic `SessionHistoryPanel<T>` taking a title, empty-message, width, and
  a per-row render function.
- **Risk:** Low-Medium — purely a session-local display list (not persisted, not gating an action), so a
  regression here is cosmetic rather than functional.
- **Payoff:** Medium — 4 near-identical implementations means any future tweak ("add a filter," "change the
  timestamp format") is currently a 4-file change.
- **Recommendation:** **Do opportunistically**, next time a 5th screen needs a history panel (which per the
  version-cadence history is a recurring need) — not urgent enough to interrupt current work for.

### F6. `PalletCodePicker` in STGPage reinvents `CodePickerField`

`src/pages/STGPage.tsx:180-292` (`PalletCodePicker`, ~113 lines) rebuilds the entire "entry box + chevron
+ tap-outside-closes popup list" pattern that `src/components/shared/CodePickerField.tsx` already
provides, apparently because STG needed a more compact/inline sizing than `CodePickerField` currently
supports.

- **Effort:** Low-Medium — add a `compact`/inline width variant + prop to `CodePickerField`, then delete
  STG's local reimplementation.
- **Risk:** Medium — STG is one of the more layout-dense, recently-redesigned screens (per the v1.6.6
  layout/graphic redesign); worth care but self-contained to one file.
- **Payoff:** Medium — 113 lines removed, and closes the gap where the shared component's sizing
  limitations caused a full parallel implementation rather than a small prop addition.
- **Recommendation:** **Do opportunistically**, next time STGPage is revisited.

### Frontend items checked and found clean (no action needed)

- **Status badges** (`StatusBadge`, `ZoneCodeBadge`) — used consistently everywhere status/zone pills
  appear; no hand-rolled duplicates found.
- **Page headers** — rendered once, globally, by `AppShell`/`Header.tsx` via a route→title map; no
  per-page duplication.
- **Data-fetch boilerplate** — all pages route through the single `src/lib/api.ts` `apiFetch` helper;
  remaining local `try/catch` blocks wrap distinct business logic, not duplicated fetch mechanics.
- **Grid/table rendering** (`AisleGrid`, `AisleSizeTable`) — used consistently by ELA/ELZ/STG; no parallel
  implementation found.

---

## Backend (`api/`)

### B1. `writeLog` bypassed 10× in `demo-reseed.ts` (largest single backend block)

`api/lib/activityLog.ts`'s `writeLog` helper is used correctly at 21 call sites across
`pallets.ts`/`pulls.ts`/`puts.ts`/`locations.ts`/`staging.ts`/`reservationTimer.ts`. But
`api/functions/demo-reseed.ts` calls `tx.activityLog.create({...})` directly **10 times** (lines 147, 232,
327, 383, 433, 465, 491, 509, 612, 668), each re-implementing the same field-mapping/`JSON.stringify`
logic `writeLog` already does. The reason is structural, not accidental: `writeLog` is hardcoded to the
singleton `prisma` client and can't accept a transaction client, and `demo-reseed.ts` needs to log inside
a `tx`. **~100 duplicated lines** — the largest concrete duplication block found anywhere in this audit.

- **Effort:** Low — overload `writeLog(entry, client = prisma)` in `activityLog.ts` so it accepts an
  optional Prisma client/transaction, then swap the 10 call sites in `demo-reseed.ts` to use it.
- **Risk:** Low — `demo-reseed.ts` is a demo/reset utility, not part of the live operational path; a bug
  here is caught immediately on next demo reseed, not silently in production data.
- **Payoff:** High relative to effort — biggest line count for one of the smallest, most mechanical fixes
  in this report.
- **Recommendation:** **Do now.**

### B2. Pallet/label ID generation and demo-data utilities duplicated between `demo-reseed.ts` and `seed.ts`

`api/lib/palletId.ts`'s `generateUniquePid` (DB-checked, collision-safe) has two independent in-memory-`Set`
clones instead of being reused:

- `api/functions/demo-reseed.ts:850` `genPid()`
- `api/prisma/seed.ts:61` `genPid()`

`palletId.ts`'s own comment already documents the duplication ("mirrors `api/prisma/seed.ts`'s `genPid`")
without it having been resolved. The same pattern repeats for `genLid` (label-ID builder,
`demo-reseed.ts:744` vs `seed.ts:69`) and for small utilities (`randomInt`, `randomFrom`, `shuffle`,
`cartonsPerPalletFor`, `julianDate`) each defined once in `demo-reseed.ts` (~710-758) and again in
`seed.ts` (~12-49). **~60-70 duplicated lines.**

- **Effort:** Medium — both files are demo/seed-only, so this is a straightforward "extract to
  `api/prisma/demoUtils.ts`, import from both" move with no production-path risk.
- **Risk:** Low — neither file runs against a live database session; worst case is a broken local reseed,
  immediately visible.
- **Payoff:** Medium — mostly a maintainability win (one seeded-ID algorithm to reason about instead of
  two that could silently drift apart), not a user-facing one.
- **Recommendation:** **Do opportunistically**, next time either file needs a change for another reason.

### B3. "Random sample row" query pattern repeated ~14×

The `count()` → random `skip` → `findFirst` idiom for picking a random eligible row is repeated across:

- `api/functions/samples.ts` (7 occurrences — this is the file's actual purpose, so repetition here is more
  defensible)
- `api/functions/items.ts:177` (`sampleItem`)
- `api/functions/pallets.ts:636` (`sampleReinstate`)
- `api/functions/locations.ts:336, 358` (`getRandomHeldLocation`, `getRandomUnheldLocation`)

**~56 duplicated lines**, ~4 lines per occurrence.

- **Effort:** Low — a `sampleRandomRow(model, where, select?)` helper covers the shape, though Prisma's
  lack of a generic "model" parameter type makes the helper signature slightly awkward (would likely need
  a small `Record<string, any>` escape hatch or per-model overloads).
- **Risk:** Low — read-only queries, easy to verify correctness of the extracted helper against each
  existing call site.
- **Payoff:** Low-Medium — each occurrence is small (4 lines), so the win is more about having one place to
  fix if the randomization strategy ever needs to change (e.g., for performance on a larger table) than
  about lines saved.
- **Recommendation:** **Defer** — real but low-value; revisit only if a bug in the randomization logic
  surfaces (at which point fixing it in each of 5 files becomes the actual motivator).

### B4. DPCI formatting/parsing has no shared helper (unlike location IDs)

`api/lib/locationParser.ts` provides `parseLocationBarcode`/`formatLocationId` for location codes, but no
equivalent exists for DPCI codes:

- **Formatting** (`dept-class-item` zero-padded string) is reimplemented identically in `activity.ts:98`,
  `items.ts:21`, `items.ts:184`, `pallets.ts:643`, `labels.ts:72`, `locations.ts:88` — 6 sites.
- **Parsing** (9-digit barcode → dept/class/item) is reimplemented identically in `activity.ts:63`,
  `items.ts:49`, `items.ts:133`, `pallets.ts:437` — 4 sites.

**~48 duplicated lines total.**

- **Effort:** Low — add `parseDpci`/`formatDpci` to `locationParser.ts` (or a new sibling `dpci.ts`), swap
  10 call sites.
- **Risk:** Low — pure string formatting/parsing, trivially testable against existing call sites.
- **Payoff:** Medium — DPCI is a core identifier touched by nearly every screen; missing this helper (when
  the symmetric location-ID one already exists) is the clearest "this should already exist" gap in the
  backend.
- **Recommendation:** **Do now** — small, safe, and closes an inconsistency with an already-established
  pattern (`locationParser.ts`).

### B5. Open-label status filter (`notIn: [PULLED, DIVERTED, CANCELED, PURGED]`) duplicated instead of exported as a constant

Canonical in `api/lib/eligibility.ts:63`, reimplemented as the same literal array in `pallets.ts:201`,
`pallets.ts:221`, and `samples.ts:141`. **4 occurrences.**

- **Effort:** Very low — export `OPEN_LABEL_STATUSES` as a constant from `eligibility.ts`, replace 3
  literals with it.
- **Risk:** Very low.
- **Payoff:** Low in line count, but meaningful in correctness: if this status list ever changes (a new
  terminal status is added), today it requires remembering to update 4 places by hand.
- **Recommendation:** **Do now** — trivial, and the kind of literal-list duplication most likely to cause a
  silent correctness bug later.

### B6. "Not held" location filter duplicated outside `zoneLogic.ts`/`stagingLogic.ts`

`OR: [{ holdCategory: null }, { holdCategory: 'HOLD_OUT' }]` is canonical in `zoneLogic.ts:100` and
`stagingLogic.ts:44`, but reimplemented inline in `demo-reseed.ts` (3×) and `samples.ts:117` (whose own
comment says it "mirrors `findNextLocation`'s own eligibility criteria exactly"). **~20 duplicated lines.**

- **Effort:** Low — export a `NOT_HELD_FILTER` Prisma where-fragment from `zoneLogic.ts`.
- **Risk:** Low for `samples.ts`; slightly more care needed for `demo-reseed.ts` since it seeds data other
  tests/screens depend on, but it's a straightforward literal swap.
- **Payoff:** Same shape as B5 — small in lines, meaningful for correctness drift over time.
- **Recommendation:** **Do now**, can be batched with B5 since both are "export a constant, fix call
  sites" changes to the same two lib files.

### Backend items checked and found clean (no action needed)

- **Auth/permission boilerplate** — `requireAuth`/`requireRole` (`jwt.ts`/`permissions.ts`) used
  consistently at all 53 call sites that need auth; no reimplemented header parsing found.
- **Response formatting** — every HTTP-triggered function routes through `withHandler`/`json`
  (`response.ts`); no ad hoc response construction found.
- **Error handling** — centralized via `withHandler`'s single try/catch; no duplicated manual try/catch
  blocks. (The `Object.assign(new Error(...), { status: N })` idiom recurs ~139 times, but this is a
  low-value cosmetic nit, not a correctness or maintainability risk — noted but not scored as a finding.)
- **Activity logging** (outside `demo-reseed.ts`, see B1) — `writeLog` used consistently.

---

## Summary table

| ID | Item | Est. lines | Effort | Risk | Payoff | Recommendation |
|---|---|---|---|---|---|---|
| F1 | Shared numpad-entry field box | ~180 | Medium | Medium | High | Do now (isolated PR) |
| F2 | `DataRow` local reimplementations | ~27 | Low | Low | Medium | Do now |
| F3 | Modal overlay chrome / `ConfirmDialog` reuse | ~90 | Medium | Medium | Medium-High | `CombineDialog` now; rest opportunistic |
| F4 | Numeric keypad modal (MNP ↔ PIP) | ~140 | Medium | Medium | Medium-High | Opportunistic (bundle with F3) |
| F5 | Session history side panel | ~150 | Medium | Low-Medium | Medium | Opportunistic |
| F6 | `PalletCodePicker` vs `CodePickerField` | ~113 | Low-Medium | Medium | Medium | Opportunistic |
| B1 | `writeLog` bypass in `demo-reseed.ts` | ~100 | Low | Low | High | Do now |
| B2 | Seed/demo ID-generation duplication | ~65 | Medium | Low | Medium | Opportunistic |
| B3 | Random-sample-row query pattern | ~56 | Low | Low | Low-Medium | Defer |
| B4 | DPCI parse/format helper | ~48 | Low | Low | Medium | Do now |
| B5 | Open-label status constant | ~4 | Very low | Very low | Low (but correctness-relevant) | Do now |
| B6 | Not-held location filter constant | ~20 | Low | Low | Low (but correctness-relevant) | Do now |

**Total duplicated lines identified: ~990**, of which **~460 lines (F2, B1, B4, B5, B6)** are low-risk,
low-effort "do now" candidates, and the rest are legitimate opportunistic-refactor candidates best folded
into the next version pass that already touches the relevant screen or file.

### Suggested sequencing

1. **Quick wins batch** (F2, B1, B4, B5, B6) — none of these change behavior, all are mechanical
   extractions with existing precedent (`DataRow`, `locationParser.ts`, `eligibility.ts`, `zoneLogic.ts`
   already establish the pattern being extended). Low risk of introducing a new bug; could reasonably be
   its own small version bump independent of the screen-per-version cadence, since it touches many files
   shallowly rather than one screen deeply.
2. **F1 (shared field box)** as its own dedicated pass with a full manual smoke test across all 7 affected
   screens, given how central this component is to every screen's interaction model.
3. **F3/F4 (modal work)** and **F6 (`CodePickerField` variant)** folded into whichever future version
   already revisits MNP, PIP, or STG for other reasons — no need to force these ahead of schedule.
4. **F5 (history panel)** and **B2/B3** — defer until the next natural trigger (a new screen needing a
   history panel; a bug surfacing in seed data or random-sample logic).

This is an audit only — no code was changed as part of producing this report.
