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
| Multi-conversation inbox | `z6.js`/`z6.css` | `/app/support`, `/app/support/:id` | Adapted from inbox rows and thread anatomy to dedicated routes |
| Rich text editor | `out.html` `rte()` and `.rte/.rtb/.rta` | ticket create/reply | Original markup/CSS/command behavior adapted to safe Markdown output |
| Drop upload | `out.html` `.drop`; `z4.js` CSV drop behavior | ticket create/reply | Original control adapted to validated attachment API |
| Segmented controls | `out.html`/Petal core | ticket priority and status filters | Reused |
| Custom select enhancement | `panel.html`/`out.html` `enhanceSelects()` | service/product filters and existing forms | Original behavior adapted for dynamic options and teardown-safe mounting |
| Invoice summary/table | `z5.js` Invoices, `z5.css` | `/app/billing`, dashboard | Adapted to exact currency/minor-unit data |
| Filterable audit log | `z5.js`/`z5.css` | `/app/activity` | Existing real-data adaptation retained |
| Multi-step wizard | `z4.js`/`z4.css` | `/app/deploy` | Planned M6; server quote remains authoritative |
| Two-factor QR flow | `z5.js` Two-factor setup | `/app/settings` | Existing three-step real TOTP flow retained |
| Active sessions | `z5.js` Active sessions | `/app/settings` | Existing real session API integration retained |
| Data tables/filters | `out.html`, `z4.js`, `z5.js` | services, domains, billing | Services search/product/runtime filters implemented; remaining domains/billing density work in M6 |
| Skeleton/error boundary | `z6.js` Utilities pro | route loading/error states | Selected patterns pending lifecycle adapter |
| Charts/gauges/live widgets | `z5.js` | none by default | Intentionally unused: no trustworthy historical utilization source |
| API keys | `z5.js` | none | Intentionally unused: customer API key lifecycle is not implemented |
| Video/social/media demos | `out.html` and parts | none | Not relevant to hosting control plane |

Adapters must own listener cleanup, avoid global demo initialization, and never copy sample identities or fabricated metrics.
