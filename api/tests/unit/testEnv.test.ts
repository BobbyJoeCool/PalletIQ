// Unit tests for scripts/testEnv.mjs (#241): the guard that keeps every test-database
// command (test:db:up/reset, start:test, test:db, test:api) off the dev database. Pure — no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertTestDatabaseUrl, buildTestEnv, TEST_ENV_FILE } from '../../scripts/testEnv.mjs';

const TEST_URL = 'mysql://root:palletiq_test@127.0.0.1:3307/palletiq_test';
const DEV_URL = 'mysql://palletiq:devpass@127.0.0.1:3306/palletiq';

test('assertTestDatabaseUrl: accepts the Docker test database on 127.0.0.1 or localhost', () => {
  assert.doesNotThrow(() => assertTestDatabaseUrl(TEST_URL));
  assert.doesNotThrow(() => assertTestDatabaseUrl('mysql://root:x@localhost:3307/palletiq_test'));
});

test('assertTestDatabaseUrl: refuses the dev database, other ports, hosts and names', () => {
  for (const url of [
    DEV_URL,
    'mysql://root:x@127.0.0.1:3306/palletiq_test', // dev port
    'mysql://root:x@127.0.0.1/palletiq_test', // default port (3306)
    'mysql://root:x@db.example.com:3307/palletiq_test', // remote host
    'mysql://root:x@127.0.0.1:3307/palletiq', // dev database name
    'mysql://root:x@127.0.0.1:3307/palletiq_test_old', // prefix match is not enough
    'postgres://root:x@127.0.0.1:3307/palletiq_test', // wrong protocol
  ]) {
    assert.throws(() => assertTestDatabaseUrl(url), /Refusing to run/, url);
  }
});

test('assertTestDatabaseUrl: refuses a missing or malformed URL', () => {
  assert.throws(() => assertTestDatabaseUrl(undefined), /missing or not a valid URL/);
  assert.throws(() => assertTestDatabaseUrl(''), /missing or not a valid URL/);
  assert.throws(() => assertTestDatabaseUrl('not a url'), /missing or not a valid URL/);
});

test('assertTestDatabaseUrl: the error names the target but not its password', () => {
  assert.throws(
    () => assertTestDatabaseUrl(DEV_URL),
    (err: Error) => err.message.includes('127.0.0.1:3306/palletiq') && !err.message.includes('devpass'),
  );
});

test('buildTestEnv: the file overrides an inherited DATABASE_URL (the Codex #240 case)', () => {
  const env = buildTestEnv(`DATABASE_URL="${TEST_URL}"\nPORT=7072\n`, { DATABASE_URL: DEV_URL, HOME: '/home/x' });
  assert.equal(env.DATABASE_URL, TEST_URL);
  assert.equal(env.PORT, '7072');
  assert.equal(env.HOME, '/home/x'); // keys the file doesn't set are kept
});

test('buildTestEnv: leaves the inherited env object untouched', () => {
  const base = { DATABASE_URL: DEV_URL };
  buildTestEnv(`DATABASE_URL="${TEST_URL}"\n`, base);
  assert.equal(base.DATABASE_URL, DEV_URL);
});

test('buildTestEnv: refuses when the file does not set a test DATABASE_URL', () => {
  // No DATABASE_URL in the file: the inherited dev URL survives, so it must be refused.
  assert.throws(() => buildTestEnv('PORT=7072\n', { DATABASE_URL: DEV_URL }), /Refusing to run/);
  assert.throws(() => buildTestEnv(`DATABASE_URL="${DEV_URL}"\n`, {}), /Refusing to run/);
});

test('the committed api/.env.test passes the guard', () => {
  const env = buildTestEnv(readFileSync(TEST_ENV_FILE, 'utf8'), {});
  assert.equal(env.DATABASE_URL, TEST_URL);
});
