import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeHarness, type Harness } from './helpers/harness.js';

describe('React customer read-only HTTP contracts', () => {
  let h: Harness;
  beforeEach(async () => { h = await makeHarness(); });
  afterEach(async () => { await h.close(); });

  it('returns authenticated JSON envelopes expected by the React adapter', async () => {
    const owner = h.user('react_owner');
    for (const [url, key] of [
      ['/api/v1/services', 'services'],
      ['/api/v1/invoices', 'invoices'],
      ['/api/v1/subscriptions', 'subscriptions'],
      ['/api/v1/tickets', 'tickets'],
      ['/api/v1/audit?limit=50', 'logs'],
    ] as const) {
      const response = await h.call('GET', url, owner.token);
      expect(response.statusCode, url).toBe(200);
      expect(response.headers['content-type'], url).toMatch(/^application\/json/);
      expect(response.json(), url).toHaveProperty(key, expect.any(Array));
    }

    const me = await h.call('GET', '/api/v1/auth/me', owner.token);
    expect(me.statusCode).toBe(200);
    expect(me.headers['content-type']).toMatch(/^application\/json/);
    expect(me.json()).toMatchObject({
      user: { id: owner.id, name: 'react_owner' },
      account: { id: owner.accountId },
      membership: { role: 'OWNER' },
    });
  });

  it('returns JSON 401 without a session and JSON 403 for a forbidden role mutation', async () => {
    const unauthenticated = await h.call('GET', '/api/v1/auth/me', null);
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.headers['content-type']).toMatch(/^application\/json/);

    const viewer = h.user('react_viewer', { role: 'VIEWER' });
    const forbidden = await h.call('POST', '/api/v1/subscriptions/missing/cancel', viewer.token, { immediate: false });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.headers['content-type']).toMatch(/^application\/json/);
  });

  it('calculates authoritative price previews without persisting checkout quotes', async () => {
    const owner = h.user('react_preview_owner');
    const before = (h.db.prepare('SELECT count(*) AS count FROM quotes').get() as { count: number }).count;
    const response = await h.call('POST', '/api/v1/quotes/preview', owner.token, {
      items: [{ planVersionId: 'plv_mc_4gb', quantity: 1, interval: 'MONTHLY', regionId: 'reg_fra_1' }],
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.json()).toMatchObject({ currency: 'EUR', totalMinorUnits: expect.any(Number), lines: [expect.any(Object)] });
    expect((h.db.prepare('SELECT count(*) AS count FROM quotes').get() as { count: number }).count).toBe(before);
  });

  it('isolates checkout-intent reconciliation by account and enforces billing RBAC', async () => {
    const ownerA = h.user('intent_a');
    const ownerB = h.user('intent_b');
    const viewer = h.user('intent_viewer', { role: 'VIEWER' });
    h.db.prepare(`INSERT INTO idempotency_records (account_id, scope, idempotency_key, request_hash, status, response_payload, expires_at)
      VALUES (?, 'checkout', 'purchase_1', 'hash', 'COMPLETED', ?, datetime('now', '+1 hour'))`).run(ownerA.accountId, JSON.stringify({ orderId: 'ord_a', invoiceId: 'inv_a', paymentAttemptId: 'pay_a', checkoutUrl: '/app/orders/ord_a' }));

    const own = await h.call('GET', '/api/v1/checkout-intents/purchase_1', ownerA.token);
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({ status: 'COMPLETED', result: { orderId: 'ord_a' } });
    expect((await h.call('GET', '/api/v1/checkout-intents/purchase_1', ownerB.token)).json()).toEqual({ status: 'NOT_FOUND' });
    expect((await h.call('GET', '/api/v1/checkout-intents/purchase_1', viewer.token)).statusCode).toBe(403);
  });

  it('preserves legacy customer app by default and protects /app with authentication', async () => {
    delete process.env.FORTLESS_REACT_CUSTOMER_UI;
    const unauthenticated = await h.call('GET', '/app', null);
    expect(unauthenticated.statusCode).toBe(302);
    expect(unauthenticated.headers['location']).toBe('/login?next=/app');

    const owner = h.user('react_owner_legacy');
    const response = await h.call('GET', '/app', owner.token);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('serves React customer app and protects deep links when FORTLESS_REACT_CUSTOMER_UI is enabled', async () => {
    process.env.FORTLESS_REACT_CUSTOMER_UI = 'true';
    try {
      const unauthDeep = await h.call('GET', '/app/account/security', null);
      expect(unauthDeep.statusCode).toBe(302);
      expect(unauthDeep.headers['location']).toContain('/login?next=');

      const owner = h.user('react_owner_spa');
      const response = await h.call('GET', '/app', owner.token);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/^text\/html/);
      expect(response.headers['cache-control']).toBe('no-store, private');
      expect(response.headers['content-security-policy']).toBeDefined();

      const deepResponse = await h.call('GET', '/app/account/security', owner.token);
      expect(deepResponse.statusCode).toBe(200);
      expect(deepResponse.headers['content-type']).toMatch(/^text\/html/);
    } finally {
      delete process.env.FORTLESS_REACT_CUSTOMER_UI;
    }
  });
});
