# FORTLESS — Security baseline, threat model, privacy and operational defenses

**Target:** OWASP ASVS 5.0 Level 2 applicable controls with explicitly evaluated Level 3 controls for privileged/admin, money and infrastructure actions. A statement like '100% secure' or 'military-grade secure' is never an acceptable deliverable. Evidence must be tests, review notes, release gates, limited credentials, monitored systems and independent penetration testing.

## Trust boundaries
1. Browser and all user content are untrusted, including URL path, hidden form fields, JWT claims not server-verified, cookies, headers, websocket messages, uploaded artifacts, billing address and provider IDs.
2. Public API gateway authenticates/validates and enforces authorization; API module service layer performs independent ownership/capability checks. Client UI only reflects allowed actions.
3. Workers run with narrowly scoped credentials; do not let browser call privileged provider REST endpoints. Workers must revalidate operation entitlement at execution time, not only enqueue time.
4. Third-party PSP/provider webhooks are not trusted until signed/verified and reconciled with local immutable expectations.
5. Infrastructure outputs (console logs, filenames, ticket bodies, remote status) are attacker-controlled strings, not trustworthy HTML/shell input.
6. AI-generated or support-authored text is untrusted; no tools with implicit write privilege.

## Threat cases and primary mitigations
| Attack | Defense & verification |
| --- | --- |
| IDOR / BOLA | Tenant/account-scoped queries + permission checks for every object/read and write; two-tenant tests |
| Privilege escalation | Staff/customer permission separation, deny default, field-level validation, audit, role change immediately enforced |
| Stolen staff password/session | Passkeys/MFA, security alerts, short-session/reauth for risky operations, revocation, break-glass policy |
| Payment replay/webhook forgery | PSP signature on raw request, inbox/semantic dedupe, verified PSP object and local amount/currency/order, event audit |
| Coupon/price tampering | Backend quote and immutable plan mapping, guarded redemption transaction |
| Free provisioning | Service creation only from verified paid/approved entitlements; provider API inaccessible to customer |
| SSRF by user URL/domain/proxy | Destination allowlist, DNS resolution check and re-check at connect, block loopback/RFC1918/link-local/metadata IP, redirect policy, egress firewall |
| XSS via logs, ticket or CMS | Contextual escaping, trusted markdown sanitizer, no dangerous HTML or script injection, CSP, tests |
| SQL/command injection | Prepared queries, strict validated arguments, no shell string interpolation, external command execution only in isolated sanctioned workloads |
| Path traversal and backup leakage | Canonical paths, tenant authorization, signed expiring download URLs, file limits, provider permission enforcement |
| Upload bombs / malware | Size/type/quota limits, scanning, quarantine, decompression limits, private object store, no direct execution |
| Cross-tenant websocket | Scope authorization before token issuance/subscribe, revoke permissions, origin/expiry checks, ephemeral secrets |
| Provider token leak | Secret manager, least privilege, IP/egress restrictions, rotation/revocation, redacted logs, no browser access |
| Resource abuse / denial of wallet | CPU/disk/RAM/network quotas, concurrency limits, risk gating, correct paid checks and node headroom |
| Supply chain compromise | pinned lockfiles/containers, advisories/dependency audit, signed deployment provenance as feasible, code review, secret scans |
| Malicious staff action | least privilege, audit trail, approval limits/dual approval, reason codes, alert on unusual refund/termination |
| Ransomware/data loss | off-host encrypted backups, retention, tested point-in-time restore, separated backup credentials, incident response |
| Social-engineering support | verify customer identity through authenticated session and documented step-up, no email-only ownership transfer |

## Application hardening checklist
- Session cookies HttpOnly/Secure/SameSite, no access tokens in `localStorage` for primary auth; CSRF protection for cookie-authenticated state changes and origin enforcement; strict CORS, deny wildcard with credentials.
- Passwords hashed with Argon2id if local passwords supported; password-reset single-use time-limited tokens and no account enumeration; breached/common password screening where feasible; sufficient throttles against stuffing without easy account DoS.
- MFA/passkey required for staff and privileged account action; device/session list, invalidate on password change and ownership changes, alerts on recovery/session theft indicators.
- Return minimal safe errors to customer and redacted detailed logs to staff; all outbound audit events bounded, escaped and tenant-scoped.
- Defense against prototype pollution/deserialization bugs, strict JSON schemas, reject unknown sensitive fields, upper bounds and content-type enforcement.
- Validate upload content not just extension, block path traversal, signed attachment URLs, private storage and antivirus/scanning pipeline.
- Protect redirects, URL fetches, web previews, webhook callbacks and status monitors from SSRF; do not rely only on regex for URLs or first DNS resolution.
- DB credentials separate per app, migrations, worker, reports; Redis authenticated and private, backups encrypted, secrets rotated and scoped; avoid logging raw environment variables.
- HTTP security headers, reasonable CSP reporting, TLS-only HSTS after domain checks, cache-control no-store on customer/admin sensitive pages, no sensitive ISR/SSR shared cache.
- Provider integrations use mutual TLS or network allowlisting where supported, scoped credentials, and recorded rotation procedures. No privileged image/container settings exposed.
- Audit staff actions (order overrides, invoice edits/credits, refund, plan change, server deletion, service transfer, privilege grant, payment method updates). Tamper-evident/exportable or separately protected append-only audit retention.
- All production admin users individually identified, no shared admin accounts, no default test accounts or demo passwords. Restrict admin surface with MFA and optionally identity-aware access proxy/VPN without confusing it for authorization.

## Privacy/legal readiness
GDPR right-of-access/export, correction, deletion request intake with appropriate legal retention exemptions, data minimization, lawful basis and DPA list, data breach response and retention schedules. Encrypt sensitive data, never persist raw card data, never make customers' real IP, account email or invoices public. Processor usage and cross-border transfers require review. Cookie consent where needed before nonessential analytics, proper operational cookies independent. Include Terms, Privacy, AUP, Refund, SLA and abuse reporting process, reviewed by responsible business/legal advisors; do not misrepresent generated policies as legal review. Rules for domain registration privacy/WHOIS may vary by TLD.

## Continuous security review
Before each new integration: trust boundary diagram, threat modeling, vendor API permission inventory, negative tests, secret scan, dependency audit and staging tests. Before go-live: owner-configured merchant, penetration test (especially auth, multitenancy and money), fix all critical/high findings, backup restore drill, staff training, incident contacts, vulnerability disclosure and scoped bug bounty policy. Bug bounty requires a written scope excluding disruptive testing, customer data access and production resource exhaustion, safe harbor language reviewed professionally, reporting channel and remediation process. Don't treat a public bug bounty as substitute for internal security review.

## OWASP evidence matrix
Map each applicable ASVS 5.0 requirement to source file/feature, automated/manual test, review owner, result, remediation and release gate. Level 2 is a coverage target to be verified, not a certification automatically granted by this doc.
