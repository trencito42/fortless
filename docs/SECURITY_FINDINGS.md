# Fortless Security & Vulnerability Findings

Audit Date: 2026-10-17  
Governing Standard: Stage 00 Global Engineering Contract & Phase 1 Audit Protocol

---

## SEC-001: Public Interface Host Binding Exposure (High Severity)

- **Severity:** HIGH
- **Location:** `src/index.ts:24`
- **Exploit Preconditions:** Port 3021 accessible on public network interface or firewall misconfiguration.
- **Evidence:**
  ```typescript
  // src/index.ts:24
  const address = await server.listen({
    port: config.PORT,
    host: '0.0.0.0', // Listen on all interfaces
  });
  ```
  While `src/config/index.ts:31` specifies `HOST: z.string().default('127.0.0.1')`, `src/index.ts` hardcoded `0.0.0.0`.
- **Impact:** An attacker on the public network could reach the Fastify HTTP port directly, completely bypassing Nginx's SSL termination, rate-limiting, and security headers.
- **Remediation:** Bind strictly to `config.HOST` (`127.0.0.1`), ensuring the upstream is only accessible via the local reverse proxy.

---

## SEC-002: Idempotency Hash Excludes Custom Options (Medium Severity)

- **Location:** `src/modules/checkout/checkout.ts:25-29`
- **Severity:** MEDIUM
- **Exploit Preconditions:** Client submits multiple checkout requests using the same `Idempotency-Key` but alters `customOptions` (such as server name or resource parameters).
- **Evidence:**
  ```typescript
  // src/modules/checkout/checkout.ts:25
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({
    accountId: data.accountId,
    quoteId: data.quoteId,
    regionId: data.regionId,
  })).digest('hex');
  ```
  The hash omitted `customOptions`.
- **Impact:** Semantic mismatch in idempotency cache: the second request with altered options would receive the first request's cached order without detecting payload divergence.
- **Remediation:** Include normalized `customOptions: data.customOptions || {}` in the SHA-256 calculation.

---

## SEC-003: Stalled Outbox Worker Event Lease Lock (Medium Severity)

- **Location:** `src/modules/outbox/worker.ts:35`
- **Severity:** MEDIUM
- **Exploit Preconditions:** Unexpected worker crash, unhandled exception, or process SIGKILL while an event is in `PROCESSING` status.
- **Evidence:**
  ```typescript
  // src/modules/outbox/worker.ts:35
  db.prepare("UPDATE outbox_events SET status = 'PROCESSING' WHERE id = ?").run(event.id);
  ```
  If the process terminates before reaching `COMPLETED` or `catch`, the event remains in `PROCESSING` permanently.
- **Impact:** Unfulfilled customer provisioning orders or un-dispatched webhooks stay stuck indefinitely with no automatic recovery.
- **Remediation:** Add lease expiration recovery at the start of each worker polling cycle: any event in `PROCESSING` with `updated_at <= datetime('now', '-5 minutes')` is automatically reset to `PENDING` with an incremented retry count.

---

## SEC-004: Missing Transactional Email Delivery Credentials (Informational / Operational Blocker)

- **Location:** `src/modules/identity/auth.ts:105`, `src/config/index.ts:39`
- **Severity:** LOW (Fails Closed)
- **Exploit Preconditions:** Legitimate user registers or requests password reset in production.
- **Evidence:** `config.EMAIL_MODE` defaults to `disabled`. The email delivery adapter is currently stubbed. Tokens are returned in test responses or logged.
- **Impact:** System correctly fails closed, but public self-service registration cannot complete without administrative/manual intervention until an email provider (SES/Postmark/Resend) is configured.
- **Remediation:** Implement a durable mail outbox table and transactional provider adapter with DKIM/SPF verification.

---

## SEC-005: Missing Initial Staff Owner Bootstrap CLI (Low Severity)

- **Location:** `src/modules/admin/access.ts`
- **Severity:** LOW
- **Exploit Preconditions:** New system deployment where no user possesses `OWNER` staff membership.
- **Evidence:** Staff management APIs strictly reject self-promotion and require an existing `OWNER` session with step-up verification. If zero owners exist, no new staff can be promoted via API.
- **Impact:** Inability to promote the initial legitimate platform administrator through a safe, audited interface.
- **Remediation:** Provide an explicit, one-time, audited CLI command (`npm run staff:bootstrap-owner <email>`) that verifies the user identity exists, is verified with MFA, and records an immutable audit log.
