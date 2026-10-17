# Fortless Implementation Backlog & Phase Roadmap

Governed by: `FORTLESS_CODEX_MEGA_PROMPTS/` Playbook  
Ordering Principle: Hard Dependencies & Security Risk First

---

## Phase 1 — Code Audit, Mock Elimination Map & Reality Baseline
- [x] **Slice 1.1**: Full repository and architecture inspection (verified Fastify monolith, SQLite WAL, Argon2id, and Petal assets).
- [x] **Slice 1.2**: Comprehensive Petal Component Inventory (`docs/PETAL_COMPONENT_INVENTORY.md`).
- [x] **Slice 1.3**: Security vulnerability assessment (`docs/SECURITY_FINDINGS.md`).
- [x] **Slice 1.4**: Source-of-truth status matrix (`docs/REALITY_MATRIX.md`).

---

## Phase 2 — Production Infrastructure, Reliable Jobs & Hardening (Current Priority)
- [ ] **Slice 2.1**: Fix host binding in `src/index.ts` to `config.HOST` (default `127.0.0.1`) to prevent direct public HTTP bypass.
- [ ] **Slice 2.2**: Include `customOptions` in checkout idempotency request hash calculation in `src/modules/checkout/checkout.ts`.
- [ ] **Slice 2.3**: Implement durable lease recovery for stalled `PROCESSING` outbox worker events in `src/modules/outbox/worker.ts`.
- [ ] **Slice 2.4**: Standalone database migration runner CLI (`npm run migrate`) decoupled from public API startup.
- [ ] **Slice 2.5**: Automated negative test suite for host bind, idempotency options divergence, and worker lease recovery.

---

## Phase 3 — Identity, Authorization, Email & User Settings
- [ ] **Slice 3.1**: Transactional email outbox table and sandbox adapter with retry logic and fail-closed reporting.
- [ ] **Slice 3.2**: Audited initial staff `OWNER` bootstrap CLI (`npm run staff:bootstrap-owner`).
- [ ] **Slice 3.3**: Account settings deletion/export lifecycle and organization team member invitation flow.
- [ ] **Slice 3.4**: WebAuthn / Passkeys exploration and step-up enrollment.

---

## Phase 4 — Admin Control Plane & Governance
- [ ] **Slice 4.1**: Connect `/admin/staff` owner-only management UI to API with step-up verification modal.
- [ ] **Slice 4.2**: Implement real cross-tenant ticket reply and status transitions in `/admin/tickets`.
- [ ] **Slice 4.3**: Implement service inspection and manual operational sync in `/admin/services`.

---

## Phase 5 — Catalog, Inventory & Dynamic Commerce
- [ ] **Slice 5.1**: Dynamic catalog admin management (plan creation, versioning, resource limits).
- [ ] **Slice 5.2**: Node capacity allocation checks and pre-reservation validation.
- [ ] **Slice 5.3**: Option and addon pricing calculations (extra RAM, dedicated IP).

---

## Phase 6 — Billing Engine, Stripe Sandbox & Fiscal Tax
- [ ] **Slice 6.1**: Real Stripe hosted checkout session creation in `stripe_test` mode.
- [ ] **Slice 6.2**: Authoritative `checkout.session.completed` asynchronous settlement handling.
- [ ] **Slice 6.3**: PDF invoice document generation and EU VAT fiscal compliance validation.

---

## Phase 7 — Pterodactyl Infrastructure Provisioning
- [ ] **Slice 7.1**: Real HTTP Pterodactyl client adapter with API token authentication.
- [ ] **Slice 7.2**: Allocation and egg resolution for Minecraft and Discord bot templates.
- [ ] **Slice 7.3**: End-to-end sandbox provisioning saga with live rollback on failure.

---

## Phase 8 — Complete Customer Lifecycle & Support
- [ ] **Slice 8.1**: Customer server power controls with live state reconciliation and audit logging.
- [ ] **Slice 8.2**: Subscription recurring renewal and service auto-suspension upon non-payment.
- [ ] **Slice 8.3**: Full customer ticket lifecycle (attachments, urgency escalation, rating).

---

## Phase 9 — Optional Provider Expansion
- [ ] **Slice 9.1**: Cloud VPS orchestration interface.
- [ ] **Slice 9.2**: Domain registration and DNS record management integration.

---

## Phase 10 — Release Security, Disaster Recovery & Launch
- [ ] **Slice 10.1**: PostgreSQL production migration rehearsal with data reconciliation.
- [ ] **Slice 10.2**: Distributed Redis rate-limiting and session store integration.
- [ ] **Slice 10.3**: Penetration testing (IDOR, CSRF, race conditions, replay).
