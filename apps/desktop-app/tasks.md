# Desktop App — Bootstrap Tasks

Build plan for getting `apps/desktop-app/` from an empty scaffold to a running Electron app with
a working zNumber+password login. This covers **bootstrap only** — none of the 8
designed Manager screens (tracked as GitHub issues #141–148) are in scope here; this is
everything that has to exist before any of them can be built on top of it.

Decisions locked in before writing this list:

- Password credential lives on the existing `User` model (new nullable `passwordHash`
  field) — same identity as the tablet's zNumber+PIN login, not a separate table.
- Only **LWW, OM, ICQA, ADMIN** can log into the desktop app. WORKER/IM are rejected
  with a clear "no desktop access" error, not a generic wrong-password message.
  ("ICQA access" is derived from `Department.id = 'IQA'`, same as the design docs treat
  it — not a distinct `role` value.)
- Passwords are admin-set only for this demo phase — no self-service reset flow.

## Phase 0 — Project tooling

- [ ] Install Vite + React + TypeScript + TailwindCSS in `apps/desktop-app/`, matching the root
      app's stack (`src/`) for consistency and to make shared component reuse realistic
      later.
- [ ] Install Electron as a devDependency. Create a main-process entry point and a
      preload script; open a single `BrowserWindow` pointed at the Vite dev server in
      development and the built `dist/` in production.
- [ ] Wire up `dev` (Vite dev server + Electron launched against it, e.g. via
      `concurrently`/`wait-on`) and `build` (Vite build, then package with
      `electron-builder` or similar) scripts in `apps/desktop-app/package.json`.
- [ ] Add `apps/desktop-app/tsconfig.json` and an ESLint config — either its own or extending the
      root `eslint.config.js`'s pattern (decide which once the frontend is actually
      scaffolded; the root config's per-folder `files` blocks, like the one already
      scoping `api/**/*.ts`, are the existing precedent).
- [ ] Update root `.gitignore` for `apps/desktop-app/node_modules`, `apps/desktop-app/dist`, and whatever
      Electron's packager outputs.

## Phase 1 — Password authentication (schema + backend)

- [ ] **Open decision, flagged rather than assumed:** the design docs' role model calls
      for `LWW`/`OM` role values, but the live seeded `User.role` data uses `LEAD`/
      `MANAGER` (see the Demo Users memory / seed data). Before writing the login
      endpoint's role check, confirm: rename the actual `role` column values in the
      database (`LEAD`→`LWW`, `MANAGER`→`OM`), or keep the DB values as-is and only
      relabel for display? This affects the *existing*, already-live tablet app's role
      checks too, not just desktop — worth its own explicit answer, not a silent guess.
- [ ] `api/prisma/schema.prisma` — add `passwordHash String? @db.VarChar(255)` to
      `User` (nullable: only set for the 4 desktop-eligible roles). Generate and apply
      a migration against the local MySQL `PalletIQ_DB`.
- [ ] New backend endpoint, e.g. `POST /api/auth/desktop-login` (separate from the
      tablet's existing `identify`/`login` — different credential, different session
      shape) — accepts `zNumber` + `password`, checks the user's role/department is
      desktop-eligible *before* checking the password (so a WORKER gets "no desktop
      access" rather than a password prompt at all), verifies via `bcryptjs.compare`
      against `passwordHash` (already a dependency — same package the PIN hash uses),
      and issues a JWT via the existing `signToken()` in `api/lib/jwt.ts`.
- [ ] Decide the desktop session's JWT expiry — reuse the tablet's 12h, or something
      different suited to a desktop app that might stay open all shift.
- [ ] Set demo passwords for the desktop-eligible seeded users (Marcus Webb/LWW,
      Diana Kowalski/OM+ICQA-department, Robert Breutzmann/ADMIN — see the Demo Users
      memory for exact zNumbers) via a seed script update, so login is actually
      testable end to end.

## Phase 2 — Base app shell

- [ ] Login screen: zNumber field + a real password field (masked text input, not the
      tablet's PIN numpad — DESKTOP assumes physical keyboard entry per the Embedded
      Floor App design doc). Visual language matches the existing app's Tailwind
      conventions.
- [ ] Auth context/provider for the desktop app, mirroring the floor-app's
      `AuthContext.tsx` pattern — decide where the session token persists inside the
      Electron renderer (plain `localStorage`, same as the web app, vs. Electron's
      `safeStorage`/a local file via the main process for something less web-exposed).
- [ ] Basic authenticated shell once logged in: a nav/header listing all 8 planned
      screens as stub/"Coming Soon" entries (they're built out under their own issues,
      #141–148), plus the persistent Floor App toggle described in the Embedded Floor
      App design (can stay a non-functional placeholder until #141 is actually built).
- [ ] Logout flow (clears the persisted session, returns to the login screen).

## Phase 3 — Verification

- [ ] Manual smoke test: launch the Electron app, log in as a seeded desktop-eligible
      user, confirm the JWT issues and the shell renders. Confirm a WORKER/IM-role
      login attempt is correctly rejected with the right error, not just a generic
      failure.
- [ ] Log everything above in `DevNotes/Logs/Desktop/V1.0/`, per this project's logging
      convention. Decide at that point whether this bumps `apps/desktop-app/package.json` to
      1.1.0 or stays 1.0.0 until a real Manager screen ships — not decided now.
- [ ] Decide (can defer): whether/how to set up Electron-aware Playwright e2e coverage
      for the desktop app, parallel to the floor-app's existing `tests/e2e/`.
