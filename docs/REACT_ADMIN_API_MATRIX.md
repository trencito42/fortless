# React Admin API integration matrix

Updated 2026-10-21. Status is evidence-based: `LIVE_READ`, `LIVE_WRITE`, `BACKEND_PARTIAL`, `BACKEND_UNSUPPORTED`, `SANDBOX_VERIFIED`, `PRODUCTION_VERIFIED`, `BLOCKED`.

| Area | React route | Backend | Status | Evidence / remaining work |
|---|---|---|---|---|
| Staff session | all `/admin/*` | `GET /api/v1/admin/me` | LIVE_READ | Real user, role, permissions and session verification timestamps; browser role switching removed in live mode. |
| Dashboard | `/admin` | `GET /api/v1/admin/overview` | LIVE_READ | Real counts, per-currency collections, queues and configured capabilities. |
| Customers | `/admin/customers*` | accounts list/detail/status/notes/billing profile | BACKEND_PARTIAL | Backend exists; React DTO adapters and live mutations not connected. |
| Services | `/admin/services*` | services list/detail/power/lifecycle/relink/sync | BACKEND_PARTIAL | Backend exists and keeps lifecycle/runtime separate; React live adapters/mutations not connected. |
| Orders | `/admin/orders*` | orders list/detail | BACKEND_PARTIAL | Backend reads exist; React adapter not connected. |
| Billing | `/admin/billing*` | invoices, credit notes, refund, renewals | BACKEND_PARTIAL | Critical endpoints exist; React adapters/mutations not connected. |
| Catalog | `/admin/products*` | products/plans/options/coupons/inventory | BACKEND_PARTIAL | Backend CRUD exists; React adapters/mutations not connected. |
| Infrastructure/jobs | `/admin/infrastructure*`, `/admin/provisioning*` | capacity, maintenance, reconcile, jobs/retry | BACKEND_PARTIAL | Backend exists; live UI wiring incomplete. |
| Support | `/admin/support*` | tickets/meta/reply/status/routing/attachments | BACKEND_PARTIAL | Backend exists; live UI wiring incomplete. |
| Content | `/admin/content*` | categories/articles/announcements CRUD | BACKEND_PARTIAL | Backend exists; live UI wiring incomplete. |
| Staff/audit/settings | corresponding routes | staff, audit/export, settings/email tests | BACKEND_PARTIAL | Backend exists; live UI wiring incomplete. |
| Preview-only new product areas | actions persistence, workers, campaigns, referrals, analytics, approvals, staff sessions, legal revisions | none | BACKEND_UNSUPPORTED | Must remain explicitly unavailable; no synthetic production fallback. |

All browser-only mutations are disabled on `/admin`. They remain enabled only at `/admin-preview` for component tests.
