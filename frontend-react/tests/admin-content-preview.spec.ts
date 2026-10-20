import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test('admin content route renders editable Knowledge Base and announcement records', async ({ page }) => {
  const [html, script] = await Promise.all([
    readFile('../public/admin.html', 'utf8'),
    readFile('../public/assets/admin-ui.js', 'utf8'),
  ]);
  await page.route('**/admin/content', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.route('**/assets/admin-ui.js**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') return route.fulfill(json({ user: { name: 'Stefan Admin' } }));
    if (path === '/api/v1/admin/me') return route.fulfill(json({ staff: { role: 'OWNER', permissions: ['admin:access', 'content:read', 'content:manage'] } }));
    if (path === '/api/v1/admin/content') return route.fulfill(json({
      knowledgeCategories: [{ id: 'kbc_1', slug: 'minecraft', name: 'Minecraft', description: '', sortOrder: 10 }],
      announcementCategories: [{ id: 'anc_1', slug: 'news', name: 'News', description: '', sortOrder: 10 }],
      articles: [{ id: 'kba_1', slug: 'eula', title: 'Minecraft EULA', category: 'minecraft', summary: 'Accept EULA', contentMarkdown: '## EULA', tags: ['minecraft'], isPublished: true }],
      announcements: [{ id: 'ann_1', slug: 'panel-update', title: 'Panel update', category: 'news', kind: 'NEWS', bodyMarkdown: 'Ready', isPublished: true }],
    }));
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' });
  });
  await page.goto('/admin/content');
  await expect(page.getByRole('heading', { name: 'Content management' }).last()).toBeVisible();
  await expect(page.getByText('Minecraft EULA')).toBeVisible();
  await expect(page.getByText('Panel update')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.locator('#knowledgeCategoryForm input[name="name"]')).toHaveValue('Minecraft');
});
