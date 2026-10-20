# Handoff: rebuilding the Fortless app views with this kit

Scope of this phase: UI kit only. Nothing here touches the production `/app`, the Fastify backend, Stripe or Pterodactyl.

## How to start a view

1. Open the workbench (`npm run dev`) and find the component in `docs/COMPONENTS.md` (tiers show how far each is verified).
2. Compose from layer C (`src/features`) first, then layer B (`src/design-system`). Do not copy markup out of stories.
3. The view owns data fetching. Pass `loading`, `error`/`onRetry`, `empty`, and async callbacks. A rejected callback is shown by the component; do not swallow errors in the view.
4. Values the API did not return are rendered as a dash with a reason (see `MetricCard`). Never default them to 0.
5. Gate navigation with `AppShell`'s `can(permission)`; gate buttons by passing `disabled` + `disabledReason`.

## View to component map

| View | Start from |
|---|---|
| Dashboard | `MetricCard`, `ChartFrame` + `TimeSeriesChart` + `ChartLegend`, `ActivityFeed` |
| Servers & Instances | `DataTable` (+ `renderExpanded`), `ServerPowerToolbar`, `FilterBuilder` |
| Deploy Instance | `DeployConfigurator` (Quick/Custom) or `FormWizard` (`persistKey`) |
| Service: Console / Files / Players | `ServerConsole`, `FileExplorer`, `PlayerManagerTable` |
| Service: Databases / Schedules / Backups | `DatabaseList`, `ScheduleEditor`, `BackupList` |
| Domains & DNS | `DomainSearch`, `DNSRecordEditor` |
| Invoices & Billing | `InvoiceSummary`, `SubscriptionActions`, `PaymentMethodList` |
| Support Tickets | `DataTable`, `TicketConversation`, `Dropzone` |
| Audit Trail | `AuditTrail` |
| Security & Team | `TwoFactorSetup`, `PasskeyList`, `SessionList`, `ApiKeyManager`, `TeamMembers` |

## Not built (see `planned-*` stories)

Cart/Checkout, PricingTable, StartupVariablesEditor, NetworkAllocations, Announcements/KnowledgeBase, UsagePage (needs a metrics backend), NotificationPreferences. Build these when the first view needs them, composing existing pieces (RadioCardGroup, KeyValueEditor, DataTable, Switch).

## Known limits to plan around

- `DataTable` filters, sorts and paginates client-side. Server-driven mode is not implemented; use `FilterBuilder` rules as the request payload and replace `data` per page.
- Verification is Chromium only. Real iOS/Android devices, screen readers (NVDA/VoiceOver) and touch were not tested.
- `FormWizard.persistKey` uses sessionStorage and writes every value; never put secrets in wizard values.
- Bundle: xterm and CodeMirror are lazy, but the workbench main chunk is above 700 kB; app builds should import only what they use.
