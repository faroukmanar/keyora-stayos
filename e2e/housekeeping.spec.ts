import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Requires the local API with the synthetic seed (see docs/operations/housekeeping.md).
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100';
const propertyId = '10000000-0000-4000-8000-000000000002';
const seedRoomTypeId = '10000000-0000-4000-8000-000000000004';
const password = process.env.KEYORA_E2E_PASSWORD ?? 'Local-Test-Only!2026';

test.describe.configure({ timeout: 180_000 });

async function signIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  // First load can include a cold dev bundle.
  await page.getByLabel('Work email').waitFor({ timeout: 120_000 });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Property ID').fill(propertyId);
  await page.getByRole('button', { name: 'Open operations desk' }).click();
  await page.waitForURL(/dashboard/);
  return page;
}

test('housekeeper completes a room turn and managers see it live', async ({ browser, request }) => {
  const login = await request.post(`${apiUrl}/v1/auth/login`, { data: { email: 'owner@demo.keyora.test', password, propertyId, clientType: 'native', deviceName: 'Playwright fixture' } });
  expect(login.ok()).toBeTruthy();
  const headers = { authorization: `Bearer ${(await login.json()).accessToken}` };
  const roomName = `E2E Turn ${randomUUID().slice(0, 8)}`;
  const room = await request.post(`${apiUrl}/v1/properties/${propertyId}/rooms`, { headers: { ...headers, 'idempotency-key': randomUUID() }, data: { roomTypeId: seedRoomTypeId, name: roomName } });
  expect(room.status()).toBe(201);
  const task = await request.post(`${apiUrl}/v1/properties/${propertyId}/housekeeping/tasks`, { headers: { ...headers, 'idempotency-key': randomUUID() }, data: { roomId: (await room.json()).id, priority: 'rush', inspectionRequired: false, dueAt: new Date(Date.now() + 3_600_000).toISOString() } });
  expect(task.status()).toBe(201);

  const manager = await signIn(browser, 'manager@demo.keyora.test');
  await manager.goto('/housekeeping');
  const managerCard = manager.getByRole('button', { name: new RegExp(`^${roomName}, Ready to start`) });
  await expect(managerCard).toBeVisible({ timeout: 30_000 });

  const housekeeper = await signIn(browser, 'housekeeping@demo.keyora.test');
  await housekeeper.goto('/housekeeping');
  await expect(housekeeper.getByRole('button', { name: new RegExp(`^${roomName},`) })).toBeVisible({ timeout: 30_000 });
  const card = housekeeper.locator('div', { has: housekeeper.getByRole('button', { name: new RegExp(`^${roomName},`) }) }).last();
  await card.getByRole('button', { name: 'Start turn' }).click();
  await expect(housekeeper.getByRole('button', { name: new RegExp(`^${roomName}, In progress`) })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Mark room ready' })).toHaveCount(0);

  await housekeeper.getByRole('button', { name: new RegExp(`^${roomName},`) }).click();
  const boxes = card.getByRole('checkbox');
  await expect(boxes).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    const box = boxes.nth(index);
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
  }
  await card.getByRole('button', { name: 'Mark room ready' }).click();
  await expect(housekeeper.getByRole('button', { name: new RegExp(`^${roomName}, Room ready`) })).toBeVisible();
  await expect(card.getByText(/Updated by .+ at \d{2}:\d{2}/)).toBeVisible();

  // No reload: the manager's board updates through the SSE stream.
  await expect(manager.getByRole('button', { name: new RegExp(`^${roomName}, Room ready`) })).toBeVisible({ timeout: 15_000 });
});

test('front desk sees the board read-only', async ({ browser }) => {
  const frontDesk = await signIn(browser, 'frontdesk@demo.keyora.test');
  await frontDesk.goto('/housekeeping');
  await expect(frontDesk.getByText('Live service board')).toBeVisible({ timeout: 30_000 });
  for (const label of ['Start turn', 'Mark room ready', 'Pass inspection', 'Report blocker']) {
    await expect(frontDesk.getByRole('button', { name: label })).toHaveCount(0);
  }
});
