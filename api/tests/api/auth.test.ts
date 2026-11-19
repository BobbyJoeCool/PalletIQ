// functions/auth.ts — identify, tablet login, desktop login (test plan Part 2, #237).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, USERS } from './harness.js';
import { verifyToken } from '../../lib/jwt.js';

test('identify: returns the user name, case- and space-insensitive', async () => {
  const res = await call('POST', '/auth/identify', { body: { zNumber: '  Z002P21 ' } });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['firstName', 'lastName']);
  assert.equal(res.body.firstName, 'Tyler');
});

test('identify: missing or non-string zNumber is 400; unknown user is 404', async () => {
  assert.equal((await call('POST', '/auth/identify', { body: {} })).status, 400);
  assert.equal((await call('POST', '/auth/identify', { body: { zNumber: 42 } })).status, 400);
  assert.deepEqual((await call('POST', '/auth/identify', { body: { zNumber: 'z999x99' } })), { status: 404, body: { error: 'NOT_FOUND' } });
});

test('login: correct PIN returns a token for that user and role', async () => {
  const res = await call<{ token: string; user: { zNumber: string; role: string } }>('POST', '/auth/login', { body: { zNumber: USERS.im, pin: '1234' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'IM');
  assert.deepEqual(await verifyToken(res.body.token), { zNumber: USERS.im, role: 'IM' });
});

test('login: wrong PIN 401, unknown user 404, missing fields 400', async () => {
  assert.deepEqual(await call('POST', '/auth/login', { body: { zNumber: USERS.worker, pin: '0000' } }), { status: 401, body: { error: 'INVALID_PIN' } });
  assert.equal((await call('POST', '/auth/login', { body: { zNumber: 'z999x99', pin: '1234' } })).status, 404);
  assert.equal((await call('POST', '/auth/login', { body: { zNumber: USERS.worker } })).status, 400);
  assert.equal((await call('POST', '/auth/login', { body: { pin: '1234' } })).status, 400);
});

test('desktop-login: an LWW signs in with the desktop password and gets their department', async () => {
  const res = await call<{ token: string; user: { departmentId: string; role: string } }>('POST', '/auth/desktop-login', { body: { zNumber: USERS.lead, password: 'Desktop1234' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'LEAD');
  assert.equal(res.body.user.departmentId, 'WHS');
});

test('desktop-login: ICQA counts as desktop-eligible whatever the role', async () => {
  assert.equal((await call('POST', '/auth/desktop-login', { body: { zNumber: USERS.icqaManager, password: 'Desktop1234' } })).status, 200);
});

test('desktop-login: a worker is 403 NO_DESKTOP_ACCESS; a wrong password 401; missing fields 400', async () => {
  assert.deepEqual(await call('POST', '/auth/desktop-login', { body: { zNumber: USERS.rosterWorker, password: 'Desktop1234' } }), { status: 403, body: { error: 'NO_DESKTOP_ACCESS' } });
  assert.deepEqual(await call('POST', '/auth/desktop-login', { body: { zNumber: USERS.lead, password: 'nope' } }), { status: 401, body: { error: 'INVALID_PASSWORD' } });
  assert.equal((await call('POST', '/auth/desktop-login', { body: { zNumber: USERS.lead } })).status, 400);
  assert.equal((await call('POST', '/auth/desktop-login', { body: { zNumber: 'z999x99', password: 'x' } })).status, 404);
});
