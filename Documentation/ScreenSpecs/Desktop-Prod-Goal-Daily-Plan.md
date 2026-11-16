# Screen Design: Prod Goal / Ramping / Daily Plan (Desktop)

**Device:** DESKTOP — the Electron app in `apps/desktop-app/`, route `/screens/prod-goals`
**Bucket:** DESKTOP / Manager
**Issue:** #146 · **Design source:** `DevNotes/DesignPrompts/Desktop/Prod-Goal-Ramping-Daily-Plan-design.md`

**Roles** (decided 2026-11-16; enforced by the API):

| Action | Who |
|---|---|
| Open the screen; edit ramping overrides and Daily Plan targets | LWW, OM, System Admin |
| Change prod goal rates; cancel a scheduled change | OM, System Admin |

ICQA is excluded unless they hold one of those roles. Ramping and targets cover the viewer's home department; goals are global.

## Sections

### Daily Plan

1. Choose a date and the Day / Night shift running that date (defaults to the viewer's home shift).
2. Three read-only reference panels:
   - **Daily Drop** — simulated company-wide store-order volume per pull function (CA, CF, FP, BKP, BK), deterministic per date.
   - **Staffing** — the department's scheduled team members, minus anyone whose whole scheduled shift is Time Off on the Job/Function Assignment roster (broken down by attendance code), and the net available. Partial time off (e.g. VLE) still counts as available.
   - **Other departments** — each staffed department's net headcount and any targets it has. No per-worker detail.
3. One target box per function that has a goal. A blank box shows the simulated target the roster uses as its placeholder. **Needs** updates live: target ÷ (goal rate × full shift hours), rounded up — 18,000 cartons at 180/hr on a 10-hour shift needs 10.
4. **Save targets** writes the department's targets; clearing a box removes the entered target, and the roster goes back to the simulated one. Reference numbers never limit what can be entered.

### Ramping

- Add an override:
  - **Worker** — type-ahead over the department's team members;
  - **Function**;
  - **% of goal** — 1–99;
  - **Starts** — defaults to today;
  - **Ends** — optional; blank means ongoing.
- Current and upcoming overrides are listed. Percent can be edited in place; **End today** closes an active one; **Remove** deletes.
- One override per worker and function at a time: an overlapping one is refused.
- Ramping weights the worker's contribution to Job/Function Assignment's plan projection and shows as a RAMP badge there.

### Prod Goals

- Each function's rate today and the date it took effect, plus scheduled changes and a **History** of past rates.
- OM / Admin: **Change** sets a new rate from an effective date (today or later; back-dating is refused). The unit and any secondary rate carry over. A change on a date that already has one replaces it. A scheduled change can be **Cancel**led before it starts.

## Data

| Endpoint | Does |
|---|---|
| `GET /api/prod-goals` | Goals now, upcoming, history |
| `POST /api/prod-goals` | `{ functionCode, rate, effectiveDate }` (OM / Admin) |
| `DELETE /api/prod-goals/{id}` | Cancel a future change (OM / Admin) |
| `GET /api/ramping` | Current + upcoming overrides, department team members, functions |
| `POST /api/ramping` | `{ workerZ, functionCode, percent, startDate?, endDate? }` |
| `PATCH /api/ramping/{id}` | Any of `{ percent, startDate, endDate }` |
| `DELETE /api/ramping/{id}` | Remove |
| `GET /api/daily-plan?date&shift` | Reference panels and target lines (`shift` optional) |
| `PUT /api/daily-plan` | `{ date, shiftCode, targets: [{ functionCode, targetVolume \| null }] }` |

**Tables:** `ProdGoal` becomes dated history — an `id` key, unique per function and effective date, plus `setByZ` and `createdAt`. `RampingOverride` and `DailyPlanTarget` were created by #145.

**Rate in force:** the row with the latest effective date on or before the date in question (`shared/prodPlan.ts goalInForce`). IRP, the roster and simulated targets all read it that way (`api/lib/prodGoals.ts`).

## Behind the Scenes

- **Attendance:** read from the roster's Time Off sections, not a separate table (decided 2026-11-16).
- **Daily Drop:** generated deterministically, so it never goes stale (decided 2026-11-16).
- **Dates:** stored in `@db.Date` columns are compared as `YYYY-MM-DD` strings.

## Differences from the design doc

- LWW has access (ramping and targets), not OM only.
- No `SimDailyDrop` / `SimAttendanceException` tables.
- No `JobFunction` table; functions come from the department's function list.

## Open items still remaining

- Editing a function's secondary rate (BKP, BK) and units.
- Other departments' function lists, so they can enter targets.

## Change Log

- **2026-11-16:** first build (#146).
