# Fortless Reality Matrix

Last Updated: 2026-10-17  
Standard: Production Integrity, Zero Placeholders, Strict Evidence Protocol

## Verification Tiers

- **`UI_ONLY`**: Rendered in client UI only; no authoritative backend logic or state backing.
- **`MOCKED`**: Simulated locally with mock fixtures, in-memory adapters, or placeholder responses.
- **`LOCAL_VERIFIED`**: Implemented with real backend logic and local persistence; verified with passing automated test evidence.
- **`SANDBOX_VERIFIED`**: Validated against actual external vendor staging/sandbox environments (Stripe, Pterodactyl, Email).
- **`PRODUCTION_VERIFIED`**: Validated in live production under authorized operations.
- **`BLOCKED`**: Missing external dependency, credentials, or undefined business/legal policy.

---

## 1. Public & Customer Routes

| Route | Type | Status | Evidence / Notes |
|---|---|---|---|
| `/` | Page | `LOCAL_VERIFIED` | Real landing page served by Fastify, Petal design system, session-aware CTAs (no guest-action flash). |
| `/login` | Page | `LOCAL_VERIFIED` | Auth UI, Argon2id verify, single-origin CSRF, HttpOnly session cookie, redirect guards. |
| `/register` | Page | `LOCAL_VERIFIED` | New accounts created with `PENDING_VERIFICATION` status, single-use 24h verification token. |
| `/verify-email` | Page | `LOCAL_VERIFIED` | Consumes single-use SHA-256 hashed verification token, activates identity. |
| `/forgot-password` | Page | `LOCAL_VERIFIED` | Non-enumerating token request; 15-minute expiration window. |
| `/reset-password` | Page | `LOCAL_VERIFIED` | Consumes password reset token, revokes all active sessions upon reset. |
| `/mfa/challenge` | Page | `LOCAL_VERIFIED` | 6-digit TOTP challenge or single-use recovery code authentication. |
| `/app` | Page / Shell | `LOCAL_VERIFIED` | Server-side authentication guard; History API deep-links; Petal mobile/desktop adaptive layout. |
| `/app/deploy` | Page | `LOCAL_VERIFIED` | Plan selector backed by DB catalog (`/api/v1/catalog`). Fail-closed checkout. |
| `/app/billing` | Page | `LOCAL_VERIFIED` | Renders sequential fiscal invoices (`/api/v1/invoices`) with EUR minor units. |
| `/app/support` | Page | `LOCAL_VERIFIED` | Customer support thread list and ticket view (`/api/v1/tickets`). |
| `/app/activity` | Page | `LOCAL_VERIFIED` | Audit trail viewer (`/api/v1/audit`) scoped strictly to tenant account. |
| `/app/settings` | Page | `LOCAL_VERIFIED` | Active session inventory, remote session revocation, TOTP enrollment/disablement. |
| `/status` | Page | `LOCAL_VERIFIED` | Standalone public status dashboard with canonical Petal design system, Hugeicons, live indicator dot, component telemetry grid, active incidents, and history. |

---

## 2. Staff & Administrative Routes

| Route | Type | Status | Evidence / Notes |
|---|---|---|---|
| `/admin` | Page / Workspace | `LOCAL_VERIFIED` | Server-guarded by `staff_memberships` role check + active MFA verification on every request. |
| `/admin/accounts` | Page | `LOCAL_VERIFIED` | Global account search omitting credential/session material. |
| `/admin/services` | Page | `LOCAL_VERIFIED` | Global instance inventory derived from SQLite `services` table. |
| `/admin/tickets` | Page | `LOCAL_VERIFIED` | Cross-tenant support queue for staff triage. |
| `/admin/audit` | Page | `LOCAL_VERIFIED` | Global immutable audit event log with actor and IP tracking. |
| `/admin/staff` | Page | `LOCAL_VERIFIED` | Staff directory; mutations require `OWNER` role + fresh password/TOTP step-up. |

---

## 3. API Endpoints

### Identity & Authentication
| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/api/v1/auth/register` | POST | `LOCAL_VERIFIED` | Memory-hard Argon2id, IP/identifier throttling, `PENDING_VERIFICATION`. |
| `/api/v1/auth/verify-email` | POST | `LOCAL_VERIFIED` | Constant-time token lookup, marks `ACTIVE`. |
| `/api/v1/auth/login` | POST | `LOCAL_VERIFIED` | Validates credentials, checks MFA status, issues SHA-256 hashed session. |
| `/api/v1/auth/mfa/challenge` | POST | `LOCAL_VERIFIED` | Verifies TOTP or recovery code; throttles invalid attempts. |
| `/api/v1/auth/mfa/enroll/begin` | POST | `LOCAL_VERIFIED` | Password-gated; returns QR payload + encrypted secret. |
| `/api/v1/auth/mfa/enroll/confirm` | POST | `LOCAL_VERIFIED` | Confirms live RFC 6238 code; generates 10 one-time recovery codes. |
| `/api/v1/auth/mfa/disable` | POST | `LOCAL_VERIFIED` | Requires password + live TOTP; revokes factor. |
| `/api/v1/auth/step-up` | POST | `LOCAL_VERIFIED` | Generates 10-minute session-scoped privilege evidence for destructive actions. |
| `/api/v1/auth/password/change` | POST | `LOCAL_VERIFIED` | Validates current password, updates Argon2id hash, revokes other sessions, writes audit log. |
| `/api/v1/auth/sessions` | GET | `LOCAL_VERIFIED` | Lists active sessions for current user with device/IP info. |
| `/api/v1/auth/sessions/:id` | DELETE | `LOCAL_VERIFIED` | Revokes specific session; tenant-scoped. |
| `/api/v1/auth/sessions/revoke-others` | POST | `LOCAL_VERIFIED` | Revokes all other sessions except current. |
| `/api/v1/auth/logout` | POST | `LOCAL_VERIFIED` | Destroys current session token and clears cookie. |
| `/api/v1/auth/passkeys/register-options` | POST | `LOCAL_VERIFIED` | Generates single-use WebAuthn registration challenge with anti-replay. |
| `/api/v1/auth/passkeys/register-verify` | POST | `LOCAL_VERIFIED` | Verifies origin, clientData, stores ES256/RS256 credential and writes audit log. |
| `/api/v1/auth/passkeys/login-options` | POST | `LOCAL_VERIFIED` | Generates single-use authentication challenge. |
| `/api/v1/auth/passkeys/login-verify` | POST | `LOCAL_VERIFIED` | Verifies signature, advances counter (anti-replay check), issues session with mfaVerified=true. |
| `/api/v1/auth/passkeys` | GET | `LOCAL_VERIFIED` | Lists registered passkeys for caller. |
| `/api/v1/auth/passkeys/:id` | DELETE | `LOCAL_VERIFIED` | Revokes specific passkey credential. |
| `/api/v1/account/members` | GET | `LOCAL_VERIFIED` | Lists workspace team members and pending invitations. |
| `/api/v1/account/members/invite` | POST | `LOCAL_VERIFIED` | Sends workspace invitation; queues signed email atomically. |
| `/api/v1/account/members/:membershipId` | DELETE | `LOCAL_VERIFIED` | Removes workspace member with strict last-owner protection. |
| `/api/v1/account/invitations/accept` | POST | `LOCAL_VERIFIED` | Consumes invitation token and adds user to workspace. |
| `/api/v1/email/status` | GET | `LOCAL_VERIFIED` | Returns truthful email outbox status, mode, and queue counts. |

### Catalog & Pricing
| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/api/v1/catalog` | GET | `LOCAL_VERIFIED` | Seeded products (`minecraft`, `discord-bot`) and plan versions. |
| `/api/v1/pricing/quote` | POST | `LOCAL_VERIFIED` | Server-signed HMAC-SHA256 quotes; minor units, EU VAT, B2B reverse charge. |

### Checkout & Payments
| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/api/v1/checkout` | POST | `LOCAL_VERIFIED` | Idempotent checkout attempt; fails closed with typed error if Stripe unconfigured. |
| `/api/v1/webhooks/stripe` | POST | `LOCAL_VERIFIED` | Raw-body HMAC-SHA256 signature verification; idempotent inbox; fails closed without secret. |
| `/api/v1/invoices` | GET | `LOCAL_VERIFIED` | Returns sequential fiscal invoices (`INV-YYYY-XXXXX`) for tenant. |
| `/api/v1/invoices/:id` | GET | `LOCAL_VERIFIED` | Returns invoice with immutable line items. |

### Infrastructure & Provisioning
| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/api/v1/services` | GET | `LOCAL_VERIFIED` | Returns tenant services from SQLite database. |
| `/api/v1/services/:id/power` | POST | `MOCKED` | Tested via `MockPterodactylAdapter`; returns `PROVIDER_NOT_CONFIGURED` if live disabled. |
| `/api/v1/orders/instant-deploy` | POST | `LOCAL_VERIFIED` | 410 LEGACY_FLOW_DISABLED in production; test harness handles outbox flow. |

### Support, Ticketing & Global Search
| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/api/v1/search` | GET | `LOCAL_VERIFIED` | Scoped global search for services, tickets, invoices, navigation and admin routes. |
| `/api/v1/tickets` | GET/POST | `LOCAL_VERIFIED` | Tenant-scoped support tickets with transactional initial message. |
| `/api/v1/tickets/:id` | GET | `LOCAL_VERIFIED` | Customer thread history with Markdown bodies, attachments, and staff replies. |
| `/api/v1/tickets/:id/messages` | POST | `LOCAL_VERIFIED` | Customer reply append with Markdown support; fails closed if ticket is closed. |
| `/api/v1/tickets/:id/attachments` | POST | `LOCAL_VERIFIED` | Uploads ticket file attachment; enforces MIME whitelist, SHA256 integrity, 5MB limit. |
| `/api/v1/tickets/:id/attachments/:attachmentId` | GET | `LOCAL_VERIFIED` | Streams attachment download with nosniff and Content-Disposition; tenant-isolated. |
| `/api/v1/admin/tickets/:ticketId/attachments` | POST | `LOCAL_VERIFIED` | Staff attachment upload to customer ticket; tenant-isolated storage. |
| `/api/v1/audit` | GET | `LOCAL_VERIFIED` | Tenant-scoped immutable audit stream. |
| `/api/v1/status` | GET | `LOCAL_VERIFIED` | Public truthful platform component status, health indicator, and incident history. |

### Staff Operations (`/api/v1/admin/*`)
| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/api/v1/admin/overview` | GET | `LOCAL_VERIFIED` | Derived from DB counts; reports capability status truthfully. |
| `/api/v1/admin/accounts` | GET | `LOCAL_VERIFIED` | Bounded pagination; owner info without passwords/tokens. |
| `/api/v1/admin/services` | GET | `LOCAL_VERIFIED` | Cross-tenant instance inspection. |
| `/api/v1/admin/orders` | GET | `LOCAL_VERIFIED` | Cross-tenant order inspection with item counts, search, and pagination. |
| `/api/v1/admin/invoices` | GET | `LOCAL_VERIFIED` | Cross-tenant fiscal invoice inspection with credit note counts. |
| `/api/v1/admin/credit-notes` | GET | `LOCAL_VERIFIED` | Cross-tenant refund and SLA credit note inspection with parent invoice references. |
| `/api/v1/admin/capacity` | GET | `LOCAL_VERIFIED` | Infrastructure capacity pools by region and node (memory, disk, active service count). |
| `/api/v1/admin/incidents` | POST | `LOCAL_VERIFIED` | Staff incident creation with atomic component status updates and audit logs. |
| `/api/v1/admin/incidents/:id/updates` | POST | `LOCAL_VERIFIED` | Staff incident progress updates and resolution marking. |
| `/api/v1/admin/components/:id` | PATCH | `LOCAL_VERIFIED` | Staff direct component operational state modification. |
| `/api/v1/admin/billing/process-renewals` | POST | `LOCAL_VERIFIED` | Staff trigger for automated subscription renewals, dunning grace periods, and suspension. |
| `/api/v1/admin/tickets` | GET | `LOCAL_VERIFIED` | Cross-tenant support triage. |
| `/api/v1/admin/audit` | GET | `LOCAL_VERIFIED` | Global administrative mutation stream. |
| `/api/v1/admin/staff` | GET | `LOCAL_VERIFIED` | Staff directory with active/revoked memberships. |
| `/api/v1/admin/staff` | POST | `LOCAL_VERIFIED` | Owner-only grant; requires step-up, target MFA, reason. |
| `/api/v1/admin/staff/:id` | PATCH/DELETE | `LOCAL_VERIFIED` | Owner-only role modification / revocation; final owner protected. |

---

## 4. External Integrations

| Integration | Verification Tier | Blockers / Next Steps |
|---|---|---|
| **Transactional Email** | `LOCAL_VERIFIED` | Transactional outbox with exponential backoff, dead-lettering, atomic leasing, and disk-verified sandbox receipts in `data/sandbox_mail`. Production provider adapter fails closed until live API credentials configured. |
| **Stripe Payments** | `MOCKED` |authoritative HMAC validation implemented & tested with test fixtures; real Stripe sandbox keys needed. |
| **Pterodactyl Panel** | `MOCKED` | Outbox worker & timeout recovery saga verified with `MockPterodactylAdapter`; live sandbox instance needed. |
| **Database Engine** | `LOCAL_VERIFIED` | SQLite with WAL mode & foreign keys active; PostgreSQL migration tooling required before production. |
| **Backup & Disaster Recovery** | `LOCAL_VERIFIED` | Automated online atomic SQLite backup, AES-256-GCM encryption, SHA-256 checksum verification, and isolated staging restore drills (`npm run backup`). |
| **Distributed Cache/KV** | `BLOCKED` | In-process rate limiting active; Redis required for multi-replica deployments. |
