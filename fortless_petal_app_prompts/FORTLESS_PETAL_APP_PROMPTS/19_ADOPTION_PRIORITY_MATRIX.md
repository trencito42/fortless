# Petal widget adoption priority matrix

| Fortless experience | Original Petal sources/examples to inspect | Required real binding |
|---|---|---|
| Global shell | Navigation > Command palette, Keyboard keys, Breadcrumbs; Workspace > Collapsible sidebar; Mobile > Bottom tab bar | Route registry, authorized server-side resource search and command actions |
| Account overview | Data > Stat tiles, Timeline; Charts > Area, Bar, Donut, Sparklines, Gauge; Onboarding > Checklist; Workspace > Draggable widgets | `/api/v1/services`, invoices, tickets, audit; telemetry only if provider supports |
| Service details | Data > Key-value, Code block, File rows; Workspace > Split view; Feedback > Status, Progress | Tenant-safe service/provider endpoints, observed state and logs |
| Deploy | Forms pro > Multi-step wizard, Repeater, Money; Selection > Option cards; Dropdowns > Searchable select; Navigation > Stepper | Catalog, availability, backend-authoritative quote, sandbox checkout |
| Billing | Account & business > Invoices, Upgrade/downgrade; Data > Payment card/Table; Date > Range | Actual invoice/subscription/payment state and documents |
| Support | Communication > Multi-conversation inbox / Comments; Forms > Rich text; Inputs > File upload; Data > Chat bubbles | DB threads, safe Markdown, authorized file storage, staff actions |
| Activity | Account > Filterable audit; Data > Timeline; Date > Range; Data & tables > Saved filters | DB audit events, server-side filters, CSV-safe export |
| Settings | Account > Two-factor QR, Active sessions, API keys; Forms > password fields; Feedback > Alerts | Preserve `.z-2f`, real MFA, roles, sessions, scoped keys |
| Notifications | Social & content > Grouped notifications; Overlays > Popover; Data > Notification items | Real recipient scoped event store and read state |
| Admin | Data & tables > Editable grid, Bulk actions; Workspace > Contextual command bar; Overlay > Dialogs | RBAC, audited status actions, service/ticket/customer ops |
| Catalog admin | Forms pro > Wizard, Repeater, Sortable; Data > Pricing and table; Dropdowns > Multi-select | Versioned plans, resources, region, capacity, secure pricing |
| Operational monitoring | Charts pro > Live mini chart / Dual axis; Feedback > Status; Data > Timeline | Actual telemetry, queue/error-state, provider staging |

**Important:** The gallery demonstrates components, not actual Fortless business records or a licensed production backend. Demo arrays (`PEOPLE`, generated `series()`, sample chart values, fake toasts) must NEVER be used as user data. A widget with no genuine backend data must show a Petal empty/pending state.
