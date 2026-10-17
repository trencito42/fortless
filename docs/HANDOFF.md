# Fortless engineering handoff

Read, in order: root `AGENTS.md`, `handoff/docs/CODEX_CONTEXT.md`, `handoff/docs/DESIGN_SYSTEM_INTEGRATION.md`, `blueprint/fortless-blueprint/MASTER_PROMPT.md`, every numbered blueprint specification, `docs/REPOSITORY_AUDIT.md`, and `docs/IMPLEMENTATION_STATUS.md`.

## Current safe continuation point

The client redesign is active. `/app` is now a real-data command center and the service inventory moved to `/app/services`. Support no longer depends on customer modals: `/app/support`, `/app/support/new`, and `/app/support/:id` provide list, create, and full conversation views. The editor adapter reuses Petal's canonical `.rte/.rtb/.rta` structure and command behavior, then converts semantic content to the backend Markdown contract; the drop control uses the existing tenant-scoped attachment API and reports partial upload failures honestly. Continue from `docs/frontend/REDESIGN_PROGRESS.md` and do not reintroduce the removed ticket modals.

The generated `public/assets/app-ui.js` must never be edited directly. Change `src/frontend/**`, run `npm run build`, and commit both source and generated bundle. The five redesign documents under `docs/frontend/` are required deliverables and must track visual QA truthfully.

Identity slice 1, session/device management, TOTP MFA, recent password+TOTP step-up, persisted staff RBAC and the guarded staff operations slice are implemented and locally tested. Continue Phase 1 with WebAuthn/passkeys, approved initial-owner bootstrap and broader HTTP permission tests. Keep Petal as the sole component source. Do not reactivate checkout, webhooks, provider power actions, or the worker until a separate official sandbox adapter is implemented and its release-gate tests pass.

The admin workspace now has canonical routes `/admin`, `/admin/accounts`, `/admin/services`, `/admin/tickets`, `/admin/audit`, and `/admin/staff`. Every document route and API requires both a persisted active `staff_memberships` record and an MFA-verified session. Roles are `OWNER`, `ADMINISTRATOR`, `BILLING`, `SUPPORT`, `INFRASTRUCTURE`, and `AUDITOR`; permission checks re-read the database for each request so revocation takes effect mid-session. Overview, account lookup, service inventory, support queue, global audit and staff directory are derived from real records; bounded list queries omit password/session material, provider secrets, environment variables and raw payloads. Owner-only staff grants/changes/revocations require a fresh password+TOTP step-up, target MFA, a reason and audit event; self-change and final-owner removal fail closed. No live `OWNER` was inferred. Migration v4 mapped only the closed set of existing `is_staff=1` identities to `ADMINISTRATOR` and granted nobody new. The legacy column remains for compatibility but is no longer the authorization boundary.

Homepage/auth/app now share logo geometry and the `fortless_theme` preference. Homepage authentication CTAs are selected server-side (no guest-action flash), and authenticated requests to `/login` or `/register` redirect to `/app`. The shared auth password toggle changes from eye to eye-slash when the password is visible.

The app shell now has valid document structure and loads its composition layer after the supplied Petal base. Portrait uses a full-width docked bottom tab bar; compact landscape uses a docked left rail. Tables become labeled record cards on phone, modals become bottom sheets, non-interactive table/card hover affordances were removed, and the whole-page Twemoji mutation observer was removed. Physical-device/browser visual E2E is still required before raising the UI verification tier.

Customer navigation no longer uses prototype hash URLs. The canonical implemented routes include `/app`, `/app/services`, `/app/services/:id`, `/app/deploy`, `/app/domains`, `/app/billing`, `/app/support`, `/app/support/new`, `/app/support/:id`, `/app/activity`, and `/app/settings`; the server serves authenticated deep links, while the client uses History API navigation and migrates old `#...` bookmarks with `replaceState`.

The customer routes have now been swept against the supplied Petal source. Dashboard metrics use `stat`; service records use `li`; support rows use the original `z6` `.z-cl/.z-cv`; Deploy uses the original `z4` multi-step wizard plus `z-pls`/`z-plc`, `z-sum` and `z-plsum`; Billing uses `z-iv`/`z-ivs`, filters and the supplied table; Domains and workspace members use the supplied responsive table; Activity uses expandable `z-au` rows and segmented filters; empty states use `z-es`. Settings retains the supplied sessions, QR/OTP and 2FA components. Browser-computed VAT was removed from Deploy because only the signed server quote is authoritative. Domain actions truthfully create DNS zones and do not claim registrar purchase. Authenticated desktop/portrait/landscape screenshot QA is still required.

TOTP enrollment requires the current password, stores the secret with AES-256-GCM, confirms a live RFC 6238 code before activation, returns ten recovery codes exactly once, and gates every subsequent session until TOTP or an unused recovery code succeeds. Invalid challenge attempts are persisted and throttled. Migration v3 adds the factor, recovery-code, and attempt tables. The auth UI now includes `/mfa/challenge`, while `/app/settings` manages enrollment and disablement using the existing Petal QR, OTP, backup-code and session primitives.

Development cryptographic key material is now persisted at `data/.development-session-secret` with mode `0600`; the previous random-on-every-restart fallback must not be restored. Production still requires an explicit `SESSION_SECRET`. Recovery-code digests no longer depend on that encryption key, and challenge recovery is evaluated before decrypting TOTP data. The single factor enrolled before this fix was encrypted with an already-lost ephemeral key and requires an explicit owner-approved reset and re-enrollment.

## Migration note

Migration v1 creates verification, recovery, and persistent login-attempt tables, adds `sessions.mfa_verified_at`, and intentionally rotates legacy plaintext session IDs. Migration v2 gives only identities that were already `ACTIVE` at the v1 cutoff an audited legacy verification timestamp; this fixes the login/app redirect loop without weakening verification for new registrations. Both migrations have been applied by the local watch process to the served development database. Any future production migration must be separated from API startup, backed up first, and executed through an explicit deployment procedure.

Migration v3 adds TOTP factors, recovery-code hashes and persistent MFA attempts. Migration v4 adds revocable staff memberships and migrates only pre-existing `is_staff=1` identities to `ADMINISTRATOR`. It has been applied to the served development database.

Migration v5 adds `sessions.step_up_verified_at`. `/api/v1/auth/step-up` requires the current password and live six-digit TOTP, lasts ten minutes, and is the mandatory precondition for staff-membership mutations.

## Known blockers needing owner/provider input

- Transactional email provider, sender domain/address, sandbox credentials, SPF/DKIM/DMARC plan.
- Staff identity list and preferred MFA baseline (TOTP can be implemented locally; WebAuthn/passkeys preferred for privileged users).
- Legal entity, tax and invoice approval.
- Approved PSP sandbox account and exact API version.
- Pterodactyl staging URL/version, nodes, allocations, eggs, and least-privilege credentials.
- Production deployment, PostgreSQL/Redis, backup/RPO/RTO, monitoring, and incident ownership.
