# FORTLESS — Billing, Payments, Invoicing & Anti-Fraud Architecture

**Version:** 1.0.0-PROD  
**Status:** Approved for Implementation (Phase 0 Baseline)  
**Classification:** Financial & Commerce Specifications  

---

## 1. Non-Negotiable Financial Invariants

1. **Zero Client Authority on Payment State:**  
   Under no circumstances can a browser callback, URL query parameter (`?status=success`), client-side fetch, or arbitrary API payload mark an order or invoice as `PAID`. Paid entitlement is granted **exclusively** upon cryptographic verification of an authoritative webhook received directly from the Payment Service Provider (PSP) or via an explicit, dual-authorized administrative ledger override.
2. **Immutable Quote Snapshots:**  
   Every checkout requires a server-signed, cryptographic quote. The order locks this quote: prices, applied discounts, tax jurisdiction rules, currency, and resource quotas are frozen. If a client attempts to alter the payload during checkout, the server rejects the request.
3. **Exact Minor Unit Arithmetic:**  
   All calculations use integer minor units (e.g. cents). Floating point numbers (`0.1 + 0.2 === 0.30000000000000004`) are banned. Multi-line invoices round line-item taxes according to standard half-up banker's rounding rules, recording fractional basis points.
4. **Append-Only Financial Ledger:**  
   Issued invoices cannot be deleted, altered, or renumbered. Corrections require an immutable **Credit Note** referencing the original invoice number.
5. **Durable Idempotency on Every Financial Mutation:**  
   Every payment intent, charge, refund, and subscription renewal carries a deterministic, scoped idempotency key (`{account_id}:{action}:{resource_id}:{attempt_version}`). Concurrent or duplicate submissions are handled safely without duplicate charges or duplicate servers.

---

## 2. Canonical Payment Flow

```
[ Customer ]             [ Fortless API ]           [ Fortless DB ]            [ PSP (Stripe) ]
     │                          │                          │                          │
     │ 1. Request Quote         │                          │                          │
     ├─────────────────────────►│                          │                          │
     │                          │ 2. Check Capacity & Tax  │                          │
     │                          │    Generate Quote Hash   │                          │
     │ 3. Return Signed Quote   │                          │                          │
     │◄─────────────────────────┤                          │                          │
     │                          │                          │                          │
     │ 4. Submit Checkout (Key) │                          │                          │
     ├─────────────────────────►│                          │                          │
     │                          │ 5. Atomic Tx:            │                          │
     │                          │    - Validate Quote TTL  │                          │
     │                          │    - Lock Capacity Resv  │                          │
     │                          │    - Create Order & Inv  │                          │
     │                          │    - Insert Attempt Rec  │                          │
     │                          │                          │                          │
     │                          │ 6. Create Hosted Session │                          │
     │                          │    (Durable PSP Key)     │                          │
     │                          ├────────────────────────────────────────────────────►│
     │                          │                          │                          │
     │ 7. Redirect URL / Token  │ 8. Return Session Token  │                          │
     │◄─────────────────────────┴──────────────────────────┘                          │
     │                                                                                │
     │ 9. Complete Card / 3DS / SCA Payment                                           │
     ├───────────────────────────────────────────────────────────────────────────────►│
     │                                                                                │
     │ 10. Cosmetic Return to `/app/orders/[id]?status=processing`                    │
     │                                                     11. Webhook POST           │
     │                                                         (Raw Body + Signature) │
     │                          ┌───────────────────────────┬─────────────────────────┤
     │                          │ 12. Verify HMAC Signature │                         │
     │                          │ 13. Persist Event to      │                         │
     │                          │     `psp_inbox_events`    │                         │
     │                          │ 14. Return 200 OK (Fast)  │                         │
     │                          │                           │                         │
     │                          │ 15. Async Worker:         │                         │
     │                          │     - Dedupe Transaction  │                         │
     │                          │     - Match Order & Minor │                         │
     │                          │     - Transition -> PAID  │                         │
     │                          │     - Commit Outbox Event │                         │
     │                          │       'order.paid.v1'     │                         │
```

---

## 3. Idempotency Mechanics

To prevent duplicate charges or duplicate server provisioning during network blips or rapid customer double-clicks:

1. **Header Requirement:** All state-mutating requests (`POST /api/v1/checkout`, `POST /api/v1/billing/renew`, `POST /api/v1/refunds`) accept an `Idempotency-Key` header.
2. **Database Key Registration:**
   ```sql
   INSERT INTO idempotency_records (account_id, scope, idempotency_key, request_hash, status, response_payload, expires_at)
   VALUES ($1, $2, $3, $4, 'IN_PROGRESS', NULL, NOW() + INTERVAL '24 hours');
   ```
3. **Collision Handling:**
   - **Identical Hash + `COMPLETED`:** Returns the cached response payload immediately with HTTP status code `200 OK` and header `Idempotent-Replay: true`.
   - **Identical Hash + `IN_PROGRESS`:** Returns `409 Conflict` with header `Retry-After: 2` (or awaits completion up to lock timeout).
   - **Mismatched Request Hash + Reused Key:** Returns `422 Unprocessable Entity` ("Idempotency key was previously used with a different request payload").

---

## 4. Tax Calculation & Invoicing Sequence Rules

### 4.1. Tax Calculation Engine
- **Jurisdiction & Domicile:** Tax rules depend on the merchant's country of establishment and the customer's billing country/profile.
- **B2C Transactions (EU):** Standard VAT rate of the customer's member state applies (under EU VAT OSS rules) or domestic VAT if not registered for OSS.
- **B2B Transactions (EU):** Reverse-charge mechanism (0% VAT) applies **only** if the customer provides a valid EU VAT identification number verified against the VIES database.
- **Rest of the World:** 0% export of services, subject to local withholding rules.
- **Fail-Closed Tax Policy:** If external tax rate resolution fails or the customer's address is ambiguous, checkout **fails closed**. Estimated taxes are never guessed.

### 4.2. Invoicing Sequence & Numbering
- **Draft vs Fiscal Invoices:** While an order is unpaid, the document is an unnumbered **Pro-Forma Invoice** or **Draft Order**.
- **Atomic Sequence Allocation:** Upon confirmed settlement (`PAID`), the system issues an official fiscal invoice number:
  ```sql
  SELECT next_invoice_number($merchant_entity_id, $series_prefix, $calendar_year);
  -- Returns monotonically increasing sequence: 'INV-2026-00001'
  ```
- **Credit Notes:** Any cancellation, chargeback, or refund generates a linked **Credit Note** (`CRN-2026-00001`) with equal and opposite ledger entries.

---

## 5. Subscription Renewal & Dunning Lifecycle

```
Anchor Day - 7: Draft Renewal Invoice Generated & Emailed to Customer
      │
Anchor Day 0: Worker Attempts Auto-Charge via Saved PSP Payment Method
      ├──► SUCCESS: Invoice marked PAID -> Term extended by 1 Cycle -> Receipt Sent
      │
      └──► FAILED: Card Declined / Insufficient Funds / SCA Required
            │
            ▼
      [ Day 1: Grace Period Begins — Service Remains ACTIVE ]
      - Customer alerted via email with 1-click SCA completion link.
      - Retry Attempt 1 scheduled for Day 2.
            │
            ▼
      [ Day 3: Retry Attempt 2 ]
      - If failed: Warning notice sent ("Service will be suspended in 48 hours").
            │
            ▼
      [ Day 5: Grace Period Expires — Service SUSPENDED ]
      - Worker calls Pterodactyl `suspend` API.
      - Game server stopped; disk files and allocations preserved intact.
      - Final payment reminder sent.
            │
            ▼
      [ Day 19: 14 Days Suspended — TERMINATION ELIGIBILITY ]
      - Service queued for termination in Admin Review dashboard.
      - Server removed from Pterodactyl only after staff review or automated policy.
```

---

## 6. Anti-Fraud & Risk Engine

Fortless implements an automated risk evaluation engine prior to hosted payment dispatch:
1. **Velocity Limits:** Maximum 3 checkout attempts per IP per 10 minutes; maximum 5 failed card transactions per account per 24 hours.
2. **Proxy / Tor / VPN Detection:** Flag transactions originating from known datacenter IPs or anonymous Tor exit nodes.
3. **Disposable Email Filter:** Deny registration and order completion from temporary email domains.
4. **Resource Value Thresholds:** Orders exceeding `EUR 100` from new accounts (< 7 days old) require automated phone/email 2FA verification or manual staff review before provisioning.
5. **Quarantine on Dispute:** If an active service receives a PSP chargeback/dispute event, the service is transitioned to `SUSPENDED_RISK_HOLD` with customer notification; data is never silently wiped until the dispute window concludes.

---

## 7. Comprehensive Payment & Provisioning Fault Matrix

| Case ID | Scenario Description | Required System Behavior | Guard / Recovery Mechanism |
| :--- | :--- | :--- | :--- |
| **FLT-01** | Client manipulates checkout payload from `EUR 15.00` to `EUR 0.01` | Server rejects request with `422 Unprocessable`. Prices derived strictly from server quote. | Server-side quote hash verification |
| **FLT-02** | 10 concurrent checkout submissions from multiple tabs | Exactly one checkout session created; others return `409 Conflict` or identical session URL. | Unique DB constraint on `idempotency_key` |
| **FLT-03** | Customer attempts to pay another tenant's invoice ID | Request denied with `404 Not Found` or `403 Forbidden`. | Server-side tenant authorization check |
| **FLT-04** | 3D Secure / SCA challenge abandoned by customer | Payment remains in `REQUIRES_ACTION` or `FAILED`. No provisioning triggered. | Order remains in `AWAITING_PAYMENT` until TTL |
| **FLT-05** | Customer lands on fake `/app/checkout/success` URL | Order status checked via server DB. Shows "Payment Processing / Awaiting Confirmation". | Zero frontend trust; no client `markPaid` |
| **FLT-06** | Webhook arrives with invalid HMAC signature | Server logs security warning, returns `400 Bad Request`, drops payload. | Raw body HMAC-SHA256 signature verification |
| **FLT-07** | Duplicate webhook event delivered by Stripe | Server returns `200 OK` on duplicate insert conflict, skips execution. | Unique index on `(psp_name, merchant, event_id)` |
| **FLT-08** | Success webhook arrives BEFORE `processing` webhook | Server transitions monotonically: `AWAITING_PAYMENT` -> `PAID`. | Monotonic state machine guards |
| **FLT-09** | Paid webhook payload has wrong currency or mismatched amount | Event quarantined in `psp_inbox_events` with status `ANOMALY`. Staff alerted. | Minor unit amount & currency equality check |
| **FLT-10** | Payment succeeds AFTER order/quote TTL expired | System accepts funds, creates accounting deposit credit, alerts staff or auto-refunds. | Out-of-order reconciliation saga |
| **FLT-11** | Sandbox webhook received in production environment | Rejected with `400 Bad Request`. Mode mismatch logged. | Explicit `livemode === true` environment check |
| **FLT-12** | Database connection outage during incoming webhook POST | Endpoint returns `503 Service Unavailable`. PSP retries with exponential backoff. | Transactional failure returns non-2xx |
| **FLT-13** | Payment succeeded, but provider is out of capacity | Order transitions to `PAID_UNFULFILLED`. Customer informed; 1-click refund offered. | Post-payment capacity check guard |
| **FLT-14** | Provider creates server, but HTTP response times out | Worker performs lookup query by deterministic `external_id`. Links existing server. | Idempotent lookup before retry |
| **FLT-15** | Worker crashes after server creation but before DB write | Reconciler discovers unlinked provider server matching correlation tag, links DB. | Drift reconciliation loop |
| **FLT-16** | Overlapping renewal cron workers run simultaneously | Unique constraint `(subscription_id, period_start, period_end)` prevents duplicate invoice. | Database-level unique constraint |
| **FLT-17** | Customer cancels subscription while renewal charge in flight | Deterministic state resolution: if charge captures, refund or extend period; no stuck state. | Versioned optimistic concurrency lock |
| **FLT-18** | Staff submits refund twice rapidly | First refund executes; second request detects remaining refundable balance is `0`, rejects. | Remaining refundable balance calculation |
| **FLT-19** | Partial refund executed on active service | Credit note issued for partial amount. Service remains active or prorated per policy. | Dedicated `refunds` & `credit_notes` tables |
| **FLT-20** | Chargeback / Dispute opened by customer bank | Dispute record created; service placed in `RISK_HOLD`; staff alerted to submit evidence. | `disputes` state machine & audit log |
| **FLT-21** | 200 concurrent users claim coupon with max 100 uses | Exactly 100 redemptions succeed; 101st and beyond fail with "Coupon quota exceeded". | `UPDATE coupon_rules SET count = count + 1 WHERE count < max` |
| **FLT-22** | Tax provider / VIES validation API offline | System fails closed: checkout blocked with clear temporary notification. | Fail-closed tax policy |
| **FLT-23** | Email service down after successful purchase | Order and service provision cleanly; email queued in outbox for automatic retry. | Asynchronous notification queue |
| **FLT-24** | Redis cache wiped or restarted | Database is the sole source of truth; queue re-hydrates from DB outbox records. | Persistent transactional outbox |
| **FLT-25** | Customer deletes saved card during active subscription | Dunning emails prompt customer to update payment method before renewal date. | Pre-renewal card validity check |
