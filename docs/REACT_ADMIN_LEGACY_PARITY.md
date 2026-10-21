# React Admin legacy parity

| Old feature | Old code/API | New React route | Real API | Verified |
|---|---|---|---|---|
| Dashboard | legacy overview | `/admin` | `/api/v1/admin/overview` | LIVE_READ · local real-data browser verified |
| Accounts | legacy accounts pages | `/admin/customers*` (legacy `/admin/accounts/:id` retained by server shell) | accounts list/detail/status/notes | LIVE_WRITE · local real-data browser verified; billing-profile editor pending |
| Services | legacy service inventory/detail/actions | `/admin/services*` | services list/detail/power/lifecycle/sync | LIVE_WRITE · local real-data browser verified; relink UI pending |
| Orders | legacy orders | `/admin/orders*` | orders list/detail | LIVE_READ · local real-data browser verified |
| Billing/refunds | legacy billing | `/admin/billing*` | invoices/transactions/subscriptions/refunds/credit-notes/refund | LIVE_WRITE · local real-data browser verified; renewals and credit-note authoring pending |
| Infrastructure | legacy capacity/nodes | `/admin/infrastructure*` | capacity/maintenance/reconcile | LIVE_WRITE · local real-data browser verified |
| Catalog | legacy catalog | `/admin/products*` | catalog/products/coupons/provider inventory | LIVE_READ · local real-data browser verified; authoring controls pending |
| Tickets | legacy tickets | `/admin/support*` | tickets/meta/reply/status | LIVE_WRITE · local real-data browser verified; routing/attachments/meta authoring pending |
| Jobs | legacy jobs | `/admin/provisioning*` | jobs/retry | LIVE_WRITE · local real-data browser verified |
| Staff | legacy staff | `/admin/staff*` | staff list/grant/update | LIVE_WRITE · local real-data browser verified |
| Audit | legacy audit | `/admin/audit*` | audit list | LIVE_READ · local real-data browser verified; export pending |
| Content | legacy content | `/admin/content*` | content/categories/articles/announcements | LIVE_WRITE · local real-data browser verified; remaining edit/delete controls pending |
| Status | legacy status | `/admin/monitoring*` | status/components/incidents | LIVE_WRITE · local real-data browser verified |
| Settings | legacy settings | `/admin/settings*` | safe settings/email reads | LIVE_READ · local real-data browser verified; protected writes pending |

The legacy UI remains the active rollback path while `FORTLESS_REACT_ADMIN_UI` is disabled. The pending rows above prevent production cutover. “Local real-data browser verified” means the production build was exercised against an isolated Fastify process and the development database; it is not public-staging or production verification.
