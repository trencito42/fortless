import { expect, test, type Page } from '@playwright/test';

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockDashboard(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test', email_verified_at: '2026-01-01' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true, recoveryCodesRemaining: 6 }));
    if (path === '/api/v1/services') return route.fulfill(json({ services: [{ id: 'svc_1', contract_status: 'ACTIVE', runtime_state: 'RUNNING', provider_type: 'PTERODACTYL', identifier: 'abc123', node_id: 'n1', node_name: 'Bucharest', plan_name: 'Minecraft 4 GB', memory_limit_mb: 4096, disk_limit_mb: 20480, created_at: '2026-10-01T10:00:00Z', custom_options: '{"serverName":"Survival"}' }] }));
    if (path === '/api/v1/invoices') return route.fulfill(json({ invoices: [] }));
    if (path === '/api/v1/subscriptions') return route.fulfill(json({ subscriptions: [] }));
    if (path === '/api/v1/tickets') return route.fulfill(json({ tickets: [] }));
    if (path === '/api/v1/audit') return route.fulfill(json({ logs: [] }));
    return route.fulfill(json({ error: 'Not wired in this test' }, 501));
  });
}

test('authenticated preview renders real identity and account-scoped dashboard DTOs', async ({ page }) => {
  await mockDashboard(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Welcome, Maria' })).toBeVisible();
  await expect(page.getByText('Maria Popescu')).toBeVisible();
  await expect(page.getByText('Survival')).toBeVisible();
  await expect(page.getByText('4.0 GB RAM allocated')).toBeVisible();
  await expect(page.getByText(/fixture data/i)).toHaveCount(0);
  await page.screenshot({ path: 'test-results/react-dashboard-integrated.png', fullPage: true });
});

test('mobile dashboard keeps customer navigation available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Welcome, Maria' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Servers/i }).or(page.getByRole('link', { name: /Servers/i })).first()).toBeVisible();
});

test('expired session is never replaced with fixtures', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.fulfill(json({ error: 'Unauthorized', message: 'Authentication required' }, 401)));
  await page.goto('/app');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
  await expect(page.getByText(/Alex Morgan|fixture data/i)).toHaveCount(0);
});

test('HTML returned for an API is rejected and no zero statistics are invented', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true }));
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Vite fallback</title>' });
  });
  await page.goto('/app');
  await expect(page.getByText('Services unavailable')).toBeVisible();
  await expect(page.getByText('Billing unavailable')).toBeVisible();
  await expect(page.getByText('Support unavailable')).toBeVisible();
  await expect(page.getByText('€0.00')).toHaveCount(0);
});

test('services supports real inventory search, status filtering, and detail navigation', async ({ page }) => {
  await mockDashboard(page);
  await page.goto('/app/services');
  const service = page.getByRole('button', { name: /^Survival/ });
  await expect(service).toBeVisible();
  const search = page.getByPlaceholder('Search by name, engine or region');
  await search.fill('Bucharest');
  await expect(service).toBeVisible();
  await search.fill('does-not-exist');
  await expect(service).toHaveCount(0);
  await search.fill('Survival');
  await page.screenshot({ path: 'test-results/react-services-integrated.png', fullPage: true });
  await page.getByRole('button', { name: /^Survival/ }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/app/services/svc_1');
});

test('403 responses become visible error states instead of undefined lists', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'VIEWER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: false }));
    return route.fulfill(json({ error: 'Forbidden', message: 'Account permission required' }, 403));
  });
  await page.goto('/app');
  await expect(page.getByText('Services unavailable')).toBeVisible();
  await expect(page.getByText('Billing unavailable')).toBeVisible();
  await expect(page.getByText(/Cannot read properties/)).toHaveCount(0);
});

test('loading skeletons remain until delayed API responses complete', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true }));
    if (path === '/api/v1/services') return route.fulfill(json({ services: [] }));
    if (path === '/api/v1/invoices') return route.fulfill(json({ invoices: [] }));
    if (path === '/api/v1/subscriptions') return route.fulfill(json({ subscriptions: [] }));
    if (path === '/api/v1/tickets') return route.fulfill(json({ tickets: [] }));
    if (path === '/api/v1/audit') return route.fulfill(json({ logs: [] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });
  await page.goto('/app');
  await expect(page.getByLabel('Loading services')).toBeVisible();
  await expect(page.getByText('No services yet')).toBeVisible();
});

test('valid empty DTO arrays render honest empty states', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Empty Account', email: 'empty@example.test' }, account: { name: 'Empty' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: false }));
    if (path === '/api/v1/services') return route.fulfill(json({ services: [] }));
    if (path === '/api/v1/invoices') return route.fulfill(json({ invoices: [] }));
    if (path === '/api/v1/subscriptions') return route.fulfill(json({ subscriptions: [] }));
    if (path === '/api/v1/tickets') return route.fulfill(json({ tickets: [] }));
    if (path === '/api/v1/audit') return route.fulfill(json({ logs: [] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });
  await page.goto('/app');
  await expect(page.getByText('No services yet')).toBeVisible();
  await expect(page.getByText('Nothing to pay')).toBeVisible();
  await expect(page.getByText('No renewals in the next 30 days.')).toBeVisible();
});

test('preview proxy reaches the real Fastify session guard in a browser', async ({ page }) => {
  await page.goto('/app');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  const me = await page.request.get('/api/v1/auth/me');
  expect(me.status()).toBe(401);
  expect(me.headers()['content-type']).toMatch(/^application\/json/);
});
