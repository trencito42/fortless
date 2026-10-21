# React Admin cutover and rollback

## Gate

`FORTLESS_REACT_ADMIN_UI=1` independently selects the React shell for `/admin` and all deep routes. With the flag absent/false, the existing `public/admin.html` remains active. Both paths keep server-side authentication, active staff access, route permission and staff MFA checks.

The flag must remain **off** until every critical row in the API and parity matrices is live and browser-tested against disposable Fastify data.

## Deployment prerequisites

1. Build `frontend-react/dist-react-preview` atomically with the server release.
2. Run typecheck, production build, API integration tests and Admin browser tests.
3. Verify authenticated staff MFA, restricted roles, direct deep links, CSRF and step-up in staging.
4. Enable the flag only through the established deployment procedure; monitor 401/403/5xx, asset failures and privileged mutation audit events.

## Rollback

Set `FORTLESS_REACT_ADMIN_UI=0` (or remove it) and redeploy/reload through the established authorized procedure. The next `/admin` request uses `public/admin.html`; no database rollback is required by this slice. If the flag is on but the React build is missing, the server fails closed with 503 instead of bypassing security.

Production enablement: **NOT VERIFIED / NOT EXECUTED**.
