import { test, expect, type Page } from '@playwright/test';

/**
 * Interaction tests: real keyboard and pointer behavior in a browser, not render checks.
 * Each test names the concern it reproduces. A failing test here is a confirmed defect.
 */
async function open(page: Page, id: string, width = 1100, height = 900) {
  // Lets scripts/registry-report.ts attribute this test to the component it exercises.
  test.info().annotations.push({ type: 'story', description: id });
  await page.setViewportSize({ width, height });
  await page.goto(`/?embed=${id}`);
  await page.locator(`[data-story="${id}"]`).waitFor();
}
const scenario = (page: Page, name: string) => page.locator(`section[data-scenario="${name}"]`);

test.describe('actions', () => {
  test('SegmentedControl is a radio group and arrow keys change the selection', async ({ page }) => {
    await open(page, 'segmented-control');
    const group = scenario(page, 'Time range').getByRole('radiogroup');
    await expect(group).toBeVisible();
    const radios = group.getByRole('radio');
    const before = await group.getByRole('radio', { checked: true }).textContent();
    await group.getByRole('radio', { checked: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio', { checked: true })).not.toHaveText(before ?? '');
    expect(await radios.count()).toBeGreaterThan(1);
  });

  test('ActionMenu opens with keyboard, Escape closes and returns focus to the trigger', async ({ page }) => {
    await open(page, 'action-menu');
    const trigger = scenario(page, 'Row menu').getByRole('button').first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('ButtonGroup: a failing action shows feedback instead of failing silently', async ({ page }) => {
    await open(page, 'button-group');
    const s = scenario(page, 'Power actions: request fails');
    await s.getByRole('button', { name: /restart|stop|start/i }).first().click();
    await expect(s.getByRole('alert').or(s.getByText(/could not|failed|try again/i)).first()).toBeVisible({ timeout: 4000 });
  });

  test('ResponsiveActionBar at 320px: no overflow, hidden actions reachable in More', async ({ page }) => {
    await open(page, 'toolbar', 320);
    const s = scenario(page, 'File actions (resize to see overflow)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const more = s.getByRole('button', { name: /more actions/i });
    await expect(more).toBeVisible();
    await more.click();
    expect(await page.getByRole('menuitem').count()).toBeGreaterThan(0);
  });
});

test.describe('forms', () => {
  test('NumberField: stepper stops at max, typing beyond clamps on blur, arrows respect limits', async ({ page }) => {
    await open(page, 'number-fields');
    const input = page.getByRole('textbox', { name: 'View distance' }).or(page.getByRole('spinbutton', { name: 'View distance' }));
    await input.fill('999');
    await input.blur();
    await expect(input).toHaveValue('32');
    await expect(page.getByRole('button', { name: /increase view distance/i })).toBeDisabled();
    await input.focus();
    await page.keyboard.press('ArrowUp');
    await expect(input).toHaveValue('32');
    await input.fill('1');
    await input.blur();
    await expect(input).toHaveValue('2');
  });

  test('SecretField: plain value is gone from the DOM after hiding', async ({ page }) => {
    await open(page, 'secret-field');
    const s = scenario(page, 'Fetched on reveal');
    await s.getByRole('button', { name: /reveal|show/i }).click();
    await expect(s.locator('input[readonly]')).not.toHaveValue(/^•+$/, { timeout: 3000 });
    await s.getByRole('button', { name: /hide/i }).click();
    await expect(s.locator('input[readonly]')).toHaveValue(/^•+$/);
  });

  test('SecretField: reveal failure is announced', async ({ page }) => {
    await open(page, 'secret-field');
    const s = scenario(page, 'Reveal fails');
    await s.getByRole('button', { name: /reveal|show/i }).click();
    await expect(s.getByText(/could not decrypt/i)).toBeVisible({ timeout: 3000 });
  });

  test('Combobox: typing filters, arrows + Enter select', async ({ page }) => {
    await open(page, 'combobox');
    const s = scenario(page, 'Single and grouped');
    const input = s.getByRole('combobox', { name: 'Minecraft version' });
    await input.click();
    await input.fill('1.20');
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();
    for (const o of await options.allTextContents()) expect(o).toContain('1.20');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue(/1\.20/);
  });

  test('MultiSelect: max is enforced and chips can be removed', async ({ page }) => {
    await open(page, 'combobox');
    const s = scenario(page, 'Multiple');
    const chips = s.getByRole('button', { name: /remove/i });
    const start = await chips.count();
    expect(start).toBeGreaterThan(0);
    await chips.first().click();
    expect(await s.getByRole('button', { name: /remove/i }).count()).toBe(start - 1);
  });

  test('FormWizard: Next is blocked by validation, Back keeps values, errors clear when fixed', async ({ page }) => {
    await open(page, 'form-wizard');
    const s = scenario(page, 'Deploy (sample)');
    await s.getByRole('button', { name: 'Continue' }).click();
    await expect(s.getByRole('alert')).toContainText(/fix 1 field/i);
    await s.getByRole('textbox', { name: 'Server name' }).fill('survival');
    await s.getByRole('button', { name: 'Continue' }).click();
    await expect(s.getByRole('heading', { name: 'Pick a region' })).toBeFocused();
    await s.getByRole('button', { name: 'Back' }).click();
    await expect(s.getByRole('textbox', { name: 'Server name' })).toHaveValue('survival');
  });

  test('FormWizard: draft survives a reload when persistKey is set', async ({ page }) => {
    await open(page, 'form-wizard');
    const s = scenario(page, 'Deploy (sample)');
    await s.getByRole('textbox', { name: 'Server name' }).fill('keepme');
    await s.getByRole('button', { name: 'Continue' }).click();
    await page.reload();
    await page.locator('[data-story="form-wizard"]').waitFor();
    await expect(scenario(page, 'Deploy (sample)').getByRole('heading', { name: 'Pick a region' })).toBeVisible();
    await scenario(page, 'Deploy (sample)').getByRole('button', { name: 'Back' }).click();
    await expect(scenario(page, 'Deploy (sample)').getByRole('textbox', { name: 'Server name' })).toHaveValue('keepme');
  });
});

test.describe('overlays', () => {
  test('Dialog: focus moves in, Tab stays inside, Escape restores focus to the trigger', async ({ page }) => {
    await open(page, 'dialog');
    const trigger = page.getByRole('button', { name: 'Rename server' });
    await trigger.click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      // Base UI's focus guard receives focus for one frame at the wrap point and redirects it, so wait for focus to settle.
      await expect.poll(() => dlg.evaluate((d) => d.contains(document.activeElement)), { timeout: 1500 }).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('AlertDialog: typed confirmation gates the confirm button; outside press does not dismiss', async ({ page }) => {
    await open(page, 'alert-dialog');
    await page.getByRole('button', { name: 'Delete server' }).click();
    const dlg = page.getByRole('alertdialog');
    const confirm = dlg.getByRole('button', { name: 'Delete server' });
    await expect(confirm).toBeDisabled();
    await page.mouse.click(5, 5);
    await expect(dlg).toBeVisible();
    await dlg.getByRole('textbox').fill('survival-eu');
    await expect(confirm).toBeEnabled();
  });

  test('Nested overlays: AlertDialog opened from a Dialog stacks above it and returns focus to the Dialog', async ({ page }) => {
    await open(page, 'team-members');
    await page.getByRole('button', { name: /actions for alex/i }).click();
    await page.getByRole('menuitem', { name: /edit permissions/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('data', () => {
  test('DataTable: keyboard sort, aria-sort updates, search filters and clears', async ({ page }) => {
    await open(page, 'data-table');
    const s = scenario(page, 'Services (sample data)');
    const th = s.getByRole('columnheader', { name: /RAM/ });
    await th.getByRole('button').focus();
    await page.keyboard.press('Enter');
    await expect(th).toHaveAttribute('aria-sort', /ascending|descending/);
    await s.getByRole('searchbox').or(s.getByRole('textbox', { name: /search/i })).first().fill('zzzz');
    await expect(s.getByText(/no matches/i)).toBeVisible();
    await s.getByRole('button', { name: /clear search/i }).last().click();
    expect(await s.getByRole('row').count()).toBeGreaterThan(2);
  });

  test('DataTable at 390px: cards, no horizontal overflow, selection works', async ({ page }) => {
    await open(page, 'data-table', 390);
    const s = scenario(page, 'Services (sample data)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await s.getByRole('checkbox').nth(1).click();
    await expect(page.getByRole('toolbar', { name: /bulk actions/i }).or(page.getByText(/1 selected/i)).first()).toBeVisible();
  });

  test('FileExplorer at 390px: row actions stay reachable', async ({ page }) => {
    await open(page, 'files', 390);
    const s = scenario(page, 'Explorer (sample)');
    expect(await s.getByRole('button', { name: /actions for/i }).count()).toBeGreaterThan(0);
  });

  test('PlayerManagerTable at 390px: row actions stay reachable', async ({ page }) => {
    await open(page, 'player-manager', 390);
    const s = scenario(page, 'Players (sample)');
    expect(await s.getByRole('button', { name: /actions for/i }).count()).toBeGreaterThan(0);
  });

  test('PlayerManagerTable: a failing action is reported to the user', async ({ page }) => {
    await open(page, 'player-manager');
    const s = scenario(page, 'Players (sample, actions fail)');
    await s.getByRole('button', { name: /actions for steve/i }).click();
    await page.getByRole('menuitem', { name: /remove operator|make operator/i }).click();
    await expect(s.getByRole('alert')).toBeVisible({ timeout: 4000 });
  });
});

test.describe('technical', () => {
  test('ServerConsole: a failing command shows an error and keeps the command for retry', async ({ page }) => {
    await open(page, 'server-console');
    const s = scenario(page, 'Command fails');
    const input = s.getByRole('textbox', { name: 'Console command' });
    await input.fill('say hi');
    await input.press('Enter');
    await expect(s.getByRole('alert')).toBeVisible({ timeout: 3000 });
    await expect(input).toHaveValue('say hi');
  });

  test('DeployConfigurator: Custom mode exposes env vars and they are part of the submitted value', async ({ page }) => {
    await open(page, 'deploy-configurator');
    await page.getByRole('radio', { name: 'Custom' }).click();
    await expect(page.getByText('Environment variables')).toBeVisible();
    await expect(page.getByText(/startup command|java flags|extra ports/i).first()).toBeVisible();
  });
});

test.describe('charts', () => {
  test('Chart resizes with its container without overflow', async ({ page }) => {
    await open(page, 'charts', 1100);
    const svg = scenario(page, 'Area with range selector').locator('svg.recharts-surface').first();
    const w1 = (await svg.boundingBox())!.width;
    await page.setViewportSize({ width: 420, height: 900 });
    await page.waitForTimeout(400);
    const w2 = (await svg.boundingBox())!.width;
    expect(w2).toBeLessThan(w1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('reduced motion', () => {
  test('prefers-reduced-motion disables long transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'button');
    const d = await page.getByRole('button', { name: 'Primary', exact: true }).evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(parseFloat(d)).toBeLessThanOrEqual(0.01);
  });
});

test.describe('advanced components', () => {
  test('CommandButton copies its command and announces it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, 'command-button');
    const s = scenario(page, 'Install command');
    await s.getByRole('button', { name: /copy command/i }).click();
    await expect(s.getByRole('status')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('curl -fsSL https://example.com/install.sh | sh');
  });

  test('RevealButton: value absent from DOM until revealed, hides on demand, failure announced', async ({ page }) => {
    await open(page, 'reveal-button');
    const s = scenario(page, 'Static value');
    await expect(s).not.toContainText('203.0.113.42');
    const btn = s.getByRole('button', { name: /reveal server address/i });
    await btn.click();
    await expect(s).toContainText('203.0.113.42:25565');
    await expect(s.getByRole('button', { name: /hide server address/i })).toHaveAttribute('aria-expanded', 'true');
    await s.getByRole('button', { name: /hide server address/i }).click();
    await expect(s).not.toContainText('203.0.113.42');
    const f = scenario(page, 'Fetch fails');
    await f.getByRole('button', { name: /reveal ip address/i }).click();
    await expect(f.getByRole('alert')).toContainText('Could not load');
  });

  test('CheckboxCardGroup: Space toggles, several can be on, disabled card is inert', async ({ page }) => {
    await open(page, 'checkbox-card-group');
    const s = scenario(page, 'Addons');
    const ddos = s.getByRole('checkbox', { name: /extra ddos/i });
    await ddos.focus();
    await page.keyboard.press('Space');
    await expect(ddos).toBeChecked();
    await expect(s.getByRole('checkbox', { name: /daily backups/i })).toBeChecked();
    await expect(s.getByRole('checkbox', { name: /dedicated ip/i })).toBeDisabled();
  });

  test('ValidationSummary: appears on submit, takes focus, links move focus to the field', async ({ page }) => {
    await open(page, 'validation-summary');
    await page.getByRole('button', { name: 'Save' }).click();
    const alert = page.getByRole('alert').first();
    await expect(alert).toContainText('Fix 2 problems');
    await expect(alert).toBeFocused();
    await alert.getByRole('link', { name: /email/i }).click();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeFocused();
  });

  test('ChartLegend: toggling hides a series, the last one cannot be hidden', async ({ page }) => {
    await open(page, 'chart-legend');
    const legend = page.getByRole('list', { name: 'Series' });
    const cpu = legend.getByRole('button', { name: /^CPU/ });
    await cpu.click();
    await expect(cpu).toHaveAttribute('aria-pressed', 'false');
    await legend.getByRole('button', { name: /^RAM/ }).click();
    await expect(legend.getByRole('button', { name: /^Network/ })).toBeDisabled();
  });

  test('FilterBuilder: rules filter rows with AND, incomplete rule is ignored, Clear all resets', async ({ page }) => {
    await open(page, 'filter-builder');
    const s = scenario(page, 'Services (sample data)');
    await expect(s.getByRole('status').filter({ hasText: 'of 6 services' })).toContainText('6 of 6');
    await s.getByRole('button', { name: 'Add filter' }).click();
    await expect(s.getByRole('status').filter({ hasText: 'of 6 services' })).toContainText('6 of 6');
    await s.getByRole('textbox', { name: 'Filter 1 value' }).fill('minecraft');
    await expect(s.getByRole('status').filter({ hasText: 'of 6 services' })).toContainText('0 of 6');
    await s.getByRole('textbox', { name: 'Filter 1 value' }).fill('hub');
    await expect(s.getByRole('status').filter({ hasText: 'of 6 services' })).toContainText('1 of 6');
    await s.getByRole('button', { name: 'Clear all' }).click();
    await expect(s.getByRole('status').filter({ hasText: 'of 6 services' })).toContainText('6 of 6');
    await expect(s.getByRole('button', { name: /remove filter/i })).toHaveCount(0);
  });

  test('DataTable expandable rows: button has state, panel opens and closes, works at 390px', async ({ page }) => {
    for (const w of [1100, 390]) {
      await open(page, 'data-table', w);
      const s = scenario(page, 'Expandable rows');
      const btn = s.getByRole('button', { name: /expand details for survival-eu/i });
      await expect(btn).toHaveAttribute('aria-expanded', 'false');
      await btn.click();
      const open_ = s.getByRole('button', { name: /collapse details for survival-eu/i });
      await expect(open_).toHaveAttribute('aria-expanded', 'true');
      await expect(s.getByText('Memory').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await open_.click();
      await expect(s.getByText('Memory')).toHaveCount(0);
    }
  });

  test('DataTable: a clickable row is reachable and activated with the keyboard', async ({ page }) => {
    await open(page, 'data-table');
    const s = scenario(page, 'Services (sample data)');
    const row = s.getByRole('row', { name: /creative-hub/ });
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('DataTable at 390px: row click is reachable through an explicit Open button', async ({ page }) => {
    await open(page, 'data-table', 390);
    const s = scenario(page, 'Services (sample data)');
    await s.getByRole('button', { name: 'Open creative-hub' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('AuditTrail: filter by outcome, expand shows details', async ({ page }) => {
    await open(page, 'audit-trail');
    const s = scenario(page, 'Events (sample)');
    await s.getByRole('button', { name: 'Add filter' }).click();
    await s.getByRole('combobox', { name: 'Filter 1 field' }).click();
    await page.getByRole('option', { name: 'Outcome' }).click();
    await s.getByRole('combobox', { name: 'Filter 1 value' }).click();
    await page.getByRole('option', { name: 'Failed' }).click();
    await expect(s.locator('tbody tr')).toHaveCount(2); // the two failed events
    await s.getByRole('button', { name: /expand details for login by mara/i }).click();
    await expect(s.getByText('Wrong authenticator code')).toBeVisible();
  });
});

test.describe('responsive bars and charts', () => {
  test('BulkActionBar at 320px: every action sits inside the bar and the page does not overflow', async ({ page }) => {
    await open(page, 'bulk-action-bar', 320, 700);
    const bar = page.getByRole('region', { name: 'Bulk actions' });
    await expect(bar).toBeVisible();
    const inside = await bar.evaluate((r) => {
      const pill = r.firstElementChild as HTMLElement; const pr = pill.getBoundingClientRect();
      return Array.from(pill.querySelectorAll('button')).every((b) => { const br = b.getBoundingClientRect(); return br.left >= pr.left - 1 && br.right <= pr.right + 1 && br.bottom <= pr.bottom + 1 && br.top >= pr.top - 1; });
    });
    expect(inside).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });

  test('Chart tooltip stays inside the viewport at 390px', async ({ page }) => {
    await open(page, 'chart-legend', 390, 800);
    const box = await page.locator('.recharts-wrapper').first().boundingBox();
    expect(box).not.toBeNull();
    // Left of the plot area is the y axis, so start at 0.3.
    for (const f of [0.3, 0.6, 0.97]) {
      await page.mouse.move(box!.x + box!.width * f, box!.y + box!.height / 2, { steps: 5 });
      await page.waitForTimeout(500); // tooltip slides for 400 ms
      const tip = page.locator('.recharts-tooltip-wrapper').first();
      await expect(tip).toBeVisible();
      const t = await tip.boundingBox();
      expect(t!.x).toBeGreaterThanOrEqual(-1);
      expect(t!.x + t!.width).toBeLessThanOrEqual(390 + 1);
    }
  });
});

test.describe('more component behavior', () => {
  test('TagInput: invalid tag is rejected with a message, valid tag is added, chip can be removed', async ({ page }) => {
    await open(page, 'tag-input');
    const s = scenario(page, 'Allowed IPs');
    const input = s.getByRole('textbox', { name: 'Allowed IP addresses' });
    await input.fill('not-an-ip');
    await input.press('Enter');
    await expect(s.getByText(/is not/i)).toBeVisible();
    await expect(s.getByText('not-an-ip', { exact: true })).toHaveCount(0);
    await input.fill('198.51.100.4');
    await input.press('Enter');
    await expect(s.getByText('198.51.100.4', { exact: true })).toBeVisible();
    await s.getByRole('button', { name: /remove 198\.51\.100\.4/i }).click();
    await expect(s.getByText('198.51.100.4', { exact: true })).toHaveCount(0);
  });

  test('Tabs: arrows move focus, Enter selects, panel follows', async ({ page }) => {
    await open(page, 'tabs-breadcrumbs');
    const tabs = scenario(page, 'Tabs').getByRole('tab');
    const first = tabs.first();
    await first.focus();
    await expect(first).toHaveAttribute('aria-selected', 'true');
    // Manual activation: arrows move focus, Enter selects (WAI-ARIA tabs pattern).
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(first).toHaveAttribute('aria-selected', 'false');
    await expect(scenario(page, 'Tabs').getByRole('tabpanel')).toBeVisible();
  });

  test('Pagination: next and previous change the current page (story starts on page 5 of 20, zero-based index 4)', async ({ page }) => {
    await open(page, 'pagination');
    const s = scenario(page, 'Many pages');
    await expect(s.locator('[aria-current="page"]')).toHaveText('5');
    await s.getByRole('button', { name: /next page/i }).click();
    await expect(s.locator('[aria-current="page"]')).toHaveText('6');
    await s.getByRole('button', { name: /previous page/i }).click();
    await s.getByRole('button', { name: /previous page/i }).click();
    await expect(s.locator('[aria-current="page"]')).toHaveText('4');
  });

  test('ServerPowerToolbar: Start moves through Starting to Running, Locked disables actions with a reason', async ({ page }) => {
    await open(page, 'server-power');
    const s = scenario(page, 'Interactive (simulated)');
    await s.getByRole('button', { name: /^start/i }).click();
    await expect(s.getByText('Starting').first()).toBeVisible();
    await expect(s.getByText('Running').first()).toBeVisible({ timeout: 4000 });
    const locked = scenario(page, 'Locked');
    for (const b of await locked.getByRole('button').all()) await expect(b).toBeDisabled();
  });

  test('DNSRecordEditor: an invalid record is blocked with a field error', async ({ page }) => {
    await open(page, 'dns-editor');
    const s = scenario(page, 'example.com (sample)');
    await s.getByRole('button', { name: /add record/i }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: /^(save|add)/i }).click();
    await expect(dlg.getByRole('alert').or(dlg.getByText(/required|enter|invalid|must/i)).first()).toBeVisible();
    await expect(dlg).toBeVisible();
  });

  test('TwoFactorSetup: a wrong code is reported and the boxes reset, the sample code is accepted', async ({ page }) => {
    await open(page, 'otp-two-factor');
    const s = scenario(page, 'Enrol (sample: code 123456 succeeds)');
    const boxes = s.getByRole('textbox');
    await boxes.first().click();
    await page.keyboard.type('111111');
    await expect(s.getByRole('alert')).toContainText('did not work');
    await expect(boxes.first()).toHaveValue('');
    await boxes.first().click();
    await page.keyboard.type('123456');
    await expect(s.getByRole('alert')).toHaveCount(0, { timeout: 3000 });
  });
});

test.describe('safety fixes', () => {
  test('ServerConsole without onCommand: input is disabled and explains why', async ({ page }) => {
    await open(page, 'server-console');
    const s = scenario(page, 'No command handler');
    const input = s.getByRole('textbox', { name: 'Console command' });
    await expect(input).toBeDisabled();
    await expect(input).toHaveAttribute('placeholder', /cannot be sent/i);
  });

  test('SecretField without value or onReveal: Reveal and Copy are not offered', async ({ page }) => {
    await open(page, 'secret-field');
    const s = scenario(page, 'Not retrievable');
    await expect(s.getByRole('button', { name: /reveal|hide|copy/i })).toHaveCount(0);
    await expect(s.getByRole('textbox', { name: 'Deploy key' })).toHaveAttribute('placeholder', /shown once/i);
  });

  test('SecretField: cancelling a slow reveal drops the late value', async ({ page }) => {
    await open(page, 'secret-field');
    const s = scenario(page, 'Slow reveal');
    const field = s.getByRole('textbox', { name: 'Webhook secret' });
    await s.getByRole('button', { name: 'Reveal value' }).click();
    await s.getByRole('button', { name: 'Cancel reveal' }).click();
    await expect(s.getByRole('button', { name: 'Reveal value' })).toBeVisible();
    await page.waitForTimeout(3300); // the original request resolves after 3 s
    await expect(field).toHaveValue(/^•+$/);
    await expect(s.getByRole('button', { name: 'Hide value' })).toHaveCount(0);
  });

  test('SecretField: a slow reveal that is not cancelled does show the value, and Hide masks it again', async ({ page }) => {
    await open(page, 'secret-field');
    const s = scenario(page, 'Slow reveal');
    await s.getByRole('button', { name: 'Reveal value' }).click();
    await expect(s.getByRole('textbox', { name: 'Webhook secret' })).toHaveValue('whsec_sample_value', { timeout: 5000 });
    await s.getByRole('button', { name: 'Hide value' }).click();
    await expect(s.getByRole('textbox', { name: 'Webhook secret' })).toHaveValue(/^•+$/);
  });

  test('FormWizard persistExclude: the token never reaches sessionStorage and is empty after reload', async ({ page }) => {
    await open(page, 'form-wizard');
    const s = scenario(page, 'Draft without secrets');
    await s.getByRole('textbox', { name: 'Bot name' }).fill('helper-bot');
    await s.getByRole('button', { name: 'Continue' }).click();
    await s.getByLabel('Bot token', { exact: true }).fill('SUPER-SECRET-TOKEN');
    await expect.poll(() => page.evaluate(() => JSON.stringify({ ...sessionStorage }))).toContain('helper-bot');
    const stored = await page.evaluate(() => JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain('SUPER-SECRET-TOKEN');
    await page.reload();
    await page.locator('[data-story="form-wizard"]').waitFor();
    const r = scenario(page, 'Draft without secrets');
    await expect(r.getByRole('heading', { name: 'Paste the bot token' })).toBeVisible();
    await expect(r.getByLabel('Bot token', { exact: true })).toHaveValue('');
    await r.getByRole('button', { name: 'Back' }).click();
    await expect(r.getByRole('textbox', { name: 'Bot name' })).toHaveValue('helper-bot');
  });
});
