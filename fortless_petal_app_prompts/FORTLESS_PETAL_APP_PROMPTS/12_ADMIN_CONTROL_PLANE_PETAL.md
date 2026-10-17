# Task 12: fully operational `/admin` using existing Petal admin shell

**Existing:** `public/admin.html`, `public/assets/admin-ui.{js,css}`, real global admin read models and latest phase-4 staff/account/ticket modals/API. Inspect current Git HEAD first; do not rewrite working staff or ticket features and do not mistake existing DB read models for fake data.

**Canonical Petal:** Data & tables > editable grid, expandable rows, saved filters, bulk actions; Workspace > draggable dashboard and contextual command bar if useful; Navigation > Command palette / breadcrumbs; Data > metrics, status, timeline, tables; Forms > searchable selects; Overlays > confirmation, drawers, modals; Charts > real trend graphs; Account > filterable audit log.

Complete admin routes as real ops: overview health and payment/provisioning queues; accounts search/detail, customer verification/status and account locking subject to audited approval; services search/detail, provisioning errors/retries, reconciliation jobs and safe maintenance; ticket work queue with internal notes, assignment, status, close/reopen, attachment moderation; staff permissions with step-up and immutable audit; audit explorer; support macros; capability settings that reflect real integration state. Add separate product catalog administration via later task, not hidden ad hoc forms.

Do not expose provider API keys, raw password hashes, tokens or internal support notes to users. High-impact actions: explicit confirmation, staff RBAC+recent MFA, reason capture, audit, dry run when applicable. No arbitrary SQL console or unsafe infrastructure shell. Dashboard metrics must derive from real DB/provider state; partial/unavailable integrations should be clearly flagged, not rendered green.

Build UI controls as direct Petal compositions without copying demo placeholder business records. Tests for each role (OWNER, BILLING, SUPPORT, INFRASTRUCTURE, AUDITOR), unsafe transition refusal, cross-tenant staff permissions, revocation mid-session, focus and mobile responsiveness.
