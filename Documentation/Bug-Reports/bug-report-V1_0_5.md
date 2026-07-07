# Bug Report V1.0.5

### Feature Change: Tab-out/blur on filled field should trigger OK action

- **Type:** Feature Change
- **Screen / Feature:** STG
- **Environment:** *(blank — not relevant for feature change)*
- **Priority:** <Blocker | Major/Important | Minor | Nice-to-have/Cosmetic>

**Current / actual behavior:** Moving focus away from a filled field does nothing on its own — the user must click OK to trigger the update.

**Desired / expected behavior:** When a field is filled and focus moves away from it (e.g., via click or tab to the next field), that should behave the same as hitting OK — the screen should update automatically.

**Steps to reproduce:** *(feature change — general scenario)* User enters a number/code into a field, then clicks or tabs into the next field without pressing OK.

**Why this matters:** For faster navigation. Users commonly enter a number/code and click straight into the next field, expecting the screen to update as if they'd hit OK.

**Additional notes:**

### Feature Change: Zone map should only refresh when aisle changes

- **Type:** Feature Change
- **Screen / Feature:** STG
- **Environment:** *(blank — not relevant for feature change)*
- **Priority:** <Blocker | Major/Important | Minor | Nice-to-have/Cosmetic>

**Current / actual behavior:** When the screen updates with staging information, the zone map redraws/updates every time, regardless of whether the aisle changed.

**Desired / expected behavior:** The zone map should only update when the aisle actually changes.

**Steps to reproduce:** *(feature change — general scenario)* Update staging information on the screen where the aisle stays the same as the previous entry; zone map still refreshes unnecessarily.

**Why this matters:** Faster processing — avoids redundant re-rendering of the zone map when nothing relevant to it has changed.

**Additional notes:**

### Bug: App doesn't lock to landscape orientation on iPhone

- **Type:** Bug
- **Screen / Feature:** Not screen-specific — app wide, including the numbers/login screen
- **Environment:** Production — iPhone
- **Logged in as:** <zNumber and role, or "not logged in">
- **Priority:** <Blocker | Major/Important | Minor | Nice-to-have/Cosmetic>

**Current / actual behavior:** On iPhone, the app shows in portrait mode, app wide — including the numbers/login screen.

**Desired / expected behavior:** The app should default to landscape mode and lock it (prevent rotation back to portrait) across the whole app, including the numbers/login screen, for testing.

**Steps to reproduce:**
1. Open the app on an iPhone in production (any screen, including numbers/login).
2. Observe the screen displays in portrait orientation.
3.

**Why this matters:** *(optional for bugs)*

**Additional notes:**
