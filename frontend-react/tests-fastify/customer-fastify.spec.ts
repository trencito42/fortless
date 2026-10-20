import { expect, test } from '@playwright/test';

async function authenticate(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/app');
  await page.getByLabel('Email address').fill('browser@example.test');
  await page.locator('input[name="password"]').fill('Browser-Test-Password-123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/app');
}

test('serves an authenticated React dashboard and real account-scoped inventory through Fastify', async ({ page }) => {
  await authenticate(page);
  await expect(page.getByRole('heading', { name: 'Welcome, Browser' })).toBeVisible();
  await expect(page.getByText('Minecraft Standard (4GB RAM)').first()).toBeVisible();
  const me = await page.request.get('/api/v1/auth/me');
  expect(me.status()).toBe(200);
  expect(me.headers()['content-type']).toContain('application/json');
  expect((await me.json()).membership.role).toBe('OWNER');
});

test('protects deep links, serves assets/CSP, and keeps API routes out of SPA fallback', async ({ page, context }) => {
  const anonymous = await context.newPage();
  await anonymous.goto('/app/services');
  await expect.poll(() => new URL(anonymous.url()).pathname).toBe('/login');
  await anonymous.close();

  await authenticate(page);
  await page.goto('/app/services');
  await expect(page.getByRole('heading', { name: 'Servers & instances' })).toBeVisible();
  await expect(page.getByText('Minecraft Standard (4GB RAM)').first()).toBeVisible();
  const html = await page.request.get('/app/services');
  expect(html.headers()['content-security-policy']).toBeTruthy();
  expect(html.headers()['cache-control']).toContain('no-store');
  const missingApi = await page.request.get('/api/v1/definitely-missing');
  expect(missingApi.headers()['content-type']).toContain('application/json');
  expect(missingApi.status()).toBe(404);
});
