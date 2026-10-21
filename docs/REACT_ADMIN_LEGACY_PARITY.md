# React Admin legacy parity

| Old feature | Old code/API | New React route | Real API | Verified |
|---|---|---|---|---|
| Dashboard | legacy overview | `/admin` | `/api/v1/admin/overview` | LIVE_READ, build verified |
| Accounts | legacy accounts pages | `/admin/customers*` (legacy `/admin/accounts/:id` retained by server shell) | accounts endpoints | NOT VERIFIED in live React |
| Services | legacy service inventory/detail/actions | `/admin/services*` | services endpoints | NOT VERIFIED in live React |
| Orders | legacy orders | `/admin/orders*` | orders endpoints | NOT VERIFIED in live React |
| Billing/refunds | legacy billing | `/admin/billing*` | invoices/credit-notes/refund | NOT VERIFIED in live React |
| Infrastructure/catalog | legacy modules | `/admin/infrastructure*`, `/admin/products*` | capacity/catalog endpoints | NOT VERIFIED in live React |
| Tickets | legacy tickets | `/admin/support*` | ticket endpoints | NOT VERIFIED in live React |
| Jobs | legacy jobs | `/admin/provisioning*` | job endpoints | NOT VERIFIED in live React |
| Staff/audit/content/status/settings | legacy modules | matching React sections | existing Admin endpoints | NOT VERIFIED in live React |

The legacy UI remains the active rollback path while `FORTLESS_REACT_ADMIN_UI` is disabled. Critical parity is not yet achieved, therefore production cutover is prohibited.
