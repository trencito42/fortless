# React Admin API integration matrix

Updated 2026-10-21. Status is evidence-based: `LIVE_READ`, `LIVE_WRITE`, `BACKEND_PARTIAL`, `BACKEND_UNSUPPORTED`, `SANDBOX_VERIFIED`, `PRODUCTION_VERIFIED`, `BLOCKED`.

| Area | React route | Backend | Status | Evidence / remaining work |
|---|---|---|---|---|
| Staff session | all `/admin/*` | `GET /api/v1/admin/me` | LIVE_READ | Real user, role, permissions and session verification timestamps; browser role switching removed in live mode. |
| Dashboard | `/admin` | `GET /api/v1/admin/overview` | LIVE_READ | Real counts, per-currency collections, queues and configured capabilities. |
| Customers | `/admin/customers*` | accounts list/detail/status/notes/billing profile | LIVE_WRITE | List and Customer 360 load real records. Account status and internal notes use protected Fastify mutations; billing-profile editing remains blocked. |
| Services | `/admin/services*` | services list/detail/power/lifecycle/relink/sync | LIVE_WRITE | Real list/detail; lifecycle and runtime remain separate. Power, suspend, unsuspend, terminate and sync use CSRF, backend permissions and real step-up. Unsupported migrate/rebuild/plan operations remain unavailable. |
| Orders | `/admin/orders*` | orders list/detail | LIVE_READ | Real order, fulfillment, invoice and provisioning evidence. |
| Billing | `/admin/billing*` | invoices, transactions, subscriptions, refunds, credit notes, renewals | LIVE_WRITE | Invoice, payment transaction, subscription and refund reads are live and keep currencies/minor units authoritative. Invoice refund uses the protected provider-authoritative endpoint; renewal management remains blocked. |
| Catalog | `/admin/products*` | products/plans/options/coupons/inventory | LIVE_READ | Product, nested plan, coupon and provider inventory reads are live. Writes remain blocked. |
| Infrastructure/jobs | `/admin/infrastructure*`, `/admin/provisioning*` | capacity, maintenance, reconcile, jobs/retry | LIVE_WRITE | Capacity, allocations, maintenance flags and durable job queues are live. Node maintenance, provider reconciliation and eligible job retry use protected Fastify mutations. |
| Monitoring | `/admin/monitoring*` | `GET /api/v1/admin/status`, incident/component writes | LIVE_WRITE | Uses the persisted public status model through staff RBAC. Incident creation and component-state updates use protected Fastify mutations. Incident edit/delete remains blocked. |
| Support | `/admin/support*` | tickets/meta/reply/status/routing/attachments | LIVE_WRITE | Inbox, conversation, departments and macros load real records. Replies, internal notes and status transitions are live; routing/attachment management remains blocked. |
| Content | `/admin/content*` | categories/articles/announcements CRUD | LIVE_WRITE | Managed content, Markdown and publication state are live. Creating categories, articles and announcements and editing articles are connected; remaining edit/delete controls are blocked. |
| Staff/audit/settings | corresponding routes | staff, audit/export, settings/email tests | BACKEND_PARTIAL | Staff/MFA, server-written audit, safe settings and email failures are live; staff grant/role/revoke operations use real step-up. Audit export and settings writes remain blocked. |
| Preview-only new product areas | actions persistence, workers, campaigns, referrals, analytics, approvals, staff sessions, legal revisions | none | BACKEND_UNSUPPORTED | Must remain explicitly unavailable; no synthetic production fallback. |

`/admin-preview` is a real-data staging route by default. Synthetic data and browser-only operations require the explicit test-only build variable `VITE_ADMIN_DEMO=1`. Connected mutations call Fastify with CSRF, RBAC and step-up handling; every unconnected mutation remains disabled rather than simulated.
