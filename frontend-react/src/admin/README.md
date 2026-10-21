# Admin preview (React)

Isolated React admin UI on synthetic data. Mounted only at `/admin-preview/*` in development or in a build made with `VITE_ADMIN_PREVIEW=1`; a normal production build contains none of this code. It makes **no network calls** and never touches `/admin`, Fastify, Stripe, Pterodactyl, DNS or the database.

```bash
npm run dev                 # http://127.0.0.1:5173/admin-preview
npm run test:admin          # Playwright against the dev server (port 4180)
npm run test:admin-fixtures # consistency of the synthetic data
```

Layout: `AdminApp.tsx` (providers) · `router.tsx` · `routes.ts` (lazy, permission per route) · `nav.ts` · `session.tsx` (preview role, step-up simulation) · `store.tsx` (in-memory data and preview audit) · `shell/` · `components/` · `hooks/` · `fixtures/` · `pages/<group>/` · `types/`.

Rules for contributors: money is integer minor units in one currency; never add currencies; every mutation goes through `ActionDialog` (permission, step-up, reason, “preview” notice) and writes a preview audit event; unsupported capabilities are shown as unsupported, never simulated as working; no secret, token or card number appears in fixtures or UI. Details: `docs/REACT_ADMIN_VIEW_MATRIX.md`.
