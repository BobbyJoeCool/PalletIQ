// Unit tests for the HTTP plumbing: response helpers, JWT signing, the auth/role/desktop
// gates (test plan Part 2, #237). Pure — no DB (requireDesktopAccess's DB lookup is
// covered by the API suite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { json, withHandler } from '../../lib/response.js';
import { signToken, verifyToken } from '../../lib/jwt.js';
import { requireAuth, requireRole, hasMinRole } from '../../lib/permissions.js';
import { requireOmOrIcqa, type DesktopActor } from '../../lib/desktopAccess.js';
import type { HttpRequest, InvocationContext } from '../../lib/functionsRuntime.js';

const ctx: InvocationContext = { log: () => {}, error: () => {} };

/** A request carrying only the given headers. */
function req(headers: Record<string, string> = {}): HttpRequest {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { url: 'http://localhost/api/x', headers: { get: (n) => lower[n.toLowerCase()] ?? null }, params: {}, json: async () => ({}) };
}

/** Thrown-error matcher for the handlers' `Object.assign(new Error(code), { status })` shape. */
const httpError = (code: string, status: number) => (e: Error & { status?: number }) => e.message === code && e.status === status;

test('json: serializes the body with a JSON content type; status defaults to 200', () => {
  assert.deepEqual(json({ a: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
  assert.equal(json(null, 201).status, 201);
  assert.equal(json(null).body, 'null');
});

test('withHandler: a returned value becomes a 200 JSON response', async () => {
  const res = await withHandler(async () => ({ ok: true }))(req(), ctx);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body!), { ok: true });
});

test('withHandler: a thrown error with a status keeps its status and code, plus any data', async () => {
  const res = await withHandler(async () => {
    throw Object.assign(new Error('LEVEL_MISMATCH'), { status: 409, data: { scanned: 3, actual: 4 } });
  })(req(), ctx);
  assert.equal(res.status, 409);
  assert.deepEqual(JSON.parse(res.body!), { error: 'LEVEL_MISMATCH', scanned: 3, actual: 4 });
});

test('withHandler: an error without a status is a 500; a non-Error throw is INTERNAL_ERROR', async () => {
  const plain = await withHandler(async () => { throw new Error('boom'); })(req(), ctx);
  assert.equal(plain.status, 500);
  assert.deepEqual(JSON.parse(plain.body!), { error: 'boom' });
  const weird = await withHandler(async () => { throw 'not an error'; })(req(), ctx);
  assert.equal(weird.status, 500);
  assert.deepEqual(JSON.parse(weird.body!), { error: 'INTERNAL_ERROR' });
});

test('signToken / verifyToken: round trip keeps zNumber and role', async () => {
  const token = await signToken({ zNumber: 'z002p21', role: 'WORKER' });
  assert.deepEqual(await verifyToken(token), { zNumber: 'z002p21', role: 'WORKER' });
});

test('verifyToken: rejects a token signed with another secret', async () => {
  const foreign = await new SignJWT({ zNumber: 'z1', role: 'ADMIN' })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h')
    .sign(Buffer.from('some-other-secret'));
  await assert.rejects(verifyToken(foreign));
});

test('verifyToken: rejects an expired token', async () => {
  const expired = await new SignJWT({ zNumber: 'z1', role: 'WORKER' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(Buffer.from(process.env.JWT_SECRET!));
  await assert.rejects(verifyToken(expired));
});

test('verifyToken: rejects a tampered payload', async () => {
  const token = await signToken({ zNumber: 'z002p21', role: 'WORKER' });
  const [h, , s] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ zNumber: 'z002p21', role: 'ADMIN' })).toString('base64url');
  await assert.rejects(verifyToken(`${h}.${forged}.${s}`));
});

test('requireAuth: reads X-Auth-Token; missing or invalid tokens are 401', async () => {
  const token = await signToken({ zNumber: 'z002p22', role: 'IM' });
  assert.deepEqual(await requireAuth(req({ 'X-Auth-Token': token })), { zNumber: 'z002p22', role: 'IM' });
  await assert.rejects(requireAuth(req()), httpError('UNAUTHORIZED', 401));
  await assert.rejects(requireAuth(req({ 'X-Auth-Token': 'garbage' })), httpError('UNAUTHORIZED', 401));
  // A Bearer token in Authorization is not read (see permissions.ts on the Azure proxy).
  await assert.rejects(requireAuth(req({ Authorization: `Bearer ${token}` })), httpError('UNAUTHORIZED', 401));
});

test('requireRole / hasMinRole: rank order WORKER < IM < LEAD < MANAGER < ADMIN', () => {
  assert.equal(hasMinRole('IM', 'WORKER'), true);
  assert.equal(hasMinRole('IM', 'IM'), true);
  assert.equal(hasMinRole('IM', 'LEAD'), false);
  assert.doesNotThrow(() => requireRole({ zNumber: 'z', role: 'ADMIN' }, 'MANAGER'));
  assert.throws(() => requireRole({ zNumber: 'z', role: 'WORKER' }, 'IM'), httpError('FORBIDDEN', 403));
});

test('requireOmOrIcqa: MANAGER/ADMIN or home department ICQA; LEAD elsewhere is 403', () => {
  const actor = (role: DesktopActor['role'], departmentId: string): DesktopActor => ({ zNumber: 'z', role, departmentId });
  assert.doesNotThrow(() => requireOmOrIcqa(actor('MANAGER', 'WHS')));
  assert.doesNotThrow(() => requireOmOrIcqa(actor('ADMIN', 'WHS')));
  assert.doesNotThrow(() => requireOmOrIcqa(actor('WORKER', 'IQA')));
  assert.throws(() => requireOmOrIcqa(actor('LEAD', 'WHS')), httpError('FORBIDDEN', 403));
});
