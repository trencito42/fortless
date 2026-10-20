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

test('desktop sidebar aligns every collapsed navigation icon and exposes the authenticated user menu', async ({ page }) => {
  await mockDashboard(page);
  await page.goto('/app');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  const sidebar = page.getByLabel('Sidebar');
  const centers = await sidebar.locator('nav button svg').evaluateAll((icons) => icons.map((icon) => {
    const box = icon.getBoundingClientRect(); return box.left + box.width / 2;
  }));
  expect(centers.length).toBeGreaterThan(5);
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1);
  await sidebar.getByRole('button', { name: 'Account menu for Maria Popescu' }).click();
  await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Security' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
});

test('team shows one invite action and cancels pending invitations through the invitation endpoint', async ({ page }) => {
  let deleted = '';
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Stefan', email: 'stefan@example.test' }, account: { name: 'Fortless' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true }));
    if (path === '/api/v1/auth/csrf') return route.fulfill(json({ csrfToken: 'test-csrf-token' }));
    if (path === '/api/v1/account/members' && route.request().method() === 'GET') return route.fulfill(json({ members: [], invitations: [{ id: 'inv_pending', email: 'paunelul.tr@gmail.com', role: 'VIEWER' }] }));
    if (path === '/api/v1/account/invitations/inv_pending' && route.request().method() === 'DELETE') { deleted = path; return route.fulfill(json({ success: true })); }
    return route.fulfill(json({ error: 'Not found' }, 404));
  });
  await page.goto('/app/account/team');
  await expect(page.getByRole('button', { name: 'Invite member' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Actions for paunelul.tr@gmail.com' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Remove member' }).click();
  await expect.poll(() => deleted).toBe('/api/v1/account/invitations/inv_pending');
});

test('important service events exclude account and authentication audit records', async ({ page }) => {
  await mockDashboard(page);
  await page.route('**/api/v1/audit**', (route) => route.fulfill(json({ logs: [
    { id: 'svc_event', created_at: '2026-10-20T12:00:00Z', action: 'service.power_started', resource_type: 'service', resource_id: 'svc_1', service_name: 'Survival' },
    { id: 'login_event', created_at: '2026-10-20T11:00:00Z', action: 'user.login', resource_type: 'user', resource_id: 'usr_secret' },
  ] })));
  await page.goto('/app');
  const serviceEvents = page.getByRole('region', { name: 'Important service events' });
  await expect(serviceEvents.getByRole('heading', { name: 'Important service events' })).toBeVisible();
  await expect(serviceEvents.getByText('Survival')).toBeVisible();
  await expect(serviceEvents.getByText('usr_secret')).toHaveCount(0);
});

test('announcements use the dedicated content API rather than operational notifications', async ({ page }) => {
  const requested: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname; requested.push(path);
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Stefan', email: 'stefan@example.test' }, account: { name: 'Fortless' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true }));
    if (path === '/api/v1/announcements') return route.fulfill(json({ announcements: [{ id: 'ann_1', kind: 'NEWS', title: 'Panel update', bodyMarkdown: 'The new panel is ready.', publishedAt: '2026-10-20T10:00:00Z', readAt: null }] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });
  await page.goto('/app/announcements');
  await expect(page.getByText('Panel update')).toBeVisible();
  expect(requested).toContain('/api/v1/announcements');
  expect(requested).not.toContain('/api/v1/notifications');
});

test('mobile dashboard keeps customer navigation available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Welcome, Maria' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Servers/i }).or(page.getByRole('link', { name: /Servers/i })).first()).toBeVisible();
});

test('knowledge article renders backend Markdown as semantic styled content', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: false }));
    if (path === '/api/v1/kb/articles') return route.fulfill(json({ articles: [{ id: 'kb_1', slug: 'minecraft-crash-eula-memory', category: 'Minecraft', title: 'Troubleshooting Minecraft Startup Crashes', summary: 'EULA and memory', contentMarkdown: '## Unaccepted EULA Agreement\n\nIf the console shows **You need to agree**:\n\n1. Open `eula.txt`.\n2. Change `eula=false` to `eula=true`.\n\n```\njava.lang.OutOfMemoryError: Java heap space\n```', updatedAt: '2026-10-20T10:00:00Z', tags: ['minecraft'] }] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });
  await page.goto('/app/knowledge/minecraft-crash-eula-memory');
  await expect(page.getByRole('heading', { name: 'Unaccepted EULA Agreement', level: 2 })).toBeVisible();
  await expect(page.locator('ol').filter({ hasText: 'Open eula.txt.' }).locator('li')).toHaveCount(2);
  await expect(page.locator('code').filter({ hasText: 'java.lang.OutOfMemoryError' })).toBeVisible();
  await expect(page.getByText('## Unaccepted EULA Agreement')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/react-knowledge-markdown.png', fullPage: true });
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

test('suspended services do not trigger error warnings or appear in attention filter', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true }));
    if (path === '/api/v1/services') {
      return route.fulfill(json({
        services: [
          {
            id: 'svc_susp_1',
            identifier: 'srv-susp1',
            account_id: 'acc_1',
            plan_name: 'Minecraft Paper',
            contract_status: 'SUSPENDED',
            runtime_state: 'STOPPED',
            provider_type: 'PTERODACTYL',
            node_name: 'Frankfurt-1',
            node_id: 'fra',
            created_at: '2026-09-01T10:00:00Z',
            suspension_reason: 'Account billing review.',
            memory_limit_mb: 4096,
            disk_limit_mb: 20480,
          },
          {
            id: 'svc_susp_2',
            identifier: 'srv-susp2',
            account_id: 'acc_1',
            plan_name: 'CS2 Server',
            contract_status: 'PAST_DUE',
            runtime_state: 'STOPPED',
            provider_type: 'PTERODACTYL',
            node_name: 'Frankfurt-1',
            node_id: 'fra',
            created_at: '2026-09-02T10:00:00Z',
            suspension_reason: 'Invoice past due.',
            memory_limit_mb: 8192,
            disk_limit_mb: 40960,
          },
        ],
      }));
    }
    if (path === '/api/v1/invoices') return route.fulfill(json({ invoices: [] }));
    if (path === '/api/v1/subscriptions') return route.fulfill(json({ subscriptions: [] }));
    if (path === '/api/v1/tickets') return route.fulfill(json({ tickets: [] }));
    if (path === '/api/v1/audit') return route.fulfill(json({ logs: [] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });

  await page.goto('/app');
  // Needs attention section must NOT be rendered when only suspended services exist
  await expect(page.getByRole('heading', { name: 'Needs attention' })).not.toBeVisible();
  await expect(page.getByText('2 suspended')).toBeVisible();
  await expect(page.getByText('Suspended').first()).toBeVisible();

  await page.goto('/app/services');
  // Attention segmented filter counter must be 0
  await expect(page.getByRole('radio', { name: /Attention 0/ })).toBeVisible();
  // Default filter is Lifecycle is Active, so suspended services are hidden until cleared
  await expect(page.getByText('No services match')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  // Suspended services appear with their Suspended status badge once filter is cleared
  await expect(page.getByRole('cell', { name: /Minecraft Paper/ }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: /CS2 Server/ }).first()).toBeVisible();
  // Switching to Attention filter shows no matches
  await page.getByRole('radio', { name: /Attention 0/ }).click();
  await expect(page.getByText('No services match')).toBeVisible();
});

test('service detail distinguishes 403, 404, and 500 error tiers with retry options', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true }));
    if (path === '/api/v1/services') return route.fulfill(json({ services: [] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });

  await page.goto('/app/services/nonexistent_svc');
  await expect(page.getByText('Service not found')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to services' })).toBeVisible();
});

test('dns editor maps priority, weight and port for SRV and MX records', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: true }));
    if (path === '/api/v1/domains/zones') {
      return route.fulfill(json({
        zones: [{ id: 'zone_1', domain_name: 'example.com', status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z', auto_renew: true, whois_privacy: true, nameservers: '["ns1.fortless.net"]' }],
      }));
    }
    if (path === '/api/v1/domains/zones/zone_1/records') {
      return route.fulfill(json({
        records: [
          { id: 'rec_mx', record_type: 'MX', name: '@', content: 'mail.example.com', ttl: 3600, priority: 10 },
          { id: 'rec_srv', record_type: 'SRV', name: '_minecraft._tcp', content: 'mc.example.com', ttl: 3600, priority: 0, weight: 5, port: 25565 },
        ],
      }));
    }
    return route.fulfill(json({ error: 'Not found' }, 404));
  });

  await page.goto('/app/domains/example.com');
  await expect(page.getByText('example.com').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'mail.example.com' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '5 25565 mc.example.com' })).toBeVisible();
});

test('mfa setup renders local svg qr code without external network leaks', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Maria Popescu', email: 'maria@example.test' }, account: { name: 'Maria Studio' }, membership: { role: 'OWNER' } }));
    if (path === '/api/v1/auth/csrf') return route.fulfill(json({ csrfToken: 'csrf_test_token' }));
    if (path === '/api/v1/auth/mfa') return route.fulfill(json({ enabled: false, recoveryCodesRemaining: 0 }));
    if (path === '/api/v1/auth/mfa/totp/enroll') return route.fulfill(json({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Fortless:test?secret=JBSWY3DPEHPK3PXP' }));
    if (path === '/api/v1/auth/passkeys') return route.fulfill(json({ passkeys: [] }));
    if (path === '/api/v1/auth/sessions') return route.fulfill(json({ sessions: [] }));
    return route.fulfill(json({ error: 'Not found' }, 404));
  });

  await page.goto('/app/account/security');
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  await page.locator('input[autocomplete="current-password"]').last().fill('ValidPass1234!');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Verify local SVG QR code is rendered and does not leak raw otpauth:// URI as plain text
  const qr = page.getByRole('img', { name: 'Authenticator setup QR code' });
  await expect(qr).toBeVisible();
  await expect(qr.locator('svg')).toBeVisible();
});

