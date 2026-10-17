# FORTLESS — Money, payments, billing, taxes, fraud & disputes

## Non-negotiable rule
NEVER deliver a paid hosting entitlement because the browser says checkout succeeded. Never mutate a contract from a client-supplied `paid=true`, client price, unverified order ID or arbitrary discount. Hosted PSP confirmation must match the authoritative Fortless merchant, immutable quote, paid amount, currency, customer and order. Do not store card numbers or CVV. Only charge via approved PSP integrations.

## Authority model and choice
Default architecture proposal: Fortless is authoritative for catalog, subscription contract, invoices/credits, tax snapshots, invoice numbering and due dates; the PSP is authoritative for actual payment attempts, captures, refunds, disputes and payment methods. This is not the same as using Stripe Billing as the recurring subscription authority. Write an ADR selecting one option. With Fortless-owned renewals, charge a Fortless-issued renewal invoice through approved PSP primitives and authorized saved payment method; do not also create a PSP recurring plan that charges autonomously. Account for SCA/off-session exceptions and card-consent law. If business chooses Stripe Billing authority, implement with subscription webhooks and forbid independent renewal-charging worker.

## Payment flow: canonical
1. Customer selects product/version/region/plan cycle and options. Server checks published plan, actual provider capacity, eligibility, abuse restrictions, coupon rules and tax info; responds with signed server-owned quote reference, exact items/totals, currency, recurring fee, tax assumptions, valid-until and merchant policy version.
2. On checkout, require session, allowed email/account state, clear renewal consent, applicable legal acceptance, quote version, billing identity/address and fraud rules. Acquire idempotency lock. Persist order + order item snapshots and payment attempt transactionally. If capacity reserved, it expires deterministically.
3. Create hosted checkout/payment object through PSP with durable PSP idempotency key and narrow metadata containing ONLY opaque correlation references; persist provider IDs. Client receives only PSP-hosted redirect or client-safe token.
4. Browser redirect page is cosmetic; it shows `processing` or queries trusted order status. It NEVER issues provisioning or `mark-paid` itself.
5. Raw webhook arrives. Verify signature and event source against exact environment and account; parse only post-verification. Persist event ID+payload digest+timestamp inbox with uniqueness; create outbox job atomically and return 2xx. Respect replay tolerance per PSP documentation. Process asynchronously; handle event ordering and re-fetch canonical payment object as required.
6. Map provider payment to ONE Fortless attempt/order/invoice, verify currency, expected amount and settlement status. On verified success atomically post journal transaction, transition invoicing/entitlement, queue provisioning once and notify. If not verified, quarantine/alert; do not provide resources.
7. Reconciliation scans live PSP payment objects against Fortless transactions and orders, identifies missing events, abandoned attempts, partial balances, chargebacks and provider ambiguity.

## Monetary and ledger invariants
- Use decimal/integer minor units; never JS IEEE floats; encode ISO currency and exponent. Taxes and discounts have documented order-of-operations and rounding, including mixed tax treatment and multiple lines.
- Quote totals frozen at acceptance for that checkout attempt. If plan changes or quote expires, obtain new customer approval. Subsequent renewal uses agreed renewal schedule/rules, not silently stale one-time promo.
- An invoice amount due cannot become negative. Track individual payment allocations, partial payment, amount refunded and currency. A payment is never allocated twice.
- A paid invoice has sufficient confirmed settlement or approved accounting credit. A PSP authorization/hold is NOT automatically settlement; policy requires sufficiently final state before irreversible/expensive provisioning.
- The ledger contains immutable event references and compensating entries. Never delete a settled payment or overwrite an issued invoice. Credit notes and cancellations use legally compliant sequence.
- If prepaid account credit/wallet ever exists, use proper double-entry immutable ledger, atomic reservation/spend/refund and reconciliation. Keep OFF in MVP.
- Reconcile source-of-truth business events at least daily and after outages; provide staff downloadable anomaly reports and explicit reconciliation actions, with dual-control for dangerous fixes.

## Subscription/renewal policy design
Contract has billing period anchors, timezone behavior, current period start/end, next due, next renewal price, cancellation type, outstanding invoices, grace and service hold status. Generate each renewal invoice at most once by unique `(contractId,periodStart,periodEnd)`; issue according to tax/entity rules. Send notices; attempt autocharge only after explicit customer authorization; perform step-up customer action if SCA required. Payment failures cause a configurable grace schedule with notification. Avoid instant termination due to PSP webhook delay or Redis outage. Suspension and deprovision are different and have documented grace/data retention. After chargeback/fraud, limit services by risk policy with manual review; never silently discard user data.

## Refund/cancellation policy
Differentiate: cancel renewal, immediate suspension, termination at period end, early termination, prorated upgrade/downgrade and refunded purchase. Staff refund requests require amount <= legitimately refundable captured balance minus prior refunds/disputes, provider refund idempotency key, signed high-risk permission and potentially second approval. PSP refund pending != completed. Credit note/finance adjustment must reflect actual final PSP outcome. For domain registrations and other irreversible upstream purchases, refund rules differ and must be visible before checkout. A full refund does NOT necessarily mean instant data destruction; follow explicit terms, abuse procedures and retention policy.

## Disputes and anti-fraud
- Track chargebacks, fraud alerts, dispute deadlines, evidence, fees and state. A dispute event is a risk signal, not proof of fraud or permission for arbitrary automatic destruction.
- Velocity by IP/session/account/payment fingerprint (only where lawful/provider-supported), email verification, anonymous proxy warnings, signup-age/abuse patterns, PSP fraud score if offered, transaction value and abnormal geographical patterns. Enforce per-account provisional quotas and manual review for suspicious high-cost resources. Don't use protected attributes for risk scores.
- Prevent coupon farming, signup repeated use, card testing, false trials, gifted service ownership ambiguity, multiple accounts bypassing limits and price race. Add challenge/rate limits to failed payment attempts but avoid accidental denial of service through hostile lockouts.
- Manual bank transfer, cash or crypto is disabled by default. If added, define exact PSP/bank reconciliation, irreversible/confirmation semantics, fraud risk, accounting and authorization. An image of payment receipt cannot mark paid.
- Admin staff cannot simply call arbitrary `markPaid`. Any manual credit/override must be narrow, dual-approved beyond thresholds, reasoned, journaled, and linked to external evidence.

## Payment and provisioning fault matrix
| Case | Required behavior |
| --- | --- |
| Customer changes displayed `€15` to `€0.01` | Server ignores client price, trusted quote governs, reject mismatch |
| Race: 10 simultaneous checkout calls | One logical attempt/session/order effect per idempotency key, safe conflicts |
| Customer uses another account's invoice ID | Ownership validation denies |
| 3DS challenge canceled | Still pending/failed, no provisioning |
| Authorized but not captured | No premature irreversible service under configured payment policy |
| Browser never returns | Webhook/reconciliation still finalizes |
| Customer lands on fake `success` URL | No `paid` transition |
| Webhook signature invalid / raw body modified | Reject and log safe security event |
| Stripe event delivered twice | Inbox dedupe + transaction semantic dedupe; no second entitlement |
| Success webhook before `processing` webhook | Monotonic guarded state, authoritative PSP fetch |
| Paid event has wrong currency or amount | Quarantine anomaly, no entitlement |
| Payment succeeds after quote/order canceled | Hold in exception queue and reconcile/refund rather than create surprise service |
| Wrong PSP account or sandbox event in live | Reject |
| PSP timeout during checkout creation | Lookup by idempotency key/correlation, no blind second charge |
| DB commit fails after payment created | Recovery job locates payment and links attempt, alerts if ambiguous |
| Provider declines after payment | PAID_UNFULFILLED + support, retry or refund with consent; no silent disappearance |
| Provider creates server but response times out | Discover external-id, link; never duplicate |
| Provider creates two resources due to previous bug | Quarantine extra, investigate and remediate, no arbitrary instant deletion |
| Renewal worker overlaps twice | Unique contract/period invoice + idempotency stops double charge |
| Cancel occurs as charge is requested | Deterministic command ordering and recoverable refund/void policy |
| Payment failed yet late paid webhook arrives | Re-evaluate current source state and entitlement, do not overwrite valid newer state |
| Refund requested twice | Refund idempotency + remaining-refundable calculation prevents over-refund |
| Payment partially refunded | Preserve journal and entitlement policy, do not label full refund |
| Dispute opened then won | Restore according to risk policy, journal consistency |
| Customer issued tax invoice then edits address | Previous invoice immutable; corrected document according to local tax rules |
| Coupon max 100 redeemed by 200 concurrent users | Atomic cap, no oversubscription |
| Tax provider unavailable | Fail closed for checkout when tax correctness cannot be established; do not charge estimated tax silently |
| Email provider unavailable | Order state persists, queued delivery retries; no duplicate charge |
| Worker crash during settlement processing | Inbox/outbox resume without duplicate paid transitions |
| Redis outage | Durable DB work visible for recovery; no guessed success |
| Stripe reports suspicious charge after provision | Risk review and abuse policy; retained customer notification and evidence |

## PSP sandbox acceptance
Test payment succeeded, failed, 3DS challenge, SCA off-session, delayed async, webhook retry out-of-order, refund pending and succeeded, dispute lifecycle, API network timeout, stale invoice, canceled checkout and concurrency. Explicitly label any sandbox case that PSP cannot simulate and describe staging alternative. No live charging until verified provider approval, tax/invoice policy signoff, privacy/TOS/AUP/refund wording, security and backup gates.

## Tax/legal configuration gates
Business domicile/merchant-of-record, selling region, VAT registration, VAT OSS/IOSS applicability (do not assume IOSS for hosting), reverse charge, VIES ID verification, price displays to consumer/business, invoicing and national e-invoice rules all depend on actual seller and customers. Define tax calculator interface and persistent tax evidence, but block live billing until accountant-reviewed jurisdiction rules exist. GDPR privacy notices, retention, processor DPAs and data subject requests must have lawful basis and exceptions. Never claim legal compliance solely from generated text.
