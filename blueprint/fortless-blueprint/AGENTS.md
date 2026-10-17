# Rules for AI coding agents operating on Fortless

READ `MASTER_PROMPT.md`, then all files in `docs/` before writing implementation code. Follow the most detailed applicable rule. This repository may be brand-new or partially implemented: inspect it, do not assume.

Project owner has an existing design system. Do not generate a competing design system; wait for and reuse it exactly when provided. In absence of design components, prioritize architecture/contracts/backend and use minimal neutral UI scaffolding.

Mandatory practices:
1. Never fabricate live provider integration, legal policy approval, test execution, payment capture, operational success or security certification.
2. Never store/show payment card PAN or CVV, auth secrets, privileged panel API keys or user infrastructure credentials in browser/public files/logs.
3. Enforce client/staff RBAC + per-object tenant authorization in server domain methods AND API boundary.
4. Never start paid provisioning on client redirect alone. Only verified PSP facts plus trusted purchase state and explicit risk/capacity gates.
5. Use durable inbox/outbox, idempotency and reconciliation for PSP events and provider side effects. A timeout is an unknown outcome, not guaranteed failure.
6. Live changes to billing, provider resources, DNS, email, and destructive data operations require explicit authorization and verified environment configuration.
7. Keep historical monetary documents immutable and reconcile refunds/credit notes correctly.
8. Integrate third-party services based on actual official API version/capabilities. No guessed methods.
9. Build negative-path and concurrency tests before declaring financial/provider features done.
10. Provide implementation status with precise evidence; never label MOCK as production.

Start with Phase 0 and maintain `/docs/fortless` with project-specific validated decisions. Use `docs/08_ROADMAP_AND_DECISIONS.md` for unknown business inputs. Proposed stack is not a reason to discard valid existing code.
