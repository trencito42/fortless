# Petal Redesign Component Map

The canonical source is `blueprint/fortless-blueprint/design/`. `out.html`, `panel.html`, and the `z4`–`z8b` parts were inventoried. Demo records and timers are not copied into Fortless.

| Petal component | Canonical source | Fortless destination | Integration state |
|---|---|---|---|
| Application sidebar/topbar | `panel.html` app shell; `z6.js` Collapsible sidebar | all `/app` routes | Adapted to authenticated route/session state |
| Mobile tab navigation | `out.html` Mobile app / Floating tab bar | client shell under 760px | Adapted; further full-route mobile menu QA pending |
| Command palette combobox | `panel.html`; `z8b.js` | global search | Existing adapter retained |
| Notification bell/popover | `panel.html`, `notification-01`; grouped notifications in `out.html` | topbar | Existing real API integration retained; row interaction refinement pending |
| Metric cards/list rows | `panel.html` dashboard patterns; Petal `stat`, `li`, `card` | `/app` | Adapted to real account APIs; no generated charts |
| Empty states | `z5.js` Empty states per page | dashboard and list pages | Existing adapter reused |
| Multi-conversation inbox | `z6.js`/`z6.css` | `/app/support`, `/app/support/:id` | Original `.z-cl/.z-cv` CSS extracted; rows adapted to real dedicated routes |
| Rich text editor | `out.html` `rte()` and `.rte/.rtb/.rta` | ticket create/reply | Original markup/CSS/command behavior adapted to safe Markdown output |
| Drop upload | `out.html` `.drop`; `z4.js` CSV drop behavior | ticket create/reply | Original control adapted to validated attachment API |
| Segmented controls | `out.html`/Petal core | ticket, invoice and activity filters | Reused with route-owned real-data filtering |
| Custom select enhancement | `panel.html`/`out.html` `enhanceSelects()` | service/product filters and existing forms | Original behavior adapted for dynamic options and teardown-safe mounting |
| Invoice summary/table | `z5.js` Invoices, `z5.css` | `/app/billing`, dashboard | Adapted to exact currency/minor-unit data |
| Filterable audit log | `z5.js`/`z5.css` | `/app/activity` | Existing real-data adaptation retained |
| Multi-step wizard | `z4.js`/`z4.css` | `/app/deploy` | Original structure/CSS adapted to catalog plan, region and instance details; signed server quote remains authoritative |
| Two-factor QR flow | `z5.js` Two-factor setup | `/app/settings` | Existing three-step real TOTP flow retained |
| Active sessions | `z5.js` Active sessions | `/app/settings` | Existing real session API integration retained |
| Data tables/filters | `out.html`, `z4.js`, `z5.js` | services, domains, billing, team | Original table/toolbar patterns adapted with responsive record cards and real local result filtering |
| Skeleton/error boundary | `z6.js` Utilities pro | route loading/error states | Original `.z-skb` page variants extracted and mounted before account API requests |
| Charts/gauges/live widgets | `z5.js` | none by default | Intentionally unused: no trustworthy historical utilization source |
| API keys | `z5.js` | none | Intentionally unused: customer API key lifecycle is not implemented |
| Video/social/media demos | `out.html` and parts | none | Not relevant to hosting control plane |

Adapters must own listener cleanup, avoid global demo initialization, and never copy sample identities or fabricated metrics.

## Full catalog category audit

Every component used in the product must start from its canonical Petal markup and class contract. “Use where relevant” does not mean placing demo widgets in the product: categories that need data or workflows Fortless does not have stay deliberately absent.

| `out.html` category | Fortless use |
|---|---|
| Buttons | Canonical button variants, sizes, icon buttons and disabled states across all routes |
| Inputs | Login/account fields, search, service name, DNS records and support fields |
| Selection | Segmented status/priority controls, switches, radios and plan/region option cards |
| Feedback | Alerts, badges, toasts, empty states and progress/loading feedback |
| Navigation | Sidebar, breadcrumbs, wizard steps, tabs, accordions and mobile tab bar |
| Data | Avatars, stat tiles, key-value lists, list rows, timelines and code/identifier fields |
| Overlays | Command palette, notifications, confirmation dialogs and mobile sheets |
| Charts | Reserved for verified historical telemetry; no fabricated utilization charts |
| Icons | Canonical symbol sprite / approved icon set; no emoji used as control icons |
| Foundations | Petal color, type, radius, spacing and surface tokens in both themes |
| Media | Attachment preview/download only; entertainment-player demos are not relevant |
| Mobile app | Bottom tab bar, full navigation sheet, touch targets, safe areas and portrait/landscape composition |
| Dropdowns | Account/actions menus and enhanced searchable/select controls |
| Date & time | Consistent localized timestamps; pickers only when a real scheduling workflow requires them |
| Adv. forms | Support rich-text editor and validated file drop |
| System pages | Login, register, recovery, verification, MFA and HTTP/error pages |
| Data tables | Billing, domains/DNS and team records with mobile record-card transformation |
| Social | Not applicable to the hosting control plane; no feed/reaction demo UI |
| Guides | Contextual help, destructive-action confirmation and mobile navigation guidance; no decorative coach marks |
| Layout | Auth split view, application shell, dashboard grids and responsive content panels |
| Visuals | Only product-relevant status/plan visuals; no illustrative data presented as telemetry |
| Utilities | Copy controls, loading states, offline/error banners and keyboard shortcuts |
| Data tools | Search/filter toolbars and expandable activity rows; bulk actions only when the API supports them |
| Forms pro | Deploy wizard and structured support/account flows; signature/rating demos excluded |
| Charts pro | Reserved until real time-series APIs exist |
| Onboarding | Dashboard first-service empty state and truthful release/capability guidance |
| Account | Invoice records, TOTP QR setup, active sessions and audit history |
| Communication | Support conversation list and canonical compact comment/thread items |
| Workspace | Collapsible desktop shell and route-aware command/search surface; draggable demo widgets excluded |
| Utilities pro | Page-type skeletons and route error states, sized to prevent content layout shift |
