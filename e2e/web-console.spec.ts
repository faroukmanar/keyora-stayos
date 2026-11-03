import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1024, height: 900 }, { width: 1440, height: 1000 }]) {
  test(`sign-in remains usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(page.getByLabel('Work email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open operations desk' })).toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
  });
}

test('web authentication does not write bearer credentials into browser storage', async ({ page }) => {
  await page.goto('/');
  const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  expect(storage.local.join(' ')).not.toMatch(/token|session|auth/i);
  expect(storage.session.join(' ')).not.toMatch(/token|session|auth/i);
});
