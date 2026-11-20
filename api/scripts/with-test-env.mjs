#!/usr/bin/env node
/**
 * Runs a Node script with api/.env.test's values applied over the inherited environment,
 * after checking that DATABASE_URL is the Docker test database (issue #241). Replaces
 * `node --env-file=.env.test`, which lets an exported DATABASE_URL win over the file.
 *
 *   node scripts/with-test-env.mjs <script> [args...]
 *
 * Used by package.json's start:test, test:db and test:api. Exits with the child's code.
 */
import { spawn } from 'node:child_process';
import { readTestEnv } from './testEnv.mjs';

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error('Usage: node scripts/with-test-env.mjs <script> [args...]');
  process.exit(2);
}

let env;
try {
  env = readTestEnv();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const child = spawn(process.execPath, [script, ...args], { env, stdio: 'inherit' });

// Pass Ctrl+C / a test runner's shutdown on to the child rather than orphaning it.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

// A child ended by a signal has no exit code; report that as a failure.
child.on('exit', (code) => process.exit(code ?? 1));
