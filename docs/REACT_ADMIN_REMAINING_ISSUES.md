# React Admin remaining issues

## Release blockers

- Connect typed DTO adapters and real queries for every non-dashboard route.
- Replace each preview operation with its exact protected Fastify mutation; preserve pending/unknown outcomes and refresh authoritative state.
- Add real recent-MFA step-up UX; a browser timestamp must never grant verification.
- Add pagination/search/filter transport for large lists and detail joins.
- Finish real Fastify + disposable DB browser coverage for all roles and critical operations.
- Run provider and Stripe tests only in isolated sandbox environments.
- Complete desktop/mobile/dark/accessibility regression and legacy parity evidence.

## Current safety behavior

- `/admin-preview` remains synthetic and clearly labelled.
- `/admin` never loads fixtures; unsupported live mutations are disabled with an explicit explanation.
- The React Admin feature flag is independent and defaults off.
- Production and staging cutover are NOT VERIFIED.
