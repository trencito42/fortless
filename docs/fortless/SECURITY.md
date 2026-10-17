# FORTLESS — Security Architecture, Threat Model & Privacy Controls

**Version:** 1.0.0-PROD  
**Status:** Approved for Implementation (Phase 0 Baseline)  
**Standard:** OWASP ASVS 5.0 Level 2 Baseline / Level 3 Privileged Operations  

---

## 1. Security Architecture Principles

1. **Zero-Trust Multi-Tenancy:** Every request is authenticated and authorized on the server. Client-provided tenant or object identifiers are treated as unverified hints; actual access is derived strictly from the verified session context.
2. **Defense in Depth:** Security controls are layered across edge proxy (WAF/Rate Limiting), API gateway (CORS/CSRF/Schema Validation), application domain logic (RBAC/ABAC), and database (Foreign Keys, Constraints, Row Isolation).
3. **Least Privilege & Role Segregation:** Workers, staff members, and third-party integrations operate with the minimum required permissions. Support agents cannot access raw credentials or trigger refunds.
4. **Append-Only Tamper-Evident Audit Trail:** High-risk actions (role assignments, invoice credits, server terminations, token generations) are permanently recorded in an append-only audit log with actor identity, IP address, causation ID, and correlation metadata.

---

## 2. Threat Model & Defensive Mitigations

| Threat Vector | Attack Scenario | Defense & Verification Mechanism | ASVS 5.0 Req |
| :--- | :--- | :--- | :--- |
| **IDOR / BOLA** | Attacker alters `orderId` or `serviceId` in API URL to view or terminate another tenant's server | Server enforces tenant-scoped queries: `WHERE id = $id AND account_id = $session_account_id`. Multi-tenant unit & E2E tests verify cross-tenant denial. | V4.1, V4.2 |
| **Privilege Escalation** | Customer submits JSON with `"role": "OWNER"` or `"is_staff": true` during profile update | Strict schema validation ignores or rejects unauthorized fields. Roles can only be modified via dedicated, authorized endpoints. | V4.3 |
| **Webhook Forgery** | Attacker sends fake `payment_intent.succeeded` to trick platform into free provisioning | Webhook endpoint verifies HMAC-SHA256 signature using the raw unparsed request body against the PSP webhook secret. Event ID is checked for inbox deduplication. | V13.2 |
| **Price Tampering** | Attacker edits price in browser client from €15.00 to €0.01 | Server recalculates and freezes prices in a signed quote snapshot. Checkout binds strictly to quote ID; client prices are completely ignored. | V13.1 |
| **SSRF** | Customer supplies custom webhook or domain verification URL pointing to `http://169.254.169.254` or `http://localhost:6379` | Custom HTTP client resolves DNS, checks target IP against blacklist (blocks loopback, RFC1918 private subnets, link-local metadata 169.254.x.x, IPv6 equivalents), and re-verifies before socket connect to prevent DNS rebinding. | V12.6 |
| **Stored XSS** | Attacker injects `<script>` tags into support ticket messages, server names, or file editor | HTML is escaped by default in templates; markdown is parsed using a strict sanitizer that disallows raw HTML, scripts, and `javascript:` URIs. Strong Content Security Policy (CSP) enforced. | V5.1, V5.3 |
| **SQL Injection** | Attacker inputs SQL fragments into search filters or pagination parameters | 100% parameterized queries via Prisma / ORM query builder. String concatenation of SQL queries is strictly prohibited. | V5.3 |
| **Path Traversal** | Attacker uses `../../etc/passwd` in file manager download or upload endpoint | Paths are canonicalized with `path.resolve()` and asserted to start strictly within the tenant's designated sandboxed directory. | V12.3 |
| **Cross-Tenant WebSocket Access** | Attacker attempts to subscribe to another user's server console stream | WebSocket connection requires a short-lived (60-second), single-use ticket generated via authenticated HTTP endpoint after verifying server ownership. | V13.3 |
| **Provider Token Leak** | Administrative Pterodactyl Application API key leaked via client bundle | Application API key is stored strictly on backend worker environments; no browser code or client API has access to administrative keys. | V6.2 |
| **Denial of Wallet / Resource Exhaustion** | Attacker creates thousands of unpaid orders or exhausts RAM allocations | Unpaid orders do not lock capacity permanently; temporary reservations expire within 15 minutes. Velocity limits and rate limits throttle abuse. | V11.1 |

---

## 3. Cryptographic Standards & Session Management

1. **Password Hashing:** Passwords are hashed using **Argon2id** (memory cost: 64MB, time cost: 3 iterations, parallelism: 4 threads).
2. **Secret Encryption at Rest:** Sensitive provider tokens and environment variable secrets are encrypted using **AES-256-GCM** with unique initialization vectors (IVs) and authenticated tags stored alongside the ciphertext.
3. **Session Cookies:**
   - `HttpOnly`: Inaccessible to client JavaScript.
   - `Secure`: Transmitted strictly over HTTPS.
   - `SameSite=Lax` (or `Strict` for sensitive management flows): Mitigates Cross-Site Request Forgery (CSRF).
   - Cryptographically random session tokens (256-bit entropy).
4. **Transport Security:** Strict Transport Security (HSTS) with `max-age=31536000; includeSubDomains; preload` and TLS 1.3 preferred.

---

## 4. Anti-SSRF (Server-Side Request Forgery) Egress Guard

When Fortless makes outbound HTTP requests to user-supplied URLs (e.g. custom webhooks, domain health checks, ping monitors):

```
User URL -> [ DNS Resolution ] -> Check IP against Blacklist -> Connect directly to Resolved IP
                                  ├── 127.0.0.0/8 (Loopback) -> BLOCK
                                  ├── 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (Private) -> BLOCK
                                  ├── 169.254.0.0/16 (Link-Local / Cloud Metadata) -> BLOCK
                                  ├── ::1, fc00::/7, fe80::/10 (IPv6 Private/Link-Local) -> BLOCK
                                  └── Public Routable IP -> ALLOW (Pin IP to prevent Rebinding)
```

---

## 5. Privacy, GDPR & Compliance Readiness

1. **Data Minimization:** Fortless collects only data strictly required for service delivery, billing, and fraud prevention. Customer payment card numbers (PAN) and CVVs are **never** received, processed, or stored on Fortless servers.
2. **Right to Access (GDPR Art. 15):** Customers can download a complete JSON export of their profile, order history, active services, and support communications.
3. **Right to Erasure (GDPR Art. 17):** Account closure deletes personal credentials and active services. **Statutory Exemption:** Financial invoices, tax records, and transaction journals are retained for the legally mandated period (e.g., 7–10 years per national fiscal law) under a restricted legal hold.
4. **Data Processor Agreements:** All external data processors (PSP, cloud hosts, email providers) must maintain signed DPAs and standard contractual clauses.
