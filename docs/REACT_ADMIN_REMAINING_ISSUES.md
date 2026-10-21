# React Admin remaining issues

## Release blockers

- Connect the remaining catalog, customer billing-profile, subscription renewal, support routing/attachment, content edit/delete, audit export and settings operations to their exact protected Fastify mutations; preserve pending/unknown outcomes and refresh authoritative state.
- Add pagination/search/filter transport for large lists and detail joins.
- Finish real Fastify + disposable DB browser coverage for all roles and critical operations.
- Run provider and Stripe tests only in isolated sandbox environments.
- Complete desktop/mobile/dark/accessibility regression and legacy parity evidence.

## Current safety behavior

- `/admin-preview` and `/admin` use real APIs by default and never load fixtures. Demo fixtures require `VITE_ADMIN_DEMO=1`.
- `/admin-preview` is independently gated by `FORTLESS_REACT_ADMIN_PREVIEW=1`, authentication, active staff access, staff MFA and section permissions.
- Connected service, customer, billing refund, infrastructure, job, monitoring, support, content and staff mutations use the existing CSRF and real step-up endpoints; unsupported live mutations are disabled with an explicit explanation.
- The React Admin feature flag is independent and defaults off.
- Local authenticated browser integration is verified at desktop and mobile widths. Public staging and production cutover are NOT VERIFIED.
