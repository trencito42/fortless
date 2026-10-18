# Fortless plan reconciliation — 2026-10-19

This document reconciles `fortless_codex_mega_prompts/FORTLESS_CODEX_MEGA_PROMPTS/` with the current working tree. It prevents agents from replaying old phases merely because an older checklist is unchecked.

## Binding design rule

- Canonical visual reference: `fortless-redesign/Fortless Views.html` (read-only).
- Canonical transactional-email reference: `fortless-redesign/Fortless Mail.html` (read-only).
- Normalized copy with the same design content: `docs/design/views.html` (read-only during feature work).
- Production primitives: `public/assets/petal-app.css` and `src/frontend/petal/`.
- New screens must compose the existing Petal primitives. If a necessary pattern is absent, create one reusable production primitive derived from the canonical reference. Do not edit the reference, introduce a parallel design system, or add route-local visual inventions.
- Required QA for UI work: desktop, portrait phone, compact landscape where relevant, light/dark themes, keyboard/focus, loading/empty/error/success/disabled states, dialogs/drawers and long-content overflow.

## Current phase assessment

| Original phase | Current assessment | Remaining gate |
| --- | --- | --- |
| 01 Audit/reality map | Implemented but documentation has drifted | Refresh matrices from executable state after each slice |
| 02 Foundation/jobs | Core SQLite migrations, worker leasing/recovery and config hardening exist locally | Production DB/multi-replica infrastructure is not verified |
| 03 Auth/email/MFA | Registration, sessions, TOTP, WebAuthn, team flows, canonical email rendering, SMTP/sandbox transport and per-user optional preferences exist locally | Live SMTP deliverability and real-browser passkey QA |
| 04 Admin control plane | Most read models and several mutations exist; Petal admin shell is implemented | Game-profile UI and a route/action-by-action browser audit |
| 05 Catalog/commerce | Catalog, quotes, capacity and admin catalog exist locally | External/provider validation where applicable |
| 06 Billing/Stripe | Financial domain logic and mock/local tests exist | Real Stripe test-mode checkout/webhook/3DS evidence and owner fiscal decisions |
| 07 Pterodactyl | Inventory and several reads are sandbox-verified; server tools are implemented locally | Disposable-server write tests and full create/suspend/delete lifecycle evidence |
| 08 Customer lifecycle | Customer routes, support and broad server management exist locally | Browser QA, real-panel writes, tab navigation QA |
| 09 Optional providers | DNS/VPS/cPanel/web-app/AI abstractions have local/mock coverage | Real provider contracts and sandbox evidence; do not market as operational |
| 10 Release | Automated local security/recovery coverage exists | Vendor gates, production deployment architecture and independent review |
| 12 Server extensions | Game profiles, console, files, sharing, sync and panel management slices exist locally with automated coverage | Real-panel write verification and authenticated browser QA |

## Verified during this reconciliation

- `npm test`: **212/212 tests passed** across 12 files.
- `npx tsc --noEmit`: **passed**.
- `npm run build:frontend`: **passed**.
- `docs/design/views.html` is byte-identical to `fortless-redesign/fortless-redesign/docs/design/views.html`. Root `fortless-redesign/Fortless Views.html` contains the same design content with only the outer document wrapper added.
- Stage 12 was absent from `MANIFEST.json`, `README_START_HERE.md` and `ALL_STAGES_ONE_FILE.md` before reconciliation.

## Current execution order

1. Perform authenticated browser QA for existing customer/server routes, including Databases, Backups and Network in both themes and compact viewports.
2. Exercise safe write paths on a disposable Pterodactyl server and update verification tiers honestly.
3. Verify SMTP delivery, SPF/DKIM/DMARC alignment and bounce handling with production credentials.
4. Continue only the Stage 12 gaps proven by the browser/provider audits; do not replay completed slices.

Do not enable production payments, DNS changes, provider mutations or destructive operations solely because local tests pass.
