# Desktop App Changelog

All notable changes to the PalletIQ **Desktop** app are documented here. Loosely follows [Keep a Changelog](https://keepachangelog.com) conventions. This is a **separate version/changelog track from the floor-app (tablet/SYMBOL) and the api**, each of which version and ship independently — see [`../floor-app/CHANGELOG.md`](../floor-app/CHANGELOG.md) and [`../../api/CHANGELOG.md`](../../api/CHANGELOG.md). All three share `../../api` and `../../shared`.

## Table of Contents

- [Roadmap — Planned Screens](#roadmap--planned-screens)
- [1.0.0 — 2026-07-26](#100--2026-07-26)

---

## Roadmap — Planned Screens

The eight DESKTOP-bucket screens designed in the 2026-07-25 design session (see
`DevNotes/DesignPrompts/Desktop/Session-Log-2026-07-25.md`), tracked as GitHub issues
under the `major-feature-addition` label:

- **Embedded Floor App** — containerized webview wrapper around the existing SYMBOL
  tablet build, with auto-login and persistent state across window close.
- **DPCI Setup Edit** — item setup/edit with HQ Default/Building Override/Lock handling
  code, item hold, and an HQ ticket system for out-of-tier changes.
- **Location Setup Edit** — aisle-as-first-class-structure (create/delete/modify), a
  grid-based selection editor for storage code/size/contraction, and a NOT FOR STORAGE
  single-location flag.
- **Hung Pallet/Location Resolution** — Soft/Hard Reset recovery tool re-invoking the
  app's existing status-determination logic gate.
- **Job/Function Assignment** — drag-and-drop shift roster/function assignment against a
  simulated myTime schedule and Daily Plan stub.
- **Prod Goal / Ramping Override / Daily Plan** — global prod-goal rates, per-worker
  ramping overrides, and OM's per-department Daily Plan target entry.
- **Team Prod Summary** — live read-only production-vs-plan dashboard, tiered by job
  function (PULL/PROD/SCAN/OTHER).
- **Universal Audit / Cross-Reference (Audit Tool)** — three-pane, drag-cross-referenced
  audit trail lookup across every major entity type.

None of these are built yet — this version is the initial project scaffold only.

---

## [1.0.0] — 2026-07-26

**Initial scaffold.** Establishes the desktop app as its own folder/versioning/changelog
track within the PalletIQ monorepo, following the same independent-sibling-folder
pattern `api/` already uses (own `package.json`, no npm workspaces tying it to root).
Nothing functional is built yet — this version covers project setup and design-doc
integration only.

### 1.0.0 — Added

- `apps/desktop-app/` folder and `apps/desktop-app/package.json` (name `palletiq-desktop-app`, version
  `1.0.0`) — no dependencies installed yet; Electron + a web frontend (framework TBD,
  likely Vite + React to match the floor-app's stack) are still to be added.
- This `apps/desktop-app/CHANGELOG.md`, tracking the desktop app's own version history separately
  from the floor-app's `CHANGELOG.md`.
- Integrated 8 screen design docs plus the session log that produced them into
  `DevNotes/DesignPrompts/Desktop/` (see that folder for full detail on every screen
  listed in the Roadmap above): `DPCI-Setup-Edit-design.md`,
  `Embedded-Floor-App-design.md`, `Hung-Pallet-Location-Resolution-design.md`,
  `Job-Function-Assignment-design.md`, `Location-Setup-Edit-design.md`,
  `Prod-Goal-Ramping-Daily-Plan-design.md`, `Team-Prod-Summary-design.md`,
  `Universal-Audit-Tool-design.md`, `Session-Log-2026-07-25.md`.
- Filed GitHub issues for the build: one umbrella "Major Feature: DESKTOP App v1.0.0"
  issue plus one child issue per screen (8 total), all labeled `feature-change` +
  `major-feature-addition`, matching this repo's existing convention for
  ground-up multi-screen feature builds.

### 1.0.0 — Not yet done

- No schema changes applied yet. The design docs above collectively specify ~15 new
  Prisma models (`Vendor`, `ItemVendor`, `ItemChangeTicket`,
  `ItemChangeTicketAttachment`, `ItemFieldLock`, `HandlingCodeChangeAlert`, `Shift`,
  `ShiftBreak`, `SimScheduledShift`, `DailyPlanTarget`, `ReasonCode`, `Aisle`,
  `ZoneBoundary`, `SizeCode`, `JobFunction`, `SimDailyDrop`,
  `SimAttendanceException`) plus additions to the existing `Item` (including removing
  `Item.conveyable` — a breaking change to an existing live field) and `User` models —
  none of this has been applied to `api/prisma/schema.prisma` yet.
- Electron is not yet installed or configured — "may need to be installed" per the
  person building this.
- No actual screen UI exists yet for any of the 8 screens above.
