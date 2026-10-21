# React Admin remaining issues

## Done in this iteration

- Catalog (product create/edit/publish, plan version, plan status and options, coupons), customer billing profile, renewal run, support routing/attachments/departments/macros, content edit/delete, audit export, email templates and resend, SMTP/Stripe/provider checks are connected to their exact protected Fastify routes with CSRF, RBAC and step-up.
- Server-side search, paging and filters on all large lists.
- Evidence: `tests/react-admin-mutations.test.ts` (13 contract tests, same request bodies as the forms, real Fastify, temp DB), `tests-admin-live` (14 browser tests against a disposable Fastify: forms, validation, step-up prompt, roles, API refusal when the UI is bypassed), `tests-admin` (32 demo-mode tests: all routes at 3 widths, a11y).

## Release blockers

- Provider and Stripe operations are verified only as typed “not configured” errors. Run them in isolated sandboxes before any cutover.
- The browser step-up dialog (password + TOTP) is exercised only up to the prompt; the TOTP exchange itself is not covered end to end.
- Legacy parity evidence (every legacy `/admin` capability mapped to a React screen) and a full dark/mobile/accessibility regression over the live views are still to do.
- Public staging and production cutover are NOT VERIFIED.

## No backend endpoint yet (shown as unavailable, never simulated)

Coupon enable/disable; plan edit in place; pricing rules; invoice void, credit-note creation, reminders; subscription grace extension and cancel; customer members, restrictions and verification workflow; department/macro edit and delete; payments list with reconciliation view; webhook inbox listing; worker heartbeats; scheduled maintenance windows; legal documents with revisions; marketing page fields; approvals and staff sessions; feature flags and settings writes beyond email; node cost and allocation ledger; service migration, rebuild, reinstall, change plan.

## Corrections found while connecting

- The backend creates plan versions as ACTIVE immediately; the earlier UI text promised a draft. Fixed.
- Built-in link templates (verification, reset, invitation) carry a sample URL, so saving them unchanged is refused by the backend. The editor now says which placeholder is required.

## Current safety behavior

- `/admin-preview` and `/admin` use real APIs by default and never load fixtures. Demo fixtures require `VITE_ADMIN_DEMO=1`.
- `/admin-preview` is independently gated by `FORTLESS_REACT_ADMIN_PREVIEW=1`, authentication, active staff access, staff MFA and section permissions.
- The React Admin feature flag is independent and defaults off.
