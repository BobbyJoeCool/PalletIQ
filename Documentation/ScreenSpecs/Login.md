# Screen Design: Login / Authentication (zNumber → PIN)

**Device:** Tablet — iPad Pro 13" landscape, fixed 1366×1024 canvas (kiosk)
**Bucket:** Existing Warehouse App (current production screens)
**Roles:** Unauthenticated — this flow exists precisely to establish a role (Worker, IM, Lead Worker, Manager, System Admin); no role gate applies to the flow itself, and every role goes through the identical two-step sequence

## Flow

1. The app always opens to the Login screen (route `/login`) — there is no unauthenticated path that reaches the Home screen, and in production no prior session is ever restored from localStorage on load (see Behind the Scenes).
2. **Identifier entry.** A single field accepts either input method, with no mode toggle — whichever arrives first is used:
   - **Badge scan:** the hardware barcode/RFID scanner routes its value into the badge-scan zone (left panel) via `AppShell`'s scanner-buffering listener.
   - **Manual entry:** the worker types on the on-screen `ZnumPad` (right panel) — a fixed `z` prefix is always shown and cannot be backspaced past; P/N/X letter keys append a lowercase suffix character, digit keys append digits, up to 7 total characters (matching `User.zNumber`'s `NVarChar(7)` column, e.g. `z002p25`).
   - Two dev-tools controls sit above both entry zones, styled in amber to read as testing utilities rather than app functionality: **"Reseed Test Data"** (wipes and regenerates pending pallets/labels/staged locations, plus a fixed 6AM-4PM Worker Activity Log shift for all 5 demo workers — see `api/functions/demo-reseed.ts`'s "Worker Activity Log" section) and **"Wake Database"** (see Behind the Scenes).
3. Worker taps "OK" (enabled only once at least one character beyond the `z` prefix is entered) or completes a badge scan. This calls `POST /api/auth/identify` with the zNumber.
   - **3a — Not found:** see Mis-scan / error handling below; stays on `/login`.
   - **3b — Found:** the API returns `{ firstName, lastName }`; the app navigates to `/pin`, passing `{ zNumber, firstName, lastName }` as router state (not query params — a direct URL visit to `/pin` with no state redirects straight back to `/login`).
4. **PIN entry** (`/pin`). Shows `Welcome: {firstName}` and four PIN-dot boxes; the worker enters a 4-digit PIN on the on-screen `PinPad`.
   - Auto-submits the instant the 4th digit is entered — there is no separate OK tap for the PIN step (unlike the zNumber step).
   - Calls `POST /api/auth/login` with `{ zNumber, pin }`.
   - **4a — Incorrect PIN:** see Mis-scan / error handling below; the identified worker's name remains shown, flow does not return to step 2 — only the PIN field clears.
   - **4b — Match:** returns `{ token, user: { zNumber, firstName, lastName, role } }`. `AuthContext.login()` stores the token/user (and, in dev only, persists to localStorage) and resets the idle-activity clock; the app navigates to `/` (Home) with `replace: true` so the browser Back button cannot return to the PIN screen.
5. A "‹ Back" button on the PIN screen returns to `/login` (a fresh identifier entry, discarding the in-progress zNumber/name).
6. **Idle timeout:** once logged in, any click, keydown, or touchstart anywhere in the app resets a 15-minute idle clock (checked every 30 seconds). If 15 minutes elapse with no activity, `AuthContext` calls `logout()` automatically — this is the actual mechanism that ends a session; the JWT's own 12-hour expiry is only a backstop.
7. **Logout:** the Header's "Logout" button (present on every authenticated screen) calls the same `logout()` — clears the token/user and localStorage, navigates to `/login`.

### Mis-scan / error handling

- **zNumber not found** (`identify` returns 404 `NOT_FOUND`): `playAlert('error')`, message bar shows `zNumber not found — rescan badge or re-enter`, and the zNumber field resets to just `z`. Worker retries on the same screen (step 2).
- **Any other identify failure** (network/connection error, non-`NOT_FOUND` error code): message bar shows the generic `Connection error — please try again`; field also resets to `z`.
- **Incorrect PIN** (`login` returns 401 `INVALID_PIN`): `playAlert('error')`, message bar shows `Incorrect PIN — try again`, PIN field clears to empty — the worker's identified name stays on screen, so they re-enter only the PIN, not the whole flow.
- **Any other login failure** (connection error, unexpected response): generic `Connection error — please try again`, PIN also clears.
- **Direct/stale navigation to `/pin`** with no route state (e.g. a bookmarked URL, a page reload on `/pin`): `PinPage` immediately issues a `<Navigate to="/login" replace />` — there's no partial/broken PIN screen state possible.
- **zNumber length cap:** once the value reaches 7 characters (the fixed-width `User.zNumber` column length), further keypad presses are silently ignored rather than erroring — there is no length-related error message, just a hard stop on further input (added v1.6.0; previously unbounded).
- **App-wide red-wash audit (v1.7.0):** no field on either screen picked up the red-wash treatment (`DevNotes/DesignPrompts/Feature-8-AppWide-Invalid-Field-Wash.md`) — both zNumber and PIN reset to empty atomically on every failure path (`setZnumber('z')` / `setPin('')`), so there's never a moment where a bad value sits visibly in a box to wash; same finding, same reasoning, as MNP/STG's audits. The zNumber display box also has no focus/active state at all to begin with (always the same static border), unlike every other numpad-driven field in the app.

### Status / messaging behavior

- Both `/login` and `/pin` render their own **standalone** `MessageBar` (each wrapped in its own isolated `MessageBarProvider`) rather than the shared app-shell message bar used by every authenticated screen — this is deliberate so a login error never bleeds into the first authenticated screen's message bar state after a successful login.
- Any field edit after an error (`handleChange`) immediately calls `clearMessage()` — the error text does not persist once the worker starts correcting their input, unlike some other screens' persist-until-next-action pattern.
- The Wake Database and Reseed Test Data controls have their own independent, non-message-bar status text directly beneath the buttons (`Waking up… (Ns)` countdown → `Database ready` / error; `Reseeding test data…` → a summary string / error) — these never touch the shared message bar since they aren't part of the actual login transaction.

## Layout (landscape, pre-auth — no Header/Footer shell)

```
┌───────────────────────────────────────────────────────────────────────────┐  Full 1366×1024 canvas
│                          PalletIQ                                        │
│                   Welcome to PalletIQ                                    │
│           Please scan your badge or enter your zNumber                  │
│                                                                            │
│      ⚠ Reseed Test Data        ⚠ Wake Database   (amber dev-tools row)   │
│                                                                            │
│   ┌───────────────────────┐   │   ┌─────────────────────────────────┐    │
│   │                       │   │   │ Enter your zNumber              │    │
│   │   TAP BADGE TO        │  or  │  ┌───────────────────────────┐  │    │
│   │      SCANNER          │   │   │  │ z 002p25|                 │  │    │
│   │   Primary sign-in     │   │   │  └───────────────────────────┘  │    │
│   │  (504×544, dashed)    │   │   │  [P][N][X]                       │    │
│   │                       │   │   │  [7][8][9]                       │    │
│   └───────────────────────┘   │   │  [4][5][6]                       │    │
│                                │   │  [1][2][3]                       │    │
│                                │   │  [⌫][0][ OK ]                    │    │
│                                    └─────────────────────────────────┘    │
│                                                                    v1.6.6  │
├───────────────────────────────────────────────────────────────────────────┤   Standalone
│  ● (idle / error message)                                                 │   Message Bar (84px)
└───────────────────────────────────────────────────────────────────────────┘

  /pin screen (after identify succeeds):
┌───────────────────────────────────────────────────────────────────────────┐
│ ‹ Back                                                                    │
│                                                                            │
│                       Welcome: {firstName}                               │
│                        Enter your PIN                                    │
│                                                                            │
│              [●][●][○][ ]  ← 4 PIN-dot boxes (96×108px each)             │
│                                                                            │
│                        [7][8][9]                                         │
│                        [4][5][6]                                         │
│                        [1][2][3]                                         │
│                        [⌫][0][ OK ]  (PinPad, auto-submits at 4 digits)   │
├───────────────────────────────────────────────────────────────────────────┤   Standalone
│  ● (idle / error message)                                                 │   Message Bar
└───────────────────────────────────────────────────────────────────────────┘
```

Neither screen uses the standard authenticated-screen shell (`AppShell`'s 104px Header / 74px shared MessageBar / 792px content / 54px Footer) — both are `fixed inset-0` full-black screens with their own layout and a standalone message bar, since there is no logged-in user yet to show a name/logout for, and no Jump/Activity/Footer-demo context makes sense pre-auth.

## Input handling

- **ZnumPad** (`/login`): custom keypad, not the shared app-wide `Numpad`/`Keyboard` components or `NumpadContext` — login has its own dedicated, simpler component tree since `NumpadContext` is provided inside `AppShell`, which only wraps authenticated routes. Layout: P/N/X letter row → 7-8-9 → 4-5-6 → 1-2-3 → ⌫-0-OK. Digit/letter buttons are 82–84px tall; backspace cannot delete the leading `z`.
- **PinPad** (`/pin`): same standalone-component pattern, numeric only (no letter row), 4-digit cap, auto-submit on the 4th digit via the parent's `useEffect` (the PinPad's own "OK" button is present but its click handler is a no-op — submission is driven entirely by length, not the tap).
- No hardware-scanner `deliverScan()` wiring is visible in these two components directly — the badge-scan zone on `/login` is a visual placeholder; the actual physical badge scan is handled the same way as any hardware scan app-wide, via `AppShell`'s global keydown buffering, which is outside `AppShell`'s authenticated routes but still mounted at the app root (`src/main.tsx`) for the scan to reach the identifier field.
- Touch targets: PIN-dot boxes are 96×108px; all keypad buttons are 82–84px tall — both comfortably exceed the 72px app-wide minimum. The zNumber/PIN entry display fields themselves (92px tall) are not directly tappable — they're a read-only display of the accumulated value, with the keypad below as the actual input surface.

## Data

**Reads:**
- `User` — by `zNumber` (lowercased/trimmed), via `POST /api/auth/identify`: selects `firstName`, `lastName` only.
- `User` — by `zNumber` again, via `POST /api/auth/login`: selects `zNumber`, `firstName`, `lastName`, `role`, `pinHash` (to verify against, via `bcrypt.compare`).

**Writes:** None. Neither `/api/auth/identify` nor `/api/auth/login` writes any database row — no `ActivityLog` entry is created for a login or logout (confirmed: there is no `actionType` value representing login/logout anywhere in `activityFormat.ts`'s tag/severity/detail mappings, and `outline.md`'s Activity Log section describes only transactional/state-changing events).

**Not written:** Login/logout events, failed identify attempts, and failed PIN attempts are not tracked anywhere in the database — there is no audit trail of login attempts, successful or not. Session state itself (token, user) lives only in memory/localStorage on the client, not as a server-side session record — the JWT is stateless.

## Screen Flow

Covers: identifier entry (scan vs. manual), not-found, PIN entry, wrong PIN, success, direct/stale `/pin` access, idle timeout, and logout.

```mermaid
flowchart TD
    A([App loads]) --> B[/login — LoginPage]
    B --> C{Identifier input}
    C -->|Badge scan| D[Scanner buffer → zNumber]
    C -->|Manual ZnumPad + OK| D
    D --> E[POST /api/auth/identify]
    E -->|404 NOT_FOUND| F[Error tone, 'zNumber not found', field resets to 'z']
    F --> C
    E -->|other failure| F2[Error tone, 'Connection error']
    F2 --> C
    E -->|200| G[navigate /pin with state: zNumber, firstName, lastName]
    G --> H{Route state present?}
    H -->|No — direct/stale nav| B
    H -->|Yes| I[/pin — PinPage, shows 'Welcome: firstName']
    I --> J[Worker enters 4-digit PIN via PinPad]
    J -->|length reaches 4| K[POST /api/auth/login]
    K -->|401 INVALID_PIN| L[Error tone, 'Incorrect PIN', PIN clears]
    L --> J
    K -->|other failure| L2[Error tone, 'Connection error', PIN clears]
    L2 --> J
    K -->|200| M[AuthContext.login stores token+user, resets idle clock]
    M --> N[navigate / — replace:true]
    N --> O[Authenticated app — 15-min idle clock running]
    O -->|15 min no click/keydown/touchstart| P[AuthContext.logout — auto]
    O -->|worker taps Logout| P
    P --> B
```

## Behind the Scenes

**Two-endpoint split (E, K):** `identify` and `login` are deliberately separate calls rather than one combined endpoint — `identify` never touches `pinHash` or issues a token; only `login` verifies the PIN and mints the JWT. This lets the PIN screen show a personalized greeting before any credential (the PIN) is actually checked.

**Token issuance and expiry (K→M):** `signToken()` (`api/lib/jwt.ts`) issues an HS256 JWT with a 12-hour expiry — long enough to outlast any real shift. The *actual* session-length enforcement is entirely client-side: `AuthContext`'s 15-minute idle timer (`IDLE_MS`, checked every `IDLE_CHECK_MS` = 30s). The 12h JWT expiry is a backstop only, in case the client-side timer somehow doesn't fire (tab left open across a device restart, etc.) — **note:** both `Documentation/Flowcharts-ERDs/auth-flow.mmd`'s diagram text ("issue 15-min JWT") and `Documentation/outline.md`'s Authentication section ("the API issues a signed JWT (HS256, 15-minute expiry)") are stale/incorrect relative to the current code — `jwt.ts`'s `signToken()` and its own doc comment are unambiguous that the token expiry is 12 hours and the 15-minute figure belongs only to the separate client-side idle timeout. Both docs should be corrected to avoid future confusion; flagged here rather than fixed as part of this documentation-only task.

**Custom `X-Auth-Token` header, not `Authorization` (all authenticated calls post-login):** `requireAuth()` (`api/lib/permissions.ts`) reads the session token from a custom `X-Auth-Token` header rather than the standard `Authorization` header. This is a hard requirement, not a style choice — Azure Static Web Apps' Managed Functions proxy overwrites the `Authorization` header with its own internal system-to-system JWT (issued by `scm.azurewebsites.net`, audience `azurefunctions`) before a request reaches the Function code, so the app's own Bearer token never arrives if sent that way. This was root-caused in production (v0.9.7) by dumping the raw header and finding Azure's service JWT there instead of the app's own token; every authenticated `apiFetch` call sends `X-Auth-Token` accordingly.

**Session persistence rule (app load, step 1):** In production, `AuthContext`'s initial `useState` initializer unconditionally clears any leftover localStorage token/user and starts at `null` — every real page load starts at Login, matching physical kiosk behavior (a shared device should never silently resume someone else's session). In dev only, a valid, non-expired token is restored from localStorage so local hot-reloads don't force a re-login every time.

**Wake Database (dev-tools control):** Hits an unauthenticated `GET /api/health` endpoint (a trivial `SELECT 1`) purely to force Azure SQL out of serverless auto-pause before a real login attempt. This exists because early production deployments (`[0.9.0]`–`[0.9.7]`) hit real login failures from a cold Azure SQL resume timing out mid-`identify`/`login` call. The connection string's `connectTimeout` was later raised from the `mssql` driver's 15-second default to 60 seconds (v1.6.0) specifically so this control's wait window (`WAKE_TIMEOUT_SECONDS = 60`) matches what a cold resume can actually take — the countdown shown to the worker ticks from 60 to 0 rather than being a static, non-informative spinner (also v1.6.0).

**zNumber length cap (ZnumPad):** Capped at 7 total characters (`z` + 6) to match `User.zNumber`'s `NVarChar(7)` schema column and the canonical example in `outline.md` (`z002p25`) — added in v1.6.0 after the original fix-list item mis-specified "7 digits (8 with leading z)," which doesn't match the actual schema or any real seeded zNumber; treated as an arithmetic slip in the task description rather than followed literally.

## Open items still remaining

- No open GitHub issues in the current `CHANGELOG.md` "Unreleased — Reported Issues" backlog reference Login, zNumber entry, or PIN entry specifically as of this writing.
- Both `Documentation/Flowcharts-ERDs/auth-flow.mmd`'s diagram text and `Documentation/outline.md`'s Authentication section incorrectly state the JWT is issued with a "15-minute" expiry — it is actually 12 hours (per `api/lib/jwt.ts`); the 15-minute figure belongs only to the separate client-side idle timeout. Both documents should be corrected the next time they're touched (flagged here per this project's Documentation/Diagram Sync Requirements rather than fixed as part of this documentation-only task).
- The deployed Azure Function App's own Application Settings (not tracked in this repo) need `connectTimeout=60000` added to their `DATABASE_URL` to match the local `connectTimeout` fix from v1.6.0 — this is outside what repository-tracked config/code can address directly, per that version's own changelog note.

## Change Log

| Date | Change |
| --- | --- |
| 2026-07-19 | "Reseed Test Data" gained the Worker Activity Log feature: on every click, simulates a realistic fixed 6AM-4PM shift (shared 10:00-10:30 break) for all 5 demo workers — z002p21 Carton Air pulls, z002p22 Directed Puts, z002p23 GPM staging, z002p24 light IM hold-clear/pallet-edit work, z002p25 consolidation — resuming from wherever each worker's log left off on a same-day repeat click rather than resetting. Full design/rationale in `api/functions/demo-reseed.ts`'s "Worker Activity Log" section comment. |
| 2026-07-18 | Initial design — new standard-template spec built from `src/pages/LoginPage.tsx`, `src/pages/PinPage.tsx`, `src/context/AuthContext.tsx`, `src/components/ZnumPad.tsx`, `src/components/PinPad.tsx`, `api/functions/auth.ts`, `api/lib/jwt.ts`, `api/lib/permissions.ts`, `Documentation/Flowcharts-ERDs/auth-flow.mmd`, and the CHANGELOG lineage across v0.9.0 (initial full auth flow), v0.9.7 (X-Auth-Token production incident), v1.0.1 (Wake Database added), v1.0.9 (Reseed Test Data added, Wake Database relocated/enlarged), v1.0.10 (version-number label), and v1.6.0 (Wake Database timeout raised to 60s + progress countdown, zNumber length cap). No prior standalone spec existed for this flow in either `DevNotes/Screen-Specs/` or `Documentation/ScreenSpecs/` — `outline.md`'s "Authentication" section was the closest prior authoritative description; this doc found it (and `auth-flow.mmd`) both misstate the JWT's expiry as 15 minutes when `jwt.ts`'s actual implementation is 12 hours, the 15-minute figure belonging only to the separate client-side idle timeout (see Open items). |
