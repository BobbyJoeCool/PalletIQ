import { test, expect, type Page } from '@playwright/test';

// Field sequence (#214): Tab / Back Tab move along the on-screen field boxes in layout
// order (no per-screen slot list), wrapping at both ends; a field that isn't rendered is
// never in the sequence. Exercised on PRQ's filter bar: Aisle, End Aisle, Workstation at
// Level 1 (the L3-only Bin/Level/Cartons boxes aren't rendered there).

const active = (page: Page) => page.locator('button[data-field-active="true"]');
const tab = (page: Page, key: 'Tab' | 'Back Tab') => page.getByRole('button', { name: key, exact: true }).click();

test.describe('Field sequence — Tab / Back Tab', () => {
  test.use({ storageState: 'playwright/.auth/worker.json' });

  test('Tab and Back Tab walk the rendered fields in layout order and wrap', async ({ page }) => {
    await page.goto('/reporting/pull-request');
    const fields = page.locator('button[data-numpad-field]');
    // Level 1 renders exactly Aisle, End Aisle, Workstation.
    await expect(fields).toHaveCount(3);

    await fields.nth(0).click();
    await expect(active(page)).toHaveCount(1);
    await expect(fields.nth(0)).toHaveAttribute('data-field-active', 'true');

    await tab(page, 'Tab');
    await expect(fields.nth(1)).toHaveAttribute('data-field-active', 'true');

    await tab(page, 'Back Tab');
    await expect(fields.nth(0)).toHaveAttribute('data-field-active', 'true');

    // Back Tab from the first field wraps to the last (Workstation).
    await tab(page, 'Back Tab');
    await expect(fields.nth(2)).toHaveAttribute('data-field-active', 'true');
  });
});
