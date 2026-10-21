# React Admin — view matrix

Branch `feat/react-admin-ui` · app in `frontend-react/src/admin/` · available through the independently gated `/admin-preview/*` staging route and through `/admin/*` only when `FORTLESS_REACT_ADMIN_UI=1`.
The legacy `/admin` HTML console remains the default rollback path. Live mode uses authoritative Fastify responses and never falls back to fixtures. Synthetic fixture mode is restricted to builds with `VITE_ADMIN_DEMO=1`; the historical UI inventory below still describes that fixture implementation, while [REACT_ADMIN_API_MATRIX.md](./REACT_ADMIN_API_MATRIX.md) is authoritative for live integration status.

## Status vocabulary

| Label | Meaning |
|---|---|
| `IMPLEMENTED_UI` | Real route and working interface: filters, tabs, dialogs, validation, state transitions in demo data. Not a title plus placeholder. |
| `PARTIAL_UI` | UI exists but a part is deliberately missing. None at the moment. |
| `NOT_STARTED` | Not built. None at the moment. |
| `NEEDS_BACKEND` | The screen works on demo data; the live endpoint or read model does not exist yet (last column). |
| `VERIFIED_IN_BROWSER` | Opened in Chromium at desktop, tablet and mobile (light and dark sampled), with no console error and no horizontal overflow, by `tests-admin/admin-preview.spec.ts`, plus the functional tests listed below. Verification tier for all views: **`[MOCK_ONLY]`** — nothing was run against a real backend or provider. |

77 views, 85 route patterns. In live mode, supported routes are handled by `src/admin/live/LiveOutlet.tsx`; unsupported routes show an explicit backend-integration state and no invented numbers.

## Views

| ID | View | Route | Source / backend reference | Main components | UI state | Live backend |
|---|---|---|---|---|---|---|
| A1 | Dashboard | `/` | `pages/overview`, `GET /api/v1/admin/overview` | KpiGrid, MetricCard, ChartFrame+TimeSeriesChart, SegmentedControl, CapacityBar, ActivityFeed | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Partial: `/overview` returns counts only; revenue, MRR, trends, capacity roll-up need new read models |
| A2 | Action Center (+ detail) | `/actions`, `/actions/:id` | new; derives from `jobs`, `payments/inbox`, `tickets`, `capacity` | ResourceTable, KpiGrid, Timeline, NotesPanel, ActionDialog | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: no unified queue, assignment or history store |
| B1 | Customers list | `/customers` | `pages/accounts`, `GET /admin/accounts` | ResourceTable (segments, filters, FilterBuilder, saved views, bulk), MoneyByCurrency | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | List exists; risk, outstanding, services count and tags need computed fields |
| B2 | Customer 360 | `/customers/:id/:tab` | `GET /admin/accounts/:id` | DetailTabs ×10, RelatedTable, Timeline, Section/Fact | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Detail exists; subscriptions, members, security events, activity need joins |
| B3 | Customer operations | dialogs on B2 | `PATCH …/status`, `POST …/notes`, `PUT …/billing-profile` | ActionDialog (permission, step-up, reason), NotesPanel | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | status, notes, billing-profile exist. Restrictions, verification request, member ops, reset link: NEEDS_BACKEND |
| C1 | Services inventory | `/services` | `pages/services`, `GET /admin/services` | ResourceTable, Status (lifecycle ≠ runtime ≠ provider sync) | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | List exists; node, sync state and billing columns need joins |
| C2 | Service detail | `/services/:id/:tab` | `GET /admin/services/:id` | DetailTabs ×10, UsageMeter, LogViewer, TimeSeriesChart, provider diff table | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Detail exists; provider diff, metrics history, access list need provider reads |
| C3 | Service operations | tab Operations | `POST …/power`, `suspend`, `unsuspend`, `terminate`, `relink`, `sync` | ActionDialog via useServiceOps | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | power, suspend, unsuspend, terminate, relink, sync exist. Reinstall, rebuild, change plan, limits, recovery: NEEDS_BACKEND |
| C4 | Node migration workflow | `/services/:id/migrate` | new | FormWizard, TaskProgress, CapacityBar | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: no migration job type; rollback semantics must be designed |
| D1 | Orders list | `/orders` | `GET /admin/orders` | ResourceTable; DRAFT … CANCELED terminology from `checkout.ts` | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists; payment/fulfillment sub-states need exposing |
| D2 | Order detail | `/orders/:id` | `GET /admin/orders/:id` | Section ×3 (payment ≠ fulfillment ≠ provisioning), Timeline, RelatedTable | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists; jobs and payments need joins |
| D3 | Order intervention | dialogs on D2 | `POST /admin/jobs/:type/:id/retry` | ActionDialog (reconcile, retry, fraud review, cancel) | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | retry exists. Reconcile by correlation tag, fraud review, staff cancel: NEEDS_BACKEND |
| E1 | Billing overview | `/billing` | new | KpiGrid, ChartFrame ×2, per-currency totals | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: aggregates by currency |
| E2 | Invoices | `/billing/invoices` | `GET /admin/invoices` | ResourceTable | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists |
| E3 | Invoice detail | `/billing/invoices/:id` | `GET /admin/invoices/:id`, `POST …/refund` | Section, RelatedTable, ActionDialog (refund, credit note, void) | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | detail and refund exist. Void, uncollectible, reminder, credit-note creation: NEEDS_BACKEND (credit notes list exists) |
| E4 | Transactions & payments | `/billing/transactions(/:id)` | `POST /admin/payments/inbox/:id/retry` | ResourceTable, webhook evidence | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: payments list/detail endpoint; retry exists |
| E5 | Subscriptions & renewals | `/billing/subscriptions` | `POST /admin/billing/process-renewals` | ResourceTable, Switch, ActionDialog | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: subscription list, grace extension, cancel |
| E6 | Refunds & credit notes (+ detail) | `/billing/refunds(/:id)` | `GET /admin/credit-notes`, `POST …/refund` | ResourceTable, Timeline, four-eyes check | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Credit notes list exists. Approval workflow: NEEDS_BACKEND |
| E7 | Reports | `/billing/reports` | new | SegmentedControl, ChartFrame, CSV export (client-side) | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: report queries |
| F1 | Catalog | `/products` | `GET /admin/catalog/products`, `PATCH …/publish` | ResourceTable, Switch + ActionDialog | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists |
| F2 | Product editor | `/products/:id`, `/products/new` | `POST/PUT /admin/catalog/products` | useForm validation, TagInput, NumberField | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists |
| F3 | Plans & Plan Builder | `/products/plans`, `/products/plans/:id` | `POST /admin/catalog/plans`, `PATCH …/status`, `PUT …/options` | Section, NumberField, price matrix, options editor, preview | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists; versioning semantics mirrored |
| F4 | Pricing rules | `/products/pricing` | `src/modules/pricing/quote.ts` (VAT table, reverse charge) | ResourceTable, Switch | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Read-only concept: rules are code; editable rules NEEDS_BACKEND |
| F5 | Coupons & promotions | `/products/coupons` | `GET/POST /admin/catalog/coupons` | CouponManager (shared with L3) | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Create/list exist; enable/disable NEEDS_BACKEND |
| F6 | Provider inventory | `/products/inventory` | `GET /admin/providers/pterodactyl/inventory` | RelatedTable, KpiGrid | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists (read-only) |
| G1 | Infrastructure overview | `/infrastructure` | `GET /admin/capacity` | KpiGrid, CapacityBar | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Capacity exists |
| G2 | Nodes | `/infrastructure/nodes` | `GET /admin/capacity` | ResourceTable | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists |
| G3 | Node detail | `/infrastructure/nodes/:id/:tab` | capacity + services joins | DetailTabs ×8, CapacityBar | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Needs per-node usage vs allocation fields |
| G4 | Capacity & profitability | `/infrastructure/capacity` | new | RelatedTable; margin only when cost known | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: node cost field |
| G5 | IPs & allocations | `/infrastructure/allocations` | provider inventory | ResourceTable, ActionDialog | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: local allocation ledger |
| G6 | Node maintenance | `/infrastructure/maintenance` | `PATCH /admin/infrastructure/nodes/:id/maintenance` | ActionDialog (reason, drain, window) | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists; drain flag and window are extensions |
| G7 | Provider connections | `/infrastructure/providers` | settings + status | ConnectionCard (masked secrets) | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: connection health endpoint |
| H1 | Job queue | `/provisioning/jobs` | `GET /admin/jobs`, `POST …/retry` | ResourceTable, retry guard for unknown outcome | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists; manual-review/dead-letter statuses to confirm |
| H2 | Job detail | `/provisioning/jobs/:id` | jobs | LogViewer, Timeline, ActionDialog | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Needs log and attempt history |
| H3 | Order → service timeline | `/provisioning/timeline` | new | six-stage pipeline | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: correlation read model |
| H4 | Workers | `/provisioning/workers` | new | ResourceTable, KpiGrid | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: worker heartbeats |
| H5 | Webhook events | `/provisioning/webhooks` | `payments/inbox` | ResourceTable, DetailPanel | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Inbox exists; list endpoint NEEDS_BACKEND |
| I1 | Monitoring overview | `/monitoring` | status module | Notice, KpiGrid | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Partial |
| I2 | Component health | `/monitoring/components` | `PATCH /admin/components/:id` | ResourceTable, Switch, ActionDialog | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists |
| I3 | Incidents (+ detail) | `/monitoring/incidents(/:id)` | `POST /admin/incidents`, `…/updates` | ResourceTable, Timeline, NotesPanel | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Create/update exist; list/detail partial |
| I4 | Incident editor | `/monitoring/incidents/new`, `/:id/edit` | same | CheckboxGroup, public-text leak check | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists; internal notes NEEDS_BACKEND |
| I5 | Scheduled maintenance | `/monitoring/maintenance(/:id)` | new | calendar grid + list, DateField | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: maintenance windows |
| I6 | Public status management | `/monitoring/public` | status module | public preview, banner | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Partial |
| J1 | Support inbox | `/support` | `GET /admin/tickets`, `support/meta` | ResourceTable, SLA badges | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists |
| J2 | Ticket conversation | `/support/tickets/:id` | `GET …/:id`, `reply`, `status`, `routing` | Dropzone, SplitButton, macros, internal notes | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | reply/status/routing/attachments exist; ai-assist exists but is not wired |
| J3 | Departments | `/support/departments` | `POST /admin/support/departments` | ActionDialog form, CheckboxGroup | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Create exists; edit NEEDS_BACKEND |
| J4 | Macros | `/support/macros` | `POST /admin/support/macros` | ActionDialog form, live preview | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Create exists; edit/delete NEEDS_BACKEND |
| J5 | Support performance | `/support/performance` | new | SegmentedBar, ChartFrame | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: metrics |
| K1 | Content overview | `/content` | content module | KpiGrid | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Partial |
| K2 | Knowledge base (+ editor) | `/content/knowledge(/:id)` | `/admin/content/articles`, categories | Markdown editor + preview, SEO snippet | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists; SEO fields to confirm |
| K3 | Announcements | `/content/announcements` | `/admin/content/announcements` | ActionDialog form, DateField | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists |
| K4 | Marketing pages | `/content/pages` | new | field table, ActionDialog | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: page fields store |
| K5 | Legal pages (+ detail) | `/content/legal(/:id)` | new | DiffViewer, revisions, version bump | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: legal documents with revisions |
| L1 | Marketing overview | `/marketing` | coupons | KpiGrid | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Partial |
| L2 | Campaigns | `/marketing/campaigns` | new | ResourceTable, ActionDialog | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND (and no bulk email capability) |
| L3 | Promotions & coupons | `/marketing/promotions` | coupons | CouponManager | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | See F5 |
| L4 | Referrals & affiliates | `/marketing/referrals` | — | disabled form, Unsupported notice | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NOT SUPPORTED: no model. UI shows structure only |
| L5 | Conversion analytics | `/marketing/analytics` | orders | order funnel; MetricCard `unavailable` | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NOT SUPPORTED: no visitor analytics |
| M1 | Staff directory | `/staff` | `GET/POST/PATCH /admin/staff` | ResourceTable, ActionDialog (self-change and last-owner rules) | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists |
| M2 | Staff detail | `/staff/directory/:id` | staff | DescriptionList, sessions | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Sessions NEEDS_BACKEND |
| M3 | Roles & permissions matrix | `/staff/roles` | `src/modules/admin/access.ts` | matrix table, planned permissions | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Roles are code; editable roles not planned |
| M4 | Approval requests | `/staff/approvals` | new | ResourceTable, four-eyes | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: approval workflow |
| M5 | Staff sessions & security | `/staff/sessions` | new | ResourceTable | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND: session listing/revocation |
| N1 | Audit explorer | `/audit` | `GET /admin/audit`, `…/export` | ResourceTable, CSV export (step-up) | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists |
| N2 | Audit event detail | `/audit/events/:id` | audit | before/after, correlation siblings | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Partial |
| N3 | Security events | `/audit/security` | new | ResourceTable | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND |
| N4 | Admin access history | `/audit/access` | audit filtered | ResourceTable | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Derivable from audit |
| N5 | Security policy | `/audit/policy` | new | control list with evidence | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Static knowledge + live staff MFA state |
| O1 | General | `/settings` | `GET /admin/settings` | useForm | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Read exists; write NEEDS_BACKEND |
| O2 | Authentication & security | `/settings/auth` | settings | NumberField, Switch, TagInput | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND (env-managed today) |
| O3 | Payments | `/settings/payments` | settings | masked credentials, verification | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Read-only values; verification NEEDS_BACKEND |
| O4 | Email | `/settings/email` | `…/email-templates`, `test-smtp`, `email-deliveries/:id/resend` | tabs, template editor | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | Exists |
| O5 | Integrations (+ detail) | `/settings/integrations(/:id)` | new | ConnectionCard | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND |
| O6 | Feature flags | `/settings/flags` | new | Switch, SliderField, ActionDialog | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND |
| O7 | Notifications | `/settings/notifications` | new | Switch matrix | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND |
| O8 | Localization | `/settings/localization` | new | Select, Switch | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND |
| O9 | Maintenance & system health | `/settings/system` | new | Notice, scheduled tasks | IMPLEMENTED_UI · VERIFIED_IN_BROWSER | NEEDS_BACKEND |

## Route inventory

Permissions are the real backend permission names (`src/modules/admin/access.ts`); the shell hides navigation the active preview role lacks and the route guard shows an explanation.

| Route | Permission | Page module (`src/admin/pages/…`) |
|---|---|---|
| `/admin-preview` | `admin:access` | `overview/Dashboard.tsx` |
| `/admin-preview/customers` | `accounts:read` | `customers/CustomerList.tsx` |
| `/admin-preview/customers/:id/:tab?` | `accounts:read` | `customers/Customer360.tsx` |
| `/admin-preview/services` | `services:read` | `services/ServiceList.tsx` |
| `/admin-preview/services/:id/migrate` | `services:read` | `services/MigrationWizard.tsx` |
| `/admin-preview/services/:id/:tab?` | `services:read` | `services/ServiceDetail.tsx` |
| `/admin-preview/orders` | `accounts:read` | `orders/OrderList.tsx` |
| `/admin-preview/orders/:id` | `accounts:read` | `orders/OrderDetail.tsx` |
| `/admin-preview/billing` | `accounts:read` | `billing/BillingOverview.tsx` |
| `/admin-preview/billing/invoices` | `accounts:read` | `billing/InvoiceList.tsx` |
| `/admin-preview/billing/invoices/:id` | `accounts:read` | `billing/InvoiceDetail.tsx` |
| `/admin-preview/billing/transactions` | `accounts:read` | `billing/TransactionList.tsx` |
| `/admin-preview/billing/transactions/:id` | `accounts:read` | `billing/TransactionDetail.tsx` |
| `/admin-preview/billing/subscriptions` | `accounts:read` | `billing/SubscriptionList.tsx` |
| `/admin-preview/billing/refunds` | `accounts:read` | `billing/RefundList.tsx` |
| `/admin-preview/billing/refunds/:id` | `accounts:read` | `billing/RefundDetail.tsx` |
| `/admin-preview/billing/reports` | `accounts:read` | `billing/Reports.tsx` |
| `/admin-preview/products` | `catalog:read` | `products/ProductCatalog.tsx` |
| `/admin-preview/products/plans` | `catalog:read` | `products/PlanList.tsx` |
| `/admin-preview/products/plans/:id` | `catalog:read` | `products/PlanBuilder.tsx` |
| `/admin-preview/products/pricing` | `catalog:read` | `products/PricingRules.tsx` |
| `/admin-preview/products/coupons` | `catalog:read` | `products/Coupons.tsx` |
| `/admin-preview/products/inventory` | `catalog:read` | `products/ProviderInventory.tsx` |
| `/admin-preview/products/:id` | `catalog:read` | `products/ProductEditor.tsx` |
| `/admin-preview/actions` | `admin:access` | `actions/ActionCenter.tsx` |
| `/admin-preview/actions/:id` | `admin:access` | `actions/ActionDetail.tsx` |
| `/admin-preview/infrastructure` | `services:read` | `infrastructure/InfraOverview.tsx` |
| `/admin-preview/infrastructure/nodes` | `services:read` | `infrastructure/NodeList.tsx` |
| `/admin-preview/infrastructure/nodes/:id/:tab?` | `services:read` | `infrastructure/NodeDetail.tsx` |
| `/admin-preview/infrastructure/capacity` | `services:read` | `infrastructure/Capacity.tsx` |
| `/admin-preview/infrastructure/allocations` | `services:read` | `infrastructure/Allocations.tsx` |
| `/admin-preview/infrastructure/maintenance` | `services:read` | `infrastructure/NodeMaintenance.tsx` |
| `/admin-preview/infrastructure/providers` | `services:read` | `infrastructure/Providers.tsx` |
| `/admin-preview/provisioning` | `audit:read` | `provisioning/JobQueue.tsx` |
| `/admin-preview/provisioning/jobs` | `audit:read` | `provisioning/JobQueue.tsx` |
| `/admin-preview/provisioning/jobs/:id` | `audit:read` | `provisioning/JobDetail.tsx` |
| `/admin-preview/provisioning/timeline` | `audit:read` | `provisioning/OrderTimeline.tsx` |
| `/admin-preview/provisioning/workers` | `audit:read` | `provisioning/Workers.tsx` |
| `/admin-preview/provisioning/webhooks` | `audit:read` | `provisioning/Webhooks.tsx` |
| `/admin-preview/monitoring` | `services:read` | `monitoring/MonitoringOverview.tsx` |
| `/admin-preview/monitoring/components` | `services:read` | `monitoring/Components.tsx` |
| `/admin-preview/monitoring/incidents` | `services:read` | `monitoring/IncidentList.tsx` |
| `/admin-preview/monitoring/incidents/new` | `services:read` | `monitoring/IncidentEditor.tsx` |
| `/admin-preview/monitoring/incidents/:id/edit` | `services:read` | `monitoring/IncidentEditor.tsx` |
| `/admin-preview/monitoring/incidents/:id` | `services:read` | `monitoring/IncidentDetail.tsx` |
| `/admin-preview/monitoring/maintenance` | `services:read` | `monitoring/MaintenanceList.tsx` |
| `/admin-preview/monitoring/maintenance/:id` | `services:read` | `monitoring/MaintenanceEditor.tsx` |
| `/admin-preview/monitoring/public` | `services:read` | `monitoring/PublicStatus.tsx` |
| `/admin-preview/support` | `tickets:read` | `support/Inbox.tsx` |
| `/admin-preview/support/tickets/:id` | `tickets:read` | `support/TicketConversation.tsx` |
| `/admin-preview/support/departments` | `tickets:read` | `support/Departments.tsx` |
| `/admin-preview/support/macros` | `tickets:read` | `support/Macros.tsx` |
| `/admin-preview/support/performance` | `tickets:read` | `support/Performance.tsx` |
| `/admin-preview/content` | `content:read` | `content/ContentOverview.tsx` |
| `/admin-preview/content/knowledge` | `content:read` | `content/KnowledgeList.tsx` |
| `/admin-preview/content/knowledge/:id` | `content:read` | `content/KnowledgeEditor.tsx` |
| `/admin-preview/content/announcements` | `content:read` | `content/Announcements.tsx` |
| `/admin-preview/content/pages` | `content:read` | `content/MarketingPages.tsx` |
| `/admin-preview/content/legal` | `content:read` | `content/LegalList.tsx` |
| `/admin-preview/content/legal/:id` | `content:read` | `content/LegalDetail.tsx` |
| `/admin-preview/marketing` | `content:read` | `marketing/MarketingOverview.tsx` |
| `/admin-preview/marketing/campaigns` | `content:read` | `marketing/Campaigns.tsx` |
| `/admin-preview/marketing/promotions` | `content:read` | `marketing/Promotions.tsx` |
| `/admin-preview/marketing/referrals` | `content:read` | `marketing/Referrals.tsx` |
| `/admin-preview/marketing/analytics` | `content:read` | `marketing/ConversionAnalytics.tsx` |
| `/admin-preview/staff` | `staff:read` | `staff/StaffDirectory.tsx` |
| `/admin-preview/staff/directory/:id` | `staff:read` | `staff/StaffDetail.tsx` |
| `/admin-preview/staff/roles` | `staff:read` | `staff/RolesMatrix.tsx` |
| `/admin-preview/staff/approvals` | `staff:read` | `staff/Approvals.tsx` |
| `/admin-preview/staff/sessions` | `staff:read` | `staff/StaffSessions.tsx` |
| `/admin-preview/audit` | `audit:read` | `audit/AuditExplorer.tsx` |
| `/admin-preview/audit/events/:id` | `audit:read` | `audit/AuditEventDetail.tsx` |
| `/admin-preview/audit/security` | `audit:read` | `audit/SecurityEvents.tsx` |
| `/admin-preview/audit/access` | `audit:read` | `audit/AccessHistory.tsx` |
| `/admin-preview/audit/policy` | `audit:read` | `audit/SecurityPolicy.tsx` |
| `/admin-preview/settings` | `admin:access` | `settings/General.tsx` |
| `/admin-preview/settings/auth` | `admin:access` | `settings/Auth.tsx` |
| `/admin-preview/settings/payments` | `admin:access` | `settings/Payments.tsx` |
| `/admin-preview/settings/email` | `admin:access` | `settings/Email.tsx` |
| `/admin-preview/settings/integrations` | `admin:access` | `settings/Integrations.tsx` |
| `/admin-preview/settings/integrations/:id` | `admin:access` | `settings/IntegrationDetail.tsx` |
| `/admin-preview/settings/flags` | `admin:access` | `settings/Flags.tsx` |
| `/admin-preview/settings/notifications` | `admin:access` | `settings/Notifications.tsx` |
| `/admin-preview/settings/localization` | `admin:access` | `settings/Localization.tsx` |
| `/admin-preview/settings/system` | `admin:access` | `settings/System.tsx` |

## Behaviour that is shared on purpose

- **Permissions**: profile menu → *View as role* switches OWNER / ADMINISTRATOR / BILLING / SUPPORT / INFRASTRUCTURE / AUDITOR. Navigation, routes and buttons follow the real permission map; a disabled button names the missing permission.
- **Sensitive actions** (`ActionDialog`): shows the permission the real endpoint needs, whether step-up is required (simulated with an explicit button, never a fake code), a reason that goes into the preview audit log, optional typed confirmation, and the sentence “nothing was sent to Stripe, Pterodactyl, email or customers”.
- **Preview audit**: every confirmed action appends an event marked `preview` to the audit log, so what would be recorded can be reviewed.
- **List states**: profile menu → *List state* forces loading, error or empty on every list.
- **Separations kept visible**: contract lifecycle vs runtime vs provider sync (services); payment vs fulfillment vs provisioning (orders); invoice total vs paid vs balance vs refunded; sold vs physical vs measured capacity; incident status vs component health; client vs account.
- **Money**: integer minor units, one currency per record, totals always per currency (EUR, USD, RON are never added).
- **Unknown outcome rule**: a job with an unknown provider outcome cannot be retried until it is reconciled by correlation tag.
- **No credential handling**: staff never see or set customer passwords; provider secrets appear only masked; there is no reveal control.

## Reused design-system components (57)

ActionMenu, ActivityFeed, Avatar, Badge, Breadcrumbs, Button, Card/CardHeader, ChartFrame, Checkbox/CheckboxGroup/RadioGroup, CommandPalette, DataTable, DateField, DescriptionList, DetailPanel, Dialog, DiffViewer, Dropzone, EmptyState, FilterBuilder, FormWizard, Icon, IconButton, Kbd, LogViewer, LogoMark, MetricCard, MobileNavigationSheet, NavTree, Notice, NumberField, Popover, SearchField, SegmentedBar, SegmentedControl, Select, Skeleton, SliderField, SplitButton, StatusBadge, Switch, Tabs, TagInput, TaskProgress, TextField/Textarea, TimeSeriesChart, Timeline, Tooltip, plus `applyFilters`, `isActiveRule`, `filterNav`, `useMediaQuery`, `useTheme`, `useCommandPaletteShortcut`.
Not needed by any admin view: TreeView, FileExplorer, CodeEditor, Toolbar, FloatingActionBar, ContextMenu (row menus use ActionMenu; right-click menus are not implemented).

### Small extensions made to the shared kit (backwards compatible)

`CommandPalette`: `maxResults`, `idleFilter` (large record indexes). `NavTree`: `label`. `DataTable`: `hideSinglePagePager`, single-column grid so phone cards cannot overflow. `ChartFrame`: `role="group"` instead of `img` (a focusable chart inside `img` failed axe `nested-interactive`). `MetricCardProps` exported.

## New reusable components (this app)

Shell: `AdminShell`, `AdminSidebar` (collapsible groups), `AdminNotifications`, `AdminCommandPalette`, `ToastHost`.
Pages and layout: `AdminPage` (+ `HeaderCrumbs`), `Section`, `KpiGrid`, `Split`, `Columns`, `Fact`/`FactGrid`, `DetailTabs`, `RelatedTable`, `ResourceTable` (segments, select filters, date range, advanced rules, saved views, bulk, row menus, forced states), `col`/`nw` column helpers.
Domain: `ActionDialog`/`useActionDialog`, `NotesPanel`, `CapacityBar`, `UsageMeter`, `ConnectionCard`, `CouponManager`, `Status` (+ 30 status maps), `EntityLink` family (customer, service, order, invoice, node, ticket, job, payment, staff), `MoneyText`/`MoneyByCurrency`, `PreviewNote`/`Unsupported`/`NoAccess`.
Hooks and ops: `useForm`, `useIndex`, `useCustomerStats`, `useSettings`, `useServiceOps`, `useBillingOps`, `useNodeOps`, `useJobOps`, `useActionOps`, `useTicketOps`, `useStaffOps`, `useComponentOps`.

## Verification (what was run)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run test:admin-fixtures` (cross references, integer money, one currency per record, node allocation = sum of hosted services, no duplicate allocation) | pass |
| `npm run test:admin` (Playwright, Chromium) | 32 tests: all routes at 3 viewports with no console error and no overflow; shell, palette, permissions, lists, forced states, operations, a11y (axe wcag2a/2aa on 11 pages) |
| Production build without the flag (`--outDir` outside the repo) | contains no admin code and no `/admin-preview` string |
| Production build with `VITE_ADMIN_PREVIEW=1` served by `vite preview` | admin renders from the built bundle |

Screenshots: `docs/admin-screenshots/` (`0-interactions`, `1-foundation` … `5-system`; desktop light for every sampled route, dark/tablet/mobile sampled).

## Known limitations

- State is in memory: a full page load resets demo data (client-side navigation keeps it).
- Step-up, approvals, jobs, audit and all “provider” effects are simulated; no endpoint is called.
- Right-click context menus, drag-and-drop reordering and real file upload (tickets) are not implemented.
- Provider metrics series are deterministic samples labelled as such.
- Mobile uses the shared bottom sheet for the full navigation (not a left drawer).
- No axe pass over every route; 11 representative pages are covered.

## Recommended integration order

1. **Read-only first**: dashboard aggregates, customers, services, orders, invoices, audit, jobs, tickets, content (endpoints exist or need joins only).
2. **Account and service operations** that already have endpoints: status, notes, billing profile, suspend/unsuspend/terminate/power/sync/relink, refunds, ticket reply/status/routing, incidents, component health, node maintenance — keep `requireRecentStepUp` and the audit write.
3. **Money correctness**: payments list/detail, webhook inbox listing, reconciliation read model, credit notes, subscription list.
4. **Provisioning reliability**: order → job correlation view, reconcile-by-tag, worker heartbeats.
5. **Catalog authoring** with the existing versioned plan endpoints; pricing rules stay code until a tax-provider decision.
6. **New domains** (approvals, sessions, maintenance windows, legal documents, marketing page fields, feature flags, settings writes, node cost, allocation ledger).
7. **Not before a product decision**: referrals/affiliates, conversion analytics, bulk campaign email, service migration and rebuild/reinstall.
Release gate: enable `react_admin` only for staff, behind a flag, after items 1–2 pass against a sandbox (`[SANDBOX_VERIFIED]`).
