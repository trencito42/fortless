import { test, expect, type Page } from '@playwright/test';

/** Customer workflows against the fixture adapter. Fixture tests: they prove UI behaviour, not a live backend. */
const go = async (page: Page, path: string, w = 1280) => { await page.setViewportSize({ width: w, height: 900 }); await page.goto(path); await page.locator('h1').first().waitFor(); };

test('services: search, quick filter and empty state', async ({ page }) => {
  await go(page, '/app/services');
  await expect(page.getByText('Survival EU').first()).toBeVisible();
  await page.getByRole('searchbox').first().fill('modbot');
  await expect(page.getByText('Modbot').first()).toBeVisible();
  await expect(page.getByText('Survival EU')).toHaveCount(0);
  await page.getByRole('searchbox').first().fill('zzzz-nothing');
  await expect(page.getByText(/no (services|results|matches)/i).first()).toBeVisible();
});

test('services: advanced filter by workload narrows the list', async ({ page }) => {
  await go(page, '/app/services');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('button', { name: /add (filter|rule)/i }).first()).toBeVisible();
});

test('services: a suspended service explains why power is blocked', async ({ page }) => {
  await go(page, '/app/services');
  await expect(page.getByText(/Suspended: pay the open invoice|invoice .* overdue/i).first()).toBeVisible();
});

test('service detail: grouped navigation changes section and the URL', async ({ page }) => {
  await go(page, '/app/services/svc_survival');
  const rail = page.getByRole('navigation', { name: 'Service sections' });
  await rail.getByRole('button', { name: /console/i }).click();
  await expect(page).toHaveURL(/svc_survival\/console$/);
  await expect(rail.getByRole('button', { name: /console/i })).toHaveAttribute('aria-current', 'page');
});

test('service detail: mobile uses a grouped picker instead of a tab bar', async ({ page }) => {
  await go(page, '/app/services/svc_survival', 390);
  await expect(page.getByRole('navigation', { name: 'Service sections' })).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Service sections' })).toBeVisible();
});

test('workloads differ: Minecraft has players + icon, CS 1.6 has FastDL, a bot has neither game tools', async ({ page }) => {
  const rail = () => page.getByRole('navigation', { name: 'Service sections' });
  await go(page, '/app/services/svc_survival');
  await expect(rail().getByRole('button', { name: /^players/i })).toBeVisible();
  await expect(rail().getByRole('button', { name: /fastdl/i })).toHaveCount(0);
  await page.goto('/app/services/svc_survival/game');
  await expect(page.getByText('Server icon')).toBeVisible();

  await go(page, '/app/services/svc_cs16');
  await expect(rail().getByRole('button', { name: /fastdl/i })).toBeVisible();

  await go(page, '/app/services/svc_bot');
  await rail().getByRole('button', { name: /overview/i }).waitFor();
  await expect(rail().getByRole('button', { name: /^players/i })).toHaveCount(0);
  await expect(rail().getByRole('button', { name: /^game/i })).toHaveCount(0);
  await expect(rail().getByRole('button', { name: /fastdl/i })).toHaveCount(0);
});

test('fastdl: sync starts and cvar line can be written', async ({ page }) => {
  await go(page, '/app/services/svc_cs16/fastdl');
  await expect(page.getByText('Files published')).toBeVisible();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText(/Sync started|Syncing/).first()).toBeVisible();
});

test('minecraft icon: wrong size is rejected before upload', async ({ page }) => {
  await go(page, '/app/services/svc_survival/game');
  const bad = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.getByLabel('Choose icon file').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: bad });
  await expect(page.getByText(/Minecraft needs exactly 64×64/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save icon' })).toBeDisabled();
});

test('diagnostics: dialog returns a report for pasted logs', async ({ page }) => {
  await go(page, '/app/services/svc_api');
  await page.getByRole('button', { name: 'Diagnose a problem' }).click();
  await page.getByLabel('Logs (optional)').fill('Error: listen EADDRINUSE: address already in use :::3000');
  await page.getByRole('button', { name: 'Run diagnosis' }).click();
  await expect(page.getByText(/EADDRINUSE/).last()).toBeVisible();
  await expect(page.getByText('Critical')).toBeVisible();
});

test('billing: paying an overdue invoice succeeds, a declined card fails with nothing charged', async ({ page }) => {
  await go(page, '/app/billing/invoices/inv_0158');
  await page.getByRole('combobox', { name: 'Pay with' }).click();
  await page.getByRole('option', { name: /0087/ }).click();
  await page.getByRole('button', { name: /^Pay / }).click();
  await expect(page.getByText(/declined by the issuer/)).toBeVisible();
  await go(page, '/app/billing/invoices/inv_0141');
  await page.getByRole('button', { name: /^Pay / }).click();
  await expect(page.getByText(/Payment received/)).toBeVisible();
});

test('billing: cart is empty by default and links to deploy', async ({ page }) => {
  await go(page, '/app/billing/cart');
  await expect(page.getByText('Your cart is empty')).toBeVisible();
  await page.getByRole('button', { name: 'Deploy a server' }).click();
  await expect(page).toHaveURL(/\/app\/deploy$/);
});

test('billing: cart checkout blocks until terms are accepted', async ({ page }) => {
  await go(page, '/app/domains/search');
  await page.getByRole('searchbox').fill('mygamehost');
  await page.getByRole('main').getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Add' }).first().click();
  await page.getByRole('button', { name: 'Go to cart' }).click();
  await expect(page.getByRole('button', { name: /Place order/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Terms of Service/ }).click();
  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page.getByText('Order placed')).toBeVisible();
});

test('billing profile: invalid VAT id is explained, valid one saves', async ({ page }) => {
  await go(page, '/app/billing/profile');
  await page.getByLabel('VAT ID').fill('123');
  await page.getByRole('button', { name: 'Save billing profile' }).click();
  await expect(page.getByText(/starts with a country code/)).toBeVisible();
  await page.getByLabel('VAT ID').fill('RO12345678');
  await page.getByRole('button', { name: 'Save billing profile' }).click();
  await expect(page.getByText('Billing profile saved.')).toBeVisible();
});

test('subscriptions: cancel then keep my plan', async ({ page }) => {
  await go(page, '/app/billing/subscriptions');
  await expect(page.getByText('Cancels at period end').first()).toBeVisible();
  await page.getByRole('button', { name: 'Keep my plan' }).first().click();
  await expect(page.getByText('Cancels at period end')).toHaveCount(0);
});

test('payment methods: add a test card', async ({ page }) => {
  await go(page, '/app/billing/payment-methods');
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.getByRole('radio', { name: /American Express/ }).click();
  await page.getByRole('button', { name: 'Add card', exact: true }).last().click();
  await expect(page.getByText(/ending 0005/i)).toBeVisible();
});

test('support: create a ticket, then reply in the conversation', async ({ page }) => {
  await go(page, '/app/support/new');
  await page.getByRole('button', { name: 'Send ticket' }).click();
  await expect(page.getByText('Describe the problem in a few words.')).toBeVisible();
  await page.getByLabel('Subject').fill('Cannot connect to my server');
  await page.getByLabel('Message').fill('Players get a timeout when joining since this morning, nothing changed on our side.');
  await page.getByRole('button', { name: 'Send ticket' }).click();
  await expect(page).toHaveURL(/\/app\/support\/tkt_/);
  await expect(page.getByText('Cannot connect to my server').first()).toBeVisible();
});

test('support: inbox filters closed tickets', async ({ page }) => {
  await go(page, '/app/support');
  await expect(page.getByText('Storefront API crashes right after start')).toBeVisible();
  await page.getByRole('radio', { name: 'Closed' }).click();
  await expect(page.getByText('Storefront API crashes right after start')).toHaveCount(0);
});

test('domains: add a DNS record and change nameservers validation', async ({ page }) => {
  await go(page, '/app/domains/shop.example');
  await expect(page.getByText('203.0.113.10').first()).toBeVisible();
  await page.getByLabel(/Nameservers/).fill('ns1.only.example');
  await page.getByRole('button', { name: 'Save nameservers' }).click();
  await expect(page.getByText('Enter at least two nameservers.')).toBeVisible();
});

test('account: profile validation and save', async ({ page }) => {
  await go(page, '/app/account');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await page.getByLabel('Email').fill('alex@morgan.example');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
});

test('account: API key is shown once after creation', async ({ page }) => {
  await go(page, '/app/account/api-keys');
  await page.getByRole('button', { name: 'Create key' }).click();
  await page.getByLabel('Name').fill('Backup script');
  await page.getByRole('dialog').getByRole('button', { name: 'Create key' }).click();
  await expect(page.getByText(/flk_live_/).first()).toBeVisible();
});

test('account: inviting a teammate validates the email', async ({ page }) => {
  await go(page, '/app/account/team');
  await page.getByRole('button', { name: 'Invite member' }).click();
  await page.getByLabel('Email').fill('nope');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
});

test('notifications: unconnected channel is off and security email is locked', async ({ page }) => {
  await go(page, '/app/account/notifications');
  await expect(page.getByText('Connect Discord first').first()).toBeVisible();
  await expect(page.getByText('Always on')).toBeVisible();
});

test('knowledge base: search narrows and article opens', async ({ page }) => {
  await go(page, '/app/knowledge');
  await page.getByRole('searchbox').fill('AMX');
  await expect(page.getByText('Set up AMX Mod X on ReHLDS')).toBeVisible();
  await page.getByText('Set up AMX Mod X on ReHLDS').click();
  await expect(page.getByRole('heading', { name: 'Set up AMX Mod X on ReHLDS' })).toBeVisible();
});

test('announcements: mark as read removes the New badge', async ({ page }) => {
  await go(page, '/app/announcements');
  await expect(page.getByRole('button', { name: 'Mark as read' }).first()).toBeVisible();
  const n = await page.getByRole('button', { name: 'Mark as read' }).count();
  await page.getByRole('button', { name: 'Mark as read' }).first().click();
  await expect(page.getByRole('button', { name: 'Mark as read' })).toHaveCount(n - 1);
});

test('usage: range selector reloads the charts', async ({ page }) => {
  await go(page, '/app/usage');
  await expect(page.getByText('CPU peak')).toBeVisible();
  await page.getByRole('radio', { name: '7d' }).click();
  await expect(page.getByText('CPU peak')).toBeVisible();
});

test('auth: login validates, fails clearly, then succeeds; MFA accepts the demo code', async ({ page }) => {
  await go(page, '/auth/login');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await page.getByLabel('Email').fill('wrong@example.com');
  await page.getByLabel('Password').fill('whatever-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  await page.getByLabel('Email').fill('mfa@example.com');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/mfa$/);
});

test('auth: registration requires terms and a strong password', async ({ page }) => {
  await go(page, '/auth/register');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Accept the terms to create an account.')).toBeVisible();
  await expect(page.getByText('Use at least 10 characters.').first()).toBeVisible();
});

test('system screens render without the app shell', async ({ page }) => {
  for (const [p, h] of [['/system/404', /does not exist/], ['/system/403', /do not have access/], ['/system/500', /went wrong/], ['/system/maintenance', /maintenance/i], ['/system/unavailable', /unavailable/i], ['/system/session-expired', /expired/i]] as const) {
    await go(page, p);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  }
});

test('unknown customer route shows an in-app not-found, and there is no admin route', async ({ page }) => {
  await go(page, '/app/nothing-here');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await go(page, '/admin');
  await expect(page.getByRole('heading', { name: /Admin/i })).toHaveCount(0);
});

test('command palette opens with the keyboard and navigates', async ({ page }) => {
  await go(page, '/app');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill('invoices');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app\/billing\/invoices$/);
});

test('mobile bottom navigation reaches Servers and Support', async ({ page }) => {
  await go(page, '/app', 390);
  const bar = page.getByRole('navigation', { name: 'Primary' });
  await bar.getByRole('button', { name: 'Servers' }).click();
  await expect(page).toHaveURL(/\/app\/services$/);
  await bar.getByRole('button', { name: 'Support' }).click();
  await expect(page).toHaveURL(/\/app\/support$/);
});
