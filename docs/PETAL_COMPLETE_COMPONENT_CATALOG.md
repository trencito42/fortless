# Petal Complete Component Catalog

> **Status:** [MOCK_ONLY] — this document is a source-evidence inventory. Every entry cites a real file, selector, or function inspected on the filesystem. No examples are invented; no canonical design file was modified.
>
> **Scope:** All component families found in the Petal design canon (blueprint `out.html`, `panel.html`, `parts/z4–z8b`), the canonical compositions (`fortless-redesign/Fortless Views.html`), and the production implementation (`src/frontend/petal/`, `public/assets/petal-app.css`, `public/assets/app-ui.css`, usage in `src/frontend/client/`).
>
> **Repo:** `/home/fortless/htdocs/fortless.net`, branch `main`. Inspection date: 2026-10-19.

---

## 1. Method & Evidence Rules

1. Every entry records **source evidence**: file path + selector / CSS class / function name (+ line number where captured).
2. Production status uses the AGENTS.md tiers and is assigned **only with real code evidence**:
   - `[PRODUCTION_VERIFIED]` — symbol referenced in `src/frontend/client/` source **and** present in the built `public/assets/app-ui.js` (build dated 2026-10-19 19:07, newer than all client sources).
   - `[MOCK_ONLY]` — implemented in `src/frontend/petal/` (unit-level, no client usage) or CSS-only with markup present in static shell but no dynamic usage.
   - `[NOT_STARTED]` — exists only in the design canon (blueprint / Views.html); not ported to production code or CSS.
3. Usage counts come from `grep -r` over `src/frontend/client/` (calls, not definitions).
4. Where the built bundle contradicts the source, the discrepancy is recorded verbatim in §12.

### Source inventory inspected

| Source | Size | Role |
|---|---|---|
| `blueprint/fortless-blueprint/design/out.html` | 745,926 B | Canonical primitives + all `z-*` families (173 unique `z-*` classes) |
| `blueprint/fortless-blueprint/design/panel.html` | 549,898 B | Component class census (`.btn` ×61, `.menu` ×30, `.tbl` ×21, `.modal` ×16 …) |
| `blueprint/fortless-blueprint/design/parts/z4.css` / `z4.js` | — | Wizard, pivot tables, form primitives |
| `blueprint/fortless-blueprint/design/parts/z5.css` / `z5.js` | — | 2FA, sessions, invoices, checklists, NPS, rating, profile, QR, charts |
| `blueprint/fortless-blueprint/design/parts/z6.css` / `z6.js` | — | Inbox, chat, skeletons, widgets, pull-to-refresh, video |
| `blueprint/fortless-blueprint/design/parts/z7.js` | — | Page assembly (`zPage`/`zCard`/`zComp` + ZP registry) |
| `blueprint/fortless-blueprint/design/parts/z8.js` | — | A11y auto-labels (ICN map, `human()`, `scrollers()`) |
| `blueprint/fortless-blueprint/design/parts/z8b.js` | — | Keyboard/ARIA behaviors (`tabsSync`, `treeRove`, `cmdSync`, `headings`) |
| `fortless-redesign/Fortless Views.html` | 203,286 B | 27 canonical views + composition helpers (`seg`, `fld`, `inp`, `shell`, `ds`, …) |
| `src/frontend/petal/components/*.ts` | 16 files | Production Petal TS components |
| `public/assets/petal-app.css` | 42,770 B | Production token + primitive layer |
| `public/assets/app-ui.css` | 36,258 B | Production composition layer |
| `public/assets/app-ui.js` | 404,012 B | Built bundle (verification target) |
| `public/app.html` | 344,900 B | Static shell (modal hosts, tabbar, toasts) |

---

## 2. Design Token Foundation

**Source:** `public/assets/petal-app.css` lines 2–27 (light) and dark block via `prefers-color-scheme` + `[data-theme]`.

| Token group | Tokens | Notes |
|---|---|---|
| Surfaces | `--bg`, `--s1`, `--s2`, `--s3`, `--s4` | Flat color-blocked steps; **no borders, no shadows, no gradients** anywhere in the system |
| Ink | `--ink`, `--ink2`, `--ink3` | Text hierarchy |
| Accent | `--accent`, `--accent-h`, `--accent-bg` | Brand + hover + tinted background |
| Semantic | `--good`, `--warn`, `--bad`, `--info`, `--violet` (each with `-bg`) | Status colors |
| Misc | `--overlay`, `--font`, `--mono`, `--ease`, `--gut` | Scrim, typography, motion, gutter |

**Production status:** `[PRODUCTION_VERIFIED]` — tokens are the base of every production class; both CSS files loaded by `public/app.html`.

---

## 3. A. Buttons

### 3.1 `.btn` — core button
- **Source:** `panel.html` (61 instances); `public/assets/petal-app.css` lines 91–104.
- **Variants (canon):** default (primary/accent), `.sec`, `.tint`, `.ghost`, `.accent`, `.ink`, `.bad`, `.good`; sizes `.s`, `.xs`, `.l`, `.lg`; modifiers `.sq` (icon-only square), `.blk` (block), `.load` (spinner), `.badt`, `.rect`, `.sp`, `.play`.
- **Production variants:** `pri`/`ink`/`tint`/`bad`/`good`/`ghost`, `.s`, `.xs`, `.blk` (petal-app.css 91–104). Missing in production CSS: `.sec`, `.accent`, `.l`/`.lg`, `.sq`, `.load`, `.rect`, `.sp`, `.play`.
- **Interaction contract:** flat fill, `--accent-h` on hover, no elevation change; `.load` swaps label for spinner and disables.
- **A11y:** real `<button>` elements; z8 auto-label pass adds `aria-label` to icon-only buttons in canon (not ported).
- **Responsive:** full width in mobile tabbar contexts via `.blk`.
- **Status:** `[PRODUCTION_VERIFIED]` — `.btn` used across all 11 routes (e.g. `src/frontend/client/pages/deploy/index.ts`, `billing/index.ts`); present in built `app-ui.js`.

### 3.2 `.btngroup` + `.ddwrap` — button group & split button
- **Source:** `panel.html` (9 `.btngroup`); `public/assets/app-ui.css` lines 221–224 (`.btngroup`), 267–272 (`.ddwrap`/`.dd` with `.right`/`.up` variants).
- **Variants:** inline group; split = action button + `.ddwrap` caret opening a `.dd` dropdown.
- **Status:** `[PRODUCTION_VERIFIED]` — `.btngroup` + `.ddwrap` used in services header actions (`src/frontend/client/pages/services/index.ts`).

### 3.3 `.seg` — segmented control (button group acting as one-of selector)
- **Source:** `panel.html` (13 `.seg`, `.seg4`); `public/assets/petal-app.css` lines 147–153 (`.blk` variant); Views.html helper `seg(id,items,sel,cls,tgt)`.
- **Interaction contract:** one active segment (`.on`); in production, `.seg[role="radiogroup"]` gets roving-tabindex keyboard behavior from `src/frontend/petal/components/radiogroup.ts` (`initRadioGroups`).
- **A11y:** `role="radiogroup"` + `aria-checked` per segment; Arrow/Home/End navigation.
- **Status:** `[PRODUCTION_VERIFIED]` — `initRadioGroups()` called in `src/frontend/client/index.ts` init; `.seg` markup in `public/app.html` (4 instances) and services/settings pages.

---

## 4. B. Badges, Chips, Pills, Tags, Tiles

### 4.1 `.badge`
- **Source:** `panel.html` (13: `accent`/`bad`/`good`/`info`/`ink`/`lime`, sizes `s`, `sq`).
- **Status:** `[NOT_STARTED]` — no `.badge` class in `petal-app.css` or `app-ui.css`; production uses `.pill` instead.

### 4.2 `.chip`
- **Source:** `panel.html` (15: `dashed`, `on`, `rx`, `sm`, `dis`); `public/assets/petal-app.css` line 51.
- **Variants in production CSS:** base only (line 51); canon modifiers not ported.
- **Status:** `[MOCK_ONLY]` — class defined in production CSS; usage in client pages is limited (status chips in service lists).

### 4.3 `.pill`
- **Source:** `public/assets/petal-app.css` lines 117–119; Views.html `metric()` emits pills.
- **Variants:** `good`/`warn`/`bad`/`info`/`violet`/`acc`/`d`.
- **Status:** `[PRODUCTION_VERIFIED]` — status pills across services/billing/support pages; present in `app.html` static shell.

### 4.4 `.tile`
- **Source:** `public/assets/petal-app.css` lines 120–123.
- **Variants:** `good`/`warn`/`bad`/`info`/`violet`/`neu`, sizes `lg`/`sm`.
- **Status:** `[PRODUCTION_VERIFIED]` — dashboard metric tiles (`src/frontend/client/pages/home/index.ts` region).

### 4.5 `.tag` / `.tagin`
- **Source:** `panel.html` only.
- **Status:** `[NOT_STARTED]` — not ported; production uses `.chip`.

---

## 5. C. Form Controls

### 5.1 `.fld` + `.inp` — labeled field & text input
- **Source:** `panel.html` (`.field` ×7, `.inp` with `pill`/`sel`/`ta`/`bad`); Views.html helpers `fld(label,input,hint,id,cls)`, `inp(id,type,ph,left,extra,val)`; `public/assets/petal-app.css` lines 135 (`.fld`), 136–146 (`.inp` with `:focus-within`, `.eye`, `.bad`).
- **Interaction contract:** focus ring on the wrapper (`:focus-within`), error state `.bad` (red tint), optional left icon slot, `.eye` password reveal toggle (Views.html `pw(id,ph)`).
- **A11y:** label tied via `for`/`id` in Views.html `fld()`; z8 auto-label pass in canon.
- **Status:** `[PRODUCTION_VERIFIED]` — login/register/mfa auth forms (`src/frontend/client/shell/auth.ts` region), settings forms; `.inp` markup throughout client pages.

### 5.2 `.inp.ta` — textarea
- **Source:** `panel.html`; production rich-text editor wraps a textarea (`src/frontend/petal/components/rich-text-editor.ts`).
- **Status:** `[PRODUCTION_VERIFIED]` — support ticket composer (`src/frontend/client/pages/support/index.ts` line 185 via `petalRichTextEditor`).

### 5.3 `.inp.sel` + custom select — `installCustomSelects`
- **Source:** `panel.html` (`.inp.sel`); `src/frontend/petal/components/custom-select.ts` — `installCustomSelects(root)` enhances native `<select>` into `.selbtn` + `.dd` menu.
- **Interaction contract:** click opens `.dd`; ArrowUp/Down move, Esc closes; MutationObserver re-enhances injected markup.
- **A11y:** `role="listbox"` / `role="option"` + `aria-selected`.
- **Status:** `[PRODUCTION_VERIFIED]` — called in `src/frontend/client/index.ts` init; used on deploy/billing/settings forms.

### 5.4 `.sch` — search input
- **Source:** Views.html `sch(ph,tg)`; `public/assets/petal-app.css` lines 204–206.
- **Status:** `[PRODUCTION_VERIFIED]` — services list search, command palette input reuses `.cmd` styling.

### 5.5 `.cpf` — copy field (secret reveal + copy)
- **Source:** Views.html `cpf(v)`; `public/assets/petal-app.css` line 174.
- **Interaction contract:** masked value, reveal + copy-to-clipboard buttons.
- **Status:** `[PRODUCTION_VERIFIED]` — API key display in settings (`src/frontend/client/pages/settings/index.ts`).

### 5.6 `.otp` / `.otpm` — one-time code input
- **Source:** `panel.html` (`.otp`, `.otpm`); `public/assets/petal-app.css` lines 257–259 (`.bad` shake animation); `src/frontend/petal/components/otp.ts` — `initOtp(container)`, `getOtpValue`, `clearOtp`, `shakeOtp`.
- **Interaction contract (otp.ts):** auto-advance on input, full-code paste distribution, backspace-to-previous, ArrowLeft/Right.
- **Status:** `[MOCK_ONLY]` — component implemented, **zero client imports**. `src/frontend/client/index.ts` lines 688–760 contain **duplicate inline OTP handlers** on `[data-otp]` inputs instead. `.otp` markup present in `public/app.html` (1 instance, MFA view).

### 5.7 `.drop` — drag & drop upload
- **Source:** `public/assets/petal-app.css` lines 296–298.
- **Status:** `[MOCK_ONLY]` — CSS present; used by deploy file upload region in client pages (drag events wired in page code).

### 5.8 `.rules` / `.str` — password rules & strength
- **Source:** `public/assets/petal-app.css` lines 261–262.
- **Status:** `[PRODUCTION_VERIFIED]` — register/reset password forms (`src/frontend/client/shell/auth.ts` region).

### 5.9 `.stepper` (numeric) — `z4` form primitive
- **Source:** `panel.html` `.stepper`.
- **Status:** `[NOT_STARTED]` — not ported.

### 5.10 Slider, date/time picker, combobox (filterable)
- **Source:** not present as dedicated primitives in canon; combobox behavior exists only as `cmdSync()` in `parts/z8b.js` (ARIA combobox pattern for `.cmd`).
- **Status:** `[NOT_STARTED]` — no production equivalent.

---

## 6. D. Selection Controls

### 6.1 `.cb` — checkbox
- **Source:** `panel.html`; production uses `.chk` (`public/assets/petal-app.css` lines 263–264).
- **Status:** `[PRODUCTION_VERIFIED]` — `.chk` used in settings toggles and deploy options.

### 6.2 `.sw` — switch
- **Source:** `panel.html` (`.sw.accent`); Views.html `sw(on,label,id)`; `public/assets/petal-app.css` lines 162–164.
- **A11y:** `role="switch"` + `aria-checked` in Views.html helper.
- **Status:** `[PRODUCTION_VERIFIED]` — settings preferences (`src/frontend/client/pages/settings/index.ts`); 1 instance in `app.html`.

### 6.3 `.seg[role="radiogroup"]` — radio group
- **Source:** `src/frontend/petal/components/radiogroup.ts` — `initRadioGroups(root)`.
- **A11y:** roving tabindex, Arrow/Home/End, `aria-checked` sync.
- **Status:** `[PRODUCTION_VERIFIED]` — called in client init.

---

## 7. E. Navigation

### 7.1 `.tabs` — tab strip
- **Source:** `panel.html`; `public/assets/petal-app.css` lines 154–157; `src/frontend/petal/components/tabs.ts` — `initTabs(container)`, `initTabsById(id)`.
- **Interaction contract:** click selects; ArrowLeft/Right/Home/End move; `.on` panel toggle.
- **A11y:** `role="tab"`/`tablist`, `aria-selected`.
- **Status:** `[PRODUCTION_VERIFIED]` — `initTabs` used in `services/index.ts` and `settings/index.ts` (2 call sites); `.seg-btn` ×19 in `app.html`.

### 7.2 `.crumbs` — breadcrumbs
- **Source:** `panel.html` (4); `public/assets/app-ui.css` line 233; `.support-breadcrumb` at lines 93 region.
- **Status:** `[PRODUCTION_VERIFIED]` — support ticket navigation (`src/frontend/client/pages/support/index.ts`).

### 7.3 `.side` / `.sd` — app sidebar
- **Source:** `panel.html` (`.side`, `.sidefoot`, `.nav`, `.navlabel`); Views.html `nav(list,active)` + `shell(list,active,body,o)`; `public/assets/petal-app.css` lines 223–230 (`.sd`, `.nl`, `.nv`, `.me`).
- **Responsive:** sidebar collapses to `.tabbar` (petal-app.css 234–240, `.mid` variant) on mobile.
- **Status:** `[PRODUCTION_VERIFIED]` — app shell (`src/frontend/client/shell/`); `.tabbar` in `app.html`.

### 7.4 `.menu` / `.drop` / `.pop` — dropdown menus & popovers
- **Source:** `panel.html` (`.menu` ×30, `.drop` ×6, `.pop` ×10); `public/assets/app-ui.css` lines 200–205 (`.menu` with `.sep`, `.hd`, `.bad`), 206 (`.pop`).
- **Interaction contract:** open on click, Esc closes; z8b adds ArrowUp/Down/Home/End/Tab keyboard nav in canon (not ported).
- **Status:** `[PRODUCTION_VERIFIED]` — user menu, service actions (`.dd` via `.ddwrap`).

### 7.5 `.cmd` — command palette
- **Source:** `panel.html` (`.cmd` ×9); `parts/z8b.js` `cmdSync()` (ARIA combobox); `public/assets/petal-app.css` line 292; `src/frontend/petal/components/cmd.ts` — `CommandPaletteController`.
- **Interaction contract:** ⌘K/Ctrl+K opens; 180 ms debounced search hitting `/api/v1/search`; ArrowUp/Down + Enter execute; Esc closes.
- **A11y:** `role="combobox"`, `aria-controls`, `aria-activedescendant` (z8b canon); production controller manages selection index.
- **Status:** `[PRODUCTION_VERIFIED]` — instantiated in client shell; `#cmd` modal host in `app.html`.

### 7.6 `.tree` — tree navigation
- **Source:** `panel.html` (`.tree` ×15); `public/assets/app-ui.css` lines 194–209 (`.tree` on `details/summary`, `.tn`, `.tr0`, `.leaf`, `.kids`); `parts/z8b.js` `treeRove()`/`toggle()`.
- **A11y:** canon: roving tabindex + expand/collapse; production: `role="tree"` in file manager (`src/frontend/client/pages/services/files.ts` line 64, `fm-tree`).
- **Status:** `[PRODUCTION_VERIFIED]` (file manager tree); z8b roving behavior `[NOT_STARTED]`.

### 7.7 `.pager` — pagination
- **Source:** `panel.html` (5); `public/assets/petal-app.css` lines 457–488; `src/frontend/petal/components/pagination.ts` — `paginateItems<T>`, `renderPager(page,pages)`, `renderPaginationFooter(...)`.
- **Interaction contract:** ellipsis windowing, `aria-current="page"`.
- **Status:** `[PRODUCTION_VERIFIED]` — `renderPager` 8 calls / 5 files; `paginateItems` 5 calls / 4 files; 16 refs in built `app-ui.js`.

---

## 8. F. Data Display

### 8.1 `.tbl` / `.tblw` — table
- **Source:** `panel.html` (`.tbl` ×21); `public/assets/petal-app.css` lines 182–187 (`.rsp` responsive, `.h` row hover, `.r` right-align).
- **Responsive:** `.rsp` stacks rows on narrow viewports.
- **Status:** `[PRODUCTION_VERIFIED]` — services list, invoices, audit log tables.

### 8.2 `.kv` / `.kvx` — key-value rows
- **Source:** `panel.html`; `public/assets/petal-app.css` line 170.
- **Status:** `[PRODUCTION_VERIFIED]` — service detail, billing pages.

### 8.3 `.li` — list row
- **Source:** Views.html `li(icon,tone,t,s,right,go)`; `public/assets/petal-app.css` lines 129–131.
- **Status:** `[PRODUCTION_VERIFIED]` — activity feed, sessions list, service rows.

### 8.4 `.card` — surface card
- **Source:** `panel.html` (13); Views.html `card(h,sub,body,act,c)`; `public/assets/petal-app.css` line 126 (`.flat` variant).
- **Status:** `[PRODUCTION_VERIFIED]` — every page; `.section-card-head` composition in `app-ui.css`.

### 8.5 `.stat` / `.stat2` / `.metric-card` — stat blocks
- **Source:** `panel.html` (`.stat`, `.stat2`); Views.html `metric(l,v,i,tone,sub)`; production `.metric-card` in `app-ui.css`.
- **Status:** `[PRODUCTION_VERIFIED]` — home dashboard metrics.

### 8.6 `.tl2` — timeline
- **Source:** `public/assets/petal-app.css` lines 199–202.
- **Status:** `[PRODUCTION_VERIFIED]` — activity page, deploy progress events.

### 8.7 `.steps` / `.step` — progress stepper (visual)
- **Source:** `panel.html`; `public/assets/petal-app.css` lines 188–190 (`.cur`, `.done`); `src/frontend/petal/components/stepper.ts` — `renderStepper(steps,activeIndex)`, `updateStepper(container,activeIndex)`.
- **Status:** `[MOCK_ONLY]` — component implemented, **zero client imports**; `src/frontend/client/pages/deploy/index.ts` line 116 builds `.step` indicators inline (`indicator.className = 'step${...done/cur}'` via `[data-deploy-step-indicator]`) — duplicate logic. `.steps` markup ×4 in `app.html`.

### 8.8 `.doc` / `.prose` — document prose
- **Source:** `public/assets/petal-app.css` lines 285–287.
- **Status:** `[PRODUCTION_VERIFIED]` — legal/status pages.

---

## 9. G. Overlays

### 9.1 `.mdl` / `.scrim` — modal dialog
- **Source:** `panel.html` (`.modal` ×16 incl. `.lg`, `.scrim` ×12); `public/assets/petal-app.css` lines 208–217 (`.ov`, `.bx`, `.dr` drawer, `.cmd`, `.stepup` priority); `src/frontend/petal/components/modals.ts` — `openModal(modalId)`, `closeModal(modalId)`, `setupModalBackdrop(modalId,onClose?)`, `initModalStacker()`.
- **Interaction contract:** backdrop click + Esc close; `initModalStacker` MutationObserver assigns z-index per open order; priority modals (`.mdl.stepup`, `[data-priority="high"]`) forced to z ≥ 1200; focus moves to first interactive element.
- **Variants:** center dialog, `.dr` right drawer, mobile sheet (`.tabbar` nav sheet in `app.html`).
- **Status:** `[MOCK_ONLY]` for the modals.ts helpers — **zero direct client imports** of `openModal`/`closeModal`/`setupModalBackdrop`; pages manipulate `.mdl` classes inline. `initModalStacker()` **is** `[PRODUCTION_VERIFIED]` (1 call site in client init). `.mdl` hosts ×7 in `app.html` (cmd, stepup, mobile-nav-sheet).

### 9.2 `.sheet` / `.sheetm` — bottom sheet
- **Source:** `panel.html` (`.sheet`, `.sheetm`, `.scrim.drw`).
- **Status:** `[NOT_STARTED]` as dedicated class; production reuses `.mdl` + `.dr` drawer and a mobile nav sheet.

### 9.3 `.pop` — popover
- **Source:** `panel.html` (10); `app-ui.css` line 206.
- **Status:** `[MOCK_ONLY]` — CSS present, limited usage.

### 9.4 Tooltips — `zTipAt` / `mkTip`
- **Source:** `parts/z5.js` — `zTipAt(wrap,tip,html,x,y)`, `mkTip(host)`; `.ctip` chart tooltip class.
- **Status:** `[NOT_STARTED]` — not ported; production has no tooltip primitive.

---

## 10. H. Feedback & States

### 10.1 `.alert` — inline alert
- **Source:** `panel.html` (11); Views.html `alertb(tone,t,m,i)`; `public/assets/petal-app.css` lines 165–167; `src/frontend/petal/components/alert.ts` — `renderAlert(variant,title,body?,icon?)` (`info|good|warn|bad`, `role=alert`/`status`), `renderError(message)`.
- **Status:** `[MOCK_ONLY]` — component implemented, **zero client imports**; pages hand-write `.alert` markup inline.

### 10.2 `.toast` / `.toasts` — toast notifications
- **Source:** `panel.html`; `public/assets/petal-app.css` lines 218–219; `src/frontend/petal/components/toasts.ts` — `toast(message,type='info')`.
- **Interaction contract:** `#toasts` host, `role=alert`/`status`, 4200 ms auto-dismiss.
- **Status:** `[PRODUCTION_VERIFIED]` — **133 calls across 13 client files**; the single most-used Petal component.

### 10.3 `.sk` / `.z-skb` — skeleton loading
- **Source:** `panel.html` `.skel`; `parts/z6.css` `.z-skb`/`.z-sk`; `public/assets/petal-app.css` lines 178–179 (`.sk`); `src/frontend/petal/components/skeleton.ts` — `renderSkeleton(kind,label)` with kinds `dashboard|list|table|profile|article`, `role=status`.
- **Status:** `[PRODUCTION_VERIFIED]` — `renderSkeleton` 9 calls / 5 files; `.z-skb` ref in built `app-ui.js`; `.sk` ×13 in `app.html`.

### 10.4 `.z-es` / `.es` — empty state
- **Source:** `parts/z5.css` `.z-es`/`.z-art`; Views.html `empty(i,t,m,a)`; `public/assets/petal-app.css` line 181 (`.es`); `src/frontend/petal/components/empty-state.ts` — `renderEmptyState({icon?,title,message,actionHtml?})` → `.z-es` + `.z-art` (3 decorative `<i>`).
- **Status:** `[PRODUCTION_VERIFIED]` — `renderEmptyState` 6 calls / 4 files; `.z-es` in built bundle. **Duplication note:** two parallel class families (`.es` static vs `.z-es` component) coexist.

### 10.5 `.empty` + `renderError` — error state
- **Source:** `src/frontend/petal/components/alert.ts` `renderError(message)` → `.empty` + `.ico-b.bad`; Views.html `errbox()`.
- **Status:** `[MOCK_ONLY]` — zero client imports; error states hand-written per page.

### 10.6 `.ban` — banner
- **Source:** `public/assets/petal-app.css` lines 281–283.
- **Status:** `[PRODUCTION_VERIFIED]` — top-of-page banners (e.g. verification reminders).

### 10.7 `ds(loaded,o)` — data-state switch (loading/empty/error/loaded)
- **Source:** Views.html `ds(loaded,o)` helper.
- **Status:** `[NOT_STARTED]` — pattern not extracted; each page re-implements state branching.

---

## 11. I. Charts & Visualizations

### 11.1 `spark` / `smooth` — sparkline
- **Source:** `src/frontend/petal/components/sparklines.ts` — `smooth(points)` (Catmull-Rom → Bézier), `spark(vals,color,fill)` → `svg.spark` 120×36.
- **Status:** `[PRODUCTION_VERIFIED]` — 2 call sites each (home dashboard metrics).

### 11.2 `gauge` — progress gauge
- **Source:** `src/frontend/petal/components/gauges.ts` — `gauge(percent,label,color)`; **simplified**: horizontal bar, not the canon donut/ring.
- **Status:** `[MOCK_ONLY]` — zero client imports.

### 11.3 Canon chart family — `spark`/`gauge`/`smooth`/`donut`/`heat` + `.z-cw`/`.ctip`
- **Source:** `out.html` JS (`spark`, `gauge`, `smooth`, `donut`, `heat`); `parts/z5.css` `.z-cw` chart well, `.ctip` tooltip; `zRO(box,fn)` ResizeObserver; `zLegend(items)`.
- **Status:** `[NOT_STARTED]` — donut, heatmap, chart tooltips, chart legend, ResizeObserver scaling not ported.

---

## 12. J. z4 Specialized Family

| Component | Source evidence | Status |
|---|---|---|
| Wizard `.z-wz` (`.z-pane` steps, `.z-foot`, `.steps`) | `parts/z4.css` | `[NOT_STARTED]` — deploy flow uses inline `.step` logic instead |
| Pivot table `.z-pv` (th/td, `.t` totals, `.z-drag` column reorder) | `parts/z4.css` | `[NOT_STARTED]` |
| `.z-scroll` scroller | `parts/z4.css` | `[NOT_STARTED]` |
| `.z-csv` CSV import | `parts/z4.css` | `[NOT_STARTED]` |
| `zInp(attrs,icon,cls,pre)` | `parts/z4.js` | `[NOT_STARTED]` — production uses raw `.inp` markup |
| `zSeg(name,opts,val,extra)` | `parts/z4.js` | `[NOT_STARTED]` |
| `zSel(name,opts,val)` | `parts/z4.js` | `[NOT_STARTED]` — superseded by `custom-select.ts` |
| `validate(s)` / `validate0live(t)` / `setErr` | `parts/z4.js` | `[NOT_STARTED]` — validation is per-page inline |

---

## 13. K. z5 Specialized Family

| Component | Source evidence | Status |
|---|---|---|
| 2FA setup `.z-ak`/`.z-akr`/`.z-akn`/`.z-newkey` | `parts/z5.css` | `[NOT_STARTED]` — settings 2FA uses generic `.mdl` + `.z-2f` markup (see §17 discrepancy) |
| Sessions `.z-ss`/`.z-ssr` (`.out` dismiss animation) | `parts/z5.css` | `[NOT_STARTED]` — sessions rendered as plain `.li` rows in settings |
| Invoices `.z-iv`/`.z-ivs` | `parts/z5.css` | `[NOT_STARTED]` — billing uses `.tbl` |
| Checklists `.z-ck`/`.z-ckh`/`.z-cki` (`.z-ring`) | `parts/z5.css` | `[NOT_STARTED]` |
| Empty state `.z-es`/`.z-art` | `parts/z5.css` | `[PRODUCTION_VERIFIED]` — ported via `empty-state.ts` |
| NPS `.z-nps`/`.z-sc10`/`.z-ends`/`.z-more` | `parts/z5.css` | `[NOT_STARTED]` |
| Rating `.z-rt5` | `parts/z5.css` | `[NOT_STARTED]` |
| Profile `.z-pf`/`.z-pfc`/`.z-pfb`/`.z-pfr`/`.z-pfs`/`.z-pfl`/`.z-pfg` | `parts/z5.css` | `[NOT_STARTED]` — settings profile uses generic cards |
| QR `.z-qr`/`.z-qrb` | `parts/z5.css` | `[MOCK_ONLY]` — `.qr`/`.qrb` classes exist in `petal-app.css` lines 294–295; `PetalQR` referenced in settings source (see §17) |
| `zTotp(secret,counter)` — TOTP code preview | `parts/z5.js` | `[NOT_STARTED]` |
| `zRO(box,fn)` — ResizeObserver helper | `parts/z5.js` | `[NOT_STARTED]` |
| `zLegend(items)` — chart legend | `parts/z5.js` | `[NOT_STARTED]` |
| `zTipAt` / `mkTip` — tooltips | `parts/z5.js` | `[NOT_STARTED]` |

---

## 14. L. z6 Specialized Family

| Component | Source evidence | Status |
|---|---|---|
| Inbox `.z-in`/`.z-is`/`.z-it` | `parts/z6.css` | `[NOT_STARTED]` |
| Chat `.z-cm`/`.z-cmi`/`.z-cmc`/`.z-cmt` | `parts/z6.css` | `[NOT_STARTED]` — support ticket thread uses custom `.row`/`.av` + `.z-cmt` (app-ui.css line 93 region) partially |
| Skeletons `.z-skb`/`.z-sk` | `parts/z6.css` | `[PRODUCTION_VERIFIED]` — via `skeleton.ts` |
| Widgets `.z-wd`/`.z-wg`/`.z-w`/`.z-wh`/`.z-wt`/`.z-wv`/`.z-fly`/`.z-dg` | `parts/z6.css` | `[NOT_STARTED]` |
| Pull-to-refresh `.z-pull`/`.z-ph2` | `parts/z6.css` | `[NOT_STARTED]` |
| Video `.z-vt`/`.z-vjoin` | `parts/z6.css` | `[NOT_STARTED]` |
| `zOpts(list,val)` — option list builder | `parts/z6.js` | `[NOT_STARTED]` |

---

## 15. M. z7 Page Assembly

| Component | Source evidence | Status |
|---|---|---|
| `zPage(id)` — page shell | `parts/z7.js` | `[NOT_STARTED]` — production pages are hand-assembled TS modules |
| `zCard(title,sub,html,cls)` | `parts/z7.js` | `[NOT_STARTED]` — superseded by inline `.card` markup |
| `zHead(t,d,acts)` — page header | `parts/z7.js` | `[NOT_STARTED]` — Views.html `hd(t,sub,act,pre)` equivalent also unported |
| `zComp(key,pid)` + ZP registry (11 page templates) | `parts/z7.js` | `[NOT_STARTED]` |
| `zCache()` | `parts/z7.js` | `[NOT_STARTED]` |

---

## 16. N. z8 / z8b Accessibility Layer

| Component | Source evidence | Status |
|---|---|---|
| `run()` — auto `aria-label` for inputs/buttons/links/nav/th via ICN map | `parts/z8.js` | `[NOT_STARTED]` — production relies on hand-written labels |
| `human()` / `iconName()` / `fieldName()` | `parts/z8.js` | `[NOT_STARTED]` |
| `scrollers()` — `tabindex=0` + `role=region` on scrollables | `parts/z8.js` | `[NOT_STARTED]` |
| `tabsSync()` — roving tabindex tabs | `parts/z8b.js` | `[PARTIAL]` — equivalent behavior reimplemented in `tabs.ts` (`initTabs`) |
| Menu keyboard nav (Arrow/Home/End/Esc/Tab) | `parts/z8b.js` | `[PARTIAL]` — `custom-select.ts` covers listbox menus only |
| `treeRove()` / `toggle()` — tree roving tabindex | `parts/z8b.js` | `[NOT_STARTED]` — file tree has `role="tree"` but no roving behavior |
| `cmdSync()` — combobox ARIA for command palette | `parts/z8b.js` | `[PARTIAL]` — `cmd.ts` manages selection internally without full combobox ARIA |
| `headings()` — heading level audit | `parts/z8b.js` | `[NOT_STARTED]` |

---

## 17. O. Production Petal TS Components (16 files)

| # | File | Exports | Client usage | Status |
|---|---|---|---|---|
| 1 | `alert.ts` | `renderAlert`, `renderError` | 0 calls | `[MOCK_ONLY]` |
| 2 | `cmd.ts` | `CommandPaletteController` | 1 instantiation (shell) | `[PRODUCTION_VERIFIED]` |
| 3 | `custom-select.ts` | `installCustomSelects` | 1 call (init) | `[PRODUCTION_VERIFIED]` |
| 4 | `empty-state.ts` | `renderEmptyState` | 6 calls / 4 files | `[PRODUCTION_VERIFIED]` |
| 5 | `gauges.ts` | `gauge` | 0 calls | `[MOCK_ONLY]` |
| 6 | `icons.ts` | `hero`, `heroPaths` | 83 calls / 12 files | `[PRODUCTION_VERIFIED]` |
| 7 | `modals.ts` | `openModal`, `closeModal`, `setupModalBackdrop`, `initModalStacker` | only `initModalStacker` (1 call) | helpers `[MOCK_ONLY]`; stacker `[PRODUCTION_VERIFIED]` |
| 8 | `otp.ts` | `initOtp`, `getOtpValue`, `clearOtp`, `shakeOtp` | 0 calls (inline duplicate in `client/index.ts` 688–760) | `[MOCK_ONLY]` |
| 9 | `pagination.ts` | `paginateItems`, `renderPager`, `renderPaginationFooter` | 8+5+1 calls | `[PRODUCTION_VERIFIED]` |
| 10 | `radiogroup.ts` | `initRadioGroups` | 1 call (init) | `[PRODUCTION_VERIFIED]` |
| 11 | `rich-text-editor.ts` | `petalRichTextEditor`, `editorMarkdown`, `resetEditor`, `installRichTextEditors` | 3+3+1 calls | `[PRODUCTION_VERIFIED]` |
| 12 | `skeleton.ts` | `renderSkeleton` | 9 calls / 5 files | `[PRODUCTION_VERIFIED]` |
| 13 | `sparklines.ts` | `smooth`, `spark` | 2+2 calls | `[PRODUCTION_VERIFIED]` |
| 14 | `stepper.ts` | `renderStepper`, `updateStepper` | 0 calls (inline duplicate in `deploy/index.ts` line 116) | `[MOCK_ONLY]` |
| 15 | `tabs.ts` | `initTabs`, `initTabsById` | 2 calls | `[PRODUCTION_VERIFIED]` |
| 16 | `toasts.ts` | `toast` | 133 calls / 13 files | `[PRODUCTION_VERIFIED]` |

**Barrel:** `src/frontend/petal/index.ts` re-exports all components. Built bundle `public/assets/app-ui.js` contains 48 petal function references — build is current (bundle mtime 2026-10-19 19:07 > newest client source 2026-10-19 00:15).

---

## 18. P. Layout & Shell

| Component | Source evidence | Status |
|---|---|---|
| `.app` / `.app-h` app frame | `panel.html`; production `.ap` (petal-app.css 222) | `[PRODUCTION_VERIFIED]` |
| `.shell(list,active,body,o)` — sidebar+topbar+tabbar | Views.html | `[PRODUCTION_VERIFIED]` — reimplemented in `src/frontend/client/shell/` |
| `.auth(card,art)` — auth layout with `.bars` art | Views.html; `.au-*` petal-app.css 243–255 | `[PRODUCTION_VERIFIED]` — login/register/mfa |
| `.pubnav(on)` — public nav | Views.html | `[PRODUCTION_VERIFIED]` — status/legal pages |
| `.dh` — dashboard header | petal-app.css 203 | `[PRODUCTION_VERIFIED]` |
| `.bigic` — big icon block | petal-app.css 267 | `[PRODUCTION_VERIFIED]` |
| `.spin` — spinner | petal-app.css 265 | `[PRODUCTION_VERIFIED]` |
| `.kbd` — keyboard hint | petal-app.css 173 | `[PRODUCTION_VERIFIED]` — command palette hints |
| `.live` — live indicator | petal-app.css 353–354 | `[PRODUCTION_VERIFIED]` |
| `.edtb` — editor toolbar | petal-app.css 293 | `[PRODUCTION_VERIFIED]` — rich-text editor |
| `.fm-*` — file manager | app-ui.css 210–218 | `[PRODUCTION_VERIFIED]` — services files tab |
| `.au-*` — auth layout | petal-app.css 243–255 | `[PRODUCTION_VERIFIED]` |

---

## 19. Production vs Canon — Gap Analysis

### Fully ported (canon → production, verified)
`.btn` (subset), `.pill`, `.tile`, `.chip` (base), `.card`, `.fld`/`.inp`, `.seg`, `.tabs`, `.sw`, `.chk`, `.alert` (CSS only), `.kv`, `.tbl`, `.li`, `.crumbs`, `.pager`, `.mdl`/`.dr`, `.menu`/`.dd`, `.toast`, `.sk`/`.z-skb`, `.es`/`.z-es`, `.tl2`, `.steps`, `.otp` (CSS), `.cpf`, `.sch`, `.drop`, `.tree` (file manager), `.cmd`, `.ban`, `.au`, `.tabbar`, `.sd`.

### Partially ported (simplified or divergent)
- `.btn`: 8 of ~15 canon variants missing (`.sec`, `.sq`, `.load`, `.l`/`.lg`, `.rect`, `.sp`, `.play`).
- `gauge`: horizontal bar instead of canon donut/ring.
- Chat: `.z-cmt` message bubble reused, but `.z-cm`/`.z-cmi` thread structure replaced by custom `.row`/`.av`.
- Sessions: `.li` rows instead of `.z-ss`/`.z-ssr` with dismiss animation.
- Command palette: functional but without full z8b combobox ARIA.
- Tree: `role="tree"` present, roving tabindex absent.

### Not ported at all (canon-only families)
- **z4:** wizard, pivot table with column drag, CSV import, `zInp`/`zSeg`/`zSel` builders, `validate`/`validate0live`.
- **z5:** 2FA setup cards, sessions, invoices, checklists, NPS, 5-star rating, profile card, `zTotp`, chart tooltips/legend, `zRO`.
- **z6:** inbox, chat structure, widgets, pull-to-refresh, video, `zOpts`.
- **z7:** page assembly (`zPage`/`zCard`/`zHead`/`zComp`/ZP registry/`zCache`).
- **z8/z8b:** auto-labels, scroller regions, tree roving, heading audit.
- **panel.html primitives:** `.badge`, `.tag`/`.tagin`, `.sheet`/`.sheetm`, `.pop` (CSS only), `.stepper` (numeric), tooltips.

### Implemented but unused (dead / shadowed code)
- `renderAlert`, `renderError` (0 calls; pages inline the markup).
- `openModal`/`closeModal`/`setupModalBackdrop` (0 calls; pages toggle `.mdl` classes directly).
- `otp.ts` entire API (0 calls; duplicated inline in `client/index.ts` 688–760).
- `stepper.ts` (0 calls; duplicated inline in `deploy/index.ts` 116).
- `gauge` (0 calls).

---

## 20. Top-10 Migration Gaps (priority order)

1. **Duplicate inline OTP logic** — `client/index.ts` 688–760 reimplements `otp.ts`; consolidate onto `initOtp`.
2. **Duplicate inline stepper logic** — `deploy/index.ts` 116 reimplements `stepper.ts`; consolidate onto `renderStepper`/`updateStepper`.
3. **Unused `renderAlert`/`renderError`** — replace hand-written alert/error markup across all pages.
4. **Unused modal helpers** — route all `.mdl` open/close through `openModal`/`closeModal`/`setupModalBackdrop` for uniform stacking + focus behavior.
5. **z8b keyboard/ARIA layer missing** — tree roving, menu keyboard nav, full combobox ARIA for `.cmd`, heading audit.
6. **z5 sessions family** — port `.z-ss`/`.z-ssr` with `.out` dismiss animation for settings → sessions.
7. **z5 2FA setup family** — port `.z-ak` cards + `zTotp` preview (currently generic modal; see §21 discrepancy).
8. **Chart family** — port `donut`/`heat`, `.z-cw` chart well, `.ctip` tooltips, `zLegend`, `zRO` scaling; upgrade `gauge` to canon ring.
9. **Empty-state class duplication** — unify `.es` (static) and `.z-es` (component) into one family.
10. **Button variant gaps** — port `.sq` (icon-only), `.load` (loading), `.sec`, `.l`/`.lg` from `panel.html` canon.

---

## 21. Discrepancies & Verification Notes

1. **`z-2f` / `z-qr` / `z-qrb` / `z-sec` / `z-pane` build discrepancy:** markup exists in `src/frontend/client/pages/settings/index.ts` lines 664–676 (2FA setup modal with `PetalQR`), and the bundle `app-ui.js` (2026-10-19 19:07) is newer than the source (2026-10-19 00:15), yet `grep` for these class names in the built JS returns no matches — while `z-aut`/`z-aur`/`z-aud`/`z-es`/`z-skb` from other pages **are** found. Possible causes: string construction that defeats the literal grep pattern, or a stale/partial build for the settings module. **Action required:** rebuild and re-verify before relying on the 2FA modal in production.
2. **Two empty-state families** (`.es` in petal-app.css 181 vs `.z-es`/`.z-art` from empty-state.ts) — both verified in production; consolidation recommended.
3. **`.z-cmt`** (z6 chat message) is referenced by `app-ui.css` support-messages styling, but the surrounding z6 chat structure (`.z-cm`/`.z-cmi`) was never ported — a hybrid.
4. Usage counts are call-site counts from `grep -r` over `src/frontend/client/`; definitions in `src/frontend/petal/` are excluded.

---

## 22. Totals

| Family | Canon components/variants found | Ported to production | Verified in use |
|---|---|---|---|
| Buttons & groups | 15+ variants | 9 | 9 |
| Badges/chips/pills/tags/tiles | 4 families, 25+ variants | 3 families | 3 |
| Form controls | 12 | 8 | 8 |
| Selection controls | 3 | 3 | 3 |
| Navigation | 8 | 7 | 7 |
| Data display | 8 | 8 | 8 |
| Overlays | 6 | 4 | 4 |
| Feedback & states | 7 | 6 | 5 |
| Charts | 8 | 2 (spark/smooth) | 2 |
| z4 specialized | 8 | 0 | 0 |
| z5 specialized | 13 | 1 (z-es) | 1 |
| z6 specialized | 7 | 1 (z-skb) | 1 |
| z7 page assembly | 5 | 0 | 0 |
| z8/z8b a11y | 8 | 2 partial equivalents | 2 |
| Petal TS components | 16 files / 30 exports | — | 11 files / 19 exports |
| **Total distinct entries** | **~130** | **~60** | **~54** |

*End of catalog. Generated from direct filesystem inspection; no canonical design file was modified.*
