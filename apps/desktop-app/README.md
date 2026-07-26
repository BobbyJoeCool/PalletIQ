# PalletIQ Desktop

**Status:** scaffold only — nothing functional built yet.

The Manager-facing desktop application: a web app bundled with Electron, covering the
DESKTOP-bucket screens designed in the 2026-07-25 design session (DPCI Setup Edit,
Embedded Floor App, Hung Pallet/Location Resolution, Job/Function Assignment, Location
Setup Edit, Prod Goal/Ramping Override/Daily Plan, Team Prod Summary, Universal Audit
Tool).

This folder is versioned and changelogged **independently** from the other apps in this
monorepo — see [`CHANGELOG.md`](CHANGELOG.md) for this app's own history,
[`../floor-app/CHANGELOG.md`](../floor-app/CHANGELOG.md) for the floor-app's (the
tablet/SYMBOL build), and [`../../api/CHANGELOG.md`](../../api/CHANGELOG.md) for the
shared backend's. All three share the same `../../api` (Azure Functions backend +
Prisma/MySQL database) and `../../shared` (TypeScript types) at the repo root — this
folder only holds the desktop-specific frontend.

## Where things live

- **Design docs:** `../../DevNotes/DesignPrompts/Desktop/` — one file per screen, plus
  `Session-Log-2026-07-25.md` for the full design-session narrative.
- **GitHub issues:** filed under the `major-feature-addition` label — one umbrella issue
  for the whole v1.0.0 build, one child issue per screen.
- **Dev logs:** `../../DevNotes/Logs/Desktop/V1.0/` — session-by-session build record,
  same convention the other apps' `DevNotes/Logs/` trees use.

## Not yet done

- Electron and a frontend framework (likely Vite + React, to match the floor-app) aren't
  installed yet.
- None of the ~15 new Prisma models these screens need have been added to
  `../../api/prisma/schema.prisma` yet.
- No screen UI exists yet.
