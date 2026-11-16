# Screen Design: Team Prod Summary (Desktop)

**Device:** DESKTOP — the Electron app in `apps/desktop-app/`, route `/screens/team-prod-summary`
**Bucket:** DESKTOP / Manager
**Roles:** every desktop user — LWW, OM, System Admin and ICQA (no ICQA exclusion, per the design). Read-only.
**Issue:** #147 · **Design source:** `DevNotes/DesignPrompts/Desktop/Team-Prod-Summary-design.md`

## Flow

1. Opens on today and the viewer's home shift (or that date's day shift). The date picker and Day / Night toggle switch.
2. Each view is either:
   - **live** — today's running shift, refreshed every minute, figures as of now; or
   - a **snapshot** — a finished shift, figures as of its end.
3. **Scan-tracked functions**
   - Large cards for PULL (CA, CF, FP, BKP, BK) and PROD (RP, HP).
   - Smaller cards for SCAN (GPM, CON).
4. **Other functions:** a Downtime card.
5. Every card has an **Expand** toggle (collapsed by default).
   - Job function cards expand into a table of each worker's hours, count, rate per hour and % to goal, with a RAMP badge where it applies.
   - The Downtime card expands into names with hours.

## Cards

| Tier | Shows |
|---|---|
| PULL | Staffed now (with how many are ramping); plan target (marked simulated when no target was entered); **Team Prod** gauge — actual rate vs standard; **% to Plan** gauge — actual / target units; **Est. finish** while the shift is live |
| PROD | As PULL, without the finish estimate |
| SCAN | Staffed now; pallets staged (GPM) / consolidated (CON) so far; pallets per hour |
| OTHER (Downtime) | Headcount |

- **Untracked functions:** BKP and BK have no data path yet; their cards say output isn't tracked.
- **Team Prod %:** actual ÷ expected, where expected is each worker's hours on the function so far × goal rate × their ramping percent (the blended standard).
- **% to Plan:** actual ÷ target. Its gauge is coloured against how much of the shift has passed, so a team on pace mid-shift isn't shown red.
- **Est. finish:** now + remaining ÷ pace, where pace is units per elapsed hour across the team. A time past the shift end shows amber with "after shift end (+1h 20m)".

## Data

`GET /api/team-prod?date=YYYY-MM-DD&shift=B1` (`shift` optional).

- **Who is on what, plan lines and ramping:** the Job/Function Assignment roster (`loadRoster`).
- **Actual output:** `ActivityLog` rows of the roster's workers for each function inside the shift window, counted by `api/lib/irpUnits.ts` (the same counting IRP uses): CA/CF cartons, FP pallets, RP puts, HP locations, GPM pallets staged, CON pallets moved.

No writes. No schema changes.

## Behind the Scenes

- **Clock time, not active time.** Goal rates are treated as including breaks (decided 2026-11-16 for staffing: 18,000 cartons at 180/hr on a 10-hour shift needs 10 people). Team Prod % and pace therefore use clock time, so a worker exactly on standard reads 100%. This departs from the design's "active working time"; the finish estimate correspondingly doesn't add separate pauses for upcoming breaks.
- **Tiers** live beside the function list in `shared/workforce.ts`, not in a `JobFunction` table (decided 2026-11-16).
- **Departments without functions:** a viewer whose home department has no function list (e.g. ICQA) is shown WHS, with a note.

## Open items still remaining

- BKP / BK output tracking.
- Other departments' function lists.

## Change Log

- **2026-11-16:** first build (#147). Decisions: SCAN cards show count + per hour; late finish shown amber with overrun; plan uses the roster's target (entered or simulated); tiers in shared code.
