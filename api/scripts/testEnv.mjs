/**
 * Builds the environment every test-database process runs with (issue #241).
 *
 * `node --env-file=.env.test` is not enough on its own: Node gives a variable that is already
 * set in the environment precedence over the file, so a shell or CI that exports a dev
 * DATABASE_URL would point `prisma db push`, the seed, the test API and the DB suites at the
 * dev database. Here api/.env.test's values override the inherited environment instead, and
 * the resulting DATABASE_URL must name the Docker test database before anything runs.
 *
 * Used by scripts/test-db.mjs and scripts/with-test-env.mjs (the npm test scripts).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

/** api/.env.test, the committed test-only environment. */
export const TEST_ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env.test');

/** Hosts, port and database name of the Docker test MySQL (../docker-compose.test.yml). */
const TEST_DB_HOSTS = ['127.0.0.1', 'localhost'];
const TEST_DB_PORT = '3307';
const TEST_DB_NAME = 'palletiq_test';

/**
 * Throws unless `url` is a MySQL URL for the Docker test database: host 127.0.0.1 or
 * localhost, port 3307, database palletiq_test. Anything else, including a missing or
 * unparseable URL, is refused, so a test process can never be pointed at the dev server.
 *
 * @param {string | undefined} url
 * @returns {void}
 */
export function assertTestDatabaseUrl(url) {
  let parsed;
  try {
    parsed = new URL(url ?? '');
  } catch {
    throw new Error('Refusing to run: DATABASE_URL is missing or not a valid URL. Test commands only run against the Docker test database (api/.env.test).');
  }
  const ok =
    parsed.protocol === 'mysql:' &&
    TEST_DB_HOSTS.includes(parsed.hostname) &&
    parsed.port === TEST_DB_PORT &&
    parsed.pathname === `/${TEST_DB_NAME}`;
  if (!ok) {
    // Name the target without the credentials, so the error is safe to paste anywhere.
    const target = `${parsed.hostname}:${parsed.port || '(default port)'}${parsed.pathname}`;
    throw new Error(
      `Refusing to run: DATABASE_URL points at ${target}, not the Docker test database ` +
        `(127.0.0.1:${TEST_DB_PORT}/${TEST_DB_NAME}). Test commands only run against api/.env.test's database.`,
    );
  }
}

/**
 * Merges .env.test's text over `baseEnv` (the file wins on every key it sets) and checks
 * the result's DATABASE_URL. Pure: returns a new object and leaves `baseEnv` untouched.
 *
 * @param {string} envFileText contents of a .env file
 * @param {NodeJS.ProcessEnv} baseEnv the inherited environment
 * @returns {NodeJS.ProcessEnv}
 */
export function buildTestEnv(envFileText, baseEnv) {
  const env = { ...baseEnv, ...parseEnv(envFileText) };
  assertTestDatabaseUrl(env.DATABASE_URL);
  return env;
}

/**
 * Reads api/.env.test and returns process.env with its values applied on top, checked by
 * buildTestEnv. Throws if the file is missing or the URL is not the test database.
 *
 * @returns {NodeJS.ProcessEnv}
 */
export function readTestEnv() {
  return buildTestEnv(readFileSync(TEST_ENV_FILE, 'utf8'), process.env);
}
