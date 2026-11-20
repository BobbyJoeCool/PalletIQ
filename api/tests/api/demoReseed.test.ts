// functions/demo-reseed.ts — the Reseed Test Data endpoint (test plan Part 2, #237). The
// E2E global setups call it before every run, so this checks what they depend on: it
// succeeds and leaves printed containers and put-pending pallets to work with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, prisma } from './harness.js';

test('reseed: succeeds and leaves printed containers and put-pending pallets behind', { timeout: 300_000 }, async () => {
  const res = await call('POST', '/demo/reseed');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(await prisma.container.count({ where: { status: 'PRINTED' } }) > 0);
  assert.ok(await prisma.pallet.count({ where: { status: 'PUT_PENDING', locationAisle: null } }) > 0);
});
