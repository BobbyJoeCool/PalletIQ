// Shared plumbing for the API handler suite (test plan Part 2, #237).
//
// Each test file runs in its own process (node:test's default), loads every route through
// routes.ts, and starts the real Express app on a free port against the isolated Docker
// test database (`npm run test:api` loads api/.env.test; `npm run test:db:up` first).
// Requests go over real HTTP, so routing, JSON parsing, auth headers and status codes are
// all exercised exactly as the apps see them.
import { after } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import '../../routes.js';
import { app } from '../../lib/functionsRuntime.js';
import prisma from '../../lib/prisma.js';

if (!process.env.DATABASE_URL?.includes(':3307/palletiq_test')) {
  throw new Error('The API suite must run against the Docker test database (api/.env.test). Use "npm run test:api".');
}

/** Seeded demo accounts (api/prisma/seed.ts). Tablet PIN 1234; desktop password Desktop1234. */
export const USERS = {
  worker: 'z002p21', // Tyler, WORKER
  im: 'z002p22', // Sarah, IM
  icqaManager: 'z002p24', // Diana, MANAGER, home department ICQA
  lead: 'z930l01', // Nerva, LEAD (LWW), WHS
  manager: 'z930m01', // Hadrian, MANAGER (OM), WHS
  rosterWorker: 'z830t01', // Titus, WORKER, no desktop access
} as const;

// Started at import (top-level await), so the server is listening before any test file's
// own hooks run — a root-level before() here could run after the importing file's.
let server!: Server;
await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

export interface ApiResponse<T = Record<string, unknown>> { status: number; body: T }

/** One JSON request to the running API. */
export async function call<T = Record<string, unknown>>(
  method: string, path: string, opts: { token?: string; body?: unknown } = {},
): Promise<ApiResponse<T>> {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(opts.token && { 'X-Auth-Token': opts.token }) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body: body as T };
}

const tokens = new Map<string, string>();

/** A tablet session token for a seeded user (cached per process). */
export async function tabletToken(zNumber: string): Promise<string> {
  const key = `tablet:${zNumber}`;
  if (!tokens.has(key)) {
    const res = await call<{ token: string }>('POST', '/auth/login', { body: { zNumber, pin: '1234' } });
    if (res.status !== 200) throw new Error(`login ${zNumber} failed: ${res.status} ${JSON.stringify(res.body)}`);
    tokens.set(key, res.body.token);
  }
  return tokens.get(key)!;
}

/** A desktop session token for a seeded desktop-eligible user (cached per process). */
export async function desktopToken(zNumber: string): Promise<string> {
  const key = `desktop:${zNumber}`;
  if (!tokens.has(key)) {
    const res = await call<{ token: string }>('POST', '/auth/desktop-login', { body: { zNumber, password: 'Desktop1234' } });
    if (res.status !== 200) throw new Error(`desktop login ${zNumber} failed: ${res.status} ${JSON.stringify(res.body)}`);
    tokens.set(key, res.body.token);
  }
  return tokens.get(key)!;
}

export { prisma };
