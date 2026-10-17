# FORTLESS context transfer from ChatGPT discussion (2026-10-17)

## Why this document exists
The original conversation happened in a separate ChatGPT chat. Codex does not automatically inherit its conversation history. This file is the distilled owner-approved project context; accompanying blueprints and original design examples are the concrete source material. It is not proof that any feature exists yet. The repository inspection remains authoritative about actual implementation.

## Product and collaboration intent
- Product name: **FORTLESS**, a new unified commercial hosting platform. Screenshots show a `fortless.net` URL, but do not infer domain ownership, live service readiness, or production configuration from screenshots.
- User is implementing it with Codex / AI coding workflow and has configured an SSH connection for their development workflow. DO NOT assume SSH access is authorization to modify a production VPS.
- Another stakeholder asked for a polished public website, client area, billing, orders, domain services, shared web hosting, new products/packages, game hosting, Discord bot hosting, Node.js services, VPS later, admin area, secure provisioning and AI features later.
- User strongly prefers not to style WHMCS or use it as the client-facing system. Build an owned Fortless commercial platform with provider integrations. Do not assume custom software is inherently safer than mature WHMCS: prove security by controls, tests and external review.
- Current product direction: Pterodactyl for games, Discord bots and some application/container services; web hosting via a separate supported WHM/cPanel or equivalent provider; domain registration via registrar reseller API; VPS via a selected provider adapter later. Node.js hosting requires a real reverse proxy/TLS/domain/deployment model, not just an egg.
- Team prioritizes secure backend, protection against service fraud, payment correctness, account isolation, maintainability and realistic automation. User expects the AI agent to think through negative paths and unusual scenarios, not just happy path.
- Product intended to be developed progressively, but eventually cover all important hosting commerce workflows and in-product management screens.

## Visual direction (read DESIGNS before coding UI)
- User has supplied two large original HTML design system demos: `references/design-system/out-original.html` and `references/design-system/panel-original.html`. Both titled Păun Panel. They contain actual CSS tokens, component demonstrations, dark/light mode, responsive patterns, inputs, cards, badges, navs etc. Inspect both before editing.
- Existing Fortless landing HTML concept: `references/design-system/fortless-landing-prototype.html`. Also see `references/screenshots/` for current live-looking concept/screenshots. Maintain established Fortless identity and UI across `/`, auth, `/app`, and `/admin`.
- Styling: flat surfaces and spacing, no decorative blur/glass, no heavy shadows or gradients. Strong dark navy ink, pale gray backgrounds, white elevated flat cards, clear royal blue accent and lime CTA highlight. Rounded surfaces, compact Inter Tight typographic system, JetBrains Mono for technical annotations. Reuse exact values from source, do not approximate from visual guess alone.
- Owner provided an original monogram artwork (`references/brand/fortless-original-logo-reference.png`) in green/dark. Other branding images are generated pattern ideas and can contain minor logo shape approximations; original uploaded logo is the mark-of-record. Do not replace it with a generic F.
- Current screenshot hero: "Hosting, minus the hassle." and simulated dark dashboard/server console with "Preview" indicator. Current CTA: large lime block "Make room for what's next." with dark CTA. User explicitly wants a repeating, slightly rotated FL pattern on the *right side* of the bright lime CTA, without obscuring left-side copy or CTA button. Several variant brand assets provided.
- Branding materials include lime/navy pattern, off-white/navy pattern, dark/navy/lime/blue pattern and collages; can use with `object-fit: cover` and clipping or (better) derive repeatable SVG from the original mark. Never treat AI-generated images as exact vector source files.

## Engineering priorities
1. Monorepo/foundation aligned to actual repository and owner constraints; keep existing implementation when sound.
2. Functional account registration, login, email verification, password reset, MFA for admin, session/device management and server-authorized redirects/guards.
3. Shared authenticated shell for client, staff/admin, with consistent design system and all required view states.
4. Catalog/orders/checkout, money and billing semantics, verified PSP sandbox, immutable records, fraud checks, recovery after webhook duplication or outage.
5. Staging Pterodactyl integration and real, safe, owner-isolated management UX.
6. Later provider adaptors for shared hosting, domains, application hosting, VPS, plus public content/blog/docs, support and notification workflows.
7. Security audit, negative/concurrency/E2E tests, rollback, backups, reconciliation and external audit before production launch.

## Firm rules against overclaiming
- No fabricated plan prices, customer numbers, promised uptime, badges implying certification, live status, launch dates or discounts.
- Never present fake dashboard metrics without "Demo"/"Illustrative" labeling.
- Never create a working login screen without secure backend and call it "fully implemented".
- Never assume payment success means provisioning succeeded, or a provider timeout means provisioning did not happen.
- A passed Playwright suite is not a penetration test. Launch requires security review, monitoring, recovery drills and legal/accounting decisions.

## Open business/integration decisions
- Billing/legal entity, currency and tax regime, invoice series/e-invoicing requirements.
- Actual PSP and approval for this hosting business, billing authority model and webhook credentials.
- Pterodactyl version, installation, hostnames, staging API credentials and allocated compute/nodes.
- Domain registrar partner, availability/search/pricing contracts and transfer policy.
- WHM/cPanel provider/version/licensing or alternative shared web hosting implementation.
- VPS backend/hypervisor/provider, region/capacity plans, abuse policies, risk checks.
- Email transactional provider, outbound address and SMTP domain authentication.
- Production hosting/deployment and backup architecture, custom SLA/retention policies.

No default values should silently become production promises. Raise precise questions when a choice truly blocks execution; otherwise proceed with secure stubs that visibly identify themselves as non-live.
