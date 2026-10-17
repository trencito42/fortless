# Task 05: convert existing `/app/deploy` to real Petal multi-step order wizard

**Existing:** `loadCatalog`, `renderCatalog`, `updateSummary`, `beginCheckout` in `public/assets/app-ui.js`; published catalog is DB backed; server quotes exist but UI currently estimates tax using a fixed 19% factor. Preserve plan selection, router and checkout fail-closed behavior.

**Canonical Petal:** Forms pro > Multi-step wizard / Repeater fields / Money input; Navigation > Horizontal + vertical stepper; Selection > Option cards / segmented controls / chips; Dropdowns > Searchable select; Input > number stepper / text field; Account & business > Plan upgrade/downgrade; Data > Pricing card; Feedback > validation, progress, skeleton; Overlay > confirmation.

Wizard: (1) product category/template (games, Discord bot), (2) published plan/version and billing cycle, (3) region/node availability, (4) server name + server-specific configuration from trusted plan schema, (5) billing identity/tax jurisdiction and promo code if supported, (6) server-authored signed quote with detailed price/tax/renewal, (7) payment redirect through verified sandbox checkout, (8) order tracking with explicit statuses. Use Petal's existing `data-zw="wizard"` and `.steps` composition, not fresh mockups.

Any plan/region/addon price must come from the backend; client must NEVER compute authoritative VAT, tax exemption, discount, provisioning resources or PSP state. Only allow valid egg/environment fields; server must revalidate capabilities and quotas. Preserve user choices across back/forward and refresh using non-sensitive state; a stale quote must clearly request repricing. Show precise missing-configuration messages and never offer fake 'Deploy successfully' actions.

Tests: catalog freshness, expired quote, mismatched country/tax, tampering attempts, insufficient capacity, double submit, back-navigation, inaccessible provider, free/billed edge cases. Do not enable production charges.
