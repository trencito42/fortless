# FORTLESS — Executable QA/security/finance matrix

Testing quality cannot be measured by 'hundreds of E2E tests' alone. Use risk-driven tests and run fault injection on the money-to-server boundary. Each item must be tagged `NOT_STARTED`, `MOCK_ONLY`, `SANDBOX_VERIFIED`, or `PRODUCTION_VERIFIED` with evidence. No red-tag items in the P0 critical launch gates.

## A. Auth and isolation (minimum)
- [ ] Anonymous cannot access private API route or websocket.
- [ ] Account A cannot read/write account B orders, invoices, payments, services, logs, files, backups, domains or tickets with direct guessed IDs.
- [ ] Account owner can assign scoped membership; revoked role access stops immediately.
- [ ] Billing manager cannot power/delete a server, tech admin cannot issue refund or change PSP identity.
- [ ] Support cannot impersonate user by replacing account headers/cookies.
- [ ] Staff has MFA enforced, high-risk actions ask step-up, approvals are recorded.
- [ ] Forgot-password tokens one-use/expire; invalid sessions revoked and old sessions invalidated correctly.
- [ ] Rate limiting works across two API instances, not just in-memory.
- [ ] Auth re-check occurs inside delayed worker before destructive commands.

## B. Pricing and orders
- [ ] Product hidden/retired cannot be ordered; existing customer's old version preserved.
- [ ] Changed client price, plan, region, tax or owner ID cannot alter server calculation.
- [ ] Quote expired, option changed, tax evidence missing, invalid coupon, coupon over quota -> safe rejection.
- [ ] 100 parallel coupon claims cannot exceed redemption cap.
- [ ] Multi-line totals in exact minor units, currencies with zero/three decimal places, tax rounding correct.
- [ ] Plan available in UI but no capacity -> refuse payment or explicit waitlist, not phantom server.
- [ ] Multiple order items and partial fulfillment leave accurate order summary.

## C. Payments/webhooks (critical)
- [ ] Forged signature, invalid timestamp, wrong environment/account, malformed JSON, mismatched amount/currency rejected.
- [ ] PSP webhook raw-body signature verified before parse and effects.
- [ ] Duplicate event delivery, different event IDs for same payment, out-of-order events -> no duplicate paid transitions.
- [ ] 3DS/SCA challenge fails, pending auth, delayed capture/settlement -> no early entitlement.
- [ ] Payment succeeds with no browser return, or long delayed webhook -> order reconciled once.
- [ ] Checkout double-click, concurrent browser tabs and retry after timeout use correct idempotency semantics.
- [ ] Database outage during PSP callback leads to safe retry (non-2xx), no event loss.
- [ ] Atomic inbox/outbox ensures event committed before ACK and exactly-once business effect under at-least-once delivery.
- [ ] Wrong customer, order or payment reused between accounts -> cannot be credited.
- [ ] Refund duplicate/concurrent attempts never exceed charge remaining refundable.
- [ ] Partial refunds and disputes correctly update journal and service review state.
- [ ] Payment methods never leak full PAN/CVV; sensitive admin screens reveal minimum necessary.
- [ ] Manual payment override is permissioned, reasoned, and high-value dual-approved; cannot silently grant service.

## D. Subscription lifecycle
- [ ] End-of-month subscription anchor, 28/29/30/31 day edge cases, leap year and DST in display/timezone.
- [ ] Overlapping renewal workers create at most one renewal invoice and charge for one contract period.
- [ ] Cancellation racing renewal has deterministic outcome, refund path, notice and no ghost charge after end date.
- [ ] Failed card, missing webhook, retry+grace, recovered charge, suspension/unsuspend transition.
- [ ] Restoration from old DB snapshot does not re-charge old invoice without reconciliation.
- [ ] Upgrade mid-period cannot exceed paid resources; downgrade below disk usage refused/scheduled safely.
- [ ] Invoice issued cannot be edited directly; credit notes and numbering remain consistent.

## E. Provisioning and provider anomalies (critical)
- [ ] Paid order -> one server with correct owner/egg/resource quotas and requested region.
- [ ] Unpaid/canceled order -> no provider create call, even with forged direct worker request.
- [ ] Provider 500, rate limit, timeout, 401, invalid egg, no capacity, node offline -> classified action with recovery.
- [ ] Provider succeeded but HTTP response lost -> external lookup links ONE existing resource; retry does not create another.
- [ ] Provider succeeded but DB transaction fails -> reconciliation recovers linkage.
- [ ] Kill worker after provider call, before result persist -> safe restart and no duplicates.
- [ ] Two simultaneous resize/suspend/delete actions cannot corrupt service state.
- [ ] Cross-tenant server action via forged external provider ID denied.
- [ ] Pterodactyl app token absent/misconfigured -> safe pending failure, not fake success.
- [ ] Server install fails after create -> customer sees degraded, staff alert and retriable remediation.
- [ ] Ticket and console text XSS sanitized; file operations block traversal and arbitrary host paths.
- [ ] Purchased 2GB RAM cannot request 64GB by changing JSON or server startup variables.
- [ ] Service canceled at end-of-term -> no accidental immediate deletion; explicit retention/deletion policy.
- [ ] Orphan provider server, missing provider resource, unexpected expanded limits identified by reconciler.

## F. Provider-specific later-phase tests
- [ ] Node custom domain proof-of-ownership, TLS, Host header, proxy SSRF, runtime isolation and egress policy.
- [ ] WHM account create response lost; idempotent recovery; user/domain constraints, suspend and delete behavior.
- [ ] Domain available during search but taken during payment, premium price re-quote, wrong contact, async registration and transfer errors.
- [ ] VPS provider capacity, IP conflicts, snapshot restore, cloud-init secret delivery, detached volumes on termination and abuse review.

## G. Platform attacks and resilience
- [ ] CSRF and CORS under credentialed routes; CSP reduces script risk; cookie flags correct.
- [ ] SSRF cannot hit localhost, RFC1918, Kubernetes/docker metadata, link-local cloud metadata or DNS-rebound target.
- [ ] Malware attachment, oversized decompression, zip bomb, file preview XSS, reflected/stored XSS.
- [ ] Redis restarts, email provider outage, slow PSP responses, rolling API deployment, DB connection exhaustion degrade correctly.
- [ ] Restore production-shaped encrypted backup into isolated staging; verify no duplicate service actions after restore.
- [ ] Admin credentials rotated, API key leaked/rotated and orphaned session revoked; security event alert path works.
- [ ] Public status and metrics pages do not expose customer PII, provider secrets, internal IP architecture or token scopes.

## Test tooling and execution
Build GitHub Actions/GitLab CI as appropriate, Prisma migrations in disposable PostgreSQL, Redis and mock PSP/provider as testcontainers, deterministic time/freezing, property-based tests for money state machines, fuzz schema validation, Playwright with at least two browser contexts/accounts, integration contract tests on real vendor sandbox when credentials available, and fault injection to simulate crash positions. Negative tests must assert no provider side effects and no ledger side effects, not just HTTP status.

## Release acceptance: P0
- [ ] All critical financial, auth, and provider invariants pass automated CI and manual sandbox scenarios.
- [ ] Critical/high security findings remedied and reviewed independently.
- [ ] Production environment configured, but never seeded with test admin passwords or fake provider products.
- [ ] PSP merchant approval and tax/invoice policy verified with responsible parties.
- [ ] Restore drill passes and on-call/incident response ownership assigned.
- [ ] Customer support, cancellation/retention and abuse processes documented and active.
- [ ] Monitoring alerts reach a real responsible operator; queue and reconciliation dashboards usable.
- [ ] Product operational claims match real capacity and supported capabilities.
- [ ] Explicit approval to begin limited production pilot.
