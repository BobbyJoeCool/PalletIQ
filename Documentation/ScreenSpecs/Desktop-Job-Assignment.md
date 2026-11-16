# Screen Design: Job/Function Assignment (Desktop)

**Device:** DESKTOP — the Electron app in `apps/desktop-app/`, route `/screens/job-assignment`
**Bucket:** DESKTOP / Manager
**Roles:** LWW (LEAD), OM (MANAGER), System Admin. ICQA does not get this screen unless they hold one of those roles. Each viewer sees their own home department.
**Issue:** #145 · **Design source:** `DevNotes/DesignPrompts/Desktop/Job-Function-Assignment-design.md` (the layout below replaces its column layout — decided 2026-11-16)

## Concepts

- **Shifts:** A1 / A2 run Sat–Mon (6a–6p, 6p–6a), B1 / B2 run Tue–Fri (6a–4p, 4p–2a), each with two breaks. Productive hours = length minus breaks (A1: 11h05m).
- **Roster:** team members (WORKER, IM) of the viewer's department whose home shift is the selected shift and who are scheduled that day, plus anyone who already has time on the shift.
- **Simulated myTime schedule:** everyone is scheduled for the whole shift on the days it runs, except about one day in ten that ends 2–4 hours early. Deterministic per worker and date — no stored rows, never stale.
- **Timeline:** each worker's shift is a sequence of sections, each a job function, **Downtime** (`DTM`, with a reason) or **Time Off** (`OFF`, with an attendance code). Unassigned time is allowed and flagged.
- **Reasons**
  - Downtime: Training, Meeting, Cleaning / Spill, Equipment Down, Waiting on Freight, Safety, Other (note required).
  - Attendance:

    | Code | Meaning |
    |---|---|
    | VLE | Voluntary Leave Early — approved, unpaid |
    | VNS | Voluntary Not Scheduled — approved, unpaid full shift |
    | COF | Call Off — unapproved, unpaid |
    | VAC | Vacation — paid |
    | SCK | Sick — paid, protected |
    | LOA | FMLA / LOA — approved by HR |
    | OTH | Other — note required |

## Flow

1. Opens on today and the viewer's home shift (or that date's day shift if the home shift doesn't run that day). The date picker and the Day / Night toggle switch.
2. **Sticky header** (stays visible while scrolling):
   - one button per job function, showing:
     - **needs** — target ÷ (goal rate × full shift hours), rounded up; 18,000 cartons at 180/hr on a 10-hour shift needs 10;
     - **staffed** — headcount on it at the staffing time, with the **effective** headcount when anyone is ramping (a worker ramping at 60% counts as 0.6);
     - **forecast** — volume the staffing will produce (each worker's hours × rate × ramping %) against the target, with the percent;
   - Downtime and Time Off;
   - the time axis.

   The staffing time is wherever the pointer is over a bar, otherwise now (or shift start for another day).
3. **Rows:** name (with zNumber, schedule, RAMP badges), start time box, timeline bar, finish time box. A ⚠ marks unassigned scheduled time.
4. **Start of day / bulk assign:**
   - Select names: click; Shift-click for a range; Ctrl/Cmd-click to add or remove one; or use **Select all**.
   - Click a function. Every selected worker's unassigned scheduled time becomes that function.
   - If any selected worker already has assigned time, a dialog lists every conflict with an **Override** checkbox each (plus Override all / Ignore all). Overridden workers get the new function for their whole scheduled time; the rest only have their gaps filled.
   - Downtime / Time Off ask for the reason first.
5. **Changing times:**
   - Drag a section's edge. It snaps to 15 minutes; where two sections touch, the divider moves both.
   - Or type the worker's start / finish time. An earlier start extends the first section back; a later one leaves that time unassigned. The finish works the same way at the other end.
6. **Split:** double-click a bar. The dialog opens with the split time where you clicked and before / after doing what the section did. Any of these can be changed before **Confirm** or **Cancel**:
   - the split time;
   - the before section's start and function;
   - the after section's end and function.
7. **Edit:** click a section to change its function, reason or times, or **Clear section**. Click a hatched (unassigned) stretch to assign it.
8. **Call up a function:** with nobody selected, clicking a function moves everyone who worked it at any point to the top and dims everyone else's other sections. Click again to clear.
9. Every save shows a brief "Saved".

## Error handling

The server re-checks every timeline: sections inside the shift, in order, not overlapping, a known code, and a reason exactly where one is needed. A rejected save shows the reason and leaves the roster as it was. Messages: `apps/desktop-app/src/lib/rosterFormat.ts`.

## Data

| Endpoint | Does |
|---|---|
| `GET /api/roster?date=YYYY-MM-DD&shift=B1` | Shift timing, plan lines, workers with schedules, ramping and timelines (`shift` optional) |
| `PUT /api/roster` | `{ date, shiftCode, timelines: [{ workerZ, segments }] }` — each replaces that worker's sections for the shift; all or nothing |

**Tables:** `Shift`, `ShiftBreak`, `DailyPlanTarget`, `RampingOverride` (new); `User.homeShiftCode`; `FunctionAssignment.shiftCode`, `reasonCode`, `reasonText`. Rows written before this screen (IRP demo data, no shift) count as part of a shift when they start inside it.

**Plan targets:** an OM-entered `DailyPlanTarget` row wins; otherwise a simulated target (a typical headcount × goal rate × productive hours, ±15% per date), marked as simulated in the button tooltip. GPM and CON have no goal, so no target.

**Change log:** saving a worker who already had sections writes a `ScanLog` entry (`FUNC_ASSIGN_CHANGE`, before and after). A worker's first assignment of the shift is not logged, since there is no "before".

## Behind the Scenes

- All timeline operations (overlay, fill gaps, split, clear, validation), staffing math and the simulation are pure functions in `shared/workforce.ts`, used by both the screen and the API.
- Staffing vs plan is a projection from who is assigned, not actual production (that is Team Prod Summary / IRP).
- Two leads editing the same worker at once: the later save wins.

## Open items still remaining

- Other departments' function lists (only WHS is defined).
- Daily Plan target entry and ramping edits come with #146.
- Attendance codes are recorded here; #146's staffing panel should read them rather than a separate attendance table.

## Change Log

- **2026-11-16:** staffing forecast uses full shift hours (breaks built into the rate); ramping workers count at their percent in effective headcount and the forecast (direct instruction).
- **2026-11-16:** first build (#145). Timeline layout, bulk assign with a conflict dialog, split dialog, attendance codes and Roman demo roster decided with the user.
