// Preloaded before every unit test file (`npm test` passes `--import ./tests/unit/setup.ts`).
//
// Unit tests never touch a database, but several modules they test import lib/prisma.ts,
// whose MariaDB adapter throws at construction when DATABASE_URL is unset. The client only
// connects on its first query, so an unreachable placeholder is enough to import those
// modules for their pure functions; a test that accidentally queries fails fast on the
// closed port instead of reaching a real database. JWT_SECRET gets a fixed test value.
process.env.DATABASE_URL = 'mysql://unit:unit@127.0.0.1:9/unit_tests_never_connect';
process.env.JWT_SECRET ??= 'unit-test-secret';
