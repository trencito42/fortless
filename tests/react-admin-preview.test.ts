import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeHarness, type Harness } from './helpers/harness.js';

let h: Harness;
beforeAll(async () => {
  process.env['FORTLESS_REACT_ADMIN_PREVIEW'] = '0';
  h = await makeHarness();
});
afterAll(async () => {
  delete process.env['FORTLESS_REACT_ADMIN_PREVIEW'];
  await h.close();
});

describe('React Admin live preview gate', () => {
  it('is absent when its independent preview flag is disabled', async () => {
    const response = await h.app.inject({ method: 'GET', url: '/admin-preview' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('requires authentication, staff access, MFA and route permissions', async () => {
    process.env['FORTLESS_REACT_ADMIN_PREVIEW'] = '1';
    const anonymous = await h.app.inject({ method: 'GET', url: '/admin-preview/services' });
    expect(anonymous.statusCode).toBe(302);
    expect(anonymous.headers.location).toContain('/login?next=');

    const customer = h.user('react_admin_customer');
    expect((await h.call('GET', '/admin-preview', customer.token)).statusCode).toBe(403);

    const billing = h.user('react_admin_billing', { staff: 'BILLING' });
    expect((await h.call('GET', '/admin-preview/staff', billing.token)).statusCode).toBe(403);
    expect([200, 503]).toContain((await h.call('GET', '/admin-preview/billing', billing.token)).statusCode);
  });

  it('returns the real identity contract and permission-gates status data', async () => {
    const owner = h.user('react_admin_owner', { staff: 'OWNER' });
    const me = await h.call('GET', '/api/v1/admin/me', owner.token);
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { id: owner.id, name: owner.id },
      staff: { role: 'OWNER', permissions: expect.arrayContaining(['admin:access', 'staff:manage']) },
      session: { mfaVerifiedAt: expect.any(String) },
    });

    const status = await h.call('GET', '/api/v1/admin/status', owner.token);
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual(expect.objectContaining({ components: expect.any(Array), incidents: expect.any(Array) }));

    for (const [path, collection] of [['/api/v1/admin/transactions', 'transactions'], ['/api/v1/admin/subscriptions', 'subscriptions'], ['/api/v1/admin/refunds', 'refunds']] as const) {
      const response = await h.call('GET', path, owner.token);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expect.objectContaining({ [collection]: expect.any(Array), total: expect.any(Number) }));
    }

    const billing = h.user('react_admin_status_billing', { staff: 'BILLING' });
    expect((await h.call('GET', '/api/v1/admin/status', billing.token)).statusCode).toBe(403);
  });
});
