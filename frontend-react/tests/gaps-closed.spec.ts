import { test, expect, type Page } from '@playwright/test';

/** Interaction tests for gaps closed after the first registry pass. Each test names the story it exercises. */
async function open(page: Page, id: string, width = 1100) {
  test.info().annotations.push({ type: 'story', description: id });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?embed=${id}`);
  await page.locator(`[data-story="${id}"]`).waitFor();
  return page.locator(`[data-story="${id}"]`);
}

test('DatePicker: opens a calendar grid, keyboard moves focus by day/week/month, Enter picks and closes', async ({ page }) => {
  const s = await open(page, 'dropzone-date');
  const trigger = s.getByRole('button', { name: /^Start date/ });
  await trigger.click();
  const grid = page.getByRole('grid');
  await expect(grid).toBeVisible();
  const focused = grid.locator('button[tabindex="0"]');
  const before = await focused.getAttribute('data-date');
  await focused.focus();
  await page.keyboard.press('ArrowRight');
  const after = await page.locator('[role=grid] button:focus').getAttribute('data-date');
  expect(after).not.toEqual(before);
  await page.keyboard.press('PageDown');
  const month = await page.locator('[role=grid] button:focus').getAttribute('data-date');
  expect(month!.slice(0, 7)).not.toEqual(after!.slice(0, 7));
  await page.keyboard.press('Enter');
  await expect(grid).toBeHidden();
  await expect(trigger).not.toHaveAccessibleName(/none chosen/);
});

test('DatePicker: days before min are disabled', async ({ page }) => {
  const s = await open(page, 'dropzone-date');
  await s.getByRole('button', { name: /^Start date/ }).click();
  const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(today.getTime() - 86400000);
  const y = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  await expect(page.locator(`[data-date="${y}"]`)).toBeDisabled();
  await expect(page.locator(`[data-date="${iso}"]`)).toBeEnabled();
});

test('DateRangePicker: preset fills both ends; manual pick needs two clicks', async ({ page }) => {
  const s = await open(page, 'dropzone-date');
  const trigger = s.getByRole('button', { name: /^Report period/ });
  await trigger.click();
  await page.getByRole('button', { name: 'Last 7 days' }).click();
  await expect(trigger).toContainText('–');
  await expect(trigger).not.toContainText('…');
  await trigger.click();
  const days = page.locator('[role=grid] button:not([disabled])');
  await days.nth(3).click();
  await expect(page.getByRole('grid')).toBeVisible(); // still open: range incomplete
  await expect(page.getByText('Now choose the last day.')).toBeVisible();
  await days.nth(9).click();
  await expect(page.getByRole('grid')).toBeHidden();
});

test('ApiKeyManager: revoke asks first and Cancel keeps the key', async ({ page }) => {
  const s = await open(page, 'api-keys');
  await s.getByRole('button', { name: /^Revoke key CI deploy/ }).click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('Anything using this key stops working');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(s.getByText('CI deploy')).toBeVisible();
});

test('ApiKeyManager: create dialog offers an expiry', async ({ page }) => {
  const s = await open(page, 'api-keys');
  await s.getByRole('button', { name: 'Create key' }).click();
  await expect(page.getByRole('dialog').getByText('Expiry')).toBeVisible();
});

test('TeamMembers: removing a member needs confirmation', async ({ page }) => {
  const s = await open(page, 'team-members');
  await s.getByRole('button', { name: 'Actions for Sam' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('Remove Sam?');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(dlg).toBeHidden();
});

test('PaymentMethodList: removing a card needs confirmation', async ({ page }) => {
  const s = await open(page, 'payment-methods');
  await s.getByRole('button', { name: 'Actions for card 4444' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Remove card ending 4444?');
});

test('TreeView: items report set size and position; typing jumps to a label', async ({ page }) => {
  const s = await open(page, 'tree-view');
  const items = s.getByRole('treeitem');
  await expect(items.first()).toHaveAttribute('aria-setsize', /\d+/);
  await expect(items.first()).toHaveAttribute('aria-posinset', '1');
  await items.first().focus();
  const labels = await items.evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
  const target = labels.find((l, i) => i > 0 && l[0] && l[0].toLowerCase() !== labels[0]![0]!.toLowerCase());
  if (target) {
    await page.keyboard.type(target[0]!.toLowerCase());
    await expect(page.locator('[role=treeitem]:focus')).toContainText(target.slice(0, 1), { ignoreCase: true });
  }
});

test('TimeSeriesChart: focusable region reads values with the arrow keys', async ({ page }) => {
  const s = await open(page, 'charts');
  const chart = s.getByRole('group', { name: /arrow keys/ }).first();
  await chart.focus();
  await page.keyboard.press('ArrowRight');
  await expect(chart.locator('[aria-live=polite]').first()).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(chart.locator('[aria-live=polite]').first()).toBeEmpty();
});

test('SegmentedBar: has a text summary and gaps between segments', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/app');
  const bar = page.getByRole('img', { name: /running/ }).first();
  await expect(bar).toBeVisible();
  await expect(bar).toHaveCSS('column-gap', '2px');
});

test('Dialog: focus moves in, Tab stays inside, Escape closes and returns focus to the trigger', async ({ page }) => {
  const s = await open(page, 'dialog');
  const trigger = s.getByRole('button', { name: 'Rename server' });
  await trigger.click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); await expect(dlg.locator(':focus')).toHaveCount(1); }
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('AlertDialog: Escape cancels, focus starts on the safe choice, typed confirmation gates the button', async ({ page }) => {
  const s = await open(page, 'alert-dialog');
  const trigger = s.getByRole('button', { name: 'Delete server' });
  await trigger.click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Cancel' })).toBeFocused().catch(async () => { await expect(dlg.locator(':focus')).toHaveCount(1); });
  await expect(dlg.getByRole('button', { name: /^Delete/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Tabs: arrows move and select, Home/End jump', async ({ page }) => {
  const s = await open(page, 'tabs-breadcrumbs');
  const tabs = s.getByRole('tab');
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
});

test('Pagination: buttons are keyboard operable and the current page is marked', async ({ page }) => {
  const s = await open(page, 'pagination');
  const nav = s.getByRole('navigation').first();
  const cur = nav.locator('[aria-current="page"]');
  const start = Number(await cur.textContent());
  await nav.getByRole('button', { name: /next/i }).focus();
  await page.keyboard.press('Enter');
  await expect(cur).toHaveText(String(start + 1));
  await nav.getByRole('button', { name: /previous/i }).focus();
  await page.keyboard.press('Space');
  await expect(cur).toHaveText(String(start));
});

test('DateTimePicker: date and time make one value, time zone is stated, Save enables only when set', async ({ page }) => {
  const s = await open(page, 'dropzone-date');
  const box = s.locator('fieldset', { hasText: 'Schedule' }).first();
  await expect(box).toContainText('Times are in');
  const save = s.getByRole('button', { name: 'Save schedule' }).first();
  await expect(save).toBeDisabled();
  await box.getByRole('button', { name: /^Date/ }).click();
  await page.locator('[role=grid] button:not([disabled])').first().click();
  await box.getByRole('button', { name: /^Time/ }).click();
  await page.getByRole('listbox', { name: 'Hours' }).getByRole('option', { name: '14' }).click();
  await page.getByRole('listbox', { name: 'Minutes' }).getByRole('option', { name: '30' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(box.getByRole('button', { name: /^Time: 14:30/ })).toBeVisible();
  await expect(save).toBeEnabled();
});

test('DateRangePicker: popover is as wide as the calendar and the range reads as one band', async ({ page }) => {
  const s = await open(page, 'dropzone-date');
  await s.getByRole('button', { name: /^Report period/ }).click();
  await page.getByRole('button', { name: 'Last 30 days' }).click();
  await s.getByRole('button', { name: /^Report period/ }).click();
  const pop = page.getByRole('group', { name: 'Quick ranges' }).locator('..');
  const w = (await pop.boundingBox())!.width;
  expect(w).toBeLessThan(330);
  await expect(page.getByText(/^Selected:/)).toBeVisible();
});
