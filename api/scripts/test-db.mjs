#!/usr/bin/env node
/**
 * Manages the isolated E2E test database (issue #236): a Docker MySQL on port 3307,
 * defined in ../docker-compose.test.yml, never the dev database on 3306.
 *
 *   node scripts/test-db.mjs up      start it, sync the schema, seed if it has no users
 *   node scripts/test-db.mjs reset   drop every table, recreate the schema, reseed
 *   node scripts/test-db.mjs down    stop the container (the named volume keeps the data)
 *
 * Run from api/ (the npm scripts do). Every Prisma command runs with api/.env.test loaded
 * through `node --env-file`, so DATABASE_URL points at the test server; prisma.config.ts's
 * own `dotenv/config` never overrides a variable that is already set.
 *
 * The schema comes from `prisma db push` (schema.prisma as it is now), not `migrate
 * deploy`: some migrations insert demo rows that depend on seeded data (e.g.
 * 20261116140000_job_assignment adds users that reference Department rows), so the
 * migration history cannot replay onto an empty database. seed.ts creates all of that data
 * itself, so a pushed schema plus the seed gives the same starting state.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_FILE = resolve(API_DIR, '../docker-compose.test.yml');
const CONTAINER = 'palletiq-mysql-test';
const PRISMA_CLI = resolve(API_DIR, 'node_modules/prisma/build/index.js');
const TSX_CLI = resolve(API_DIR, 'node_modules/tsx/dist/cli.mjs');

/** Runs a command in api/, streaming its output; throws on a non-zero exit. */
function run(cmd, args) {
  execFileSync(cmd, args, { cwd: API_DIR, stdio: 'inherit' });
}

/** Runs a command with api/.env.test loaded, so it only ever sees the test database. */
function runWithTestEnv(script, args) {
  run(process.execPath, ['--env-file=.env.test', script, ...args]);
}

/** Runs one SQL statement inside the test container and returns its trimmed output. */
function sql(statement) {
  return execFileSync(
    'docker',
    ['exec', CONTAINER, 'mysql', '-uroot', '-ppalletiq_test', '-N', '-B', 'palletiq_test', '-e', statement],
    { cwd: API_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}

/** Number of seeded users, or 0 when the table does not exist yet. */
function userCount() {
  try {
    return Number(sql('SELECT COUNT(*) FROM `User`')) || 0;
  } catch {
    return 0;
  }
}

/** Tables the seed must have filled, checked after it runs (it creates them in this order). */
const SEEDED_TABLES = ['User', 'Location', 'Pallet', 'Container', 'ActivityLog'];

/** Seeds the test DB and confirms it worked: seed.ts logs errors without failing the
 *  process, and fails partway through, so every table it fills is checked, not just one. */
function seed() {
  runWithTestEnv(TSX_CLI, ['prisma/seed.ts']);
  const counts = SEEDED_TABLES.map((t) => [t, Number(sql(`SELECT COUNT(*) FROM \`${t}\``)) || 0]);
  const empty = counts.filter(([, n]) => n === 0).map(([t]) => t);
  if (empty.length) throw new Error(`Seeding the test database failed: no rows in ${empty.join(', ')} (see the output above).`);
  console.log(`Test database seeded (${counts.map(([t, n]) => `${t} ${n}`).join(', ')}).`);
}

function up() {
  run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait']);
  // No --accept-data-loss: if schema.prisma has changed in a way that would drop data,
  // this stops and points at test:db:reset rather than silently deleting rows.
  runWithTestEnv(PRISMA_CLI, ['db', 'push']);
  if (userCount() === 0) seed();
  else console.log('Test database already seeded; leaving its data as is. Use "npm run test:db:reset" for a fresh copy.');
}

function reset() {
  run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait']);
  // Drops and recreates the database inside the test container itself (addressed by
  // container name, so this can never reach the dev server on 3306), then pushes the
  // schema onto the empty database: no destructive Prisma command needed.
  sql('DROP DATABASE IF EXISTS palletiq_test; CREATE DATABASE palletiq_test;');
  runWithTestEnv(PRISMA_CLI, ['db', 'push']);
  seed();
}

function down() {
  run('docker', ['compose', '-f', COMPOSE_FILE, 'stop']);
}

const commands = { up, reset, down };
const command = process.argv[2];
if (!commands[command]) {
  console.error('Usage: node scripts/test-db.mjs <up|reset|down>');
  process.exit(2);
}
try {
  commands[command]();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
