# Task 10: real notification center, never sample data

**Canonical Petal:** Data > Notification items, badges, status dots; Social & content > Grouped notifications, activity log; Communication > Multi-conversation inbox only where appropriate; Overlays > Popover and side drawer; Navigation > Tabs with counts; Utilities > Infinite scroll, offline/error states.

Inspect existing shell/app and admin APIs before adding any UI. Build a notification bell in the Petal header with unread count, dropdown/side sheet, grouped chronological list, filter unread/all, mark read, mark all read, direct links to authorized invoices/tickets/services, and settings-level delivery preferences. Drive it with a real database schema and transactional notification outbox linked to domain events.

Notification taxonomy: ticket reply/status, successful provisioning, failed/stuck provisioning, service suspend/resume, due/paid invoice, payment failure, password or security changes, workspace invitation. Prevent duplicate event notifications with idempotency keys. Scope to recipient user+account, enforce visibility rules (especially staff notes), cap count and retention, and use bounded pagination. Prefer SSE with authenticated source if valuable, otherwise safe polling with visibility-awareness. Events must not leak through an unauthorized cross-tenant URL.

Use Petal notification visual primitives, never introduce a new dropdown style. Show truthful empty/offline/read state. Do not claim push/email delivery works unless vendor configured. Write tests for dedupe, read isolation, badge counts, cross-tenant access, real event generation and keyboard/focus semantics.
