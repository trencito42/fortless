# FORTLESS Frontend Routes Specification

## 1. Customer Application Routes (`public/app.html`)

All customer routes preserve deep-linking, History API navigation, browser forward/back buttons, and server-side authentication redirect to `/login?next=...`.

| Route Path | View / Page Component | Document Title | Primary API Endpoints | Petal Layout Primitives |
| :--- | :--- | :--- | :--- | :--- |
| `/app` | Dashboard (`servers`) | Instances — FORTLESS | `GET /api/v1/services` | `.grid.g4.keep2`, `.stat`, `.spark`, `.li.card.s2` |
| `/app/deploy` | Server Wizard (`deploy`) | Deploy Server — FORTLESS | `GET /api/v1/catalog/plans`, `GET /api/v1/catalog/regions`, `POST /api/v1/quotes`, `POST /api/v1/checkout` | `.deploy-layout`, `.z-pls`, `.z-plc`, `.summary-card` |
| `/app/billing` | Invoices & Subscriptions (`billing`) | Invoices & Billing — FORTLESS | `GET /api/v1/invoices`, `GET /api/v1/subscriptions`, `POST /api/v1/subscriptions/:id/cancel` | `.tbl`, `tr.mobile-record`, `.badge`, `.z-es` |
| `/app/support` | Support Conversations (`tickets`) | Support — FORTLESS | `GET /api/v1/tickets`, `GET /api/v1/tickets/:id`, `POST /api/v1/tickets`, `POST /api/v1/tickets/:id/messages`, `POST /api/v1/tickets/:id/attachments` | `.col`, `.li.card.s2`, `.message-list`, `.bubble`, `.prose`, `.att-chip` |
| `/app/activity` | Security Audit (`activity`) | Security Audit — FORTLESS | `GET /api/v1/audit` | `.z-aur`, `.z-aut`, `.z-aub`, `.mono` |
| `/app/settings` | Account & Security (`settings`) | Settings — FORTLESS | `GET /api/v1/auth/sessions`, `POST /api/v1/auth/password/change`, `GET /api/v1/account/members`, `POST /api/v1/account/members/invite`, `GET /api/v1/auth/passkeys` | `.grid.g2`, `.z-2f`, `.steps`, `.z-qr`, `.card` |
| `/app/services/:id` | Service Detail (`service-detail`) | Service Detail — FORTLESS | `GET /api/v1/services/:id`, `POST /api/v1/services/:id/power` | `.breadcrumb-bar`, `.gauge`, `.detail-pane`, `.split` |

---

## 2. Staff Admin Operations Routes (`public/admin.html`)

All staff admin routes enforce server-side RBAC validation and active MFA step-up verification.

| Route Path | View / Page Component | Document Title | Required RBAC Permission | Primary API Endpoints | Petal Layout Primitives |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/admin` | Overview (`overview`) | Operations Overview — FORTLESS | Staff Access | `GET /api/v1/admin/overview` | `.metrics`, `.split`, `.stack`, `.card` |
| `/admin/accounts` | Customer Accounts (`accounts`) | Customer Accounts — FORTLESS | `accounts:read` | `GET /api/v1/admin/accounts`, `GET /api/v1/admin/accounts/:id`, `PATCH /api/v1/admin/accounts/:id/status` | `.list-card`, `.records`, `.scrim`, `#modalAccountDetail` |
| `/admin/services` | Service Inventory (`services`) | Service Inventory — FORTLESS | `services:read` | `GET /api/v1/admin/services` | `.list-card`, `.records`, `.badge` |
| `/admin/tickets` | Support Queue (`tickets`) | Support Queue — FORTLESS | `tickets:read` | `GET /api/v1/admin/tickets`, `GET /api/v1/admin/tickets/:id`, `POST /api/v1/admin/tickets/:id/reply`, `PATCH /api/v1/admin/tickets/:id/status` | `.list-card`, `.message-list`, `.bubble.staff`, `.prose` |
| `/admin/audit` | Global Audit Trail (`audit`) | Global Audit Trail — FORTLESS | `audit:read` | `GET /api/v1/admin/audit` | `.records`, `.mono`, `.faint` |
| `/admin/staff` | Staff Directory (`staff`) | Staff Directory — FORTLESS | `staff:read` (mutations: `OWNER`) | `GET /api/v1/admin/staff`, `PATCH /api/v1/admin/staff/:id` | `.records`, `#modalStaffEditor`, `#modalStepUp` |

---

## 3. Global Universal Commands (`Ctrl+K` / `⌘K`)

| Route Category | Search Query Results | Execution Action |
| :--- | :--- | :--- |
| **Navigation** | Instances, Deploy, Billing, Support, Activity, Settings | Deep-link History navigation via client router |
| **Services** | Instance name, IP address, plan name, provider identifier | Navigates to `/app/services/:id` |
| **Tickets** | Ticket subject, ticket ID | Opens ticket inspection modal `#ticketModal` |
| **Invoices** | Fiscal invoice number (`INV-2026-XXXXX`), status | Navigates to `/app/billing` |
| **Actions** | Open Ticket, Launch Wizard, Toggle Theme | Triggers modal or state handler |
| **Admin Operations** | Accounts, Overview, Staff, Audit (Staff Only) | Navigates to staff admin route (filtered by permissions) |
