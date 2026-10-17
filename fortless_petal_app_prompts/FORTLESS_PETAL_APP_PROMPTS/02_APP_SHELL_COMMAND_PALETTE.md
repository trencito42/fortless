# Task 02: Fortless universal shell, global search & keyboard workflow

**Existing:** app shell in `public/app.html`; JS router in `public/assets/app-ui.js` (`currentRoute`, `navigate`, `routePaths`, `popstate`); server-owned `/app/:view` auth guard. Do NOT build a second router or replace the current shell.

**Canonical Petal:** Navigation > Command palette / Keyboard keys / Sidebar items / Bottom tab bar; Overlays > Command palette, Popover, Context menu; Workspace layout > Collapsible sidebar / Contextual command bar; Data > Notification items; Feedback > Toasts; Utilities > Loading/error states. Locate the actual `#cmd`, `.cmd`, `cmdRender`, `cmdMove`, `cmdRun` and `[data-cmd]` implementations inside `out.html` and adapt their underlying visual + keyboard behavior to Fortless.

Make command palette open with `Ctrl+K` on Windows/Linux and `⌘K` on macOS, plus visible search trigger and mobile tap entry. Esc closes, Up/Down chooses, Enter activates, Tab and focus are correct, no shortcuts while typing in editor/inputs. Group authorized results: navigation, the user's services, tickets, invoices, settings and commands. Add fast, accessible fuzzy matching and debounced server search for resource results. Search all resources **only with scoped server queries and permissions**. Never fetch or index other tenants' records. Show relevant keyboard hints, recent non-sensitive selections, loading/error/zero-results states.

Working commands: navigate to existing deep links, new ticket, deploy flow, copy a safe service ID/IP, change theme, open settings, refresh services. Destructive operations must require separate confirmation and recent step-up; do NOT trigger power/terminate/refund directly from a keyboard hit. No fake buttons.

Enhance, don't rewrite: maintain current desktop left sidebar, mobile portrait dock, compact landscape rail, semantic `main`, breadcrumbs and focus restoration; ensure all pages keep scroll/focus correctly on route changes and browser back/forward. Add a real account dropdown with profile, organization picker when memberships support it, settings, theme and sign-out. Responsive collapse if justified by Petal source, not a new sidebar design.

Tests: Ctrl+K and Cmd+K; hidden for guest; role-specific results; cross-tenant search denial; keyboard navigation; focus trapping and return; mobile click; route deep-link; rollback/cleanup; light/dark. Record Petal sources and real API evidence.
