# How to give this blueprint to Antigravity / Cursor / Claude Code

1. Place this entire folder into the coding agent's accessible workspace. Ideally copy `MASTER_PROMPT.md`, `AGENTS.md`, and `docs/` into the root of the Fortless repository, or provide as project attachments.
2. Paste the prompt below into the coding agent:

> You are building Fortless, a real production-minded hosting commerce and provisioning platform. Locate the `fortless-blueprint` folder (or its contents copied to repository root). Read `MASTER_PROMPT.md`, `AGENTS.md` and EVERY file in the accompanying `docs/` completely before editing. Treat these as mandatory implementation requirements, not marketing copy. First inspect the existing repository and only report findings you can verify. Start with Phase 0 documentation and an executable implementation backlog, then build Phase 1 in small tested slices. Reuse my existing design system exactly when I provide it; until then do not invent a new visual library. Security, money correctness, tenant isolation, durable idempotency, external provider reconciliation and negative-path tests are release blockers. No fake integrations or live charge/provision without approved credentials/configuration. After every slice tell me exactly what changed, tests actually executed, remaining problems and what comes next. Don't ask broad preference questions; place unresolved commercial/legal/provider choices in `OPEN_DECISIONS.md` with safest default. Begin.

3. Supply the design system in the next instruction when ready. Ask agent to inventory its components/imports and map each public/client/admin route to existing primitives, without editing backend semantics.
4. Connect actual staging Pterodactyl and payment sandbox credentials only when the implementation reaches the corresponding sandbox test phase. Never paste live secrets into public prompts, git or screenshot descriptions.
5. Review P0 gates before accepting money from customers.

If the coding tool cannot access the folder, paste the **entire** `MASTER_PROMPT.md` rather than just the short launcher above. The master prompt is self-contained, and `docs/` add deeper scenarios.
