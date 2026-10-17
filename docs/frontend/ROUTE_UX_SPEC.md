# Client Route UX Specification

| Route | Product purpose | Primary real sources | State |
|---|---|---|---|
| `/app` | Customer command center | services, tickets, invoices, audit | Implemented first redesign slice |
| `/app/services` | Service inventory | `/api/v1/services` | Implemented; filter/density polish pending |
| `/app/services/:id` | Authorized service detail | `/api/v1/services/:id` | Existing; capability-tab audit pending |
| `/app/deploy` | Catalog/configuration/authoritative quote | catalog, quote, capabilities | Existing; Petal wizard redesign pending |
| `/app/domains` | Registrar search vs authoritative DNS zones | domain/DNS APIs | Existing; UX truth-label refinement pending |
| `/app/domains/:id` | Zone/domain details | domain/DNS APIs | Planned; do not imply registration |
| `/app/billing` | Invoice/subscription inventory | invoice/subscription APIs | Existing; invoice detail route pending |
| `/app/billing/invoices/:id` | Issued invoice detail | invoice API/download | Planned |
| `/app/support` | Search/filter ticket inbox | ticket API | Implemented dedicated page |
| `/app/support/new` | Create ticket with editor/uploader | ticket/attachment APIs | Implemented dedicated page |
| `/app/support/:id` | Full conversation and context | ticket/message/attachment APIs | Implemented dedicated page |
| `/app/activity` | Account security activity | audit API/export | Existing |
| `/app/settings` | Profile, MFA, passkeys, sessions and team | security/account APIs | Existing; information architecture polish pending |

Every route must render loading, success, empty, error and authorization states. Dynamic server routes verify account ownership before returning the application shell where a scoped record is required.

Mobile rule: route content becomes purpose-built record cards or a full-width conversation, never a squeezed desktop table or modal. Inputs stay at least 16px where mobile browsers would otherwise zoom.
