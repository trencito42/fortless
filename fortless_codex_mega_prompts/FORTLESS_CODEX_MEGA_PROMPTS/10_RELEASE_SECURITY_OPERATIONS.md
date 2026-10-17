# PHASE 10 — PRE-LAUNCH SECURITY, RELIABILITY, COMPLIANCE AND RELEASE GATES

You are the independent go/no-go reviewer for Fortless. Read `00_GLOBAL_CONTRACT.md` and complete repo/status. Never declare '100% secure'. Identify residual risks, reproduce failures safely and provide evidence-based release recommendation. Do not trigger live payments, server destruction, DNS changes, production migrations or stress tests without separate explicit approval.

## 1. Threat model / abuse cases

Assets: customer IDs/session tokens, staff privileges, PSP identities/money, invoices/ledger, provider keys, server console/file content, domains, tenant data, staff notes, network allocations and backups. Threat actors: anonymous bots, fraudulent customer, compromised customer, malicious tenant inside paid hosting, compromised staff, compromised provider API and webhook spoofers. Draw data flows and trust boundaries. Check OWASP ASVS/Top 10, API access control, MFA and secrets. Every critical control must have at least one negative test.

## 2. Security review matrix

- Access: IDOR/BOLA on *all* object IDs including backup/file/ticket/invoice/domain/user/team/server; staff privilege levels and revocation, last-owner protection, safe redirects and authorization inside WebSocket/download links.
- Input: XSS from uploaded HTML, customer-controlled service names/logs/ticket content; SQL injection in sorting/search, path traversal, SSRF from image fetch/proxy/app deploy URLs, command injection in Pterodactyl start/env, stored XSS in admin views.
- Browser: cookie HttpOnly/Secure/SameSite, CSRF on all mutations, CORS exact allowlist, CSP without unsafe-inline where feasible, frame restrictions, HSTS in production, asset integrity, caching of personalized HTML as no-store.
- Secret management: .env scanning, provider/PSP keys rotation, encrypted backup and service credentials, admin/recovery-code exposure, crash logs, no customer PII in application telemetry.
- Reliability: degraded PSP/provision/email/db behavior stays fail closed without silent mock fallbacks; worker recovery, max payload size, timeouts, rate-limits, dependency failure isolation, outbox and settlement alarms.
- Financial: signed webhook verification, semantic payment status, replay/duplicate/delayed event protection, refund/dispute and tax evidence, invoice/ledger reconciliation, finance adjustments approvals.
- Infrastructure: provider API least privilege, container isolation, guest-to-host protection, storage/network per-tenant, DNS and domain transfer controls, server destruction authorization and backup retention.

## 3. Real operational verification

- Test suite: unit, integration, contract, DB migration, concurrency, property/fuzz checks for money parsing, e2e browser/mobile, accessibility, provider sandbox, restore rehearsal. Publish a test matrix with exact environment, date, and evidence. Never report a pass merely because a test was skipped.
- Disaster recovery: encrypted automatic backup schedule, off-site copy, restore of a full test snapshot, RPO/RTO measured, secret restoration/key rotation, reconciliation with remote provider and PSP after restore; runbooks and pager response.
- Observability: response latencies, error budgets, failed mail delivery, unsettled payments, webhook backlog, dead-letter, staging/live provider degradation, node utilization, backups missing, invoice anomalies, suspicious admin writes; alerts tested end-to-end.
- Load tests (staging only with authorization): account sign-in, pricing, admin search, concurrent checkout/last-capacity, retries and worker restarts, job replay storms, websocket connections. No production DDoS-style tests.
- Compliance: legal entity/invoice, consumer rights, VAT, GDPR data processing/retention, DPA for processors, acceptable use, refunds, copyright and abuse response, cookie policy when tracking; sign-offs from qualified professionals where required. Distinguish technical implementation from legal advice.
- Supply chain/deployment: dependency review, lockfile, secret scans, CI gating, branch protection, signed artifacts if feasible, staging/production parity, smoke, canary or safe rollout, rollback, explicit approval for production migration and live key activation.

## 4. Release gates (must all pass or remain blocked)

G1. Critical/high security findings resolved or approved risk exception with explicit reason; no cross-tenant or staff privilege escalation.
G2. PSP test-mode proof for paid, delayed, failed, refund, chargeback, duplicate and out-of-order events; immutable ledger reconciliation matches provider receipts.
G3. Provider staging proof with one server per entitled order; unknown outcomes recover, no misallocated resources.
G4. Real transactional email delivery verified; verification and recovery tested; no token disclosure.
G5. Admin operations and customer journey e2e; all features advertised as available are real and tested. Pending features clearly labeled.
G6. PostgreSQL/worker migration and backup restoration rehearsed; recovery within business-approved objectives.
G7. Business/legal policies, merchant approval, subscriptions and invoicing signed off.
G8. Observability/on-call, incident/runbooks, privacy and data management in place.
G9. Production credentials, DNS, provider resources, merchant live mode separately and explicitly authorized.

## Output

Create `docs/RELEASE_READINESS.md` with PASS/BLOCKED for each gate, links to exact test/log evidence, vulnerability list, open business decisions, rollback procedure and owner signoff checklist. Do not mark live without authorization. Give a recommended rollout sequence starting with internal staff, limited allowlisted customers, then paid beta with caps, and broader release only after monitoring.
