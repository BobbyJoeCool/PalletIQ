# Floor app e2e tests

Playwright drives the floor app in Chromium at the kiosk's iPad-Pro-landscape size (1366×1024).

## Running

From `apps/floor-app`: `npm run test:e2e` (`test:e2e:ui` / `test:e2e:headed` for the interactive modes).

By default the suite runs against the **isolated Docker test database** (#236). Playwright:

1. brings the database up: `npm run test:db:up` in `api/` starts the `palletiq-mysql-test` container (port 3307, `docker-compose.test.yml`), syncs the schema from `schema.prisma`, and seeds it the first time;
2. starts a test API on :7072 (`npm run start:test`, using `api/.env.test`) and its own floor-app dev server on :5175, proxied to that API;
3. reseeds the demo data once per run (`POST /api/demo/reseed`, the same as the Reseed Test Data button).

Docker must be running. The dev servers (:7071, :5173) and the dev database are never touched. A first run takes a few minutes (image pull and seed); later runs reuse the seeded database.

| Option | Effect |
|---|---|
| `E2E_DB=dev npm run test:e2e` | Run against the dev API (:7071) and dev floor app (:5173), which must already be running, on the dev database. For smoke runs on real data. |
| `E2E_SKIP_RESEED=1` | Skip the per-run reseed, e.g. when rerunning one spec. |
| `cd ../../api && npm run test:db:reset` | Drop and reseed the test database. |
| `cd ../../api && npm run test:db:down` | Stop the test database container (its data stays in the Docker volume). |

## Data

Specs sign in as the seeded demo users (`z002p21` Tyler, WORKER; `z002p22` Sarah, IM; PIN 1234; see `helpers.ts`). `auth.setup.ts` saves both sessions to `playwright/.auth/` before the `chromium` project runs.

The suite runs serially with no retries: every spec shares one database, and a retry would repeat a write.
