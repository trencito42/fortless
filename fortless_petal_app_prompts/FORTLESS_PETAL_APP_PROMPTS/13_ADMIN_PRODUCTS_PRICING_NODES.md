# Task 13: WHMCS-like product and hosting inventory administration

**Existing:** `src/modules/catalog/catalog.ts` seeded products, plan versions, prices, regions/nodes, quotes and order items. Do not discard migrations or existing sold plan versions.

**Canonical Petal:** Data & tables > editable data grid, saved filters, bulk actions; Forms pro > Multi-step wizard, repeater fields, number stepper, sortable list; Dropdowns > searchable and multi-select; Selection > tabs, option cards; Workspace > split panes; Data > pricing card, key-value; Feedback > validation and audit status.

Build `/admin/catalog` and subviews for categories, products, plans/immutable plan versions, prices per interval/currency, add-ons, service templates/eggs, package flags, publishing and archival. Region/node inventory should show real capacity, reservations and maintenance, not guessed available RAM. Allow approved staff to create draft, validate, preview customer Petal plan card, publish immutable version, schedule future price, pause sales; no retroactive silent modification of bought terms. Validate all submitted resource specs/egg IDs/option schemas server-side.

Discounts/coupons: server-side eligibility, dates, use limits, per-customer limits, percentage/currency caps, atomic redemption and rollback on expired payment. Tax settings require approved merchant legal inputs; do not invent VAT policies. Never let client options change actual provisioned resources beyond plan entitlements.

Test plan publishing/versioning, simultaneous inventory reservation, invalid coupon, currency/tax mismatch, admin RBAC, pricing quote immutability, customer checkout disabled without PSP.
