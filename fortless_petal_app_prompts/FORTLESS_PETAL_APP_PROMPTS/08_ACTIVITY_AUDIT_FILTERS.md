# Task 08: elevate `/app/activity` into a trustworthy activity center

**Existing:** `loadAudit` / `renderAudit` in `app-ui.js`, bounded `/api/v1/audit`, `.z-au` expandable rows; preserve existing live audit events and tenant scope.

**Canonical Petal:** Account & business > Filterable audit log `.z-au`; Data display > Timeline; Date/time > Date range picker/quick ranges; Data & tables > saved filters, expandable rows; Dropdowns > searchable select; Feedback > status badges, skeleton and empty state; Utilities > copy field.

Implement server-paginated and indexed filters for action category, actor, resource, timeframe and correlation ID. Add useful grouping by date, iconography, exact timestamps and timezone toggles, safe copy event ID, event detail with redacted metadata, link to authorized object and CSV export of only current account with consistent filter. Do not reveal IP/actor details beyond authorization policy and never expose provider tokens, passwords, raw financial/card data or TOTP secrets.

Audit records should be appended to true backend mutations and distributed job transitions, including tickets, team, security, payment and provisioning. Treat immutable audit events as authoritative; never fabricate history. Distinguish user/system/staff actors. Correct sort and cursor pagination as records append concurrently. Test cross-tenant leakage, filter tampering, CSV injection, huge lists, keyboard interactions, and mobile layout.
