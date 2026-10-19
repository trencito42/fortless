/**
 * Test isolation: the unit and integration tests never talk to Stripe. Every `new Stripe(...)` returns a recording
 * fake, so a developer key in .env cannot make the suite hit the network. Real-Stripe behaviour is a SANDBOX_VERIFIED
 * concern and is covered by the staging plan, not by this file.
 */
import { vi } from 'vitest';

process.env['STRIPE_SECRET_KEY'] ||= 'sk_test_unit_fake';
process.env['STRIPE_WEBHOOK_SECRET'] ||= 'whsec_unit_fake';
process.env['EMAIL_MODE'] ||= 'sandbox';

export interface StripeCall { path: string; args: unknown[] }
const g = globalThis as unknown as { __stripeCalls?: StripeCall[]; __stripeFail?: Record<string, Error | undefined>; __stripeSeq?: number };
g.__stripeCalls = [];
g.__stripeFail = {};
g.__stripeSeq = 0;

vi.mock('stripe', () => {
  const record = (path: string, result: (n: number, args: unknown[]) => unknown) => async (...args: unknown[]) => {
    g.__stripeCalls!.push({ path, args });
    const failure = g.__stripeFail![path];
    if (failure) throw failure;
    return result(++g.__stripeSeq!, args);
  };
  class FakeStripe {
    checkout = { sessions: {
      create: record('checkout.sessions.create', (n) => ({ id: `cs_test_${n}`, url: `https://checkout.stripe.test/c/${n}` })),
      expire: record('checkout.sessions.expire', (n) => ({ id: `cs_test_${n}`, status: 'expired' })),
    } };
    subscriptions = {
      cancel: record('subscriptions.cancel', (n) => ({ id: `sub_${n}`, status: 'canceled' })),
      update: record('subscriptions.update', (n) => ({ id: `sub_${n}` })),
    };
    taxRates = { create: record('taxRates.create', (n) => ({ id: `txr_${n}` })) };
    coupons = { create: record('coupons.create', (n) => ({ id: `coupon_${n}` })) };
    refunds = { create: record('refunds.create', (n) => ({ id: `re_${n}`, status: 'succeeded' })) };
    constructor(public key?: string) {}
  }
  return { default: FakeStripe, Stripe: FakeStripe };
});
