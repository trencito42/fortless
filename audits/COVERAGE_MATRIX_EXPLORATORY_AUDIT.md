# Exploratory audit coverage matrix

State at commit `89e3b45` plus batch 9. "Verified" means read in source (and reproduced locally where stated); it does not mean safe. Staging items refer to `STAGING_TEST_PLAN.md`.

| # | Domain | Findings referenced | Verified here | Needs staging / runtime | Outside this audit |
|---|---|---|---|---|---|
| 01 | Authentication | 8 (6 from this audit) | source read; NEW-368 reproduced | login timing (NEW-362), email delivery | — |
| 02 | Sessions & Devices | 6 (3 from this audit) | source read; NEW-368 reproduced | session lifetime and device behaviour in a browser | — |
| 03 | MFA & Passkeys | 10 (4 from this audit) | source read incl. WebAuthn parsing | passkey ceremony on real authenticators; TOTP replay (NEW-366) runtime | — |
| 04 | Authorization / RBAC | 15 (11 from this audit) | routes and frontend read; role/state matrix; NEW-369/376/399/404/408/409 reproduced or traced | browser walk per role (plan item 14) | — |
| 05 | IDOR / BOLA | 3 (0 from this audit) | tenant filters read on routes touched | automated cross-tenant negative suite | — |
| 06 | Multi-tenancy | 4 (0 from this audit) | workspace selection reproduced (NEW-368) | multi-account scenarios in a browser | — |
| 07 | API Security | 5 (1 from this audit) | validation and limits read on audited routes | fuzzing of every route | routes not touched by any batch |
| 08 | CSRF & CORS | 4 (3 from this audit) | CORS, CSRF and cookies read; live headers checked | CSRF expiry in a browser (item 11) | — |
| 09 | XSS & HTML Injection | 2 (0 from this audit) | markdown renderer and pattern search | browser-based XSS testing | exhaustive review of all 185 innerHTML sites |
| 10 | SQL / Command Injection | 1 (0 from this audit) | queries are parameterised where read; path normalisation read | none identified | dynamic scanner |
| 11 | SSRF | 2 (0 from this audit) | validateSafeOutboundUrl and installer redirects read | DNS-rebinding behaviour on staging | — |
| 12 | Secrets & Credentials | 5 (2 from this audit) | secret handling read; plaintext tokens in outbox (NEW-398) | rotation procedure | secret scanning of git history |
| 13 | Pterodactyl API | 6 (2 from this audit) | adapter, client keys, reconcile, relink read | real panel behaviour (items 7, 8) | — |
| 14 | Pterodactyl SSO | 6 (3 from this audit) | repo copy of the SSO patch read; live redirect and reset page probed | deployed files vs repo (item 4); session persistence (item 3) | — |
| 15 | Wings & WebSockets | 3 (2 from this audit) | console client and token flow read | revocation latency (item 1); viewer commands (item 2) | — |
| 16 | File Manager | 4 (2 from this audit) | path rules, error mapping and audit read | timeouts on writes (item 6); symlink/archive behaviour on Wings | — |
| 17 | Minecraft Installers | 3 (2 from this audit) | installer, profiles and admin routes read | memory under parallel installs (item 10) | Modrinth catalog integrity |
| 18 | Web App Isolation | 1 (0 from this audit) | not covered | container isolation on nodes | node/host hardening |
| 19 | Stripe & Payments | 11 (5 from this audit) | webhooks, checkout and refunds read in batch 1 | Stripe test-mode runs (item 15) | live-money testing |
| 20 | Billing & Subscriptions | 21 (8 from this audit) | renewal, cancellation, tax and coupons read | Stripe test-mode runs (item 15) | — |
| 21 | Provisioning | 13 (6 from this audit) | provisioning, power, suspend, terminate, sharing read | panel behaviour (items 8, 9, 12) | — |
| 22 | cPanel / WHM | 2 (0 from this audit) | not covered | — | cPanel not implemented yet |
| 23 | Proxmox / VPS | 3 (0 from this audit) | clone flow only (earlier finding) | Proxmox sandbox | Proxmox adapter review |
| 24 | DNS & Domains | 7 (5 from this audit) | zone/record paths read; NEW-369 reproduced | authoritative DNS backend (NEW-385) | registrar integration |
| 25 | Database Security | 3 (0 from this audit) | schema, constraints and migrations read | restore drill | — |
| 26 | Background Workers | 9 (6 from this audit) | outbox/inbox, email worker, sync and reconcile read | concurrency under load | — |
| 27 | Infrastructure & Network | 2 (1 from this audit) | live response headers only | TLS, firewall and port review | host and network configuration |
| 28 | Dependency & Supply Chain | 1 (0 from this audit) | npm audit --omit=dev: 0 known vulnerabilities at this date | CI secrets and pinning | transitive review beyond npm audit |
| 29 | Backups & Recovery | 7 (3 from this audit) | backup code and host state read | restore drill (NEW-375) | off-host storage |
| 30 | Logging & Monitoring | 6 (4 from this audit) | audit events and exports read | alerting and retention | external log pipeline |
