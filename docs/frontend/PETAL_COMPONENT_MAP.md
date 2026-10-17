# Petal Component Lifecycle & Reuse Registry

## 1. Component Lifecycle & DOM Management

To prevent memory leaks and duplicate event bindings when navigating single-page routes:
1. **Mounting:** Components bind event listeners using dedicated handlers or clean delegation on root container.
2. **Unmounting:** The router cleans up active event controllers, timers, or abort controllers prior to rendering the new page view.
3. **Data Invariants:** Zero hardcoded placeholders. Empty states render Petal `.z-es` with informative descriptions.

---

## 2. Reused Petal Components

| Component | Petal Canonical Source | Adopted Class / Markup | Behavior & Integration |
| :--- | :--- | :--- | :--- |
| **Command Palette** | `panel.html:396-403`, `panel.html:1140-1150` | `.scrim#cmd`, `.cmd`, `.inp`, `.res`, `.it`, `.foot` | Keyboard navigation (`↑`, `↓`, `↵`, `Esc`), live debounced search `/api/v1/search`, focus trapping |
| **Telemetry Sparkline** | `panel.html:857-861` | `.spark`, `svg.spark`, `path.ln` | Pure mathematical Bezier `smooth()` curve generation from numerical metric series |
| **Circular Gauge** | `panel.html:871` | `svg.chart`, `path` arc, `text` | Calculated polar coordinate arc for memory/CPU allocation utilization |
| **Modal Scrims & Drawers** | `panel.html:381-395` | `.scrim`, `.modal`, `.modal.lg`, `.scrim.drw` | Backdrop click closing, Escape key handler, focus trap |
| **Markdown Prose** | `out.html:1200` | `.prose`, `.code`, `blockquote`, `ul`, `li` | Sanitized markdown parser converting messages into Petal typographic prose |
| **Attachment Chips** | `out.html:1250` | `.att-chip`, `.att-list` | Inline download pills displaying file type icon, filename, and human-readable size |
| **Step-Up Verification** | `parts/modals.html` | `#modalStepUp`, `.modal` | Intercepts 403 `STEP_UP_REQUIRED`, collects TOTP challenge, retries mutation seamlessly |
| **Toast Notifications** | `panel.html:1450` | `#toasts`, `.toast`, `.toast.good`, `.toast.bad` | Auto-dismissing floating notifications with ease-out animation |
| **Three-Step Authenticator** | `out.html:3100` | `.z-2f`, `.steps`, `.step.cur`, `.z-pane.on`, `.z-qr` | QR code SVG rendering, secret key copying, recovery code generation |
| **Empty State** | `parts/z5.css:55` | `.z-es`, `.z-art`, `h4`, `p` | Styled empty state with geometric art and primary action button |
