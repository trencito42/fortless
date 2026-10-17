# Task 14: real hosting operations, status pages & monitoring

**Canonical Petal:** Charts pro > Live mini chart, dual-axis lines, gauges; Charts > sparklines, heatmap; Feedback > service status, progress, alerts; Data > file tree, code block, timeline; Utilities > error boundary/offline; Workspace > collapsible sidebar/split panes.

On top of existing services and outbox, provide operational monitoring: real node/provider connection status (never infer uptime from process alive), categorized deployment queue, stuck jobs, dead letters, incident chronology, resource allocations and observed CPU/RAM/disk/network history only where vendor telemetry exists. Include safe reconciliation controls, rerun with idempotency, correlation IDs and support links. Ensure system displays independent statuses for API, database, email, billing and Pterodactyl.

Customer service logs must be tenant-safe with bounded scrolling and redaction; admin infra logs require staff permissions. For backend streamed telemetry/console, handle disconnect/reconnect/rate limits, historical timestamps and resource cleanup. Do not connect to live servers without authorized staging credentials or create fake heartbeat charts.

Tests: stale observed state, unavailable panel, failed job, dead-letter recovery, timeout after server creation, cross-tenant log access and simultaneous admin operator actions. Coordinate with existing Phase 7 provider work rather than implementing a separate adapter.
