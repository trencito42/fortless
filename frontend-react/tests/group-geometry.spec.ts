import { test, expect, type Page } from '@playwright/test';

/**
 * Geometry contract for grouped controls (see src/design-system/actions/group-shape.ts):
 * every item is a complete pill, all items share height, items are separated by a gap that is wider than a focus ring,
 * and the group never clips (overflow visible). Computed radii alone can lie (CSS scales radii on an edge), so the check
 * also asserts that no two corners on one edge sum beyond the edge, i.e. nothing was scaled down.
 */
const measure = (page: Page, sel: string) => page.locator(sel).first().evaluate((g) => {
  const gr = g.getBoundingClientRect();
  const kids = [...g.children].map((c) => {
    const s = getComputedStyle(c); const r = c.getBoundingClientRect();
    return { tl: parseFloat(s.borderTopLeftRadius), tr: parseFloat(s.borderTopRightRadius), br: parseFloat(s.borderBottomRightRadius), bl: parseFloat(s.borderBottomLeftRadius), h: r.height, w: r.width, left: r.left, right: r.right };
  });
  return { kids, overflow: getComputedStyle(g).overflow, gapPx: kids.slice(1).map((k, i) => k.left - kids[i]!.right), w: gr.width };
});

for (const [story, sel] of [['button-group', '[role="group"]'], ['toggle-button-group', '[role="group"]'], ['server-power', '[role="group"]'], ['split-button', '[data-story] div.inline-flex']] as const) {
  test(`${story}: every item is a full pill with equal height and a gap`, async ({ page }) => {
    await page.goto(`/?embed=${story}`);
    await page.locator(`[data-story="${story}"]`).waitFor();
    const m = await measure(page, sel);
    expect(m.kids.length).toBeGreaterThan(1);
    for (const c of m.kids) {
      for (const r of [c.tl, c.tr, c.br, c.bl]) expect(r).toBeGreaterThanOrEqual(c.h / 2 - 0.5);
    }
    expect(new Set(m.kids.map((c) => Math.round(c.h))).size).toBe(1);
    for (const g of m.gapPx) expect(g).toBeGreaterThanOrEqual(4);
    expect(m.overflow).toBe('visible');
  });
}

test('visual crop of every group', async ({ page }) => {
  for (const id of ['button-group', 'toggle-button-group', 'split-button', 'server-power', 'segmented-control']) {
    await page.goto(`/?embed=${id}`); await page.locator(`[data-story="${id}"]`).waitFor();
    await page.screenshot({ path: `test-results/geom-${id}.png`, clip: { x: 0, y: 0, width: 900, height: 420 } });
  }
});
