# Task 06: truly usable `/app/billing` while preserving invoice viewer

**Existing:** `loadInvoices()` and `/api/v1/invoices` plus underlying orders/quotes/invoices/subscriptions model. Stripe disabled; do not enable without approved sandbox.

**Canonical Petal:** `data-zw="invoices"`, `.z-iv` and `.z-ivs`; Data tables > sortable table, expandable rows, payment card; Date/time > date range & quick ranges; Data > Timeline; Charts > revenue/cost sparklines where true data exists; Overlays > secure confirmation; Feedback > badges and empty state.

Create functional tabs: Overview, Invoices, Subscriptions, Payment methods, Billing profile, Transactions (as available). Invoices: server-paginated searchable/filterable by status/date, view line-item detail, due date, settlement activity, PDF download once legally valid generated document exists. Billing profile: persistent company/contact/address/tax identity with validated saves and audit. Subscriptions: truthful active/paused/cancelled/current period end, renewal details, upcoming invoice previews, cancellation/upgrade/downgrade requests that correctly handle proration with explicit confirmation. Payment methods: Stripe-hosted setup/update only; no local card processing. Payment failure flows: payment retry, unpaid warning, support link. Refund requests where policy permits, never issue refunds in a demo handler.

Backend is authoritative for monetary minor units, currencies, VAT, coupon and payment state; ensure correct event lifecycle and no duplicate fiscal invoices. Display zero data as zero data, never as fabricated invoices or past payments.

Tests: cross-tenant invoice PDF URL, sort/page/filter, tax country changes and lock policy, declined card, replayed webhooks, pending payment cannot provision, accessibility and responsive Petal invoices.
