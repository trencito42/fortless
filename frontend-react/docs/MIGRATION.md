# Migrating the existing app to Fortless UI

Goal: adopt gradually, page by page, without a rewrite and without touching the backend contract.

## 1. Know what you have

The current app is a Fastify backend serving `/app/*` pages. Pterodactyl stays headless behind your API. Nothing in this library calls the panel, Stripe or a registrar.

## 2. Install the base

1. Copy `src/styles/index.css`, `src/design-system/`, `src/lib/utils/cn.ts` and (if you want them) `src/features/` into the app.
2. Add dependencies from `package.json`: `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@tanstack/react-table@8`, `recharts`; lazily used: `@xterm/*`, `codemirror` and `@codemirror/*`.
3. Tailwind v4: `@import "tailwindcss"` plus the tokens file. Path alias `@/*` -> `src/*`.
4. Wrap the app in `ThemeProvider` and `TooltipProvider`.

## 3. Order of adoption (lowest risk first)

1. **Primitives and forms** on one low-traffic page (Security profile).
2. **AppShell** with `nav` data. Map the current routes to `NavGroup[]`; keep your router and pass `currentId` and `onNavigate`. Permissions go through `can()`.
3. **DataTable** for Services, Invoices, Tickets, Activity.
4. **Service page tabs**: Console (`ServerConsole`), Files (`FileExplorer` + `CodeEditor`), Backups, Schedules, Databases, Players, Game settings.
5. **Billing and domains**: `InvoiceSummary`, `SubscriptionActions`, `PaymentMethodList`, `DNSRecordEditor`, `DomainSearch`.

## 4. Wiring components to the backend

| Component | You provide |
|---|---|
| `ServerPowerToolbar` | `onPower(action)` -> `POST /api/services/:id/power` (map to the Pterodactyl client API server-side) |
| `ServerConsole` | A websocket to the panel (token from your API). Call `ref.write()` for output, pass `onCommand` for input |
| `ServerMetricsPanel` | Live stats from the same websocket. History needs Fortless to store samples: not built |
| `FileExplorer`, `FileUploadQueue` | List/read/write/upload endpoints. Real upload progress from XHR or fetch streams |
| `GameConfigurationForm` | Mapping between `MinecraftConfig` and startup variables / `server.properties` |
| `TwoFactorSetup`, `PasskeyList` | TOTP secret + otpauth URI (render the QR yourself); WebAuthn registration endpoints |
| `PaymentMethodList` | Stripe customer payment methods; use Stripe Elements for card entry |
| `DomainSearch`, `DNSRecordEditor` | Registrar/DNS API; availability and prices pre-formatted |

## 5. Things to decide before building more

- Where server metric history comes from (needed for any Usage page).
- Player data source for `PlayerManagerTable` (query, RCON, or log parsing).
- Whether invoice PDFs are served with cookies or signed URLs (affects `onDownload`).

## 6. Known gaps (see docs/COMPONENTS.md for per-component detail)

- Only components listed in `docs/verification.json` passed the automated suite. That suite covers rendering at 8 widths, console errors and axe (WCAG 2.1 AA). It does **not** cover keyboard flows, screen readers or real touch devices.
- Planned, not built: Cart/Checkout, PricingTable, Startup variables editor, Network allocations, Announcements/KB, Usage page, Audit trail list, Notification preferences.
- No i18n layer: UI strings are English literals.
