# Test Plan — PalletIQ

**Issue:** #235 · **Status:** implemented (2026-11-19) · **Written:** 2026-11-18

## Where things stand

- **E2E:** broad. Playwright covers most floor-app screens (`apps/floor-app/tests/e2e/`, 21 specs) and every desktop screen (`apps/desktop-app/tests/e2e/`, 8 specs). They run against the **shared live database**, serially.
- **API unit tests:** partial. `api/tests/unit/` (Node test runner via `tsx`) covers activity events, aisle setup, audit trail, container status, demo team prod, location policy, prod plan, shared rules, team prod and workforce. `api/tests/db/` covers container lifecycle, logic gate and put redirect against a database.
- **No unit tests:** 20 of the 29 `api/lib` modules, all 23 `api/functions` handlers, and both front-end apps (40 `lib` modules and 21 contexts in the floor app, 21 `lib` modules in the desktop app).

## Goal

Unit tests for every module, E2E for every screen, and E2E that no longer depends on the live database, per `CLAUDE.md`.

## Tooling

| Layer | Tool | Location | Command |
|---|---|---|---|
| API + shared unit | Node test runner via `tsx` (existing) | `api/tests/unit/` | `npm test` in `api/` |
| Front-end unit | Vitest + React Testing Library | `apps/*/src/**/*.test.ts(x)` | `npm test` in each app |
| E2E | Playwright (existing) | `apps/*/tests/e2e/` | `npm run test:e2e` |

Claude asks Bob before adding Vitest to the two apps.

## Part 1: E2E on a local test database (do first)

The live-DB dependency makes every E2E run risky and forces serial runs. Add a local Postgres in Docker for tests, migrated with Prisma and seeded by a script that builds the same fixture data the specs expect. Point `playwright.config.ts` at it through an env file, and keep the live DB only for the physical smoke test in the End of Version Checklist. **Bob decides** whether to switch over fully or keep a live-DB mode.

## Part 2: API unit tests

### `api/lib`, untested modules (pure logic first)

1. Parsers and formats: `cidParser`, `locationParser`, `palletId`, `dpci`, `irpUnits`: valid input, every invalid shape, boundaries.
2. Rules: `eligibility`, `stagingLogic`, `zoneLogic`, `permissions`, `desktopAccess`, `prodGoals`, `reasonCodes`: each rule branch.
3. `jwt`: sign/verify round trip, expired token, wrong secret, tampered payload.
4. `response`: status codes and body shapes for success and each error helper.
5. `activityLog`, `activityRow`, `irpReporting`, `roster`: row building and aggregation with fixed inputs.
6. `containerLifecycle`, `logicGate`, `putRedirect`: already have DB tests; add pure-function unit tests for branches that don't need the DB.

### `api/functions`

For each handler (`activity`, `aisles`, `audit`, `auth`, `containerInquiry`, `containers`, `irp`, `items`, `locations`, `pallets`, `prodPlan`, `pullRequest`, `pulls`, `puts`, `reasonCodes`, `reporting`, `reservationTimer`, `roster`, `samples`, `staging`, `teamProd`, `health`, `demo-reseed`): with Prisma mocked or on the local test DB, test auth required/rejected, input validation (400s), the happy path, and not-found (404). `reservationTimer` gets a test with a frozen clock.

### `shared/`

`cidFormat`, `expiration`, `roles`, `vcpSsp`, `containerStatus`, `locationPolicy`, `aisleSetup`, `prodPlan`, `teamProd`, `workforce` are partly covered by `sharedRules.test.ts` and others. Add tests for `location.ts`, `audit.ts`, and any uncovered branches.

## Part 3: Front-end unit tests

### Floor app (`apps/floor-app/src`)

1. Pure helpers: `julianDate`, `rangeValidation`, `vcpSspValidation`, `fieldSequence`, `jumpCodes`, `fmt`, `activityFormat`, `irpFormat`, `invalidWash`, `printerPrefixes`, `sizes`, `storageCodeColors`, `zoneSummary`, `stagingHelpers`, `putSessionState`, `reasonCode`, `physicalKey`, `demoScanner`.
2. Input hooks (`renderHook`): `useDigitInput`, `useNumpadField`, `useUpcField`, `useDpciFields`, `useExpirationDateFields`, `useLocationRangeFields`, `usePalletIdField`, `useAisleField`, `useCodePickerField`, `usePhysicalKeyboardInput`, `usePutSession`.
3. Data hooks with fetch mocked: `useAisleFreightTypes`, `usePrinters`, `useReasonCodes`, `useSizes`, `useStorageCodes`, `useWorkstations`; clients `api`, `aisleApi`, `putsClient`.
4. Contexts: `AuthContext`, `NavLockContext`, `MessageBarContext`, `NumpadContext`, `ReasonCodeSessionContext`, `StagingContext`, then each screen context (`CII`, `ELA`, `ELZ`, `IID`, `ISI`, `LII`, `MNP`, `PAR`, `PII`, `PIP`, `PRQ`, `SAR`, `SDP`, `WLH`): state transitions for each step of the screen's flow.
5. `audio`, `embedHost`: mock the browser APIs.

### Desktop app (`apps/desktop-app/src`)

1. Pure helpers: `auditDrag`, `auditExport`, `auditFormat`, `locationSetupFormat`, `locationSetupGrid`, `roleLabel`, `rosterFormat`, `rosterWork`, `screens`, `session`.
2. Hooks: `useAisleView`, `useAuditPanes`, `useCodeLookups`, `useGridSelection`, `useRoster`.
3. API clients: `api`, `auditApi`, `locationSetupApi`, `prodPlanApi`, `rosterApi`, `teamProdApi`.

## Part 4: E2E gaps

Floor-app screens without a spec: **CII**, **IRP**, **IRP Hourly**, **PRQ**, and the **PIN** page (if `auth.spec.ts` doesn't already cover it). Each gets a spec for its main flow and main error state. The `ComingSoonPage` and `PlaceholderPage` screens need only a render check.

## Order of work

1. Claude sets up the local test database and moves E2E onto it (Part 1).
2. Claude writes the API `lib` tests, then the handler tests.
3. Claude adds Vitest to the floor app and writes the helper, hook and context tests.
4. Claude does the same for the desktop app.
5. Claude writes the missing floor-app E2E specs.
6. Claude updates `CLAUDE.md` and the End of Version Checklist with the new commands.

## Done when

- API, floor-app and desktop-app unit suites pass.
- `npm run test:e2e` passes in both apps against the local test database.
- Every floor and desktop screen has an E2E spec.
