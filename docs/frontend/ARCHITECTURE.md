# FORTLESS Frontend Architecture

**Status:** Target Commercial Frontend Architecture  
**Design System:** Canonical Petal Custom Component Library (`blueprint/fortless-blueprint/design/`)  
**Build Strategy:** Modular TypeScript ES Modules bundled via `esbuild` to zero-dependency runtime assets in `public/assets/`.  
**Backend:** Fastify API & Static Server with SHA-256 asset fingerprinting and immutable caching.

---

## 1. Architectural Principles

1. **Strict Design System Fidelity:**
   - Exclusively reuse canonical Petal components, styles, and behaviors from `blueprint/fortless-blueprint/design/` (`out.html`, `panel.html`, `parts/`).
   - Zero competing CSS frameworks (no Tailwind, Bootstrap, Material UI, shadcn).
   - All color tokens, typography (`Inter Tight`, `JetBrains Mono`), surface elevations (`--s1`, `--s2`, `--s3`), and responsive breakpoints are sourced from the Petal design token registry.

2. **Decoupled Architecture:**
   - HTML shells (`public/app.html`, `public/admin.html`) are slim entrypoints containing semantic DOM scaffolding.
   - Enormous static SVG sprites and large stylesheets are extracted into cacheable static assets (`public/assets/petal-icons.svg`, `public/assets/petal-app.css`).
   - Legacy dead code (`if (false)`) is permanently removed.

3. **Modular Component & Feature Hierarchy:**
   - `core/`: Framework-agnostic utilities, resilient API client, typed client-side router, and shared application state.
   - `petal/`: Reusable, lifecycle-safe wrappers around canonical Petal UI components (charts, sparklines, modal dialogs, drawers, toasts, step-up challenges).
   - `client/`: Customer portal shell and feature modules (`dashboard`, `deploy`, `billing`, `support`, `activity`, `settings`, `services`).
   - `admin/`: Staff control plane workspace modules (`overview`, `accounts`, `services`, `tickets`, `audit`, `staff`).

4. **Zero Fake Success / Honest Operational State:**
   - UI operations reflect authoritative backend or infrastructure state.
   - Any unconfigured provider or service console renders an honest unavailable state with clear technical guidance instead of simulated success.

---

## 2. Directory Structure

```text
src/
  frontend/
    core/
      api/
        client.ts          # Central HTTP client with CSRF, AbortController, error normalization
        errors.ts          # Standardized ApiError and Typed error classes
      router/
        router.ts          # Client-side router supporting History API, deep links, lifecycle hooks
        routes.ts          # Customer and admin route definitions and title metadata
        guards.ts          # Client-side session and step-up authentication guards
      state/
        session.ts         # Reactive user session and active account context
        capabilities.ts    # Operational capability state (payments, provisioning, email)
      utils/
        dom.ts             # Safe DOM helpers and sanitization
        formatting.ts      # Currency (minor units), byte sizes, numbers
        dates.ts           # RFC 3339 / ISO timestamp formatting
        markdown.ts        # XSS-safe Markdown to Petal .prose transformer

    petal/
      components/
        icons.ts           # Heroicons & Petal icon SVG helper
        sparklines.ts      # Native cubic Bezier smooth() & spark() SVG algorithms
        gauges.ts          # Native SVG circular progress and gauge renderers
        modals.ts          # Modal, drawer, and scrim lifecycle manager
        toasts.ts          # Notification toast queue
        cmd.ts             # Canonical Petal Command Palette (Ctrl+K / Cmd+K)
      styles/
        # Compiled and referenced stylesheets

    client/
      shell/
        app-shell.ts       # Customer navigation shell, header, breadcrumbs, user badge
      pages/
        dashboard/         # Service metrics tiles, active instances, sparkline trends
        deploy/            # Plan selector, region picker, coupon validator, quote summary
        billing/           # Fiscal invoices, subscription lifecycle, receipt download
        support/           # Tickets queue, message thread, Markdown replies, attachments
        activity/          # Tenant audit log, query filtering, expandable rows
        settings/          # Profile, password change, TOTP MFA, Passkeys, team invitations
        services/          # Service detail, specs, nodes, honest console state

    admin/
      shell/
        admin-shell.ts     # Staff navigation shell, RBAC-filtered links, breadcrumbs
      pages/
        overview/          # Global metrics, operational attention queues, release gates
        accounts/          # Account directory, locking mutation with step-up verification
        services/          # Cross-tenant service inventory and status inspection
        tickets/           # Staff ticket triage, customer replies, internal notes
        audit/             # Global immutable audit trail
        staff/             # Staff directory, role modification, last-owner protection
```

---

## 3. Build & Bundling Pipeline

- **Bundler:** `esbuild` (zero additional dependencies; included with `tsx`).
- **Entrypoints:**
  - Customer Bundle: `src/frontend/client/index.ts` -> `public/assets/app-ui.js`
  - Admin Bundle: `src/frontend/admin/index.ts` -> `public/assets/admin-ui.js`
- **Output:** Standard ES2022 / IIFE bundles automatically fingerprinted by Fastify in `src/server.ts` with 1-year immutable caching.
