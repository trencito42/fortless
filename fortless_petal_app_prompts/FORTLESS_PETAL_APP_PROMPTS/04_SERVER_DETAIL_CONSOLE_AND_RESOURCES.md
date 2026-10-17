# Task 04: operational service detail experience, without breaking `/app`

**Existing:** `/api/v1/services`, guarded `/api/v1/services/:id/power`, service records/observed state, provider intentionally mocked/disabled. Add `/app/services/:id` carefully with an explicit server-side tenant-guarded allowlist/route and browser History API support; preserve the existing `/app` dashboard.

**Canonical Petal:** Navigation > Underline tabs / Breadcrumbs; Workspace > Multi-level split panes and collapsible sidebar where appropriate; Data > Key–value list, status, code block, file rows; Charts > gauge, sparkline, area; Feedback > progress, skeleton, error boundary; Overlays > confirm dialog; Utility > copy field.

Service page tabs: Overview, Console, Resources, Files, Backups, Databases, Network, Settings, Activity, Support. Only display tabs that have real backend implementation or clearly label blocked provider-dependent items. Overview shows actual plan, node/region, safe endpoint, billing relationship, installation progress, observed state, and controls. Console logs and commands must use the provider Client API/proxy with authenticated session and strict authorization, WebSocket or SSE lifecycle cleanup, rate limits, redacted secrets and correct buffering. Never expose Pterodactyl application keys or server-specific confidential tokens.

Actions: start, stop, restart, kill require permissions, confirmation where appropriate, anti-spam/idempotency and observed-state reconciliation; disabled with truthful reasons until Pterodactyl verified. Files: Petal tree/list/drag-drop UI with safe file browsing, path confinement, upload limits, atomic downloads and proper checks. Backups and database credentials must be accessible only to authorized owner/team roles. Resources chart must come from real telemetry.

Define API schemas, test server ownership and wrong-tenant access for every nested endpoint, prevent provider ID probing and path traversal, ensure race-safe state transitions. Deliver a UI slice that works without exposing mocked provider functionality as live.
