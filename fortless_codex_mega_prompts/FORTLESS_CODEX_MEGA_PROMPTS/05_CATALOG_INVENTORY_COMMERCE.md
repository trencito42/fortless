# PHASE 5 — REAL HOSTING PRODUCT CATALOG, PRICING, CONFIGURATION AND CAPACITY

You are implementing the Fortless catalog and inventory engine used by the storefront, admin and later checkout. Read `00_GLOBAL_CONTRACT.md`. Replace hardcoded-looking product displays and sample pricing with versioned, backend-authorized catalog records. **Do not activate real payments here.**

## Product model

Maintain service-type modules: game hosting, bot hosting, app/Node.js hosting, web hosting, VPS, domains, and (later) database/AI. **Only game hosting and Discord bot hosting are expected initial products; others may remain honestly planned.** Do not assume inventory/provider contracts exist.

- Category -> Product -> Versioned Plan -> Price by currency/billing period -> Region/Node/Provider offering -> Configurable options/add-ons, valid resource bounds and compatibility -> capabilities -> published status -> policy/marketing description.
- Make `DRAFT`, `PUBLISHED`, `UNLISTED`, `RETIRED` meaningful; plan version immutability once ordered. Existing service entitlements refer to acquired version/snapshot, never the mutable latest plan.
- Examples of configuration: CPU%, RAM, disk, backups, databases, allocations, egg ID (allowlisted, not customer-supplied arbitrary IDs), environment fields validated by egg schema, server name, software version, geography, optional additional ports. No arbitrary Docker images, startup commands, Docker privileges, bind mounts or env injection from browser requests.
- Product pages/region selector/plan cards sourced from API with legitimate pricing, detailed limits, technical support claims only when deliverable. No made-up uptime, unlimited promises or guaranteed instant provisioning.

## Pricing engine

- Money represented as ISO currency + integer minor units, checked arithmetic and maximum orders. Avoid float rounding and locale-induced decimal bugs. Handle special currency unit conventions.
- Plan prices for monthly/quarterly/yearly cycles, duration-aware promotions, configurable additions, quantity limits, renewal price and introductory discounts. Coupon semantics single-use/multi-use/per-account/per-product/expiry/cap, with transactional redemption after confirmed payment (avoid burning coupon on abandoned checkout).
- Tax inputs and customer billing address validated, but **tax decisions belong to Phase 6 approved policy**, not a frontend checkbox that triggers 0% tax.
- Expiring persisted quotes: authoritative server quote lines, totals, currency, tax evidence source, plan snapshot and validUntil; quote belongs to account, cannot be redeemed twice, tamper-safe. Cryptographic signature optional if persisted/verified authoritatively; signature must cover full semantic payload if retained.
- Hash idempotency requests using canonical full payload including `regionId`, quantity, custom options, plan version, billing period and account; same key+different canonical request -> conflict; same request -> same result.
- Compute proration for upgrades/downgrades using documented policy; no negative charge from rounding, no upgrade before settlement if payment required, no silent deletion of addons.

## Capacity and provider availability

- Region + node capacities are measured by provider state and reserved in DB atomically with concurrency locks, configurable oversell headroom, safety factor and maintenance mode.
- Allocations/network ports from controlled pool, not customer-selected arbitrary resources. Prevent duplicate port/node assignment; release reservations on abort with audit and stale-reservation sweeper.
- Distinguish catalog purchasable from technically provisionable and PSP-approved. If provider is not configured, block ordering of deliverable entitlements rather than taking funds and promising instant service.
- Explicit sold-out/maintenance/waitlist behavior, partial cart order when one region is unavailable, and plan limits enforced at *every* path including admin overrides.

## Admin and customer interface

- Staff create/edit/publish with preview, validation and audit; no retroactive mutation of historical service resources.
- Customer filters by game/use case/region/resources, configured options, quote summary and transparent totals. Use Petal tokens/cards/selectors and real empty states.
- Render display prices from backend data, never embed amount authority in HTML JS, hidden fields or query parameters.

## Tests

- Pricing minor units/currencies, discount stacking, invalid quantity (zero/negative/huge), sold-out, retired plan, region incompatible, invalid egg environment, custom startup command, malicious option fields, plan version changed mid-checkout.
- Two accounts buy last available slot at same moment; only one reserved. Concurrent coupon redemption with one remaining use; only one wins.
- Price editing after quote: expired/signed snapshots remain correct; no old price gets silently recomputed.
- Idempotency key reuse with altered region/options is denied. No quote belongs to another tenant; team VIEWER can't buy.
- Browser mobile and desktop purchase configurator, empty/unavailable/success/error states.

## Deliverables

Real catalog API + admin operations + public storefront sourcing, inventory policies, versioned/approved price and resource configuration and tests. Payment and technical delivery remain explicit disabled gates until Phase 6/7. Report real products and any seeded demo fixtures separately.
