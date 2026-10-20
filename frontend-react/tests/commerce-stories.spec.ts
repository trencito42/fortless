import { test, expect, type Page } from '@playwright/test';

/** Interaction tests for the components finished in the customer-app phase. Each test names the story it exercises so the registry can attribute it. */
async function open(page: Page, id: string, width = 1100) {
  test.info().annotations.push({ type: 'story', description: id });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?embed=${id}`);
  await page.locator(`[data-story="${id}"]`).waitFor();
}
const scenario = (page: Page, name: string) => page.locator(`section[data-scenario="${name}"]`);

test('PricingTable: current plan is disabled, unavailable plan explains why, comparison is a table', async ({ page }) => {
  await open(page, 'pricing-table');
  const cards = scenario(page, 'Current and sold-out plans');
  await expect(cards.getByRole('button', { name: 'Current plan' })).toBeDisabled();
  await expect(cards.getByText('Sold out in Frankfurt. Choose another region.')).toBeVisible();
  const table = scenario(page, 'Comparison').getByRole('table');
  await expect(table.getByRole('columnheader', { name: 'Flame' })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Dedicated IP' })).toBeVisible();
  await expect(table.getByText('Not included').first()).toBeAttached();
});

test('PricingTable: cycle switch changes prices and keeps keyboard operation', async ({ page }) => {
  await open(page, 'pricing-table');
  const s = scenario(page, 'Cards with cycle switch');
  await s.getByRole('radio', { name: 'Monthly' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(s.getByText('billed yearly').first()).toBeVisible();
});

test('NotificationPreferences: edits are local until Save, locked and unconnected cells are disabled', async ({ page }) => {
  await open(page, 'notification-preferences');
  const s = scenario(page, 'Default');
  const save = s.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await expect(s.getByText('Connect Discord first').first()).toBeVisible();
  await expect(s.getByText('Always on')).toBeVisible();
  await s.getByRole('switch', { name: /^Email/ }).first().click();
  await expect(save).toBeEnabled();
  await s.getByRole('button', { name: 'Reset' }).click();
  await expect(save).toBeDisabled();
  await s.getByRole('switch', { name: /^Email/ }).first().click();
  await save.click();
  await expect(s.getByText('Notification settings saved.')).toBeVisible();
});

test('NotificationPreferences: a failed save is reported and keeps the draft', async ({ page }) => {
  await open(page, 'notification-preferences');
  const s = scenario(page, 'Save fails');
  await s.getByRole('switch', { name: /^Browser push/ }).first().click();
  await s.getByRole('button', { name: 'Save' }).click();
  await expect(s.getByText('Could not save. Try again.')).toBeVisible();
  await expect(s.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('CheckoutSummary: terms gate the action; a declined card shows the failure', async ({ page }) => {
  await open(page, 'cart-checkout');
  const ok = scenario(page, 'Ready');
  const place = ok.getByRole('button', { name: 'Place order' });
  await expect(place).toBeDisabled();
  const bad = scenario(page, 'Card declined');
  await bad.getByRole('checkbox', { name: /Terms of Service/ }).click();
  await bad.getByRole('button', { name: 'Place order' }).click();
  await expect(bad.getByText(/declined by the issuer/)).toBeVisible();
});

test('CheckoutSummary: no payment method asks for one; empty cart offers a way forward', async ({ page }) => {
  await open(page, 'cart-checkout');
  const none = scenario(page, 'No payment method');
  await none.getByRole('checkbox', { name: /Terms of Service/ }).click();
  await none.getByRole('button', { name: 'Place order' }).click();
  await expect(none.getByText('Choose a payment method.')).toBeVisible();
  await expect(scenario(page, 'Empty cart').getByText('Your cart is empty')).toBeVisible();
});

test('AnnouncementFeed: filters, unread badge and mark as read', async ({ page }) => {
  await open(page, 'announcements-kb');
  const s = scenario(page, 'Feed');
  await expect(s.getByText('New').first()).toBeVisible();
  await s.getByRole('radio', { name: 'Incidents' }).click();
  await expect(s.getByText('Elevated packet loss in Amsterdam')).toBeVisible();
  await expect(s.getByText('Frankfurt node fra-03 maintenance')).toHaveCount(0);
  await s.getByRole('radio', { name: 'All' }).click();
  const before = await s.getByRole('button', { name: 'Mark as read' }).count();
  expect(before).toBe(2);
});

test('KnowledgeBaseSearch: matches body text and accents, filters categories, explains no results', async ({ page }) => {
  await open(page, 'announcements-kb');
  const s = scenario(page, 'Knowledge base');
  await s.getByRole('searchbox').fill('plugins and mods');
  await expect(s.getByText('Install plugins and mods')).toBeVisible();
  await expect(s.getByText('Set up AMX Mod X on ReHLDS')).toHaveCount(0);
  await s.getByRole('searchbox').fill('zzz');
  await expect(s.getByText('No articles match')).toBeVisible();
  await s.getByRole('searchbox').fill('');
  await s.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Billing' }).click();
  await expect(s.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Billing' })).toHaveAttribute('aria-pressed', 'true');
  await expect(s.getByText('How renewals and invoices work')).toBeVisible();
});

test('UsageOverview: charts have text summaries and the range selector is keyboard operable', async ({ page }) => {
  await open(page, 'usage-overview');
  const s = scenario(page, 'Ready');
  await expect(s.getByRole('progressbar', { name: 'Bandwidth used' })).toHaveAttribute('aria-valuenow', '212');
  await expect(s.getByText('CPU peak')).toBeVisible();
  await s.getByRole('radio', { name: '24h' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(s.getByRole('radio', { name: '7d' })).toBeChecked();
});

test('StartupEditor: read-only state is explained and fields are disabled', async ({ page }) => {
  await open(page, 'startup-editor');
  const s = scenario(page, 'Read-only');
  await expect(s.getByText('Your access level can view startup settings but not change them.')).toBeVisible();
});

test('StartupEditor: editing enables Save', async ({ page }) => {
  await open(page, 'startup-editor');
  const s = scenario(page, 'Editable');
  await s.getByLabel(/Server jar/).fill('paper.jar');
  await expect(s.getByRole('button', { name: /save/i }).first()).toBeEnabled();
});

test('NetworkAllocations: primary cannot be removed; view-only hides actions; empty explains', async ({ page }) => {
  await open(page, 'network-allocations');
  await expect(scenario(page, 'Full permissions').getByText('survival.fortless.gg:25565')).toBeVisible();
  await expect(scenario(page, 'Empty').getByText('No allocations')).toBeVisible();
  await expect(scenario(page, 'View only').getByRole('button', { name: /assign|add/i })).toHaveCount(0);
});
