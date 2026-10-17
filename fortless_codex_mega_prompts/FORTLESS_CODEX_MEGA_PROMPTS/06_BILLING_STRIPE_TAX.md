# PHASE 6 — PAYMENT-SAFE COMMERCE, STRIPE TEST MODE, INVOICING & FINANCIAL OPERATIONS

This is a **high-risk** stage. Read `00_GLOBAL_CONTRACT.md`, Phase 1 findings, current Stripe official docs for the pinned API version, `src/modules/{pricing,checkout,payments,invoicing}`, and `src/server.ts`. **Never activate live payments, collect real customer funds or silently decide fiscal policy.** Implement sandbox-first and prove safety before any production mode is even proposed.

## A. Decisions BEFORE activation

Create a signed-off checklist for legal merchant entity/domicile, merchant of record, B2B/B2C sales countries, VAT registrations/OSS requirements, fiscal document provider, currency/price display, applicable taxes, refund rules, retention, digital service withdrawal rules, AUP, PSP hosting/recurring approval, allowed payment methods and invoice series. Current repo docs include placeholder policies (e.g. universal 19% VAT / 72-hour refunds) that **must not** be treated as legal truth. Tax examples are test fixtures only. A valid VAT ID must be verified according to applicable requirements, with evidence/timestamp and fallback; merely length >5 is not verification. Unsupported jurisdiction/country => block or manual review, never arbitrarily default charge or 0%.

## B. Authoritative money model

- `Quote` -> `Order` -> `Invoice` / `PaymentAttempt` -> `PSP Checkout Session` -> signed provider event or authoritative PSP fetch -> `PaymentSettlement` -> service entitlement -> transactional outbox provisioning. Maintain independent commercial and technical state machines.
- Monetary totals in checked minor units with explicit ISO currency, line price/version/options, tax evidence, discounts, invoice sequencing and immutable records. Enforce numerical ranges (nonnegative) and currency matching.
- One idempotent Checkout Session creation per canonical checkout attempt; never create payment link from client input. Store real `checkout_session.id`, `payment_intent.id` (where present), merchant account, mode and expected amount/currency in DB, not a fake local attempt ID posing as session ID. Handle idempotent return after a PSP response timeout by lookup/reconciliation.
- Allow 3DS/SCA, declined, `requires_action`, delayed bank methods, pending, cancelled, expired and abandoned checkout. Do not assume redirect to success or `checkout.session.completed` means funds captured: inspect `payment_status`, session mode, payment method and authoritative PSP state; `checkout.session.async_payment_succeeded` and failed variants where applicable. Match event type-specific schemas; `amount_total` vs `amount_received` appropriately; never depend on an absent generic `amount` field.
- Verify official Stripe raw-body signature via vetted SDK (including timestamp tolerance); event parsed only after verification; reject wrong live/test mode, wrong connected merchant, wrong PSP object, wrong expected order/attempt, wrong amount/currency and non-final payment state. `metadata` is correlation aid, not payment proof. Store digest/event IDs and financial PSP identities with unique constraints and reconciliation. Redact secrets/PII in logs and stored event payload.

## C. Exactly-once EFFECT, at-least-once DELIVERY

- Provider webhook delivery is at-least-once and events may arrive out of order. Deduplicate event IDs AND settle a specific PSP payment exactly once regardless of different event IDs or webhook types. State transition must be transactional with guarded expected-state update/unique settlement ID; retries after partial crash never duplicate invoices, ledger allocations, entitlement, outbox or refunds.
- Distinguish invoice number allocation and fiscal document issuance. The tax/invoice partner decides legal sequencing; do not number draft as fiscal invoice prematurely if not compliant. Cancellation/credit-note issuance must preserve audit and legal history, never delete paid invoices.
- Build separate immutable payment ledger/allocation records and reconciliation job, mapping capture/refund/dispute/chargeback to order and invoice; nightly reconciliation detects missing/mismatched PSP amounts and orphan transactions, alerts humans and blocks automatic fulfillment on anomalies.
- Payments confirmed while capacity disappeared: create `PAID_UNFULFILLED_REVIEW`/queue and agreed refund/alternative handling, not blind server creation or money disappearance.

## D. Subscriptions and service renewals

- Choose and document one authority: local subscription engine coordinated with PSP or PSP subscriptions coordinated with local mirror. Never have two independent systems generating duplicate renewals/charges. Preserve provider identity of each invoice/payment.
- Initial periods, renewal dates, billing cycles, auto-renew and payment method consent, retry/dunning, grace period, invoices before charging when appropriate, suspended/past_due rules, unsuspension after confirmed payment, cancellation immediate vs end-of-term.
- Upgrade proration, addon modifications, usage metering if approved, plan transitions, tax rate changes and invoice adjustments; credits/refunds never exceed captured net payment.
- Refund workflow with staff role, reason, original payment linkage, idempotency, amount caps, provider confirmation, credit notes, partial refunds, duplicate event safety, alert to customer, service state policy. Chargebacks/disputes suspend actions based on approved policy; do not automatically delete data or hide dispute evidence.

## E. Frontend and admin

- Checkout displays complete and actual quote line/taxes/period, expected renewal total, T&C consent, order id, PSP redirect, pending state, success only after confirmed server-side settlement; error/expired retry with idempotency.
- Billing page has real invoices, downloadable legally correct documents if signed off, payment attempts, subscription cancellation, renewal controls, refunds status, payment method PSP portal, notification preferences. Never use placeholder PDFs as customer invoices.
- Admin queue for anomalous payments, failed renewal, refund approvals, chargebacks, corrections and manual reconciliation. Staff cannot set order PAID manually with an API toggle.

## F. Mandatory sandbox matrix (document test receipts)

1. Signed valid settled payment -> exactly one `PAID` entitlement and one outbox; never deliver before settlement.
2. Forged signature, replayed signature/time, altered body -> reject without side effects.
3. `checkout.session.completed` with unpaid/pending payment -> no provisioning; delayed success later -> one entitlement.
4. Correct session but wrong merchant, livemode, account, order ID, currency, amount, product metadata -> anomaly held.
5. Duplicate event ID, different events for same PSP payment, out-of-order events, concurrent same-payment delivery -> one financial settlement.
6. Network timeout after creating PSP session; retry matches the original session; no two chargeable orders.
7. Double-click checkout, race between two browser tabs, reusing idempotency key with changed region/option/quantity -> no incorrect order/price.
8. Tax manipulation, B2B flag with invalid/unverified VAT ID, ambiguous tax jurisdiction -> deny/live hold pending owner-approved policy.
9. 3DS challenge fail, declined, expired, partially captured/returned payments, overpayment and zero/negative amount -> correct state, no service grant.
10. Renewal paid twice, webhook delayed relative to dunning, user cancellation at renewal boundary -> no double charge or accidental termination.
11. Partial/full refund, duplicate refund webhook, dispute opened/won/lost, reversal -> consistent ledger, invoice/credit note, service status, audit.
12. Crash after PSP confirmation before DB commit, after DB commit before HTTP 200, before provisioning event dispatch -> eventual reconciliation, one result.
13. Cross-tenant invoice/checkout lookup, billing role boundaries, CSRF replay -> no leak or mutation.

## Deliverables and explicit approval gates

Real Stripe **test-mode** adapter, documented pinned API version, signed webhook contract integration with real Stripe test events, reconciled DB state machine, tests and screenshots, finance runbooks, unresolved tax/legal policy checklist. Do not switch to live; fail closed until owner provides/approves legal information, PSP access and production readiness evidence. Report exactly which cases ran in Stripe sandbox versus local mock.
