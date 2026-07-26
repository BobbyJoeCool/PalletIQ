import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } });
const page = await context.newPage();
page.on('console', (msg) => console.log('CONSOLE:', msg.type(), msg.text()));
async function tapKeys(keys) { for (const ch of keys) await page.getByRole('button', { name: ch.toUpperCase(), exact: true }).click(); }
async function tapOK() { await page.getByRole('button', { name: 'OK', exact: true }).click(); }

await page.goto('http://localhost:5173/login');
await tapKeys('002p22'); await tapOK(); await tapKeys('1234');
await page.waitForURL('http://localhost:5173/');
await page.goto('http://localhost:5173/stage');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/debug-stage-0-initial.png' });

// Use aisle 310/CR/HS (untouched by prior runs) to avoid stale-state confusion
await page.locator('span:text("Aisle")').first().locator('xpath=following-sibling::button').click();
await tapKeys('310'); await tapOK();
await page.waitForTimeout(200);
await page.locator('span:text("Storage Code")').first().locator('xpath=following-sibling::button').click();
await page.getByRole('button', { name: 'C', exact: true }).click();
await page.getByRole('button', { name: 'R', exact: true }).click();
await tapOK();
await page.waitForTimeout(200);
await page.getByLabel('Master Size').selectOption('HS');
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Fill All' }).click();
await page.waitForTimeout(300);

// only fill stack 1's quantity
const qtyLabels = page.locator('span:text("QTY")');
await qtyLabels.nth(0).locator('xpath=..').click();
await tapKeys('1');
await tapOK();
await page.waitForTimeout(1500);

const goToLists = page.locator('span:text("Pallets Go To")').locator('xpath=following-sibling::div');
console.log('Stack 1 list before stage:', JSON.stringify((await goToLists.nth(0).innerText()).trim()));
await page.screenshot({ path: '/tmp/debug-stage-1-before.png' });

const stageBtn = page.getByRole('button', { name: 'STAGE' }).first();
console.log('Stage button disabled before click:', await stageBtn.isDisabled());
await stageBtn.click();
await page.waitForTimeout(2000);
console.log('Stack 1 list after stage:', JSON.stringify((await goToLists.nth(0).innerText()).trim()));
const msg = await page.locator('text=status messages appear here').isVisible().catch(() => false);
const msgBarText = await page.locator('.font-ui.text-\\[27px\\]').innerText().catch(() => 'N/A');
console.log('Message bar text after stage:', msgBarText);
await page.screenshot({ path: '/tmp/debug-stage-2-after.png' });

await browser.close();
