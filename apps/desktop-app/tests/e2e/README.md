# Desktop app e2e tests

Playwright drives the **built** Electron app against the real local API and database.

## Running

From `apps/desktop-app`: `npm run test:e2e` (builds, then runs). `npm run test:e2e:only` skips the build.

By default the suite runs against the **isolated Docker test database** (#236): Playwright brings it up (`npm run test:db:up` in `api/`: start, sync the schema, seed on first use), starts a test API on :7072 and a floor-app dev server on :5175, and reseeds the demo data once per run. Docker must be running. Nothing touches the dev servers or the dev database.

- `E2E_DB=dev npm run test:e2e` runs against the dev servers instead: the API on :7071 (`cd ../../api && npm start`) and, for the Embedded Floor App spec, the floor app on :5173 (that spec skips itself otherwise).
- `E2E_SKIP_RESEED=1` skips the per-run reseed (handy when rerunning one spec).
- `cd ../../api && npm run test:db:reset` gives the test database a fresh seed.
- `PALLETIQ_API_URL` / `PALLETIQ_FLOOR_APP_URL` override the URLs in either mode.

## Data

The specs sign in as the seeded Roman demo roster (`z930l01` LWW, `z930m01` OM) and Diana (`z002p24`, ICQA), all with the desktop password `Desktop1234`. Each spec puts back what it changes:

- carve-outs and contraction on aisle 318;
- test timelines on next Tuesday's B1 roster;
- a Daily Plan target, a ramping override and a scheduled goal change.

Location Setup also creates and deletes test aisle **998**, which stays behind as soft-deleted rows (hidden everywhere; re-creating 998 reuses them).

The suite runs serially with no retries, like the floor app's, because the specs share one database (the test database by default).
