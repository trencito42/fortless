import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import {
  registerUser,
  loginUser,
  authenticateSession,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  changePassword,
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
import {
  listAccountMembers,
  listAccountInvitations,
  inviteAccountMember,
  revokeAccountMember,
  acceptAccountInvitation,
} from '../src/modules/identity/teams.js';
import {
  processEmailOutbox,
  getSandboxReceipts,
  clearSandboxReceipts,
} from '../src/modules/email/outbox.js';
import { config } from '../src/config/index.js';
import {
  seedInitialCatalog,
  getPublishedPlans,
  listCategories,
  listProducts,
  getProductDetail,
  listRegionsWithCapacity,
  reserveCapacity,
  releaseCapacity,
  sweepExpiredReservations,
  createCoupon,
  validateCoupon,
  redeemCouponAtomic,
  listCoupons,
  createProduct,
  updateProductPublishStatus,
  createPlanVersion,
  updatePlanStatus,
} from '../src/modules/catalog/catalog.js';
import { createQuote, verifyQuote } from '../src/modules/pricing/quote.js';
import { processCheckout } from '../src/modules/checkout/checkout.js';
import {
  generateStripeSignature,
  verifyStripeSignature,
  ingestPSPWebhook,
  processStaffRefund,
  type StripeWebhookPayload,
} from '../src/modules/payments/webhooks.js';
import { MockPterodactylAdapter } from '../src/modules/provisioning/adapter.js';
import { processOutboxQueue } from '../src/modules/outbox/worker.js';
import {
  getAdminOverview,
  listAdminAccounts,
  getAdminAccountDetail,
  updateAccountStatus,
  listAdminServices,
  listAdminTickets,
  getAdminTicketDetail,
  addStaffTicketReply,
  updateTicketStatus,
  listAdminAudit,
  listAdminStaff,
} from '../src/modules/admin/read-model.js';
import { getStaffAccess, hasStaffPermission } from '../src/modules/admin/access.js';
import { listTickets, createTicket, getTicketThread, addCustomerReply } from '../src/modules/support/tickets.js';

describe('FORTLESS Comprehensive Production Test Suite', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA_SQL);
    seedInitialCatalog(db);
  }, 10_000);

  afterEach(() => {
    db.close();
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

    it('CAT-04: Product and plan version querying returns structured specs and regions with capacity', () => {
      const categories = listCategories(db);
      expect(categories.length).toBeGreaterThanOrEqual(2);

      const products = listProducts({}, db);
      expect(products.length).toBeGreaterThanOrEqual(3);

      const detail = getProductDetail('minecraft', db);
      expect(detail).not.toBeNull();
      expect(detail?.plans.length).toBeGreaterThanOrEqual(2);
      expect(detail?.plans[0]?.resources.memoryMb).toBe(4096);

      const regions = listRegionsWithCapacity(db);
      expect(regions.length).toBeGreaterThanOrEqual(2);
      expect(regions[0]?.total_nodes).toBeGreaterThanOrEqual(1);
      expect(regions[0]?.isSoldOut).toBe(false);
    });

    it('CAT-05: Admin can create product, publish/unpublish, and version plans with prices', () => {
      const cat = listCategories(db)[0] as { id: string };
      expect(cat).toBeDefined();

      const prod = createProduct(
        { categoryId: cat.id, slug: 'rust-server', name: 'Rust Dedicated Server', providerType: 'PTERODACTYL', isPublished: false },
        db
      );
      expect(prod.id).toBeDefined();

      // Unpublished by default
      const publishedBefore = listProducts({}, db);
      expect(publishedBefore.find((p: any) => p.slug === 'rust-server')).toBeUndefined();

      // Publish product
      updateProductPublishStatus(prod.id, true, db);
      const publishedAfter = listProducts({}, db);
      expect(publishedAfter.find((p: any) => p.slug === 'rust-server')).toBeDefined();

      // Create plan version
      const plan = createPlanVersion(
        {
          productId: prod.id,
          name: 'Rust Survival 8GB',
          resourceSpecs: { memoryMb: 8192, cpuPct: 300, diskMb: 51200, databases: 1, backups: 2, eggId: 7 },
          prices: [
            { currency: 'EUR', interval: 'MONTHLY', priceMinorUnits: 2000, setupFeeMinorUnits: 0 },
            { currency: 'EUR', interval: 'ANNUAL', priceMinorUnits: 20000, setupFeeMinorUnits: 0 },
          ],
        },
        db
      );
      expect(plan.version).toBe(1);

      // Retire plan
      updatePlanStatus(plan.planVersionId, 'RETIRED', db);
      const activePlans = getPublishedPlans(db);
      expect(activePlans.find((p) => p.planVersionId === plan.planVersionId)).toBeUndefined();
    });

    it('CAT-06: Capacity engine reserves node memory/disk atomically and releases properly', () => {
      const res = reserveCapacity(
        { planVersionId: 'plv_mc_4gb', regionId: 'reg_fra_1', cartItemId: 'cart_item_abc_1' },
        db
      );
      expect(res.reservationId).toBeDefined();
      expect(res.nodeId).toBe('node_fra_01');

      const nodeAfter = db.prepare('SELECT allocated_memory_mb, allocated_disk_mb FROM nodes WHERE id = ?').get('node_fra_01') as { allocated_memory_mb: number; allocated_disk_mb: number };
      expect(nodeAfter.allocated_memory_mb).toBe(4096);
      expect(nodeAfter.allocated_disk_mb).toBe(30720);

      // Release reservation
      const released = releaseCapacity('cart_item_abc_1', db);
      expect(released).toBe(true);

      const nodeReleased = db.prepare('SELECT allocated_memory_mb, allocated_disk_mb FROM nodes WHERE id = ?').get('node_fra_01') as { allocated_memory_mb: number; allocated_disk_mb: number };
      expect(nodeReleased.allocated_memory_mb).toBe(0);
      expect(nodeReleased.allocated_disk_mb).toBe(0);
    });

    it('CAT-07: Stale reservations sweeper recovers expired capacity allocations', () => {
      reserveCapacity(
        { planVersionId: 'plv_mc_4gb', regionId: 'reg_fra_1', cartItemId: 'cart_item_stale' },
        db
      );

      // Force reservation to appear in the past
      db.prepare("UPDATE capacity_reservations SET expires_at = datetime('now', '-10 minutes') WHERE cart_item_id = 'cart_item_stale'").run();

      const swept = sweepExpiredReservations(db);
      expect(swept).toBeGreaterThanOrEqual(1);

      const node = db.prepare('SELECT allocated_memory_mb FROM nodes WHERE id = ?').get('node_fra_01') as { allocated_memory_mb: number };
      expect(node.allocated_memory_mb).toBe(0);
    });

    it('CAT-08: Coupon system validates discounts, enforces single-use per account, and caps redemptions', () => {
      const userA = registerUser({ email: 'coupon_a@example.com', password: 'P@ssword123!', name: 'User A', ipAddress: '127.0.0.1', userAgent: 'test' }, db);
      const userB = registerUser({ email: 'coupon_b@example.com', password: 'P@ssword123!', name: 'User B', ipAddress: '127.0.0.1', userAgent: 'test' }, db);

      createCoupon(
        { code: 'WELCOME25', discountType: 'PERCENTAGE', discountValue: 25, maxRedemptions: 1, expiresAt: new Date(Date.now() + 86400000).toISOString() },
        db
      );

      const allCoupons = listCoupons(db);
      expect(allCoupons.some((c) => c.code === 'WELCOME25')).toBe(true);

      // User A validates coupon on €20.00 order
      const valid = validateCoupon('WELCOME25', userA.account.id, 2000, db);
      expect(valid.discountMinorUnits).toBe(500); // 25% of 2000 = 500

      // User A redeems coupon
      redeemCouponAtomic(valid.coupon.id, userA.account.id, 'ord_first_001', db);

      // User A cannot redeem again (single-use per account)
      expect(() => {
        validateCoupon('WELCOME25', userA.account.id, 2000, db);
      }).toThrow('This coupon has already been redeemed by your workspace.');

      // User B cannot redeem because maxRedemptions was 1
      expect(() => {
        validateCoupon('WELCOME25', userB.account.id, 2000, db);
      }).toThrow('Coupon usage limit reached.');
    });

    it('CAT-09: Quote generation with coupon discounts subtotal and computes tax on discounted base', () => {
      const user = registerUser({ email: 'discount_buyer@example.com', password: 'P@ssword123!', name: 'Disc Buyer', ipAddress: '127.0.0.1', userAgent: 'test' }, db);

      createCoupon(
        { code: 'SAVE5EUR', discountType: 'FIXED_AMOUNT', discountValue: 500, maxRedemptions: 10, expiresAt: new Date(Date.now() + 86400000).toISOString() },
        db
      );

      // Minecraft 4GB (€12.00) minus €5.00 discount = €7.00 taxable. 19% VAT on €7.00 = €1.33. Total = €8.33.
      const quote = createQuote(
        user.account.id,
        [{ planVersionId: 'plv_mc_4gb', quantity: 1 }],
        'DE',
        false,
        undefined,
        'SAVE5EUR',
        db
      );

      expect(quote.subtotalMinorUnits).toBe(1200);
      expect(quote.discountMinorUnits).toBe(500);
      expect(quote.couponCode).toBe('SAVE5EUR');
      expect(quote.taxMinorUnits).toBe(133);
      expect(quote.totalMinorUnits).toBe(833);

      const verified = verifyQuote(quote.id, user.account.id, db);
      expect(verified.totalMinorUnits).toBe(833);
      expect(verified.discountMinorUnits).toBe(500);
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

    it('PAY-06: Checkout idempotency detects divergence in customOptions with same idempotency key', () => {
      const user = registerUser(
        { email: 'idem_diverge@example.com', password: 'P@ssword123!', name: 'Idem Diverge', ipAddress: '127.0.0.1', userAgent: 'test' },
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

      // First submission with serverName: 'alpha-srv'
      processCheckout(
        {
          accountId: user.account.id,
          quoteId: quote.id,
          idempotencyKey: 'idem_diverge_key_001',
          regionId: 'reg_fra_1',
          customOptions: { serverName: 'alpha-srv' },
        },
        db
      );

      // Second submission with divergent serverName under same idempotencyKey must throw
      expect(() => {
        processCheckout(
          {
            accountId: user.account.id,
            quoteId: quote.id,
            idempotencyKey: 'idem_diverge_key_001',
            regionId: 'reg_fra_1',
            customOptions: { serverName: 'beta-srv' },
          },
          db
        );
      }).toThrow('Idempotency key was previously used with a different request payload.');
    });

    it('PAY-07: checkout.session.completed with payment_status != paid does NOT mark order PAID', () => {
      const user = registerUser(
        { email: 'unpaid_checkout@example.com', password: 'Password123!', name: 'Unpaid Cust', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const quote = createQuote(user.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
      const checkout = processCheckout({ accountId: user.account.id, quoteId: quote.id, idempotencyKey: 'idem_unpaid_test', regionId: 'reg_fra_1' }, db);

      const payload: StripeWebhookPayload = {
        id: 'evt_stripe_unpaid_session_001',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: checkout.paymentAttemptId,
            amount: 1428,
            currency: 'eur',
            status: 'complete',
            // @ts-expect-error test field
            payment_status: 'unpaid',
            metadata: { orderId: checkout.orderId, paymentAttemptId: checkout.paymentAttemptId, accountId: user.account.id },
          },
        },
      };

      const result = ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(payload), payload, db);
      expect(result.status).toBe('IGNORED');

      const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(checkout.orderId) as { status: string };
      expect(order.status).toBe('AWAITING_PAYMENT');
    });

    it('PAY-08: charge.refunded webhook updates invoice to CREDITED, issues credit note, and terminates service', () => {
      const user = registerUser(
        { email: 'refund_hook@example.com', password: 'Password123!', name: 'Refund Cust', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const quote = createQuote(user.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
      const checkout = processCheckout({ accountId: user.account.id, quoteId: quote.id, idempotencyKey: 'idem_refund_hook', regionId: 'reg_fra_1' }, db);

      // Settle payment first
      const payPayload: StripeWebhookPayload = {
        id: 'evt_settle_first',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: checkout.paymentAttemptId,
            amount: 1428,
            currency: 'eur',
            status: 'succeeded',
            metadata: { orderId: checkout.orderId, paymentAttemptId: checkout.paymentAttemptId, accountId: user.account.id },
          },
        },
      };
      ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(payPayload), payPayload, db);

      // Deliver charge.refunded
      const refundPayload: StripeWebhookPayload = {
        id: 'evt_charge_refunded_001',
        type: 'charge.refunded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'ch_test_charge',
            amount: 1428,
            currency: 'eur',
            status: 'succeeded',
            // @ts-expect-error test field
            amount_refunded: 1428,
            payment_intent: checkout.paymentAttemptId,
          },
        },
      };

      const refundRes = ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(refundPayload), refundPayload, db);
      expect(refundRes.status).toBe('PROCESSED');

      const inv = db.prepare('SELECT status, amount_paid_minor_units FROM invoices WHERE id = ?').get(checkout.invoiceId) as { status: string; amount_paid_minor_units: number };
      expect(inv.status).toBe('CREDITED');
      expect(inv.amount_paid_minor_units).toBe(0);

      const ord = db.prepare('SELECT status FROM orders WHERE id = ?').get(checkout.orderId) as { status: string };
      expect(ord.status).toBe('CANCELED');

      const svc = db.prepare('SELECT contract_status FROM services WHERE account_id = ?').get(user.account.id) as { contract_status: string };
      expect(svc.contract_status).toBe('TERMINATED');
    });

    it('PAY-09: charge.dispute.created webhook suspends services and flags account for fraud review', () => {
      const user = registerUser(
        { email: 'dispute_hook@example.com', password: 'Password123!', name: 'Dispute Cust', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const quote = createQuote(user.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
      const checkout = processCheckout({ accountId: user.account.id, quoteId: quote.id, idempotencyKey: 'idem_dispute_hook', regionId: 'reg_fra_1' }, db);

      // Settle payment first
      const payPayload: StripeWebhookPayload = {
        id: 'evt_settle_for_dispute',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: checkout.paymentAttemptId,
            amount: 1428,
            currency: 'eur',
            status: 'succeeded',
            metadata: { orderId: checkout.orderId, paymentAttemptId: checkout.paymentAttemptId, accountId: user.account.id },
          },
        },
      };
      ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(payPayload), payPayload, db);

      // Dispute created
      const disputePayload: StripeWebhookPayload = {
        id: 'evt_dispute_created_001',
        type: 'charge.dispute.created',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'dp_dispute_123',
            amount: 1428,
            currency: 'eur',
            status: 'needs_response',
            // @ts-expect-error test field
            payment_intent: checkout.paymentAttemptId,
          },
        },
      };

      const disputeRes = ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(disputePayload), disputePayload, db);
      expect(disputeRes.status).toBe('PROCESSED');

      const acc = db.prepare('SELECT status FROM accounts WHERE id = ?').get(user.account.id) as { status: string };
      expect(acc.status).toBe('FLAGGED_FRAUD');

      const svc = db.prepare('SELECT contract_status FROM services WHERE account_id = ?').get(user.account.id) as { contract_status: string };
      expect(svc.contract_status).toBe('SUSPENDED');
    });

    it('PAY-10: Staff can execute partial and full refunds with credit notes and audit reason', () => {
      const user = registerUser(
        { email: 'staff_refund@example.com', password: 'Password123!', name: 'Staff Refund Cust', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const admin = registerUser(
        { email: 'billing_staff@example.com', password: 'Password123!', name: 'Billing Staff', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      db.prepare("INSERT INTO staff_memberships (user_id, role, status) VALUES (?, 'BILLING', 'ACTIVE')").run(admin.user.id);

      const quote = createQuote(user.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
      const checkout = processCheckout({ accountId: user.account.id, quoteId: quote.id, idempotencyKey: 'idem_staff_refund', regionId: 'reg_fra_1' }, db);

      // Settle payment
      const payPayload: StripeWebhookPayload = {
        id: 'evt_settle_for_staff_refund',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: checkout.paymentAttemptId,
            amount: 1428,
            currency: 'eur',
            status: 'succeeded',
            metadata: { orderId: checkout.orderId, paymentAttemptId: checkout.paymentAttemptId, accountId: user.account.id },
          },
        },
      };
      ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(payPayload), payPayload, db);

      // Partial refund: €5.00
      const partialRes = processStaffRefund(
        { invoiceId: checkout.invoiceId, amountMinorUnits: 500, reason: 'Customer dissatisfied with latency', staffUserId: admin.user.id, ipAddress: '10.0.0.5' },
        db
      );
      expect(partialRes.creditNoteNumber).toMatch(/^CRN-\d{4}-\d{5}$/);
      expect(partialRes.refundedAmount).toBe(500);

      const invAfterPartial = db.prepare('SELECT status, amount_paid_minor_units FROM invoices WHERE id = ?').get(checkout.invoiceId) as { status: string; amount_paid_minor_units: number };
      expect(invAfterPartial.status).toBe('PAID');
      expect(invAfterPartial.amount_paid_minor_units).toBe(928); // 1428 - 500

      // Cannot refund more than remaining paid amount
      expect(() => {
        processStaffRefund(
          { invoiceId: checkout.invoiceId, amountMinorUnits: 1000, reason: 'Exceeding remaining amount', staffUserId: admin.user.id, ipAddress: '10.0.0.5' },
          db
        );
      }).toThrow('Refund amount exceeds amount paid.');

      // Full refund of remaining €9.28
      const fullRes = processStaffRefund(
        { invoiceId: checkout.invoiceId, amountMinorUnits: 928, reason: 'Full account closure', staffUserId: admin.user.id, ipAddress: '10.0.0.5' },
        db
      );
      expect(fullRes.creditNoteNumber).toMatch(/^CRN-\d{4}-\d{5}$/);

      const invAfterFull = db.prepare('SELECT status, amount_paid_minor_units FROM invoices WHERE id = ?').get(checkout.invoiceId) as { status: string; amount_paid_minor_units: number };
      expect(invAfterFull.status).toBe('CREDITED');
      expect(invAfterFull.amount_paid_minor_units).toBe(0);
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

    it('PROV-05: Outbox worker automatically recovers stuck PROCESSING events after lease expiration', async () => {
      const adapter = new MockPterodactylAdapter();
      const user = registerUser(
        { email: 'lease_recovery@example.com', password: 'P@ssword123!', name: 'Lease Recovery', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );

      const quote = createQuote(user.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
      const checkout = processCheckout({ accountId: user.account.id, quoteId: quote.id, idempotencyKey: 'idem_lease_test', regionId: 'reg_fra_1' }, db);

      const payload: StripeWebhookPayload = {
        id: 'evt_lease_recovery_001',
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

      // Simulate a crashed worker: event was marked PROCESSING 10 minutes ago
      db.prepare(`
        UPDATE outbox_events
        SET status = 'PROCESSING',
            scheduled_at = datetime('now', '-10 minutes', 'utc')
      `).run();

      // Ensure outbox event is in PROCESSING state
      const preCheck = db.prepare('SELECT status FROM outbox_events LIMIT 1').get() as { status: string };
      expect(preCheck.status).toBe('PROCESSING');

      // Now run processOutboxQueue: the lease recovery query must automatically rescue it to PENDING and process it!
      const processed = await processOutboxQueue(adapter, db);
      expect(processed).toBe(1);

      const postCheck = db.prepare('SELECT status, retry_count FROM outbox_events LIMIT 1').get() as { status: string; retry_count: number };
      expect(postCheck.status).toBe('COMPLETED');
      expect(postCheck.retry_count).toBeGreaterThanOrEqual(1); // incremented during recovery
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

    it('ADMIN-05: staff ticket reply creates persistent message, transitions status to WAITING_CUSTOMER, and records audit event', () => {
      const customer = registerUser(
        { email: 'cust_ticket@example.com', password: 'StrongPassword123!', name: 'Customer Ticket', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const staffUser = registerUser(
        { email: 'staff_agent@example.com', password: 'StaffPassword123!', name: 'Staff Agent', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      db.prepare("INSERT INTO staff_memberships (user_id, role, status) VALUES (?, 'SUPPORT', 'ACTIVE')").run(staffUser.user.id);

      const ticket = createTicket(
        {
          accountId: customer.account.id,
          userId: customer.user.id,
          subject: 'Need help with allocation',
          priority: 'NORMAL',
          message: 'My instance port is unreachable',
          ipAddress: '127.0.0.1',
        },
        db
      );

      // Staff reply
      const reply = addStaffTicketReply(
        {
          ticketId: ticket.ticketId,
          staffUserId: staffUser.user.id,
          body: 'We have checked the node allocation and restarted the container.',
          isInternalNote: false,
          ipAddress: '10.0.0.1',
        },
        db
      );

      expect(reply.messageId).toMatch(/^msg_/);

      const detail = getAdminTicketDetail(ticket.ticketId, db);
      expect(detail).not.toBeNull();
      expect(detail!.ticket.status).toBe('WAITING_CUSTOMER');
      expect(detail!.messages).toHaveLength(2);
      expect(detail!.messages[1]!.is_staff_internal_note).toBe(0);
      expect(detail!.messages[1]!.body).toContain('We have checked the node allocation');

      // Check audit
      const audit = db.prepare("SELECT * FROM audit_events WHERE action = 'ticket.staff_reply_added'").all();
      expect(audit).toHaveLength(1);
    });

    it('ADMIN-06: staff internal note persists with is_staff_internal_note = 1 without changing ticket status to customer', () => {
      const customer = registerUser(
        { email: 'cust_note@example.com', password: 'StrongPassword123!', name: 'Customer Note', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const staffUser = registerUser(
        { email: 'staff_tech@example.com', password: 'StaffPassword123!', name: 'Staff Tech', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      db.prepare("INSERT INTO staff_memberships (user_id, role, status) VALUES (?, 'INFRASTRUCTURE', 'ACTIVE')").run(staffUser.user.id);

      const ticket = createTicket(
        {
          accountId: customer.account.id,
          userId: customer.user.id,
          subject: 'Hardware query',
          priority: 'HIGH',
          message: 'Hardware query details',
          ipAddress: '127.0.0.1',
        },
        db
      );

      addStaffTicketReply(
        {
          ticketId: ticket.ticketId,
          staffUserId: staffUser.user.id,
          body: 'Internal note: Node fra-node-01 memory pressure elevated.',
          isInternalNote: true,
          ipAddress: '10.0.0.2',
        },
        db
      );

      const detail = getAdminTicketDetail(ticket.ticketId, db);
      expect(detail!.ticket.status).toBe('OPEN'); // Not changed to WAITING_CUSTOMER
      expect(detail!.messages).toHaveLength(2);
      expect(detail!.messages[1]!.is_staff_internal_note).toBe(1);
    });

    it('ADMIN-07: account lock mutation updates status to LOCKED and records staff audit reason', () => {
      const customer = registerUser(
        { email: 'fraud_account@example.com', password: 'FraudPassword123!', name: 'Suspicious Workspace', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const adminUser = registerUser(
        { email: 'super_admin@example.com', password: 'SuperPassword123!', name: 'Admin', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      db.prepare("INSERT INTO staff_memberships (user_id, role, status) VALUES (?, 'OWNER', 'ACTIVE')").run(adminUser.user.id);

      updateAccountStatus(
        {
          accountId: customer.account.id,
          status: 'LOCKED',
          reason: 'Chargeback risk detected by risk team',
          actorUserId: adminUser.user.id,
          ipAddress: '10.0.0.3',
        },
        db
      );

      const detail = getAdminAccountDetail(customer.account.id, db);
      expect(detail).not.toBeNull();
      expect(detail!.account.status).toBe('LOCKED');

      const audit = db.prepare("SELECT * FROM audit_events WHERE action = 'account.status_changed'").all() as { metadata: string }[];
      expect(audit).toHaveLength(1);
      expect(JSON.parse(audit[0]!.metadata).reason).toBe('Chargeback risk detected by risk team');
    });

    it('ADMIN-08: staff can change ticket status (e.g. to RESOLVED) with persistent audit trail', () => {
      const customer = registerUser(
        { email: 'status_user@example.com', password: 'Password123!', name: 'Status Cust', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const adminUser = registerUser(
        { email: 'staff_res@example.com', password: 'Password123!', name: 'Staff Resolver', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      db.prepare("INSERT INTO staff_memberships (user_id, role, status) VALUES (?, 'SUPPORT', 'ACTIVE')").run(adminUser.user.id);

      const ticket = createTicket(
        { accountId: customer.account.id, userId: customer.user.id, subject: 'Resolve me', message: 'Please resolve this issue.', priority: 'NORMAL', ipAddress: '127.0.0.1' },
        db
      );

      updateTicketStatus(
        { ticketId: ticket.ticketId, status: 'RESOLVED', actorUserId: adminUser.user.id, ipAddress: '10.0.0.9' },
        db
      );

      const detail = getAdminTicketDetail(ticket.ticketId, db);
      expect(detail).not.toBeNull();
      expect(detail!.ticket.status).toBe('RESOLVED');

      const audit = db.prepare("SELECT * FROM audit_events WHERE action = 'ticket.status_changed'").all() as { metadata: string }[];
      expect(audit).toHaveLength(1);
      expect(JSON.parse(audit[0]!.metadata)).toEqual({ from: 'OPEN', to: 'RESOLVED' });
    });
  });

  describe('Category G: Team Management, Password Change & Transactional Email Outbox', () => {
    it('TEAM-01: Owner can invite a team member; invitation and transactional email are persisted atomically', () => {
      const owner = registerUser(
        { email: 'orgowner@example.com', password: 'OwnerPassword123!', name: 'Org Owner', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );

      const invite = inviteAccountMember(
        {
          accountId: owner.account.id,
          invitedByUserId: owner.user.id,
          email: 'engineer@example.com',
          role: 'TECH_ADMIN',
          ipAddress: '127.0.0.1',
        },
        db
      );

      expect(invite.invitationId).toMatch(/^inv_/);
      expect(invite.rawToken).toBeDefined();

      const invitations = listAccountInvitations(owner.account.id, db);
      expect(invitations).toHaveLength(1);
      expect(invitations[0]!.email).toBe('engineer@example.com');
      expect(invitations[0]!.role).toBe('TECH_ADMIN');

      // Check email outbox
      const outbox = db.prepare("SELECT * FROM email_outbox WHERE recipient = 'engineer@example.com'").all() as { template: string; status: string }[];
      expect(outbox).toHaveLength(1);
      expect(outbox[0]!.template).toBe('account_invitation');
      expect(outbox[0]!.status).toBe('PENDING');
    });

    it('TEAM-02: Non-owner without permission cannot invite team members (fails closed)', () => {
      const owner = registerUser(
        { email: 'owner2@example.com', password: 'OwnerPassword123!', name: 'Owner', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const viewer = registerUser(
        { email: 'viewer@example.com', password: 'ViewerPassword123!', name: 'Viewer', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );

      // Add viewer to owner's workspace
      db.prepare("INSERT INTO memberships (id, account_id, user_id, role) VALUES ('mem_viewer', ?, ?, 'VIEWER')")
        .run(owner.account.id, viewer.user.id);

      expect(() => {
        inviteAccountMember(
          {
            accountId: owner.account.id,
            invitedByUserId: viewer.user.id,
            email: 'unauthorized@example.com',
            role: 'BILLING_MANAGER',
            ipAddress: '127.0.0.1',
          },
          db
        );
      }).toThrow('Only workspace owners and technical administrators can invite new members.');
    });

    it('TEAM-03: Invitee can accept invitation and joins workspace with specified role', () => {
      const owner = registerUser(
        { email: 'teamcorp@example.com', password: 'CorporatePassword1!', name: 'Corp Owner', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const invitee = registerUser(
        { email: 'invitee@example.com', password: 'InviteePassword1!', name: 'Invited Engineer', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      // Verify invitee email
      db.prepare("UPDATE users SET status = 'ACTIVE', email_verified_at = datetime('now', 'utc') WHERE id = ?").run(invitee.user.id);

      const { rawToken } = inviteAccountMember(
        {
          accountId: owner.account.id,
          invitedByUserId: owner.user.id,
          email: 'invitee@example.com',
          role: 'BILLING_MANAGER',
          ipAddress: '127.0.0.1',
        },
        db
      );

      const result = acceptAccountInvitation(rawToken, invitee.user.id, '127.0.0.1', db);
      expect(result.accountId).toBe(owner.account.id);
      expect(result.role).toBe('BILLING_MANAGER');

      const members = listAccountMembers(owner.account.id, db);
      expect(members).toHaveLength(2);
      const joined = members.find((m) => m.userId === invitee.user.id);
      expect(joined?.role).toBe('BILLING_MANAGER');
    });

    it('TEAM-04: Last-owner protection: workspace owner cannot remove the last owner', () => {
      const owner = registerUser(
        { email: 'soleowner@example.com', password: 'SoleOwnerPassword1!', name: 'Sole Owner', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      const members = listAccountMembers(owner.account.id, db);
      const ownerMember = members[0]!;

      expect(() => {
        revokeAccountMember(
          {
            accountId: owner.account.id,
            actorUserId: owner.user.id,
            membershipId: ownerMember.id,
            ipAddress: '127.0.0.1',
          },
          db
        );
      }).toThrow('Cannot remove the primary workspace account owner.');
    });

    it('AUTH-12: Password change from settings validates current password, updates hash, revokes other sessions, and queues security alert', () => {
      const user = registerUser(
        { email: 'changepass@example.com', password: 'OldPassword123!', name: 'Change Pass', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );
      db.prepare("UPDATE users SET status = 'ACTIVE', email_verified_at = datetime('now', 'utc') WHERE id = ?").run(user.user.id);

      const session1 = loginUser({ email: 'changepass@example.com', password: 'OldPassword123!', ipAddress: '1.1.1.1', userAgent: 'desktop' }, db);
      const session2 = loginUser({ email: 'changepass@example.com', password: 'OldPassword123!', ipAddress: '2.2.2.2', userAgent: 'phone' }, db);

      const authCtx2 = authenticateSession(session2.token, db);
      expect(authCtx2).not.toBeNull();

      // Wrong current password fails
      expect(() => {
        changePassword(
          {
            userId: user.user.id,
            accountId: user.account.id,
            currentPassword: 'WrongPassword!',
            newPassword: 'BrandNewPassword123!',
            currentSessionId: authCtx2!.session.id,
            ipAddress: '2.2.2.2',
          },
          db
        );
      }).toThrow('Current password is incorrect.');

      // Correct password change succeeds
      changePassword(
        {
          userId: user.user.id,
          accountId: user.account.id,
          currentPassword: 'OldPassword123!',
          newPassword: 'BrandNewPassword123!',
          currentSessionId: authCtx2!.session.id,
          ipAddress: '2.2.2.2',
        },
        db
      );

      // Session 1 is revoked, Session 2 remains valid
      expect(authenticateSession(session1.token, db)).toBeNull();
      expect(authenticateSession(session2.token, db)).not.toBeNull();

      // Can sign in with new password
      const newSession = loginUser({ email: 'changepass@example.com', password: 'BrandNewPassword123!', ipAddress: '3.3.3.3', userAgent: 'laptop' }, db);
      expect(newSession.token).toBeDefined();

      // Security notification email queued
      const alerts = db.prepare("SELECT * FROM email_outbox WHERE recipient = 'changepass@example.com' AND template = 'security_alert'").all();
      expect(alerts).toHaveLength(1);
    });

    it('EML-01: Registration and password reset write to email_outbox atomically', () => {
      registerUser(
        { email: 'outboxcheck@example.com', password: 'StrongPassword123!', name: 'Outbox Check', ipAddress: '127.0.0.1', userAgent: 'test' },
        db
      );

      // Verification email was queued
      const verifyMails = db.prepare("SELECT * FROM email_outbox WHERE recipient = 'outboxcheck@example.com' AND template = 'email_verification'").all() as { payload_json: string }[];
      expect(verifyMails).toHaveLength(1);
      const payload = JSON.parse(verifyMails[0]!.payload_json);
      expect(payload.verifyUrl).toContain('/verify-email?token=');

      // Request password reset queues reset email
      requestPasswordReset('outboxcheck@example.com', db);
      const resetMails = db.prepare("SELECT * FROM email_outbox WHERE recipient = 'outboxcheck@example.com' AND template = 'password_reset'").all() as { payload_json: string }[];
      expect(resetMails).toHaveLength(1);
      const resetPayload = JSON.parse(resetMails[0]!.payload_json);
      expect(resetPayload.resetUrl).toContain('/reset-password?token=');
    });

    it('EML-02: Sandboxed email processing generates real offline receipts with correct template rendering', async () => {
      clearSandboxReceipts();
      const previousMode = config.EMAIL_MODE;
      config.EMAIL_MODE = 'sandbox';

      try {
        registerUser(
          { email: 'receipttest@example.com', password: 'ReceiptPassword123!', name: 'Receipt Test', ipAddress: '127.0.0.1', userAgent: 'test' },
          db
        );

        const result = await processEmailOutbox(db);
        expect(result.sent).toBeGreaterThanOrEqual(1);

        const receipts = getSandboxReceipts();
        const receipt = receipts.find((r) => r.recipient === 'receipttest@example.com');
        expect(receipt).toBeDefined();
        expect(receipt?.subject).toBe('Verify your Fortless account');
        expect(receipt?.text).toContain('Please verify your email address for Fortless');
        expect(receipt?.html).toContain('Verify Email Address');
      } finally {
        config.EMAIL_MODE = previousMode;
        clearSandboxReceipts();
      }
    });
  });
});
