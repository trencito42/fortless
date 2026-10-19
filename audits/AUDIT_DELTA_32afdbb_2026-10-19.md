# Fortless source audit: delta after 32afdbb

**Repo:** `trencito42/fortless` | **Code baseline:** `32afdbb21532af4ebbd1a96a082afbe7c1f76bf0` | **Date:** 2026-10-19

**Method:** static source review, cross-module event tracing and compare against `e147899`. Not a live pentest. No source modifications, no production HTTP probes and no execution of provider/Stripe E2E tests in this review.

## Result

The latest push includes genuine fixes, but several payment and service lifecycle invariants are not satisfied. **Hold real-money launch.** Prioritize complete flow repair rather than per-branch patches.

### New root-cause findings

#### NEW-339 | P0 | Outbox marks unsupported event types COMPLETED without doing anything

- `src/modules/outbox/worker.ts:122-150`: dispatcher handles only `service.provision.v1`, `service.suspend.v1`, `service.terminate.v1`. Regardless of unrecognized type, it sets status `COMPLETED`.
- `src/modules/billing/subscriptions.ts:101-114` now enqueues `stripe.subscription.cancel.v1`.
- `src/modules/payments/webhooks.ts:253-270` now enqueues `service.unsuspend.v1`.
- **Consequence:** Stripe cancellation may not happen while locally shown canceled; billing recovery may mark service ACTIVE without unsuspending provider; monitoring sees successfully completed jobs.
- **Fix:** Explicit exhaustive dispatch; unhandled types fail closed as `DEAD_LETTER` or `UNSUPPORTED_EVENT` with alerting. Implement dedicated Stripe cancellation and provider unsuspend jobs with idempotency, retry and reconciliation.
- **Acceptance:** Enqueue all 5 event types, assert each specific external call. Unknown event must not become COMPLETED. Simulate one provider outage and recover by retry.

#### NEW-340 | P0 | One-time setup fee and introductory coupon discount used as recurring Stripe price

- `src/modules/pricing/quote.ts:135-169` adds `setup_fee_minor_units` into the quote subtotal.
- `src/modules/checkout/checkout.ts:210-243` sends `txResult.totalMinorUnits` as `recurring.unit_amount` in Stripe subscription line item. This total also contains tax and any coupon discount.
- **Consequence:** One-time setup fee is charged on every renewal; a first-order discount may become a permanent recurring discount; recurring tax may be wrong when jurisdiction changes.
- **Fix:** Persist recurring base price per line and one-time setup fee independently. Stripe Checkout must contain recurring and one-time lines with correct tax modeling. Use a deliberate discount duration policy.
- **Acceptance:** €10/mo hosting + €5 setup gives first invoice €15 before tax, then €10 before tax; 3-month interval and discount-once scenarios match Stripe invoice 1/2.

#### NEW-341 | P1 | Coupon redemption committed before payment, not compensated on checkout failure

- `src/modules/checkout/checkout.ts:121-129` redeems coupon while creating unpaid order.
- `src/modules/checkout/checkout.ts:278-302` rolls back invoice/order on Stripe failure but does not undo coupon redemption. A successful Checkout Session that is abandoned also keeps coupon consumed.
- **Consequence:** Coupon usage limits and per-workspace allowance can be exhausted without actual sales.
- **Fix:** Reserve coupon against pending order with expiry and release on failed/expired session; commit redemption only at payment settlement in the same transaction.
- **Acceptance:** Failed or expired checkout restores allowance; successful payment increments exactly once; concurrent final claims stay within max_redemptions.

#### NEW-342 | P1 | Ownership-grant invitation needs recent step-up

- `src/modules/identity/teams.ts:90-98` now correctly restricts new OWNER invites to existing OWNERs.
- `src/server.ts:1020-1042` grants invite permission with `requireAuth` only; no `requireRecentStepUp` for OWNER grant.
- **Consequence:** Stolen live session of OWNER can issue high-privilege invitation without recent factor proof.
- **Fix:** For `role === 'OWNER'`, enforce recent step-up server-side; keep ordinary team invites frictionless. Log role changes and notify current owners.
- **Acceptance:** OWNER session without step-up cannot invite OWNER, current step-up can, TECH_ADMIN cannot even with step-up.

#### NEW-343 | P0 | Webhook-driven termination leaks node capacity

- `src/modules/payments/webhooks.ts:142-158`, `303-317` and `src/modules/payments/webhooks.ts:598-621` mark services terminated locally and enqueue `service.terminate.v1`.
- `src/modules/outbox/worker.ts:137-150` deletes remote resource but never updates `nodes.allocated_memory_mb` / `allocated_disk_mb`, nor runs centralized local termination accounting.
- `src/modules/provisioning/services.ts:403-499` performs node capacity release only when invoked directly. Outbox bypasses it.
- **Consequence:** Terminated servers continue occupying capacity in Fortless forever; subsequent customers may be unable to purchase/deploy.
- **Fix:** One idempotent lifecycle state machine responsible for remote deletion confirmation and exactly-once capacity release, used by API, billing, staff refund and outbox. Do not premark confirmed termination before remote success.
- **Acceptance:** Refund, Stripe subscription deletion, dunning and manual cancellation all release exactly once, with retries, lost network response, and duplicate webhook.

### Old IDs that are not fully fixed

| Existing ID | Static review outcome | Evidence / gap |
| --- | --- | --- |
| NEW-330 | PARTIAL | `webhooks.ts:240-250` pays oldest ISSUED invoice on same account; not the matching Stripe invoice ID, amount or currency. Still wrong when there are two invoice/subscription pairs. |
| NEW-331 | FIXED_IN_CODE | `teams.ts:94-97` disallows TECH_ADMIN granting OWNER; runtime test remains. |
| NEW-332 | PARTIAL | `worker.ts:21-36` rejects mock cPanel/VPS in NODE_ENV=production; no live adapters are registered in bootstrap. Disable commercial products until wired. |
| NEW-333 | PARTIAL | Stripe cancel is queued, but no handler exists, see NEW-339. |
| NEW-334 | OPEN | `webhooks.ts:561-640` staff refund still modifies local ledger without Stripe Refunds API. Added remote termination event does not refund money. |
| NEW-335 | FIXED_IN_CODE (limited) | `webhooks.ts:130-145` computes net paid as total minus cumulative charge.amount_refunded; check refund out-of-order and payment attempt status. |
| NEW-336 | PARTIAL | `webhooks.ts:253-270` queues unsuspend, but it is not dispatched; local status switches ACTIVE first. |
| NEW-337 | FIXED_IN_CODE (limited) | `worker.ts:168-177` avoids reviving TERMINATED on termination dead-letter; tests needed. |
| NEW-338 | PARTIAL | `webhooks.ts:466-502` repeats same PSP subscription ID across services and prorates full checkout total equally. `invoice.paid` uses first matching subscription and can't uniquely settle/cancel per service. |
| NEW-301/302 | PARTIAL | Await/404 handling improved, but webhook/outbox lifecycle and capacity remain inconsistent (NEW-343). |
| NEW-303 | PARTIAL | Coupon redemption added; timing introduces NEW-341. |
| NEW-308 | FIXED_IN_CODE | Backup restore now validates staged DB integrity before replacement; independent restore test still required. |
| NEW-306 | OPEN/PARTIAL | `src/modules/identity/passkeys.ts:137-157` still accepts PEM public keys without validating authenticator attestation flags/rpId; assess registration threat model and isolate test-only bypass. |

### Version-compatibility test, not a confirmed production defect

- **Stripe invoice event schema**: `webhooks.ts:218` reads legacy `rawInv.subscription`. Newer Stripe event API versions place the subscription at `invoice.parent.subscription_details.subscription`. Verify *the configured webhook endpoint API version* and add fixtures for that version before classifying as broken; see <https://docs.stripe.com/api/invoices/object>.

### Mandatory regression fixtures (do not substitute mocks for Stripe test API in release gate)

1. One account, two subscriptions, three issued invoices: renew one, assert only its own invoice goes PAID.
2. Create/cancel Stripe subscription immediately and at period end; assert job retry and Stripe actual state.
3. Delinquent service: pay overdue invoice, observe Pterodactyl unsuspended and UI updates only after external success.
4. Fee €5 + recurring €10: first Stripe invoice €15, second €10; introductory one-off coupon.
5. Abandon/expire checkout with reserved coupon; coupon remains usable.
6. Full staff refund creates real Stripe Refund once; simulate failure and delayed webhook.
7. Termination webhook + two outbox retries: capacity released once and the remote server removed.
8. Unknown event cannot be acknowledged as COMPLETED.
9. Three users in one workspace, OWNER/TECH_ADMIN/VIEWER: OWNER invite requires step-up; lower roles forbidden.

### Tracker integrity / collaboration

**Canonical workbook is the XLSX already present at `audits/FORTLESS_MASTER_SECURITY_UI_BUG_TRACKER.xlsx`.** This audit does not overwrite it: the coding agent changed the binary workbook in commit `32afdbb` and replacing it from an older local copy could destroy concurrent changes. Fold statuses and NEW-339..NEW-343 into that latest workbook, preserving IDs/history. Do not create GitHub Issues.

**Verdict:** NO-GO for live billing. This is a bounded set of root-cause inconsistencies, not evidence the UI needs rewriting.
