import type { Invoice, Money } from '../types';

/** Invoice total, payment and balance are three different numbers. Balance is what is still owed; refunds do not reopen an invoice. */
export const balanceDue = (i: Invoice): Money => ({ currency: i.currency, amount: i.status === 'OPEN' ? Math.max(0, i.total.amount - i.amountPaid.amount - i.creditApplied.amount) : 0 });
export const refundable = (i: Invoice): Money => ({ currency: i.currency, amount: Math.max(0, i.amountPaid.amount - i.amountRefunded.amount) });
export const netReceived = (i: Invoice): Money => ({ currency: i.currency, amount: i.amountPaid.amount - i.amountRefunded.amount });
/** Refunds at or above this many minor units (any currency) need a second staff member. Mirrors the "large refund" approval kind. */
export const APPROVAL_THRESHOLD_MINOR = 10_000;
