import { test, expect } from '@playwright/test';

test.skip(!process.env['ADMIN_AUTH_FIXTURE'], 'Runs against the isolated Fortless visual fixture.');

for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`Player Manager administration status renders with Petal on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/__e2e/player-admin');
    await expect(page.getByTestId('administration-status')).toContainText('Native Console');
    await expect(page.getByText('Sampled player list')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kick' })).toHaveCount(0);
    await page.screenshot({ path: `artifacts/player-administration-${viewport.name}.png`, fullPage: true });
  });
}
