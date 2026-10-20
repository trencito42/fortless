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

test('billing views render real invoices, subscriptions, and profile', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true }));
    if (path === '/api/v1/invoices/inv_123') return route.fulfill(json({ invoice: { id: 'inv_123', invoice_number: 'INV-2026-001', status: 'PAID', currency: 'EUR', subtotal_minor_units: 1000, tax_minor_units: 190, total_minor_units: 1190, created_at: '2026-10-01T10:00:00Z', paid_at: '2026-10-01T11:00:00Z' }, lines: [{ id: 'line_1', description: 'Minecraft Server Plan', amount_minor_units: 1000 }] }));
    if (path === '/api/v1/invoices') return route.fulfill(json({ invoices: [{ id: 'inv_123', invoice_number: 'INV-2026-001', status: 'PAID', currency: 'EUR', subtotal_minor_units: 1000, tax_minor_units: 190, total_minor_units: 1190, created_at: '2026-10-01T10:00:00Z', paid_at: '2026-10-01T11:00:00Z' }] }));
    if (path === '/api/v1/subscriptions') return route.fulfill(json({ subscriptions: [{ id: 'sub_123', serviceId: 'svc_1', serviceName: 'Minecraft Server', billingInterval: 'MONTHLY', renewalPriceMinorUnits: 1190, currency: 'EUR', status: 'ACTIVE', nextRenewalDate: '2026-11-01', autoRenew: true }] }));
    if (path === '/api/v1/account/billing-profile') return route.fulfill(json({ profile: { companyName: 'Maria Studio SRL', addressLine1: 'Strada Exemplu 1', city: 'Bucharest', postalCode: '010101', country: 'RO', taxId: 'RO12345678' } }));
    if (path === '/api/v1/catalog/plans') return route.fulfill(json({ plans: [{ planVersionId: 'pv_1', planName: 'Minecraft 4 GB', productSlug: 'minecraft-paper', resources: { memoryMb: 4096, cpuPct: 200, diskMb: 20480, databases: 1, backups: 3 }, prices: [{ interval: 'MONTHLY', currency: 'EUR', priceMinorUnits: 1000 }, { interval: 'ANNUAL', currency: 'EUR', priceMinorUnits: 10000 }] }] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });

  await page.goto('/app/billing/invoices');
  await expect(page.getByText('INV-2026-001')).toBeVisible();

  await page.goto('/app/billing/invoices/inv_123');
  await expect(page.getByText('Invoice INV-2026-001')).toBeVisible();
  await expect(page.getByText('Minecraft Server Plan')).toBeVisible();

  await page.goto('/app/billing/subscriptions');
  await expect(page.getByText('Minecraft Server')).toBeVisible();

  await page.goto('/app/billing/profile');
  await expect(page.locator('input[value="Maria Studio SRL"]').first()).toBeVisible();
});

test('support views render real ticket list and conversation thread', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true }));
    if (path === '/api/v1/tickets/tkt_123') return route.fulfill(json({ ticket: { id: 'tkt_123', subject: 'Server lag issue', status: 'WAITING_CUSTOMER', priority: 'NORMAL', created_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-10T12:00:00Z' }, messages: [{ id: 'msg_1', author_name: 'Support Agent', is_staff: true, created_at: '2026-10-10T12:00:00Z', body: 'We optimized your tick rate.' }], attachments: [] }));
    if (path === '/api/v1/tickets') return route.fulfill(json({ tickets: [{ id: 'tkt_123', subject: 'Server lag issue', status: 'WAITING_CUSTOMER', priority: 'NORMAL', created_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-10T12:00:00Z' }] }));
    if (path === '/api/v1/services') return route.fulfill(json({ services: [] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });

  await page.goto('/app/support');
  await expect(page.getByText('Server lag issue')).toBeVisible();

  await page.goto('/app/support/tkt_123');
  await expect(page.getByText('We optimized your tick rate.')).toBeVisible();
});

test('domains views render registered zones and DNS management', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true }));
    if (path === '/api/v1/domains/zones/zone_1/records') return route.fulfill(json({ records: [{ id: 'rec_1', record_type: 'A', name: '@', content: '192.0.2.1', ttl: 3600 }] }));
    if (path === '/api/v1/domains/zones') return route.fulfill(json({ zones: [{ id: 'zone_1', domain_name: 'example.ro', status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z', auto_renew: true, whois_privacy: true, nameservers: '["ns1.fortless.net","ns2.fortless.net"]' }] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });

  await page.goto('/app/domains');
  await expect(page.getByRole('button', { name: 'example.ro' })).toBeVisible();

  await page.goto('/app/domains/example.ro');
  await expect(page.getByRole('heading', { name: 'Nameservers' })).toBeVisible();
  await expect(page.locator('input[value*="ns1.fortless.net"]')).toBeVisible();
});

test('account security, team, and activity audit views', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true, recoveryCodesRemaining: 8 }));
    if (path === '/api/v1/auth/sessions') return route.fulfill(json({ sessions: [{ id: 'sess_1', userAgent: 'Chrome on Linux', ipAddress: '192.0.2.10', lastActiveAt: '2026-10-20T14:00:00Z', isCurrent: true }] }));
    if (path === '/api/v1/auth/passkeys') return route.fulfill(json({ passkeys: [{ id: 'pk_1', deviceLabel: 'YubiKey 5C', createdAt: '2026-05-01T10:00:00Z' }] }));
    if (path === '/api/v1/account/members') return route.fulfill(json({ members: [{ id: 'mem_1', name: 'Maria Popescu', email: 'maria@example.test', role: 'OWNER' }], invitations: [] }));
    if (path === '/api/v1/notification-preferences') return route.fulfill(json({ preferences: { billingEmail: true, serviceEmail: true, supportEmail: true } }));
    if (path === '/api/v1/audit') return route.fulfill(json({ logs: [{ id: 'aud_1', created_at: '2026-10-20T12:00:00Z', actor_name: 'Maria Popescu', actor_type: 'USER', action: 'auth.login', resource_id: 'usr_1', ip_address: '192.0.2.10' }] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });

  await page.goto('/app/account/security');
  await expect(page.getByText('8 recovery codes left.')).toBeVisible();
  await expect(page.getByText('Chrome on Linux')).toBeVisible();

  await page.goto('/app/account/team');
  await expect(page.getByRole('table', { name: 'Team members' }).getByText('Maria Popescu')).toBeVisible();

  await page.goto('/app/account/activity');
  await expect(page.getByText('Export CSV')).toBeVisible();
  await expect(page.getByText('auth login')).toBeVisible();

  await page.goto('/app/account/api-keys');
  await expect(page.getByText('Customer API keys not supported')).toBeVisible();
});

test('deploy wizard loads real catalog workloads', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true }));
    if (path === '/api/v1/catalog/plans') return route.fulfill(json({ plans: [{ planVersionId: 'pv_1', planName: 'Flame 4 GB', productSlug: 'minecraft-paper', resources: { memoryMb: 4096, cpuPct: 200, diskMb: 20480, databases: 1, backups: 3 }, prices: [{ interval: 'MONTHLY', currency: 'EUR', priceMinorUnits: 1200 }, { interval: 'ANNUAL', currency: 'EUR', priceMinorUnits: 12000 }] }] }));
    if (path === '/api/v1/catalog/regions') return route.fulfill(json({ regions: [{ id: 'reg_fra_1', name: 'Frankfurt', country: 'Germany', isSoldOut: false }] }));
    if (path === '/api/v1/deploy/workloads') return route.fulfill(json({ workloads: [{ id: 'minecraft', name: 'Minecraft: Java Edition', tagline: 'Paper, Purpur, Forge or Fabric', icon: 'server-01', supported: true, defaultSetupMode: 'QUICK', softwareOptions: [{ id: 'paper', name: 'Paper', description: 'High performance', versions: ['1.21.1'], recommended: true }], presets: [{ id: 'survival', name: 'Survival', description: 'Default vanilla style' }], addonOptions: [], configurationFields: [{ key: 'serverName', label: 'Server name', type: 'string', default: 'My Server', required: true }] }] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });

  await page.goto('/app/deploy');
  await expect(page.getByText('Minecraft: Java Edition')).toBeVisible();
});
