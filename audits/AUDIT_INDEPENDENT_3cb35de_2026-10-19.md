# Independent audit, batch 1 — reviewed commit `3cb35de`

Canonical register: [FORTLESS_MASTER_SECURITY_UI_BUG_TRACKER.xlsx](./FORTLESS_MASTER_SECURITY_UI_BUG_TRACKER.xlsx)
Method: source reading and local reproductions only (in-memory database, no provider or payment calls). No implementation code was changed. Tests at audit time: 237/237 passing, `tsc` clean.

## What was merged first

`STATUS_REOPEN_PATCH_32afdbb.csv` was merged by finding ID (19 rows). The workbook already contained NEW-339..343 as single rows (marked `FIXED_IN_CODE` by the coding agent after 32afdbb), so no duplicate rows were added. Each patch row is in `Status History` as `AUDIT_PATCH_MERGE`, followed by a second row where the independent verdict at `3cb35de` differs from the patch target. The separately uploaded `FORTLESS_REOPENED_AUDIT_32afdbb_FOR_MERGE.xlsx` is a patched copy of this register and was not used as a source.

## Verdict on the 19 patch IDs at `3cb35de`

| ID | Patch target | Verdict | Why (short) |
|---|---|---|---|
| NEW-301 | PARTIAL | PARTIAL | Subscription is CANCELED and Stripe cancel queued before provider termination can fail |
| NEW-302 | PARTIAL | PARTIAL | Webhooks mark TERMINATED before the provider deletes anything |
| NEW-303 | PARTIAL | PARTIAL | Coupon redeemed before payment; release path broken (NEW-349) |
| NEW-306 | OPEN | FIXED_IN_CODE | Route needs step-up and rejects PEM; attestation parsed and bound |
| NEW-308 | FIXED_IN_CODE | FIXED_IN_CODE | Staged integrity check present; restore drill pending |
| NEW-330 | OPEN | OPEN | Oldest ISSUED invoice of the account is marked paid, no Stripe invoice match |
| NEW-331 | FIXED_IN_CODE | FIXED_IN_CODE | Only OWNER can grant OWNER |
| NEW-332 | PARTIAL | PARTIAL | Guard depends on NODE_ENV=production, live runs development (NEW-361) |
| NEW-333 | OPEN | PARTIAL | Dispatched now, but completes silently without calling Stripe when key or id missing |
| NEW-334 | OPEN | OPEN | No Stripe Refunds API call exists |
| NEW-335 | FIXED_IN_CODE | FIXED_IN_CODE | Cumulative formula correct; multi-refund test pending |
| NEW-336 | OPEN | FIXED_IN_CODE | Unsuspend dispatched and handled; see NEW-355 |
| NEW-337 | FIXED_IN_CODE | FIXED_IN_CODE | Dead letter keeps TERMINATED |
| NEW-338 | OPEN | OPEN | One local subscription per item shares a Stripe id; lookups take the first row |
| NEW-339 | OPEN | FIXED_IN_CODE | Unknown event types fail closed |
| NEW-340 | OPEN | PARTIAL | Setup fee separated; tax, discount and quantity still mismatch (NEW-345) |
| NEW-341 | OPEN | PARTIAL | Only synchronous failure releases the coupon; no expiry handler |
| NEW-342 | OPEN | FIXED_IN_CODE | OWNER invitation requires step-up |
| NEW-343 | OPEN | FIXED_IN_CODE | Capacity released once; see NEW-357 |

## New findings, batch 1 (18)

| ID | Priority | Status | Summary |
|---|---|---|---|
| NEW-344 | P0 | OPEN | Scheduled cancellation cancels the Stripe subscription immediately (payload key mismatch) |
| NEW-345 | P0 | OPEN | Stripe Checkout bills only the first quote line, quantity 1 |
| NEW-346 | P0 | OPEN | Webhook inbox drops an event permanently when processing throws |
| NEW-347 | P0 | OPEN | SEMI_ANNUAL plans cannot be settled (subscriptions CHECK) — reproduced |
| NEW-348 | P1 | OPEN | Annual subscriptions ingested with a 30 day renewal date ("ANNUALLY" typo) |
| NEW-349 | P1 | OPEN | Checkout compensation writes values the schema rejects — reproduced |
| NEW-350 | P1 | OPEN | Payments held as ANOMALY after capture are invisible to staff |
| NEW-351 | P0 | OPEN | Reactivation is free when Stripe is unconfigured, "dummy" or NODE_ENV=test |
| NEW-352 | P1 | OPEN | Paid reactivation of a terminated service restores no resource or capacity |
| NEW-353 | P2 | OPEN | Reactivation uses a fixed 30 day period |
| NEW-354 | P1 | OPEN | Stripe outbox dead-letter audit insert violates a foreign key — reproduced |
| NEW-355 | P1 | OPEN | Payment un-suspends services suspended for disputes, fraud or staff action |
| NEW-356 | P2 | OPEN | Grace period restarts on every failed payment |
| NEW-357 | P1 | OPEN | Termination releases capacity that was never reserved |
| NEW-358 | P1 | FIXED_IN_CODE | Passkey sign-in could never verify a real credential (fixed 9dacfcb, refined 32afdbb) |
| NEW-359 | P2 | OPEN | Service access grants full permissions when the role is omitted |
| NEW-360 | P2 | OPEN | WebAuthn challenges are never purged |
| NEW-361 | P1 | OPEN | Live process runs NODE_ENV=development under tsx watch (CONFIG_DEPENDENT) |

Existing `FTL-BILL-206` (OPEN) received additional evidence instead of a new ID. The coupon-on-expiry issue was folded into NEW-341, and the tax and discount mismatch into NEW-340.

Reproductions: `npx tsx audits/proofs/repro-3cb35de.mts` (NEW-347, NEW-349, NEW-354).

## New findings, batch 2 (4) — identity flows

| ID | Priority | Status | Summary |
|---|---|---|---|
| NEW-362 | P2 | OPEN | Account enumeration through registration errors and login timing |
| NEW-363 | P1 | OPEN | Verification link signs in whoever clicks it, enabling pre-registration hijack |
| NEW-364 | P2 | POLICY_DECISION | Account-wide failure limit lets anyone lock a known account out |
| NEW-365 | P2 | OPEN | No per-recipient cooldown on verification and reset emails |

NEW-361 also gained a note: `SESSION_SECRET` is empty in `.env`, so the process uses a random file secret in `data/` (see the register row). Totals after batch 2: 110 findings: 29 OPEN, 15 PARTIAL, 58 FIXED_IN_CODE, 6 NEEDS_VERIFICATION, 2 POLICY_DECISION, 0 TESTED or CLOSED. By priority: 39 P0, 62 P1, 9 P2.

## Chains followed in this batch

Quote → Checkout → Stripe → Webhook → Invoice → Provisioning; Renewal → Failure → Grace → Suspension → Recovery; Cancellation → Stripe → Worker → Provider; Refund → Ledger → Service lifecycle (all static). Payment chains are not safe for real money until NEW-344..347, NEW-349 and NEW-351 are closed.

## Not covered yet (scope checked, not "safe")

MFA enrolment and challenge internals, session rotation, runtime timing behaviour, DNS and domains, support attachments, cPanel and Proxmox adapters, Pterodactyl console, file manager and backups (tracked from earlier work, not re-audited here), email deliverability, and the frontend states for permissions and provider outages. These remain for the next batches.
