# Desktop app e2e tests

Playwright drives the **built** Electron app against the real local API and database.

## Running

1. Start the API with migrations applied: `cd ../../api && npm start` (port 7071).
2. Optional, for the Embedded Floor App spec: start the floor app, `cd ../floor-app && npm run dev` (port 5173). Without it that spec skips itself.
3. From `apps/desktop-app`: `npm run test:e2e` (builds, then runs). `npm run test:e2e:only` skips the build.

`PALLETIQ_API_URL` / `PALLETIQ_FLOOR_APP_URL` override the defaults.

## Data

The specs sign in as the seeded Roman demo roster (`z930l01` LWW, `z930m01` OM) and Diana (`z002p24`, ICQA), all with the desktop password `Desktop1234`. Each spec puts back what it changes:

- carve-outs and contraction on aisle 318;
- test timelines on next Tuesday's B1 roster;
- a Daily Plan target, a ramping override and a scheduled goal change.

Location Setup also creates and deletes test aisle **998**, which stays behind as soft-deleted rows (hidden everywhere; re-creating 998 reuses them).

The suite runs serially with no retries, like the floor app's, because the specs share one database.
