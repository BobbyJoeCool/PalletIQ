import { _electron, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Shared plumbing for the desktop e2e specs: launching the app, signing in, the API. */

export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const API_URL = (process.env.PALLETIQ_API_URL ?? 'http://localhost:7071').replace(/\/+$/, '');
export const FLOOR_APP_URL = (process.env.PALLETIQ_FLOOR_APP_URL ?? 'http://localhost:5173').replace(/\/+$/, '');

/** Seeded demo accounts (see Documentation/seed-reference.md). Desktop password Desktop1234. */
export const USERS = {
  /** Nerva Cocceius — LEAD (LWW), WHS, home shift B1. */
  lww: { zNumber: 'z930l01', password: 'Desktop1234', firstName: 'Nerva' },
  /** Hadrian Aelius — MANAGER (OM), WHS, B1. */
  om: { zNumber: 'z930m01', password: 'Desktop1234', firstName: 'Hadrian' },
  /** Diana Kowalski — MANAGER, home department ICQA. */
  icqa: { zNumber: 'z002p24', password: 'Desktop1234', firstName: 'Diana' },
  /** Titus Flamininus — WORKER, B1: no desktop access. */
  worker: { zNumber: 'z830t01', password: 'Desktop1234', firstName: 'Titus' },
} as const;
export type DemoUser = (typeof USERS)[keyof typeof USERS];

/** Ctrl on Windows/Linux, Cmd on macOS (where Ctrl-click opens a context menu). */
export const TOGGLE_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * Launches the built desktop app. ELECTRON_RUN_AS_NODE is dropped from the environment:
 * some hosts (e.g. VS Code terminals) export it, which makes Electron start as plain Node.
 */
export async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  const app = await _electron.launch({ args: [APP_DIR], cwd: APP_DIR, env });
  const window = await app.firstWindow();
  // The first window can be reported before the app's page has loaded; wait for React.
  await window.waitForURL(/^app:\/\/palletiq\//);
  await window.waitForSelector('#root > *');
  return { app, window };
}

/** A JSON API call with a session token. */
export async function api<T = unknown>(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as T };
}

/** Signs in through the API (no UI) and returns the session. */
export async function apiLogin(user: DemoUser): Promise<{ token: string; user: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}/api/auth/desktop-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zNumber: user.zNumber, password: user.password }),
  });
  const body = (await res.json()) as { token?: string; user?: Record<string, unknown>; error?: string };
  if (!body.token || !body.user) throw new Error(`Desktop login failed for ${user.zNumber}: ${body.error ?? res.status}`);
  return { token: body.token, user: body.user };
}

/** Puts a real session into the app's storage and reloads, landing on Home signed in. */
export async function signInAs(window: Page, user: DemoUser): Promise<string> {
  const session = await apiLogin(user);
  await window.evaluate(
    ([token, u]) => {
      localStorage.setItem('palletiq_desktop_token', token as string);
      localStorage.setItem('palletiq_desktop_user', JSON.stringify(u));
    },
    [session.token, session.user] as const,
  );
  // Start from Home, whatever screen was open: the greeting only shows there.
  await window.evaluate(() => globalThis.location.assign("/"));
  await expect(window.getByRole('heading', { name: `Welcome, ${user.firstName}` })).toBeVisible();
  return session.token;
}

/** Clears any stored session and returns to the login screen. */
export async function signOutStorage(window: Page): Promise<void> {
  await window.evaluate(() => {
    localStorage.clear();
    globalThis.location.assign("/login");
  });
  await expect(window.getByRole('button', { name: 'Sign in' })).toBeVisible();
}

/** Opens a screen from the side navigation. */
export async function openScreen(window: Page, name: string | RegExp): Promise<void> {
  await window.getByRole('navigation', { name: 'Screens' }).getByRole('link', { name }).click();
}

/** @returns "YYYY-MM-DD" for the next given weekday after today (0 = Sunday … 6 = Saturday). */
export function nextWeekday(day: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== day) d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @returns today as "YYYY-MM-DD", local time */
export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
