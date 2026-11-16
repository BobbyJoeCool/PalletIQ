# PalletIQ Desktop

**Status:** bootstrap built — Electron shell, zNumber + password login, and a signed-in
shell with the planned screens stubbed as "Coming Soon". No Manager screen is built yet.

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

## Running it

```
npm install
npm run dev       # Vite dev server on :5174 + Electron pointed at it (HMR)
npm run dev:web   # renderer only, in a browser tab
npm start         # production build, served inside Electron over app://
npm run package   # unpacked electron-builder output in release/
```

The API has to be running (`cd ../../api && npm start`, port 7071). In development Vite
proxies `/api/*` to it; in a built app Electron's main process forwards `/api/*` to
`PALLETIQ_API_URL` (default `http://localhost:7071`).

## Signing in

`POST /api/auth/desktop-login` takes a zNumber and a password (`User.passwordHash`, a
second credential beside the tablet PIN). Only LEAD (shown as LWW), MANAGER (shown as
OM), ADMIN, or anyone whose home department is ICQA (`IQA`) may sign in; the rule lives
in `../../shared/roles.ts` (`isDesktopEligible`). Passwords are admin-set — there is no
self-service reset. The three eligible demo users (`z002p23`, `z002p24`, `z002p25`) are
seeded with the password `Desktop1234`.

The session is kept in `localStorage` and survives closing the app until the 12-hour
token expires.

## Not yet done

- None of the eight Manager screens (#141–148) exist; each nav entry opens a "Coming
  Soon" page, and the Floor App toggle is a disabled placeholder until #141.
- None of the ~15 new Prisma models these screens need have been added to
  `../../api/prisma/schema.prisma` yet.
- No automated e2e coverage for the desktop app.
