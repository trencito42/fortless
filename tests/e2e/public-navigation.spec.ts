import { expect, test, type Page } from '@playwright/test';

type NavGeometry = {
  viewportWidth: number;
  documentWidth: number;
  left: number;
  width: number;
  center: number;
  fontFamily: string;
};

async function navGeometry(page: Page, selector: string): Promise<NavGeometry> {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      left: rect.left,
      width: rect.width,
      center: rect.left + rect.width / 2,
      fontFamily: getComputedStyle(element).fontFamily,
    };
  });
}

function expectStable(actual: NavGeometry, baseline: NavGeometry): void {
  expect(actual.documentWidth).toBeLessThanOrEqual(actual.viewportWidth);
  expect(Math.abs(actual.left - baseline.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.width - baseline.width)).toBeLessThanOrEqual(1);
  expect(actual.fontFamily).toBe(baseline.fontFamily);
}

test('public navigation stays styled and aligned through repeated history traversal', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/Fortless/);
  const homeBaseline = await navGeometry(page, '#nav .bar');
  expect(homeBaseline.fontFamily).toMatch(/Inter/);

  await page.locator('a[href="/status"]').first().click();
  await expect(page).toHaveURL(/\/status$/);
  await expect(page).toHaveTitle(/System Status/);
  const statusBaseline = await navGeometry(page, '.pn .in');
  expect(statusBaseline.fontFamily).toMatch(/Inter/);

  for (let cycle = 0; cycle < 10; cycle += 1) {
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    expectStable(await navGeometry(page, '#nav .bar'), homeBaseline);

    await page.goForward();
    await expect(page).toHaveURL(/\/status$/);
    expectStable(await navGeometry(page, '.pn .in'), statusBaseline);
    await expect(page.locator('#nl a[aria-current="page"]')).toHaveText('Status');

    await page.locator('a.brand[href="/"]').click();
    await expect(page).toHaveURL(/\/$/);
    expectStable(await navGeometry(page, '#nav .bar'), homeBaseline);

    await page.locator('a[href="/status"]').first().click();
    await expect(page).toHaveURL(/\/status$/);
    expectStable(await navGeometry(page, '.pn .in'), statusBaseline);
  }

  expect(consoleErrors).toEqual([]);
});

test('theme persists across native public document navigation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('fortless_theme', 'dark');
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.dk = '1';
  });
  await page.locator('a[href="/status"]').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('a.brand[href="/"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
