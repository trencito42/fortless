import { afterEach, describe, expect, it } from 'vitest';
import { makeHarness, type Harness } from './helpers/harness.js';

let harness: Harness | undefined;
afterEach(async () => { await harness?.close(); harness = undefined; });

describe('managed customer content', () => {
  it('publishes Knowledge Base articles and read-tracked announcements through dedicated endpoints', async () => {
    harness = await makeHarness();
    const staff = harness.user('content_staff', { staff: 'SUPPORT' });

    const category = await harness.call('POST', '/api/v1/admin/content/knowledge-categories', staff.token, {
      slug: 'game-guides', name: 'Game guides', description: 'Customer game guides', sortOrder: 10,
    });
    expect(category.statusCode).toBe(201);

    const article = await harness.call('POST', '/api/v1/admin/content/articles', staff.token, {
      slug: 'test-game-guide', title: 'Test game guide', category: 'game-guides', summary: 'A useful guide.',
      contentMarkdown: '## Start\n\nFollow the steps.', tags: ['game'], isPublished: true,
    });
    expect(article.statusCode).toBe(201);
    const publicKb = await harness.call('GET', '/api/v1/kb/articles?q=test-game-guide', null);
    expect(publicKb.statusCode).toBe(200);
    expect(publicKb.json().categories).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'game-guides' })]));

    const announcement = await harness.call('POST', '/api/v1/admin/content/announcements', staff.token, {
      slug: 'new-customer-panel', category: 'news', kind: 'NEWS', title: 'New customer panel',
      bodyMarkdown: 'The new customer panel is available.', isPublished: true,
    });
    expect(announcement.statusCode).toBe(201);
    const announcementId = announcement.json().announcement.id as string;

    const before = await harness.call('GET', '/api/v1/announcements', staff.token);
    expect(before.json().announcements).toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId, readAt: null })]));
    expect((await harness.call('POST', `/api/v1/announcements/${announcementId}/read`, staff.token, {})).statusCode).toBe(200);
    const after = await harness.call('GET', '/api/v1/announcements', staff.token);
    expect(after.json().announcements.find((item: any) => item.id === announcementId).readAt).toBeTruthy();
  });

  it('enforces content permissions and cancels pending invitations through their own route', async () => {
    harness = await makeHarness();
    const infra = harness.user('content_infra', { staff: 'INFRASTRUCTURE' });
    expect((await harness.call('GET', '/api/v1/admin/content', infra.token)).statusCode).toBe(403);

    const owner = harness.user('team_owner');
    const invite = await harness.call('POST', '/api/v1/account/members/invite', owner.token, { email: 'pending@example.test', role: 'VIEWER' });
    expect(invite.statusCode).toBe(201);
    const invitationId = invite.json().invitationId as string;
    const remove = await harness.call('DELETE', `/api/v1/account/invitations/${invitationId}`, owner.token);
    expect(remove.statusCode).toBe(200);
    const team = await harness.call('GET', '/api/v1/account/members', owner.token);
    expect(team.json().invitations).toEqual([]);
  });
});
