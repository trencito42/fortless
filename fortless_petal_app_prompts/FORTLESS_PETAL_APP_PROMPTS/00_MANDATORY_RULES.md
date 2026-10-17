# FORTLESS × PETAL: non-negotiable operating contract

**Repository:** https://github.com/trencito42/fortless
**Authoritative component source on server:** `/htdocs/fortless.net/blueprint/fortless-blueprint/design/`
**Repository-relative:** `blueprint/fortless-blueprint/design/`
**Existing Fortless implementation:** `public/app.html`, `public/admin.html`, `public/assets/app-ui.{js,css}`, `public/assets/admin-ui.{js,css}`, `src/server.ts`, `src/modules/**`, `src/database/**`.

## Core instruction
This project already has working authentication, server-guarded app routes, substantial client and admin UI, Petal-based 2FA, team APIs and a backend foundation. **Enhance the code in place. Do NOT rebuild the application, replace Fastify, rewrite the landing, install a replacement UI framework, or create a new SPA.** Do not discard the existing route handlers, DB state, API integrations, migrations, tests or styling.

Petal is the owner's original **custom component library**, not a loose aesthetic reference. It has **29 gallery categories and at least 245 explicitly named examples/variants** in the supplied `out.html`. The goal is to compose real features from the existing components and adapt their interactions to production application data.

### Component exclusivity
1. Audit `design/out.html`, `design/panel.html`, `design/parts/z4..z7.*` (and all other parts found), then the deployed `public/assets/z4..z7.*`, `public/app.html`, `public/admin.html` and application bindings.
2. For every UI change identify the **exact canonical Petal source** by filename, identifier/class/function and gallery category. Maintain `docs/PETAL_UI_COMPONENT_MAP.md` listing component → Fortless feature → canonical source → bound endpoint → current reality tier.
3. Reuse actual Petal markup, tokens, existing classes, source interaction models and icon geometry. You may extract a reusable renderer/adaptor from existing source if you preserve semantics/appearance. Do not copy gallery sample data or blindly reuse demo navigation/hash behavior.
4. Never introduce shadcn/ui, Radix visual primitives, MUI, Tailwind, Bootstrap, DaisyUI, AntD, or an alternate visual system. Use the icons provided in the canonical Petal source, not arbitrary replacements. Avoid new component styling and invented controls; when something genuinely does not exist, compose Petal primitives first, or document an approval-required small extension.
5. No hardcoded demo charts, staged avatar/sample customers, fake incidents, fake paid invoices, placeholder toasts or decorative actions pretending to succeed.
6. Preserve the existing excellent `.z-2f` MFA wizard with steps/QR/OTP/backup codes. **Do not replace or regress it.**
7. Honor Petal light/dark variables, focus states, compact-landscape and portrait navigation, reduced-motion support, loading/empty/error states and keyboard operability.
8. Do not use CSS selectors or global event handlers that accidentally interfere with Petal's existing `z*` components. Maintain predictable lifecycle cleanup on route changes.

### Reality and safety
- Read `AGENTS.md`, `docs/REALITY_MATRIX.md`, `docs/PHASE_BACKLOG.md`, `docs/SECURITY_FINDINGS.md` and existing mega-playbook.
- Do not assume source comments marked complete imply production verification. Trace each button: UI → input validation → API → role/tenant authorization → DB or vendor → audit event → UI feedback → tests.
- Treat `UI_ONLY`, `MOCKED`, `LOCAL_VERIFIED`, `SANDBOX_VERIFIED`, `PRODUCTION_VERIFIED`, `BLOCKED` distinctly. Describe each accurately.
- **Stripe payments, live email and Pterodactyl operations must stay disabled until approved and separately verified in sandbox/staging.** No bypass with fake success. Never run destructive production commands as a convenience.
- For each implementation slice, inspect existing behavior, write acceptance tests before or alongside changes, implement incrementally, run build/tests/targeted browser checks, commit and push only proven changes, update status files. If external credentials are absent, finish all local work and present the blocker rather than fabricating success.
- Never put provider or payment secrets in browser bundles, logs or source control. Respect multi-tenant isolation, CSRF, XSS safety and support attachment authorization.

### Definition of done
A feature is complete only when: Petal source provenance is documented; interactions work with authenticated real data; keyboard/mobile/dark mode are tested; backend authorization and validation are tested; fail/empty/loading states are truthful; no existing behavior is regressed; automated tests pass; `docs/PETAL_UI_COMPONENT_MAP.md` and `docs/REALITY_MATRIX.md` are updated; commit and push are reported with SHA. Distinguish partial slices.
