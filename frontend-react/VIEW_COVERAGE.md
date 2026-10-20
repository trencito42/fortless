# VIEW_COVERAGE — customer app (`/app`)

Scope: customer routes only. No admin/staff routes exist. Data source for every route is the fixture adapter (`CustomerApi`) unless noted; nothing here has been run against a live backend.

Evidence legend
- **Smoke** = renders at 320/375/390/430/768/1024/1440/1920 with no console errors and no horizontal page overflow (`tests/customer-app.spec.ts`, 40 routes).
- **Axe** = axe wcag2a/aa/21aa, light + dark, 320 and 1024 (74/74 passed). `/app/services/*` is covered by `tests/service-detail.spec.ts` axe instead.
- **Flow** = scripted user workflow in `tests/customer-flows.spec.ts` (31 tests) or the deploy/commerce specs.
- Real-device / touch testing: **not done**.

| Route | Page component | Scope | Key interactions | Smoke | Axe | Flow | Status / blockers |
|---|---|---|---|---|---|---|---|
| `/app` | `pages/Dashboard` | customer | service summary, alerts, quick actions | yes | yes | yes | fixture |
| `/app/services` | `pages/Services` | customer | search, filter, sort, row actions | yes | yes | yes | fixture |
| `/app/services/:id/:tab?` | `pages/ServiceDetailPage` → `views/service-detail` | customer | 15 sections in grouped nav; workload-specific tabs (bot hides Players/Game/FastDL; Minecraft icon card; CS 1.6 FastDL) | partial (service-detail suite) | yes (service-detail suite) | yes (20 tests) | demo + HTTP adapters, 73 typed ports; HTTP adapter untested against a real API |
| `/app/deploy` | `pages/Deploy` | customer | 12 steps, quick/custom, live quote, checkout with declined card | yes | yes | yes (3) | **Simulated** checkout and provisioning |
| `/app/billing` + 8 sub-routes (invoices, invoice detail, subscriptions, orders, cart, plans, payment methods, profile) | `pages/billing/*` | customer | download/pay (simulated), cart, plan compare, add/remove card | yes | yes | yes | **Simulated** payments |
| `/app/domains`, `/search`, `/:name` | `pages/domains/*` | customer | search availability, DNS records, nameservers | yes | yes | yes | fixture; registrar not wired |
| `/app/support`, `/new`, `/:id` | `pages/support/*` | customer | inbox filter, new ticket, reply | yes | yes | yes | fixture |
| `/app/account/{profile,security,api-keys,team,notifications,activity}` | `pages/account/*` | customer | MFA setup, key create/revoke (secret shown once), invites, preferences | yes | yes | yes | passkey/QR are **placeholders**; notification channels planned |
| `/app/usage` | `pages/Usage` | customer | range, per-service breakdown | yes | yes | yes | **Planned** — needs a metrics backend |
| `/app/announcements` | `pages/Announcements` | customer | read/unread | yes | yes | yes | fixture |
| `/app/knowledge/:id?` | `pages/Knowledge` | customer | search, article view | yes | yes | yes | fixture |
| `/auth/{login,register,verify-email,reset,mfa}` | `auth/AuthPages` | customer, no shell | validation, failure path (`wrong@example.com`), MFA demo code | yes | yes | yes | fixture auth only; no real session |
| `/system/{403,404,500,maintenance,unavailable,session-expired}` | `shell/SystemScreens` | no shell | recovery actions | yes | yes | yes | — |

## Known gaps
- Light-theme smoke/axe skips `/app/services/*` (covered elsewhere).
- No real-device or touch verification; widths are Chromium viewport emulation.
- Visual review was manual screenshots of a subset (Dashboard, FastDL, bot startup, mobile Service Detail picker, Plans, Deploy mobile, Usage, Notifications), not every route.
- Console history recall (`commandRedacted`) is wired and the build and full suite passed after it, but it has no dedicated automated test yet.
