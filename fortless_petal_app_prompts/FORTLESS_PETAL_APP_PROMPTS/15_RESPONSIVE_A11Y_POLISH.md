# Task 15: responsive, theme and keyboard polish across ALL existing routes

**Canonical Petal:** app shell `.app/.side/.tabbar`; mobile portrait dock and compact landscape rail; overlays bottom sheet; input/stepper/skeleton/empty; reduced-motion and theme tokens. No new visual framework.

Audit all existing pages and newly introduced details at 320px, 375px, 430px, 768px, 1024px, 1440px and short-height landscape layouts. Focus on actual navigation, dialogs, selects, command palette, rich text editor, 2FA wizard, file upload, tables, ticket thread, payment status and long service names. Eliminate horizontal page overflow, unreachable dock actions, mobile input zoom and header overlap. Tables should preserve scanability with canonical Petal record card/scroll strategy.

Implement accessible dialog focus trap/return, Escape, aria-current route, combobox/listbox semantics, logical tab order, keyboard sortable/filterable data tables, readable contrast in both themes, reduced motion and appropriate live regions for toast/status. Preserve existing Petal state classes and brand geometry. Disable buttons only with accurate reason, never silently.

Use browser screenshots/Playwright if available; visual check both themes and guest/customer/staff states. Capture documented before/after test evidence, not just CSS grep. Never claim E2E if actual browser isn't run. No unapproved redesign of public landing.
