# PHASE 9 — EXTEND FORTLESS BEYOND GAMES/BOTS (SEPARATE PROVIDER PROJECTS)

Use this prompt only after customer+admin, billing and Pterodactyl staging are verifiably functional. Read `00_GLOBAL_CONTRACT.md` and the provider API docs before designing or implementing. Do **not** interpret one adapter as authorization to promise all hosting products. Integrate each category incrementally behind its own capability gate, pricing, capacity, security review and contract tests.

## 1. Node.js / app hosting

An egg alone does not make trustworthy application hosting. Define supported runtimes, build/install/deploy pipeline, environment variable secret handling, persistent process supervisor, CPU/memory limits, log streaming, dependency/cache controls, self-service deployments, Git integration only with scoped OAuth, domains, DNS verification, HTTPS/TLS issuance/renewals, reverse-proxy routing, custom ports, access logs, quotas, anti-abuse policy and resource isolation. Explicitly prevent SSRF via metadata/internal-network access, port hijacking and untrusted workloads accessing host Docker socket. Include restore/rollbacks and health checks. Sell only once implementation is tested on staging.

## 2. Web hosting (cPanel/WHM or chosen partner)

Use documented, correctly licensed WHM APIs to create/suspend/upgrade/delete accounts and packages. Define email/DNS/SSL/backup responsibilities, plan caps, account ownership, distinct reseller roles, provider mapping and recovery after timeout; handle cPanel webhook/action limitations through polling. Do not assume CloudPanel, Plesk or cPanel features are equivalent. No cracked licensing. Bind controls to actual API support.

## 3. VPS hosting

Pick provider/hypervisor (Proxmox, cloud vendor, Virtualizor or other contract), choose tenant model, templates/images, CPU/RAM/storage quota, reserved/public IP allocations, secure passwords/SSH key injection, cloud-init, snapshots, reinstall, console proxy, power/network, reverse DNS, abuse handling, capacity and billing. Use isolated virtual machines, not Docker advertised as VPS. Enforce no customer access to hypervisor admin tokens. Never allow arbitrary host-local file/image paths.

## 4. Domain registrar + DNS

Choose reseller contract/API and permitted TLDs. Validate IDN/punycode and registrant contact rules, domain availability and transfer price in real time, nameservers, DNSSEC, EPP/AuthInfo, WHOIS privacy where available, auto-renew, transfer locks, pending redemption/restore states, failed registry operations, and time-sensitive expiry notices. A domain search result is not a reservation; purchase only after a unique paid order and accepted registrar transaction; uncertain outcome requires reconciliation, not blind retry. Never expose EPP keys or private contacts to unauthorized users.

## 5. Managed databases / object storage

Define actual engine/versions, quotas, isolated tenants and credentials, IP/TLS access, backups/restore, access logs, monitoring, encryption at rest, replication and disaster recovery. Never label a Pterodactyl database quota 'managed DB hosting' without a real managed service boundary.

## 6. Optional AI-assisted services

Only after core is stable. AI support assistant can read **approved redacted** logs and public docs with strict tenant scope; destructive changes require separate explicit user confirmation, server validation and audit. No model-generated shell commands executed automatically, no provider credentials sent to model, no privilege escalation via malicious customer log content. Per-account cost budgets and opt-in consent. No invented promises about AI deployment products without provider choice.

## Uniform delivery protocol PER category

Provider selection + contractual/technical limits -> capability specification -> data model -> admin plan template/inventory -> pricing/tax -> provider staging adapter -> trust boundary review -> full negative+fault injection tests -> customer UI -> docs/runbook -> rollout flag. Report `NOT_STARTED`, `STAGING_VERIFIED` or `PRODUCTION_VERIFIED` individually for each service category. Never ship 5 categories at once as mock cards masquerading as operational products.
