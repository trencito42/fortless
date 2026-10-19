import { expect, test } from '@playwright/test';
import path from 'node:path';

test.skip(process.env['ADMIN_AUTH_FIXTURE'] !== '1', 'Requires the isolated authenticated admin fixture.');

test('captures authenticated admin views without production credentials', async ({ page }) => {
  const output = path.resolve(process.cwd(), 'handoff/references/screenshots');
  await page.goto('/__e2e/admin-session');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('body')).toContainText('Visual QA Owner');
  await page.screenshot({ path: path.join(output, 'admin-overview-authenticated.png'), fullPage: true });

  await page.goto('/admin/settings');
  await expect(page.locator('#emailTemplateSelect')).toHaveValue(/.+/);
  await page.screenshot({ path: path.join(output, 'admin-settings-authenticated.png'), fullPage: true });
  await page.locator('#mn').evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await page.screenshot({ path: path.join(output, 'admin-settings-mail-authenticated.png'), fullPage: true });

  await page.goto('/admin/audit');
  await expect(page.locator('#auditList')).toContainText('fixture.visual review started');
  await page.screenshot({ path: path.join(output, 'admin-audit-authenticated.png'), fullPage: true });
});
