# PHASE 3 — IDENTITY, AUTHORIZATION, EMAIL AND USER SETTINGS

You are completing **real** auth across Fortless marketing / login / register / customer app / staff admin using existing Petal design primitives. Read `00_GLOBAL_CONTRACT.md`. Do not replace the look and feel.

## Functional journeys

1. Register: client-side UX + server-side validation; normalized unique email; Argon2id policy; consent and terms links, validation accessibility; rate limits; create pending identity/account; no authenticated entitlement until verified.
2. Verification: real transactional email adapter with sandbox, vetted sender-domain configuration, SPF/DKIM/DMARC instructions, single-use hash-at-rest token and expiration; resend rate limit, same result for nonexistent email; invalid/expired, repeat click and mail delivery failures supported.
3. Login: session rotation, secure HttpOnly cookie, SameSite/Secure rules, user enumeration resistance, per-account/IP and global distributed limits (behind reverse proxy), alerts for unusual sign-ins, multi-factor challenge; redirect to approved safe `next` paths only.
4. Recovery: password reset email + single-use token, token binding, expiration, global session revocation and notifications; change-password flow from settings with recent authentication; never leak token in logs or referrer; consider recovery method under MFA.
5. MFA: maintain TOTP, one-use recovery codes, encryption key stability/rotation, anti-replay within allowed time windows, challenge throttling; implement passkeys/WebAuthn after choosing a vetted library and documented RP ID/origin handling; MFA enrollment/disable/credential changes require step-up and security event logging.
6. Sessions/devices: real list from DB, last seen/IP approximate, revoke one/all/other, refresh without stale state, expiry, locked/suspended account kills access; audit without exposing raw tokens.
7. Organizations: invite member via email, roles `OWNER`, `BILLING_MANAGER`, `TECH_ADMIN`, `VIEWER` (adjust only with explicit migration), accept/reject/revoke, role restrictions, last-owner protection, tenant switching with per-request authoritative account scope.
8. Staff identity: strict independent staff membership + MFA, DB-checked revocation on each operation, owner bootstrap with an explicit one-time audited CLI requiring verified email and MFA; no public self-service owner promotion.
9. Account settings: profile, billing profile validation, notification preferences, security, locale/timezone, real delete/data export workflow subject to legal retention; show truthful pending/unavailable statuses.
10. Email management: durable mail outbox, safe templating, signed links, retries, bounce/complaint handling, unsubscribe where applicable, security mail exempt from marketing opt-out, delivery observability. Never log reset/verification links.

## Security requirements

CSRF tokens associated with session context, Origin/Referer handling, CORS no wildcard credentials, XSS-safe output/HTML email rendering, session fixation prevention, Argon2 parameter review, no token localStorage for browser session, IP spoof resistance, denial on revoked team membership, API-specific rate limits.

## Petal/UI acceptance

All `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/mfa/challenge`, `/app/settings` states usable on desktop/portrait/landscape phone with keyboard, screen-reader labels and focus management. Submit/loading/success/error states must correspond to **actual backend outcomes**, not animations that imply delivery. No placeholder 'verification email sent' if mail provider is disabled: communicate configuration/queue state truthfully.

## Mandatory negative tests

Wrong/expired/reused token; race of two verification clicks; wrong MFA 5+ attempts; TOTP reused when replay protection applicable; brute force from multiple IPs; password reset invalidates every session; stolen CSRF; tenant A accessing B's sessions; revoked staff same-session action; unauthorized OWNER bootstrap; malicious `next=https://evil...`; origin spoofing; mail outbox unavailable and retries; credential rotation across process restart; concurrent invitation redemption; WebAuthn origin/RP mismatch and replay.

## Deliverables

Complete real auth/email sandbox integration, full settings UI, permissions matrix, migration and recovery docs, tests including Playwright on mobile breakpoints. Do not claim real email delivery without sandbox receipts; do not enable live sender until approved.
