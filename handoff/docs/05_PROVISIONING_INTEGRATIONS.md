# FORTLESS — Provisioning, vendor integrations and technical panel

## Provider adapter contract
A provider adapter must declare exact vendor name/version, capability matrix, auth method, rate limits, external ID idempotency strategy, resource-unit mapping, creation/update/suspend/terminate semantics, known error handling and tested status. No interface implies that a provider supports a function it doesn't actually expose. Suggested commands:
- `validateConfig`, `discoverRegions`, `discoverPlans`, `checkCapacity`, `reserveCapacity` where possible.
- `provision(immutableSpec,operationId)` -> external resource identity + pending/ready state.
- `lookupExternal(externalId)`, `observe`, `setDesiredLimits`, `powerAction`, `suspend`, `unsuspend`, `reinstall`, `backup`, `restore`, `remove` (latter must be approval-gated).
- `listCapabilitiesForService`, `pollOperation`, `healthcheck`.
Each operation is tenant-scoped before leaving API; customer never chooses arbitrary provider account/nodes/allocations from unvalidated request.

## Recommended workflow for each provision operation
1. Fulfillment eligibility (`order.paid && item.notFulfilled && riskApproved && withinCapacity`).
2. Commit desired service spec+capacity reservation and job outbox with unique order item effect key.
3. Worker obtains per-service lock / optimistic version; reads state fresh.
4. Deterministic provider external ID stored before sending request; use provider-supported fields to correlate.
5. Send allowed API call, record sanitized request operation ID and provider response with retries only for known-safe errors.
6. On timeout/connection reset, do not assume failure; lookup by app ID/external ID and reconcile.
7. Verify actual limits, node, owner mapping, startup template and installation status; store external mapping and mark ready only on verified outcome.
8. Release reservation or mark capacity consumed, notify customer exactly once, log successful operation.
9. For permanent failure place service in visible `NEEDS_MANUAL_REVIEW`; staff can correct config/capacity and safely redrive, or initiate compensation.

## Pterodactyl 1.x launch adapter
Official docs: https://docs.pterodactyl.io/v1/api and https://docs.pterodactyl.io/v1/api/application-servers/post-create-server
- Application API credentials stored in backend secret manager, generated with minimum privileges. Provision application user safely, store `userId` mapping, use external IDs if supported; validate egg startup and environment against server-side allowlist.
- Inventory panel nodes, region/location and allocations through documented API, reconcile what is free, reserved and already consumed; do not assume panel resources are infinitely available.
- Provision technical server under correct panel user, egg, docker image, startup, env, CPU, memory, swap, disk, backups, databases, allocations; custom egg revisions go through tested approval.
- Respect provider reporting of install progress. Pterodactyl `201 created` != installed and ready to accept connections.
- Suspension is not termination. On termination use grace, snapshots if policy requires, explicit deletion authorization, safety verification of ownership and external ID. NEVER remove provider resources based solely on a guessed or reused customer ID.
- Client UI: capability-first. For power/console/files/backups/databases/schedules/startup/network/users ensure supporting documented Client API permission and robust authentication; do not send Application API key to client. Websockets use documented authorized short-lived tokens, correct URL and origin policy; revocation and no cross-account subscriptions.
- Direct panel link is an acceptable first release if secure white-label console integration exceeds phase gate. Don't claim 1:1 functionality without implementing or officially linking real features. Do not implement unsafe pseudo-SSO (automated password handoff/cookie theft).

## Pterodactyl 2.x compatibility
2.x has changed API topology, including Admin API and nest endpoints removed. Implement separate tested adapter only when consciously supporting 2.x; never share an unversioned Pterodactyl client across incompatible major versions. https://docs.pterodactyl.io/v2/api . Do not upgrade production panel for aesthetic reasons or use beta by accident.

## Discord Bot Hosting
Templates/eggs by supported runtimes (Node/Python/etc.), CPU/memory/storage and process supervision, environment secrets, deployment artifact limits, logs, startup command validation, restart backoff, backups. Never let user-hosted code access Docker socket, cloud metadata, host volumes, service API network, or cross-customer filesystem. Account for abuse: spam/bot attacks, network flooding, token leaks, crypto mining; enforce AUP, rate/egress policies and suspension workflow. Provide documentation for secrets without emailing token values.

## Node.js app hosting
A generic Pterodactyl egg does not by itself mean managed app hosting. Required extra systems: secure git/archive upload or build interface, pinned Node versions, dependency install/build in isolated quotas, runtime & port registration, internal routing service, custom hostnames ownership verification, ACME/TLS issuance, domain routing changes, HTTP probes, logs and release history. For HTTP reverse proxy, default dedicated managed edge (e.g. Traefik/Caddy) behind isolated network. Prevent domain takeover, Host-header poisoning, wildcard misrouting, proxying to internal-only hosts and certificate abuse. Scope this P1, not magical functionality.

## cPanel/WHM shared hosting
Choose vendor/version/license. Use dedicated reseller/WHM API token and least privileges, verified API createacct/suspendacct/unsuspendacct/changepackage/removeacct. Validate requested domain and username, avoid duplicate account creation on ambiguous response. Provider-reported package limits and actual account status must be reconciled. Mailbox services and PHP/Node support depend on license/hosting config; do not promise npm/install tooling solely on marketing claims. Verified reseller SSO only. Refuse plaintext password mirroring between Fortless and cPanel.

## Domain registrar
Choose and contract reseller registrar, verify supported TLDs and registration/transfer API, actual payment/credit settlement, price quotes and async provisioning semantics. Important failure cases: available at initial search but unavailable at final purchase; premium name price changes; transfer pending/auth code invalid; incorrect registrant contact/WHOIS validation; TLD documentation and minimum term, redemption fee after expiry; DNSSEC support; nameserver propagation; IDN handling; renewal not honored; registry manual hold; chargeback after irreversible registration. Each operation has explicit receipt/status not assumed instantly successful. Refund/legal implications differ from virtual hosting resources.

## VPS provider
Do not build own virtualization abstraction against root ssh or raw shell. Select API-backed provider such as approved Proxmox cloud management/other authenticated platform after licensing/operations research. Ensure dedupe of VM create, image authenticity, secure init keys, root credential delivery, per-client network/IP/resource isolation, quota, snapshot/backups, billing expiry and manual override, paid-state checks, abuse and DDoS controls. Pricing must account for bandwidth, IPv4, overages, images and backup costs. No user-supplied cloud-init execution on Fortless management host.

## Prevent provider fraud and infrastructure losses
- Every provisioned paid service has a current entitlement and active verified local ownership. Detect orphaned active server resources automatically; no auto-delete without investigation.
- Validate requested resource limits against immutable paid plan; no client-chosen egg/template IDs outside server mapping.
- Ensure upgrade only after its effective paid/approved entitlement; downgrade policy must safely account for disk data larger than target capacity.
- Ports/IP allocations are exclusive at provider scope, atomic; prevent port stealing by known allocation ID manipulations.
- Force credentials-only-to-correct-principal; signed single-use temporary secrets on authorized dashboard flow; no secrets in emails/screenshots/logs.
- External provider credential failure triggers circuit breaker, admin alert and customer pending state; never fallback to unsandboxed alternative account.
- Free trials, if ever offered, are per policy with abuse and resource limits, not an auth boolean.
