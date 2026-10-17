import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import {
  registerUser,
  loginUser,
  authenticateSession,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  listUserSessions,
  revokeUserSession,
  revokeOtherUserSessions,
  beginTotpEnrollment,
  confirmTotpEnrollment,
  completeMfaChallenge,
  completeStepUp,
  generateTotpCode,
  getMfaStatus,
  hasPendingMfaSession,
} from '../src/modules/identity/auth.js';
import { seedInitialCatalog, getPublishedPlans } from '../src/modules/catalog/catalog.js';
import { createQuote, verifyQuote } from '../src/modules/pricing/quote.js';
import { processCheckout } from '../src/modules/checkout/checkout.js';
import {
  generateStripeSignature,
  verifyStripeSignature,
  ingestPSPWebhook,
  type StripeWebhookPayload,
} from '../src/modules/payments/webhooks.js';
import { MockPterodactylAdapter } from '../src/modules/provisioning/adapter.js';
import { processOutboxQueue } from '../src/modules/outbox/worker.js';
import {
  getAdminOverview,
  listAdminAccounts,
  listAdminServices,
  listAdminTickets,
  listAdminAudit,
  listAdminStaff,
} from '../src/modules/admin/read-model.js';
import { getStaffAccess, hasStaffPermission } from '../src/modules/admin/access.js';
import { listTickets, createTicket, getTicketThread, addCustomerReply } from '../src/modules/support/tickets.js';

describe('FORTLESS Comprehensive Production Test Suite', () => {
  let db: Database.Database;
  const testDbPath = './data/test_fortless.db';

  beforeEach(() => {
    fs.mkdirSync('./data', { recursive: true });
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = new Database(testDbPath);
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA_SQL);
    seedInitialCatalog(db);
  }, 30_000);

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Category A: Identity, Authentication & Multi-Tenant Isolation', () => {
    it('AUTH-01: Anonymous/Invalid session token returns null context', () => {
      const context = authenticateSession('invalid_fake_session_token', db);
      expect(context).toBeNull();
    });

    it('AUTH-02: Multi-Tenant Isolation — User A and User B belong to distinct accounts with zero cross-tenant leakage', () => {
      const userA = registerUser(
        { email: 'userA@example.com', password: 'P@ssword123!', name: 'User A', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const userB = registerUser(
        { email: 'userB@example.com', password: 'P@ssword123!', name: 'User B', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );

      expect(userA.account.id).not.toBe(userB.account.id);
      expect(userA.user.id).not.toBe(userB.user.id);

      // Verify User A has OWNER membership in Account A, but NOT Account B
      const membershipA = db.prepare('SELECT * FROM memberships WHERE account_id = ? AND user_id = ?')
        .get(userA.account.id, userA.user.id);
      expect(membershipA).toBeDefined();

      const crossMembership = db.prepare('SELECT * FROM memberships WHERE account_id = ? AND user_id = ?')
        .get(userB.account.id, userA.user.id);
      expect(crossMembership).toBeUndefined();
    });

    it('AUTH-03: Argon2id password hashing is irreversible and authenticates correctly', () => {
      const pending = registerUser(
        { email: 'test_argon2@example.com', password: 'StrongPassword99!', name: 'Argon User', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      expect(() => loginUser(
        { email: 'test_argon2@example.com', password: 'StrongPassword99!', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      )).toThrow('Invalid email or password.');
      verifyEmail(pending.verificationToken, { ipAddress: '127.0.0.1', userAgent: 'test' }, db);

      // Successful login
      const loginSuccess = loginUser(
        { email: 'test_argon2@example.com', password: 'StrongPassword99!', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      expect(loginSuccess.user.email).toBe('test_argon2@example.com');
      expect(loginSuccess.token).toBeDefined();

      // Failed login with wrong password
      expect(() => {
        loginUser(
          { email: 'test_argon2@example.com', password: 'WrongPassword!', ipAddress: '127.0.0.1', userAgent: 'test' },
          db
        );
      }).toThrow('Invalid email or password.');
    });

    it('AUTH-07: verification/reset tokens are single-use, sessions are hashed, and reset revokes sessions', () => {
      const pending = registerUser(
        { email: 'recovery@example.com', password: 'StrongPassword99!', name: 'Recovery User', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      );
      expect(pending.user.status).toBe('PENDING_VERIFICATION');
      const verified = verifyEmail(pending.verificationToken, { ipAddress: '127.0.0.1', userAgent: 'test' }, db);
      expect(verified.user.status).toBe('ACTIVE');
      expect(authenticateSession(verified.token, db)?.user.id).toBe(verified.user.id);
      expect(db.prepare('SELECT id FROM sessions WHERE id = ?').get(verified.token)).toBeUndefined();
      expect(() => verifyEmail(pending.verificationToken, { ipAddress: '127.0.0.1', userAgent: 'test' }, db)).toThrow();

      const resetToken = requestPasswordReset('recovery@example.com', db);
      expect(resetToken).toBeTruthy();
      resetPassword(resetToken!, 'DifferentPassword88!', db);
      expect(authenticateSession(verified.token, db)).toBeNull();
      expect(() => resetPassword(resetToken!, 'AnotherPassword77!', db)).toThrow();
      expect(loginUser({ email: 'recovery@example.com', password: 'DifferentPassword88!', ipAddress: '127.0.0.1', userAgent: 'test' }, db).user.id)
        .toBe(verified.user.id);
    });

    it('AUTH-08: legacy ACTIVE identities are migrated without bypassing verification for new registrations', () => {
      const legacy = registerUser(
        { email: 'legacy@example.com', password: 'StrongPassword99!', name: 'Legacy User', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      );
      db.prepare("UPDATE users SET status = 'ACTIVE', created_at = '2020-01-01 00:00:00' WHERE id = ?").run(legacy.user.id);

      expect(() => loginUser(
        { email: 'legacy@example.com', password: 'StrongPassword99!', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      )).toThrow('Verify your email before signing in.');

      runMigrations(db);
      expect(loginUser(
        { email: 'legacy@example.com', password: 'StrongPassword99!', ipAddress: '127.0.0.2', userAgent: 'test' }, db
      ).user.email_verified_at).toBe('2020-01-01 00:00:00');
      expect(db.prepare("SELECT count(*) AS count FROM audit_events WHERE action = 'user.email_verification_grandfathered'")
        .get()).toMatchObject({ count: 1 });

      const current = registerUser(
        { email: 'current@example.com', password: 'StrongPassword99!', name: 'Current User', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      );
      expect(current.user.status).toBe('PENDING_VERIFICATION');
      expect(current.user.email_verified_at).toBeNull();
    });

    it('AUTH-09: users can inspect and revoke only their own active device sessions', () => {
      const pending = registerUser(
        { email: 'devices@example.com', password: 'StrongPassword99!', name: 'Device User', ipAddress: '127.0.0.1', userAgent: 'Browser One' }, db
      );
      const first = verifyEmail(pending.verificationToken, { ipAddress: '127.0.0.1', userAgent: 'Browser One' }, db);
      const second = loginUser(
        { email: 'devices@example.com', password: 'StrongPassword99!', ipAddress: '127.0.0.2', userAgent: 'Browser Two' }, db
      );
      const firstContext = authenticateSession(first.token, db)!;
      const sessions = listUserSessions(first.user.id, firstContext.session.id, db);
      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toMatchObject({ isCurrent: true, userAgent: 'Browser One' });

      const outsider = registerUser(
        { email: 'outsider@example.com', password: 'StrongPassword99!', name: 'Outsider', ipAddress: '127.0.0.3', userAgent: 'Other' }, db
      );
      expect(revokeUserSession({ userId: outsider.user.id, accountId: outsider.account.id, sessionId: sessions[1]!.id, ipAddress: '127.0.0.3' }, db)).toBe(false);
      expect(authenticateSession(second.token, db)).not.toBeNull();

      expect(revokeOtherUserSessions({ userId: first.user.id, accountId: first.account.id, currentSessionId: firstContext.session.id, ipAddress: '127.0.0.1' }, db)).toBe(1);
      expect(authenticateSession(first.token, db)).not.toBeNull();
      expect(authenticateSession(second.token, db)).toBeNull();
    });

    it('AUTH-10: confirmed TOTP gates new sessions and recovery codes are one-time', () => {
      const pending = registerUser(
        { email: 'mfa@example.com', password: 'StrongPassword99!', name: 'MFA User', ipAddress: '127.0.0.1', userAgent: 'Browser One' }, db
      );
      const first = verifyEmail(pending.verificationToken, { ipAddress: '127.0.0.1', userAgent: 'Browser One' }, db);
      const firstContext = authenticateSession(first.token, db)!;
      const enrollment = beginTotpEnrollment(first.user.id, 'StrongPassword99!', first.user.email, db);
      const recoveryCodes = confirmTotpEnrollment({
        userId: first.user.id, accountId: first.account.id, sessionId: firstContext.session.id,
        code: generateTotpCode(enrollment.secret), ipAddress: '127.0.0.1',
      }, db);
      expect(recoveryCodes).toHaveLength(10);
      expect(getMfaStatus(first.user.id, db)).toEqual({ enabled: true, recoveryCodesRemaining: 10 });
      expect(authenticateSession(first.token, db)?.user.id).toBe(first.user.id);

      const second = loginUser(
        { email: 'mfa@example.com', password: 'StrongPassword99!', ipAddress: '127.0.0.2', userAgent: 'Browser Two' }, db
      );
      expect(second.requiresMfa).toBe(true);
      expect(authenticateSession(second.token, db)).toBeNull();
      expect(hasPendingMfaSession(second.token, db)).toBe(true);
      const storedFactor = db.prepare("SELECT secret_encrypted FROM mfa_factors WHERE user_id = ? AND type = 'TOTP'")
        .get(first.user.id) as { secret_encrypted: string };
      db.prepare("UPDATE mfa_factors SET secret_encrypted = 'v1.unreadable.factor.data' WHERE user_id = ? AND type = 'TOTP'")
        .run(first.user.id);
      expect(completeMfaChallenge(second.token, recoveryCodes[0]!, '127.0.0.2', db)).toEqual({ recoveryCodeUsed: true });
      db.prepare("UPDATE mfa_factors SET secret_encrypted = ? WHERE user_id = ? AND type = 'TOTP'")
        .run(storedFactor.secret_encrypted, first.user.id);
      expect(authenticateSession(second.token, db)?.user.id).toBe(first.user.id);
      expect(getMfaStatus(first.user.id, db).recoveryCodesRemaining).toBe(9);

      const third = loginUser(
        { email: 'mfa@example.com', password: 'StrongPassword99!', ipAddress: '127.0.0.3', userAgent: 'Browser Three' }, db
      );
      expect(() => completeMfaChallenge(third.token, recoveryCodes[0]!, '127.0.0.3', db)).toThrow('invalid');
      expect(authenticateSession(third.token, db)).toBeNull();
    });

    it('AUTH-11: sensitive actions require fresh password plus authenticator step-up evidence', () => {
      const pending = registerUser(
        { email: 'stepup@example.com', password: 'StrongPassword99!', name: 'Step Up', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      );
      const verified = verifyEmail(pending.verificationToken, { ipAddress: '127.0.0.1', userAgent: 'test' }, db);
      const context = authenticateSession(verified.token, db)!;
      const enrollment = beginTotpEnrollment(verified.user.id, 'StrongPassword99!', verified.user.email, db);
      confirmTotpEnrollment({
        userId: verified.user.id, accountId: verified.account.id, sessionId: context.session.id,
        code: generateTotpCode(enrollment.secret), ipAddress: '127.0.0.1',
      }, db);
      expect(() => completeStepUp({
        userId: verified.user.id, accountId: verified.account.id, sessionId: context.session.id,
        password: 'WrongPassword99!', code: generateTotpCode(enrollment.secret), ipAddress: '127.0.0.1',
      }, db)).toThrow('password');
      const result = completeStepUp({
        userId: verified.user.id, accountId: verified.account.id, sessionId: context.session.id,
        password: 'StrongPassword99!', code: generateTotpCode(enrollment.secret), ipAddress: '127.0.0.1',
      }, db);
      expect(result.validForSeconds).toBe(600);
      expect(authenticateSession(verified.token, db)?.session.stepUpVerifiedAt).toBeTruthy();
      expect(db.prepare("SELECT count(*) AS count FROM audit_events WHERE action = 'user.step_up_completed'").get())
        .toMatchObject({ count: 1 });
    });
  });

  describe('Category B: Catalog & Cryptographic Quote Invariants', () => {
    it('CAT-01: Seeded catalog contains published plans with exact pricing', () => {
      const plans = getPublishedPlans(db);
      expect(plans.length).toBeGreaterThanOrEqual(2);

      const mcPlan = plans.find((p) => p.productSlug === 'minecraft');
      expect(mcPlan).toBeDefined();
      expect(mcPlan?.prices[0]?.priceMinorUnits).toBe(1200); // €12.00
      expect(mcPlan?.resources.memoryMb).toBe(4096);
    });

    it('CAT-02 & CAT-05: Quote calculates exact minor units, EU VAT, and B2B reverse charge', () => {
      const user = registerUser(
        { email: 'shopper@example.com', password: 'P@ssword123!', name: 'Shopper', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );

      // B2C Customer in Germany (19% VAT)
      const quoteB2C = createQuote(
        user.account.id,
        [{ planVersionId: 'plv_mc_4gb', quantity: 1 }],
        'DE',
        false,
        undefined,
        db
      );

      expect(quoteB2C.subtotalMinorUnits).toBe(1200); // €12.00
      expect(quoteB2C.taxMinorUnits).toBe(228);        // €2.28 (19%)
      expect(quoteB2C.totalMinorUnits).toBe(1428);      // €14.28
      expect(quoteB2C.signature).toBeDefined();

      // B2B Customer in France with VAT ID (0% Reverse-Charge)
      const quoteB2B = createQuote(
        user.account.id,
        [{ planVersionId: 'plv_mc_4gb', quantity: 1 }],
        'FR',
        true,
        'FR12345678901',
        db
      );

      expect(quoteB2B.subtotalMinorUnits).toBe(1200);
      expect(quoteB2B.taxMinorUnits).toBe(0);          // 0% Reverse-Charge
      expect(quoteB2B.totalMinorUnits).toBe(1200);
    });

    it('CAT-03: Quote signature verification rejects tampered quote IDs', () => {
      const user = registerUser(
        { email: 'tamperer@example.com', password: 'P@ssword123!', name: 'Tamperer', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );

      const quote = createQuote(
        user.account.id,
        [{ planVersionId: 'plv_mc_4gb', quantity: 1 }],
        'DE',
        false,
        undefined,
        db
      );

      // Verification succeeds for genuine quote
      const verified = verifyQuote(quote.id, user.account.id, db);
      expect(verified.totalMinorUnits).toBe(1428);

      // Tampered account ownership rejected
      expect(() => {
        verifyQuote(quote.id, 'acc_fake_other_tenant', db);
      }).toThrow('Quote not found or does not belong to this account.');
    });
  });

  describe('Category C: Checkout Idempotency & Payment Invariants', () => {
    it('PAY-05: Repeated checkout submissions with same Idempotency-Key return identical session without duplicate orders', () => {
      const user = registerUser(
        { email: 'checkout_user@example.com', password: 'P@ssword123!', name: 'Buyer', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );

      const quote = createQuote(
        user.account.id,
        [{ planVersionId: 'plv_mc_4gb', quantity: 1 }],
        'DE',
        false,
        undefined,
        db
      );

      const key = 'idem_checkout_test_001';

      // First submission
      const res1 = processCheckout(
        { accountId: user.account.id, quoteId: quote.id, idempotencyKey: key, regionId: 'reg_fra_1' },
        db
      );

      expect(res1.orderId).toBeDefined();
      expect(res1.invoiceId).toBeDefined();

      // Second submission with identical key
      const res2 = processCheckout(
        { accountId: user.account.id, quoteId: quote.id, idempotencyKey: key, regionId: 'reg_fra_1' },
        db
      );

      expect(res2.isIdempotentReplay).toBe(true);
      expect(res2.orderId).toBe(res1.orderId);
      expect(res2.invoiceId).toBe(res1.invoiceId);

      // Verify exactly ONE order in database
      const orderCount = db.prepare('SELECT count(*) as count FROM orders WHERE account_id = ?').get(user.account.id) as { count: number };
      expect(orderCount.count).toBe(1);
    });

    it('PAY-01: Webhook signature verification validates authentic Stripe signatures and rejects forgeries', () => {
      const secret = 'whsec_test_secret_key_12345';
      const rawBody = JSON.stringify({ id: 'evt_test_123', type: 'payment_intent.succeeded' });

      // Valid signature
      const validSig = generateStripeSignature(rawBody, secret);
      expect(verifyStripeSignature(rawBody, validSig, secret)).toBe(true);

      // Forged signature
      expect(verifyStripeSignature(rawBody, 't=123456,v1=bad_forged_hash', secret)).toBe(false);

      // Tampered body with valid signature
      const tamperedBody = JSON.stringify({ id: 'evt_test_123', type: 'payment_intent.succeeded', amount: 1 });
      expect(verifyStripeSignature(tamperedBody, validSig, secret)).toBe(false);
    });

    it('PAY-02 & PAY-04: Authoritative Webhook transitions order to PAID, issues fiscal invoice, and deduplicates cleanly', () => {
      const user = registerUser(
        { email: 'webhook_test@example.com', password: 'P@ssword123!', name: 'Webhook Customer', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );

      const quote = createQuote(
        user.account.id,
        [{ planVersionId: 'plv_mc_4gb', quantity: 1 }],
        'DE',
        false,
        undefined,
        db
      );

      const checkout = processCheckout(
        { accountId: user.account.id, quoteId: quote.id, idempotencyKey: 'idem_webhook_test', regionId: 'reg_fra_1' },
        db
      );

      const payload: StripeWebhookPayload = {
        id: 'evt_stripe_payment_success_001',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: checkout.paymentAttemptId,
            amount: 1428, // Matches total
            currency: 'eur',
            status: 'succeeded',
            metadata: {
              orderId: checkout.orderId,
              paymentAttemptId: checkout.paymentAttemptId,
              accountId: user.account.id,
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);

      // Ingest webhook
      const result = ingestPSPWebhook('stripe', 'acct_primary', rawBody, payload, db);
      expect(result.status).toBe('PROCESSED');
      expect(result.orderId).toBe(checkout.orderId);

      // Verify Order is now PAID
      const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(checkout.orderId) as { status: string };
      expect(order.status).toBe('PAID');

      // Verify sequential invoice number allocated
      const invoice = db.prepare('SELECT invoice_number, status, amount_paid_minor_units FROM invoices WHERE id = ?').get(checkout.invoiceId) as {
        invoice_number: string;
        status: string;
        amount_paid_minor_units: number;
      };
      expect(invoice.status).toBe('PAID');
      expect(invoice.invoice_number).toMatch(/^INV-\d{4}-\d{5}$/);
      expect(invoice.amount_paid_minor_units).toBe(1428);

      // Verify outbox provisioning event was committed atomically
      const outbox = db.prepare('SELECT count(*) as count FROM outbox_events WHERE status = ?').get('PENDING') as { count: number };
      expect(outbox.count).toBe(1);

      // Duplicate delivery of same event
      const duplicateRes = ingestPSPWebhook('stripe', 'acct_primary', rawBody, payload, db);
      expect(duplicateRes.status).toBe('DEDUPLICATED');
    });
  });

  describe('Category D: Tenant-Safe Support Lifecycle', () => {
    it('SUP-01: ticket, initial message and audit evidence are committed together', () => {
      const customer = registerUser(
        { email: 'ticket-owner@example.com', password: 'StrongPassword99!', name: 'Ticket Owner', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      );
      const created = createTicket({
        accountId: customer.account.id, userId: customer.user.id, subject: 'Node latency', priority: 'HIGH',
        message: 'Latency started after midnight and affects every player.', ipAddress: '127.0.0.1',
      }, db);
      expect(created).toMatchObject({ priority: 'HIGH', status: 'OPEN' });
      expect(listTickets(customer.account.id, db)).toHaveLength(1);
      expect(getTicketThread(created.ticketId, customer.account.id, db)?.messages).toHaveLength(1);
      expect(db.prepare("SELECT count(*) AS count FROM audit_events WHERE action = 'ticket.created' AND resource_id = ?")
        .get(created.ticketId)).toMatchObject({ count: 1 });
    });

    it('SUP-02: threads and replies remain tenant-scoped and closed tickets fail closed', () => {
      const owner = registerUser(
        { email: 'ticket-a@example.com', password: 'StrongPassword99!', name: 'Tenant A', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      );
      const outsider = registerUser(
        { email: 'ticket-b@example.com', password: 'StrongPassword99!', name: 'Tenant B', ipAddress: '127.0.0.2', userAgent: 'test' }, db
      );
      const created = createTicket({
        accountId: owner.account.id, userId: owner.user.id, subject: 'Service issue', priority: 'NORMAL',
        message: 'The service is returning an error.', ipAddress: '127.0.0.1',
      }, db);
      expect(getTicketThread(created.ticketId, outsider.account.id, db)).toBeNull();
      expect(addCustomerReply({ ticketId: created.ticketId, accountId: outsider.account.id, userId: outsider.user.id, body: 'intrusion', ipAddress: '127.0.0.2' }, db).outcome)
        .toBe('NOT_FOUND');
      expect(addCustomerReply({ ticketId: created.ticketId, accountId: owner.account.id, userId: owner.user.id, body: 'Additional details', ipAddress: '127.0.0.1' }, db).outcome)
        .toBe('CREATED');
      expect((getTicketThread(created.ticketId, owner.account.id, db)?.ticket as { status: string }).status).toBe('WAITING_STAFF');
      db.prepare("UPDATE tickets SET status = 'CLOSED' WHERE id = ?").run(created.ticketId);
      expect(addCustomerReply({ ticketId: created.ticketId, accountId: owner.account.id, userId: owner.user.id, body: 'Too late', ipAddress: '127.0.0.1' }, db).outcome)
        .toBe('CLOSED');
    });
  });

  describe('Category E: Infrastructure Provisioning & Timeout Recovery Sagas', () => {
    it('PROV-01: Outbox worker provisions exactly one server and marks service ACTIVE', async () => {
      const adapter = new MockPterodactylAdapter();

      const user = registerUser(
        { email: 'prov_user@example.com', password: 'P@ssword123!', name: 'Server Owner', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );

      const quote = createQuote(user.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
      const checkout = processCheckout({ accountId: user.account.id, quoteId: quote.id, idempotencyKey: 'idem_prov_1', regionId: 'reg_fra_1' }, db);

      const payload: StripeWebhookPayload = {
        id: 'evt_prov_1',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: checkout.paymentAttemptId,
            amount: 1428,
            currency: 'eur',
            status: 'succeeded',
            metadata: { orderId: checkout.orderId },
          },
        },
      };

      ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(payload), payload, db);

      // Process Outbox Queue
      const processed = await processOutboxQueue(adapter, db);
      expect(processed).toBe(1);

      // Verify provider created 1 server
      expect(adapter.getServerCount()).toBe(1);

      // Verify Service in DB is ACTIVE and linked to external ID
      const service = db.prepare('SELECT * FROM services WHERE account_id = ?').get(user.account.id) as ({
        id: string;
        external_id: string;
        identifier: string;
        contract_status: string;
      });
      expect(service.contract_status).toBe('ACTIVE');
      expect(service.external_id).toBeDefined();
      expect(service.identifier).toBeDefined();

      // Purchased plan limits are persisted as the authoritative desired configuration.
      const desired = db.prepare('SELECT * FROM service_desired_configs WHERE service_id = ?').get(service.id) as {
        cpu_limit_pct: number;
        memory_limit_mb: number;
        disk_limit_mb: number;
      };
      expect(desired.cpu_limit_pct).toBe(200);
      expect(desired.memory_limit_mb).toBe(4096);
      expect(desired.disk_limit_mb).toBe(30720);

      // Verify Order is COMPLETED
      const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(checkout.orderId) as { status: string };
      expect(order.status).toBe('COMPLETED');
    });

    it('PROV-04: The Unknown Outcome Rule — Timeout after creation recovers via correlation tag without duplicate server creation', async () => {
      const adapter = new MockPterodactylAdapter();
      // Configure adapter to simulate network timeout AFTER server creation!
      adapter.simulateTimeoutOnNextProvision = true;

      const user = registerUser(
        { email: 'timeout_user@example.com', password: 'P@ssword123!', name: 'Timeout Owner', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );

      const quote = createQuote(user.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
      const checkout = processCheckout({ accountId: user.account.id, quoteId: quote.id, idempotencyKey: 'idem_timeout_test', regionId: 'reg_fra_1' }, db);

      const payload: StripeWebhookPayload = {
        id: 'evt_prov_timeout_001',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: checkout.paymentAttemptId,
            amount: 1428,
            currency: 'eur',
            status: 'succeeded',
            metadata: { orderId: checkout.orderId },
          },
        },
      };

      ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(payload), payload, db);

      // Execute outbox processing:
      // Even though the adapter throws an ETIMEDOUT error, the saga invokes lookupByCorrelationTag and recovers!
      const processed = await processOutboxQueue(adapter, db);
      expect(processed).toBe(1);

      // CRITICAL ASSERTION: Exactly ONE server exists on the provider! No duplicate created!
      expect(adapter.getServerCount()).toBe(1);

      const service = db.prepare('SELECT * FROM services WHERE account_id = ?').get(user.account.id) as ({
        external_id: string;
        contract_status: string;
      });
      expect(service.contract_status).toBe('ACTIVE');
      expect(service.external_id).toBeDefined();
    });
  });

  describe('Category F: Staff Read Models', () => {
    it('ADMIN-01: global account lookup returns operational fields without authentication secrets', () => {
      registerUser(
        { email: 'alpha@example.com', password: 'StrongPassword99!', name: 'Alpha Owner', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      );
      registerUser(
        { email: 'beta@example.com', password: 'StrongPassword99!', name: 'Beta Owner', ipAddress: '127.0.0.2', userAgent: 'test' }, db
      );

      const result = listAdminAccounts(db, { query: 'alpha', limit: 10 });
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0]).toMatchObject({ owner_email: 'alpha@example.com', member_count: 1 });
      expect(result.accounts[0]).not.toHaveProperty('password_hash');
      expect(result.accounts[0]).not.toHaveProperty('billing_email');
    });

    it('ADMIN-02: overview and empty operational queues are derived from real database state', () => {
      registerUser(
        { email: 'operations@example.com', password: 'StrongPassword99!', name: 'Operations Owner', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      );

      expect(getAdminOverview(db)).toMatchObject({
        users: 1,
        accounts: 1,
        orders: 0,
        activeServices: 0,
        openTickets: 0,
        pendingOutboxEvents: 0,
        capabilities: { payments: 'NOT_CONFIGURED', provisioning: 'MOCK_ONLY' },
      });
      expect(listAdminServices(db).services).toEqual([]);
      expect(listAdminTickets(db).tickets).toEqual([]);
      expect(listAdminAudit(db, { query: 'user.registration_pending' }).logs).toHaveLength(1);
    });

    it('ADMIN-03: persisted staff roles deny by default and revocation takes effect immediately', () => {
      const user = registerUser(
        { email: 'support@example.com', password: 'StrongPassword99!', name: 'Support Agent', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      );
      expect(getStaffAccess(user.user.id, db)).toBeNull();
      db.prepare("INSERT INTO staff_memberships (user_id, role, status) VALUES (?, 'SUPPORT', 'ACTIVE')").run(user.user.id);
      expect(hasStaffPermission(user.user.id, 'tickets:read', db)).toBe(true);
      expect(hasStaffPermission(user.user.id, 'audit:read', db)).toBe(false);
      expect(hasStaffPermission(user.user.id, 'staff:manage', db)).toBe(false);
      expect(listAdminStaff(db, { query: 'support' }).staff).toHaveLength(1);
      db.prepare("UPDATE staff_memberships SET status = 'REVOKED' WHERE user_id = ?").run(user.user.id);
      expect(hasStaffPermission(user.user.id, 'tickets:read', db)).toBe(false);
    });

    it('ADMIN-04: migration preserves only the closed set of existing staff identities', () => {
      const staff = registerUser(
        { email: 'legacy-staff@example.com', password: 'StrongPassword99!', name: 'Legacy Staff', ipAddress: '127.0.0.1', userAgent: 'test' }, db
      );
      const customer = registerUser(
        { email: 'customer@example.com', password: 'StrongPassword99!', name: 'Customer', ipAddress: '127.0.0.2', userAgent: 'test' }, db
      );
      db.prepare('UPDATE users SET is_staff = 1 WHERE id = ?').run(staff.user.id);
      runMigrations(db);
      expect(getStaffAccess(staff.user.id, db)?.role).toBe('ADMINISTRATOR');
      expect(getStaffAccess(customer.user.id, db)).toBeNull();
    });
  });
});
