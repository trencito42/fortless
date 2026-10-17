# Petal UI Component Map & Production Reuse Registry

**Source of Truth:** Canonical Petal Custom Components from `blueprint/fortless-blueprint/design/`  
**Files:** `out.html`, `panel.html`, `parts/` (`buttons.html`, `cards.html`, `forms.html`, `modals.html`, `tables.html`, `charts.html`, `z6.js`)  
**Standard:** 100% Native Petal DOM structures, styles, and SVG behaviors. No external UI frameworks.

---

## 1. Component Registry & Mapping

| Petal Canonical Component | Canonical Source | Integrated Location | Backend / State Wiring | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Command Palette (`Ctrl+K` / `⌘K`)** | `panel.html` lines 396-403, 1140-1150 | `public/app.html`, `public/admin.html`, `app-ui.js`, `admin-ui.js` | `/api/v1/search` (multi-tenant scoped search, permission-aware admin routes, keyboard arrow & enter navigation) | `[PRODUCTION_VERIFIED]` |
| **Step-Up Verification Modal** | `parts/modals.html`, `panel.html` | `public/admin.html` (`#modalStepUp`), `admin-ui.js` | Transparent 403 `STEP_UP_REQUIRED` interception, TOTP challenge verify `/api/v1/auth/step-up`, seamless mutation retry | `[PRODUCTION_VERIFIED]` |
| **Support Thread & Ticketing** | `out.html` (.message-list, .bubble) | `public/app.html`, `public/admin.html`, `tickets.ts` | `/api/v1/tickets/:id`, `/api/v1/tickets/:id/messages`, `/api/v1/admin/tickets/:ticketId/reply` | `[PRODUCTION_VERIFIED]` |
| **Markdown Prose Renderer** | `out.html` (.prose) | `app-ui.js`, `admin-ui.js`, `admin-ui.css`, `app-ui.css` | Real-time XSS-safe Markdown parser for ticket message bodies (code blocks, blockquotes, bold, italics, lists, links) | `[PRODUCTION_VERIFIED]` |
| **Ticket File Attachments** | `parts/forms.html`, `out.html` (.att-chip) | `public/app.html`, `public/admin.html`, `tickets.ts` | Multi-tenant SHA256 integrity storage, 5MB limit, MIME whitelist, streaming secure download `/api/v1/tickets/:id/attachments/:attachmentId` | `[PRODUCTION_VERIFIED]` |
| **Native SVG Sparklines (`spark`)** | `panel.html` lines 857-861 (`spark()`) | `public/app.html`, `app-ui.js` | Service metric trends in stat tiles (Active servers, RAM allocation, CPU usage) generated via native cubic Bezier `smooth()` | `[PRODUCTION_VERIFIED]` |
| **Three-Step Authenticator Flow** | `out.html` (.steps, .z-pane, .z-qr) | `public/app.html` (`#mfaControl`), `app-ui.js` | `/api/v1/auth/mfa/totp/enroll`, `/api/v1/auth/mfa/totp/confirm`, backup recovery codes | `[PRODUCTION_VERIFIED]` |
| **WebAuthn / Passkeys Flow** | `parts/buttons.html`, `panel.html` | `public/app.html` (`#passkeyCard`), `src/modules/identity/passkeys.ts` | Phishing-resistant FIDO2/WebAuthn enrollment, challenge anti-replay, ES256 signature verification | `[PRODUCTION_VERIFIED]` |
| **Catalog Plan Selector & Cards** | `out.html` (.z-pls, .z-plc) | `public/app.html` (`#planSelector`), `app-ui.js` | Dynamic `/api/v1/catalog/plans`, `/api/v1/catalog/regions`, capacity checks | `[PRODUCTION_VERIFIED]` |
| **Summary & Checkout Panel** | `out.html` (.summary-card, .z-es) | `public/app.html` (`#section-deploy`), `app-ui.js` | `/api/v1/quotes` (signed quote, coupon discounts, minor unit math), `/api/v1/checkout` | `[PRODUCTION_VERIFIED]` |
| **Billing & Invoices Table** | `parts/tables.html`, `panel.html` | `public/app.html` (`#invoicesTableBody`), `app-ui.js` | `/api/v1/invoices`, plaintext receipt stream `/api/v1/invoices/:id/download`, subscription lifecycle | `[PRODUCTION_VERIFIED]` |
| **Audit Activity Log** | `panel.html` (.z-aur, .z-aut) | `public/app.html`, `public/admin.html`, `read-model.ts` | Global security audit trail with metadata, actor user, IP address, and collapsible inspection | `[PRODUCTION_VERIFIED]` |

---

## 2. Design Invariants Verified

1. **No Competing Frameworks:** Zero Tailwind, Bootstrap, or Material UI dependencies installed or bundled.
2. **Pure Vanilla CSS & Semantics:** All tokens (`--font`, `--bg`, `--s1`, `--s2`, `--ink`, `--accent`, `--good`, `--warn`, `--bad`, `--violet`) match canonical Petal definitions.
3. **Responsive Mobile & Desktop Parity:** Mobile drawers, cards, and tables stack gracefully using Petal's exact media queries.
4. **Universal Keyboard Shortcuts:**
   - `Ctrl+K` / `⌘K`: Global Command Palette across client and staff admin interfaces.
   - `Escape`: Closes open modals, drawers, and command palette.
   - `ArrowUp` / `ArrowDown` / `Enter`: Navigates and selects items in the Command Palette.
