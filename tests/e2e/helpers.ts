import type { Page } from '@playwright/test';

/**
 * Demo seed users (stable across test runs — always PIN 1234).
 * See api/prisma/seed.ts.
 */
export const USERS = {
  worker: { zNumber: '002p21', pin: '1234', firstName: 'Tyler', role: 'WORKER' },
  im: { zNumber: '002p22', pin: '1234', firstName: 'Sarah', role: 'IM' },
} as const;

/**
 * Taps one on-screen button per character — stands in for a worker tapping a physical
 * keypad, since none of this app's custom fields support `.fill()`.
 */
export async function tapKeys(page: Page, keys: string) {
  for (const ch of keys) {
    // exact: true matches case-sensitively — zNumbers are typed lowercase (e.g. "002p21")
    // but ZnumPad's letter keys render uppercase ("P"/"N"/"X"), so the button name lookup
    // must be uppercased even though the value passed to onChange stays lowercase.
    await page.getByRole('button', { name: ch.toUpperCase(), exact: true }).click();
  }
}

/**
 * Full manual login: types the zNumber on the ZnumPad, taps OK, then types the 4-digit
 * PIN on the PinPad (which auto-submits — no OK tap needed). Leaves the page on `/`
 * once the session is established.
 */
export async function loginManually(page: Page, zNumber: string, pin: string) {
  await page.goto('/login');
  await tapKeys(page, zNumber);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await tapKeys(page, pin);
}

/**
 * Simulates a real hardware barcode scan by dispatching raw keyboard events rather than
 * on-screen button taps. Needed for values the on-screen Numpad can't type (e.g. label IDs,
 * which include lowercase letters — see api/prisma/seed.ts's genLid) — AppShell buffers rapid
 * keydown events and replays them into the active field exactly like a demo-button deliverScan.
 * Only reaches fields inside the authenticated app shell (see AppShell.tsx); does nothing on
 * the unauthenticated Login screen, which has no scanner listener mounted.
 */
export async function hardwareScan(page: Page, value: string) {
  await page.keyboard.type(value, { delay: 0 });
  await page.keyboard.press('Enter');
}

/**
 * Reads the message bar's status-dot color class to distinguish an info (blue) message
 * from a warning (amber) one — the two share identical wording in several flows (e.g. the
 * "already stored — directing as move" message), so text alone can't tell them apart.
 * See src/components/shell/MessageBar.tsx's STATE_STYLES.
 */
export async function messageBarTone(page: Page): Promise<'info' | 'warning' | 'unknown'> {
  const dot = page.locator('span.w-3.h-3.rounded-full').first();
  const cls = (await dot.getAttribute('class')) ?? '';
  if (cls.includes('4D9FFF')) return 'info';
  if (cls.includes('F0A500')) return 'warning';
  return 'unknown';
}
