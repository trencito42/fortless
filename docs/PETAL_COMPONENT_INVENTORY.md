# Petal Design System — Comprehensive Component Inventory

Authoritative Source Directory: `blueprint/fortless-blueprint/design/`  
Local Reference Copy: `handoff/references/design-system/`  
Standard: Mandatory Exclusive Component Library for FORTLESS

---

## 1. Design Tokens & Foundations

| Token Category | Token Name | Light Theme Value | Dark Theme Value (`[data-theme="dark"]`) | Usage / Purpose |
|---|---|---|---|---|
| **Backgrounds** | `--bg` | `#eff1f5` | `#0a0e15` | Viewport & document root background |
| **Surfaces** | `--s1` | `#ffffff` | `#141a24` | Primary card surface, elevated panels, modal body |
| | `--s2` | `#f5f6fa` | `#1b2330` | Secondary surface, input background, item container |
| | `--s3` | `#e5e8ee` | `#252f3f` | Tertiary surface, hover states, dividers, pill backgrounds |
| | `--s4` | `#d5dae3` | `#344156` | Inactive elements, disabled toggle tracks, slider tracks |
| **Ink (Typography)**| `--ink` | `#0b1a2b` | `#eef2f7` | Primary text, titles, prominent icons |
| | `--ink2` | `#4a576a` | `#a0adbd` | Secondary text, captions, subtitles, labels |
| | `--ink3` | `#5a687b` | `#8d9bae` | Subtle hints, metadata, section category labels |
| | `--on-ink` | `#ffffff` | `#0a0e15` | Contrast text rendered on `--ink` backgrounds |
| **Accent (Electric Blue)**| `--accent` | `#2a5fe8` | `#7aa2ff` | Primary CTA buttons, focused borders, active tabs |
| | `--accent-bg` | `#e6edff` | `#1a2750` | Accent badge surface, selected options, subtle highlight |
| | `--on-accent` | `#ffffff` | `#0a0e15` | Contrast text rendered on `--accent` buttons |
| **Semantic Feedback**| `--good` / `--good-bg` | `#0e6b35` / `#d6f5e0` | `#3ddc84` / `#123525` | Operational status, paid invoices, verified checks |
| | `--warn` / `--warn-bg` | `#855000` / `#fdefc8` | `#f0b232` / `#352a0e` | Pending verification, warning notices, high priority |
| | `--bad` / `--bad-bg` | `#b8232a` / `#fde1e2` | `#ff6b70` / `#3b1618` | Error alerts, terminated services, urgent priority |
| | `--info` / `--info-bg` | `#4a56e2` / `#e3e5ff` | `#8f9bff` / `#1f2250` | General info badges, documentation tags |
| **Special Accents** | `--lime` / `--lime-ink` | `#b9ff3d` / `#0b1a12` | `#b9ff3d` / `#0b1a12` | Signature Fortless promotional highlight & launch badges |
| **Typography** | `--font` | System / Inter Tight | System / Inter Tight | Primary UI typography (weights 400–850) |
| | `--mono` | JetBrains Mono | JetBrains Mono | IP addresses, ports, IDs, timestamps, tabular numbers |

---

## 2. Shell & Structural Primitives

### 2.1 Two-Column Application Shell
- **Source:** `panel.html:51-60`
- **Classes:** `.app`, `.side`, `.brand`, `.navlabel`, `.nav`, `.nav a`, `.tabbar`
- **Markup:**
  ```html
  <div class="app">
    <aside class="side">
      <a class="brand" href="/app">
        <span class="brand-mark"></span>
        <span>fortless</span>
      </a>
      <div class="navlabel">Workspace</div>
      <nav class="nav">
        <a href="/app" class="act"><span class="ic"></span>Instances</a>
        <a href="/app/deploy"><span class="ic"></span>Deploy</a>
      </nav>
      <div class="sidefoot">...</div>
    </aside>
    <main class="main">
      <header class="top">...</header>
      <section class="page">...</section>
    </main>
  </div>
  ```
- **Responsive Behavior:** 
  - On viewports `<980px`, the desktop `.side` sticky column is hidden.
  - Replaced by a fixed bottom dock (`.tabbar`) on mobile portrait and a compact rail on mobile landscape.

### 2.2 Marketing & Public Shell
- **Source:** `out.html:8-25`, `public/index.html`
- **Classes:** `.site-header`, `.nav-inner`, `.brand`, `.nav-links`, `.nav-acts`, `.wrap`, `.hero`
- **Characteristics:** Flat background step with sticky header, high-contrast CTA pills, full-width responsive snap rails.

---

## 3. Surface & Card Primitives

| Component | Class | Source Location | Variants / Modifiers | Usage in Fortless |
|---|---|---|---|---|
| **Standard Card** | `.card` | `panel.html:70` | Default rounded 24px, `--s1` background | Base container for panels, detail views |
| **Flat Card** | `.card.flat` | `panel.html:75` | No elevation, borderless surface step | Data table wrappers, invoice lists |
| **Secondary Surface Card** | `.card.s2` | `panel.html:82` | `--s2` background surface | Filter boxes, nested server info cards |
| **Compact Card** | `.card.tight` | `panel.html:88` | Reduced internal padding (12px) | Sidebar widgets, compact summaries |
| **Grid Layouts** | `.grid` | `panel.html:95` | `.g2`, `.g3`, `.g4`, `.g12`, `.auto`, `.keep2` | Responsive metric and feature grids |
| **Empty State** | `.z-es` | `parts/z5.css:55` | `.z-art` multi-tone background shapes + title + CTA | No servers deployed, no tickets open |

---

## 4. Typography & Icon Primitives

- **Typography Rules:**
  - Headings: `font: 800-850 clamp(...) var(--font)` with negative letter spacing (`-0.04em` to `-0.078em`).
  - Technical Data: `.mono`, `font-family: var(--mono); font-variant-numeric: tabular-nums`.
  - Hierarchy: Primary text (`--ink`), Secondary (`--ink2`), Subdued/Faint (`--ink3`).
- **Iconography System:**
  - Heroicons-style clean inline SVGs (`width: 20px; height: 20px; stroke-width: 1.85`).
  - Size variants: `.ic.xs` (14px), `.ic.s` (16px), `.ic.l` (24px), `.ic.xl` (30px).
  - Defined via inline `<symbol id="i-...">` or component template paths (`heroPaths`).

---

## 5. Form Controls & Inputs

| Control | Class / Selector | Source | Behavioral Rules | Fortless Implementation |
|---|---|---|---|---|
| **Input Wrapper** | `.field` | `panel.html:160` | Label on top, optional `.err` or `.hint` | All login, register, deploy inputs |
| **Text Input** | `.inp` | `panel.html:165` | Height 42px, radius 12-14px, `--s2` surface | Server label, username, email inputs |
| **Custom Select** | `.inp.sel` | `panel.html:170`, `parts/z4.css:52` | Trigger button + floating `.dd` listbox | Region selector, ticket urgency dropdown |
| **Switch Toggle** | `.sw` | `panel.html:187` | Smooth ball translation (18px), green active | 2FA toggle, auto-renewal switches |
| **Segmented Pill** | `.seg` | `panel.html:195` | Radio group in rounded pill container | Billing frequency (Monthly/Annual), date ranges |
| **Option Tile Card** | `.opt` / `.z-pls` | `panel.html:211`, `app-ui.css:65` | Borderless `--s2` card with checked outline | Hosting plan selectors (`mc-perf`, `bot-starter`) |
| **Checkbox** | `.chk` | `panel.html:178` | Custom rounded square checkmark | Table bulk selection, agreement checkbox |

---

## 6. Action & Feedback Primitives

| Component | Class | Source | Visual Appearance | Fortless Application |
|---|---|---|---|---|
| **Primary Pill Button** | `.btn` | `panel.html:140` | Min-height 44px, radius 99px, `--ink` or `--accent` | "Deploy Instance", "Sign In", "Submit" |
| **Secondary Button** | `.btn.sec` | `panel.html:145` | Background `--s3`, text `--ink` | "Cancel", "Refresh", "Inspect" |
| **Ghost Button** | `.btn.ghost` | `panel.html:150` | Transparent background, hover step | "Sign Out", close buttons (✕), icon actions |
| **Status Badge** | `.badge` | `panel.html:221` | Height 24px, pill shape, uppercase 11-12px | `good` (RUNNING), `warn` (PENDING), `bad` (ERROR) |
| **Live Pulse Dot** | `.dotc.pulse` | `panel.html:225` | Radial expanding ping animation | Active server heartbeat, cluster status |
| **Filter Chip** | `.chip` | `panel.html:228` | Pill with count, `aria-pressed` state | Server filter (`All`, `Running`, `Stopped`) |
| **Toast Alert** | `.toast` | `panel.html:764` | Elevated floating pill, colored status stripe | Async operation receipts, clipboard copies |

---

## 7. Data Displays, Tables & Modals

| Component | Class | Source | Functionality | Fortless Mapping |
|---|---|---|---|---|
| **Data Table** | `.tbl` / `.tblw` | `panel.html:310` | Tabular row layout, sortable headers (`.sortable`) | Invoices list, global staff table |
| **Record Row Item** | `.li` / `.row` | `panel.html:340`, `parts/z4.css:14` | Icon + Title/Subtitle + Status + Action button | Server list rows, support thread items |
| **Metric Stat Tile** | `.stat` / `.metric` | `panel.html:360`, `admin-ui.css:35` | Title label + bold tabular metric number | Overview counters (Active Servers, RAM, CPU) |
| **Modal Scrim** | `.scrim` | `panel.html:774` | Fixed backdrop (`rgba(0,0,0,.5)`), centered dialog | Support ticket thread, 2FA setup modal |
| **Expandable Audit Row** | `.z-au` / `.row` | `parts/z4.css:120` | Clickable row showing actor, IP, timestamp | Audit trail records in `/app/activity` & `/admin/audit` |

---

## 8. Specialized Security & MFA Components

- **TOTP QR Code Container:** Built with `public/assets/petal-qr.js` emitting native vector QR matrix inside Petal `--s2` card.
- **6-Digit OTP Cells:** Discrete single-digit inputs with automatic advance, backspace regression, and paste handling (`auth-ui.js`).
- **One-Time Recovery Code Grid:** Monospace 2-column tabular code grid with 1-click copy action.
- **Active Device Session Cards:** Device icon (`.hero-icon device`) + IP + approximate last-active timestamp + individual/global revocation buttons.

---

## 9. Fortless Interface Compliance Audit

| Interface | URL | Canonical Petal Components Used | Compliance Status |
|---|---|---|---|
| **Public Storefront** | `/` | `.site-header`, `.nav-inner`, `.hero`, `.strip`, `.service-card`, `.closing-box`, `.site-footer` | **100% Petal Canonical** |
| **Authentication Flow** | `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` | `.auth-shell`, `.card`, `.field`, `.inp`, `.btn`, `.badge` | **100% Petal Canonical** |
| **MFA Challenge** | `/mfa/challenge` | `.auth-shell`, `.card`, `.field`, `.inp`, `.btn`, `.badge`, `.link` | **100% Petal Canonical** |
| **Customer Console** | `/app`, `/app/deploy`, `/app/billing`, `/app/support`, `/app/activity`, `/app/settings` | `.app`, `.side`, `.brand`, `.nav`, `.tabbar`, `.card`, `.stat`, `.li`, `.z-es`, `.tbl` | **100% Petal Canonical** |
| **Staff Admin** | `/admin`, `/admin/accounts`, `/admin/services`, `/admin/tickets`, `/admin/audit`, `/admin/staff` | `.app`, `.side`, `.brand`, `.nav`, `.tabbar`, `.card.list-card`, `.records`, `.metric` | **100% Petal Canonical** |

*Rule Enforcement: Zero competing UI frameworks (Tailwind, Bootstrap, Material, shadcn) installed or permitted.*
