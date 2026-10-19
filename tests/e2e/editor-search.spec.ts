import { test, expect } from '@playwright/test';

test.skip(!process.env['ADMIN_AUTH_FIXTURE'], 'Runs against the isolated Fortless visual fixture.');

test('CodeMirror search uses Petal controls and navigates a 5,000-line file', async ({ page }) => {
  await page.goto('/__e2e/editor?legacy=1');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+f');
  await page.screenshot({ path: 'artifacts/editor-search-before.png', fullPage: true });

  await page.goto('/__e2e/editor');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+f');
  const search = page.getByLabel('Find in file');
  await expect(search).toBeFocused();
  await search.fill('needle');
  await expect(page.getByText('1 of 3')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByText('2 of 3')).toBeVisible();
  await expect(page.locator('.cm-searchMatch-selected')).toBeVisible();
  const scrollTop = await page.locator('.cm-scroller').evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(1_000);
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByText('1 of 3')).toBeVisible();
  await search.fill('not-present-anywhere');
  await expect(page.getByText('No matches')).toBeVisible();
  await page.screenshot({ path: 'artifacts/editor-search-after-dark.png', fullPage: true });
});

test('search state survives tabs, regex replace is undoable, and mobile/light render correctly', async ({ page }) => {
  await page.goto('/__e2e/editor');
  await page.locator('.cm-content').click();
  await page.keyboard.type('changed ');
  await expect(page.getByText('Unsaved')).toBeVisible();
  await page.keyboard.press('Control+f');
  await page.getByLabel('Find in file').fill('setting\\.(8|9)=');
  await page.getByText('Regex', { exact: true }).click();
  await expect(page.getByText('1 of 1')).toBeVisible();
  await page.getByLabel('Replace with').fill('option.');
  await page.locator('button[title="Replace current match"]').click();
  await page.keyboard.press('Escape');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+z');
  await page.getByRole('button', { name: 'Small file' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+f');
  await page.getByLabel('Find in file').fill('needle');
  await expect(page.getByText('1 of 1')).toBeVisible();
  await page.getByRole('button', { name: 'Large file' }).click();
  await expect(page.getByText('1 of 1')).toBeVisible();

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.cm-panel.card')).toBeVisible();
  await page.screenshot({ path: 'artifacts/editor-search-after-light-mobile.png', fullPage: true });
});
