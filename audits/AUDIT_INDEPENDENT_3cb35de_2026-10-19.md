# Independent audit, batches 1–3 — reviewed commit `3cb35de`

Canonical register: [FORTLESS_MASTER_SECURITY_UI_BUG_TRACKER.xlsx](./FORTLESS_MASTER_SECURITY_UI_BUG_TRACKER.xlsx)
Method: source reading and local reproductions only (in-memory database, no provider or payment calls). No implementation code was changed. Tests at audit time: 237/237 passing, `tsc` clean.

## What was merged first

`STATUS_REOPEN_PATCH_32afdbb.csv` was merged by finding ID (19 rows). The workbook already contained NEW-339..343 as single rows (marked `FIXED_IN_CODE` by the coding agent after 32afdbb), so no duplicate rows were added. Each patch row is in `Status History` as `AUDIT_PATCH_MERGE`, followed by a second row where the independent verdict at `3cb35de` differs from the patch target. The separately uploaded `FORTLESS_REOPENED_AUDIT_32afdbb_FOR_MERGE.xlsx` is a patched copy of this register and was not used as a source.

## Verdict on the 19 patch IDs at `3cb35de`

| ID | Patch target | Verdict | Why (short) |
|---|---|---|---|
| NEW-301 | PARTIAL | PARTIAL | Subscription is CANCELED and Stripe cancel queued before provider termination can fail |
| NEW-302 | PARTIAL | PARTIAL | Webhooks mark TERMINATED before the provider deletes anything |
| NEW-303 | PARTIAL | PARTIAL | Coupon redeemed before payment; release path broken (NEW-349) |
| NEW-306 | OPEN | FIXED_IN_CODE | Route needs step-up and rejects PEM; attestation parsed and bound |
| NEW-308 | FIXED_IN_CODE | FIXED_IN_CODE | Staged integrity check present; restore drill pending |
| NEW-330 | OPEN | OPEN | Oldest ISSUED invoice of the account is marked paid, no Stripe invoice match |
| NEW-331 | FIXED_IN_CODE | FIXED_IN_CODE | Only OWNER can grant OWNER |
| NEW-332 | PARTIAL | PARTIAL | Guard depends on NODE_ENV=production, live runs development (NEW-361) |
| NEW-333 | OPEN | PARTIAL | Dispatched now, but completes silently without calling Stripe when key or id missing |
| NEW-334 | OPEN | OPEN | No Stripe Refunds API call exists |
| NEW-335 | FIXED_IN_CODE | FIXED_IN_CODE | Cumulative formula correct; multi-refund test pending |
| NEW-336 | OPEN | FIXED_IN_CODE | Unsuspend dispatched and handled; see NEW-355 |
| NEW-337 | FIXED_IN_CODE | FIXED_IN_CODE | Dead letter keeps TERMINATED |
| NEW-338 | OPEN | OPEN | One local subscription per item shares a Stripe id; lookups take the first row |
| NEW-339 | OPEN | FIXED_IN_CODE | Unknown event types fail closed |
| NEW-340 | OPEN | PARTIAL | Setup fee separated; tax, discount and quantity still mismatch (NEW-345) |
| NEW-341 | OPEN | PARTIAL | Only synchronous failure releases the coupon; no expiry handler |
| NEW-342 | OPEN | FIXED_IN_CODE | OWNER invitation requires step-up |
| NEW-343 | OPEN | FIXED_IN_CODE | Capacity released once; see NEW-357 |

## New findings, batch 1 (18)

| ID | Priority | Status | Summary |
|---|---|---|---|
| NEW-344 | P0 | OPEN | Scheduled cancellation cancels the Stripe subscription immediately (payload key mismatch) |
| NEW-345 | P0 | OPEN | Stripe Checkout bills only the first quote line, quantity 1 |
| NEW-346 | P0 | OPEN | Webhook inbox drops an event permanently when processing throws |
| NEW-347 | P0 | OPEN | SEMI_ANNUAL plans cannot be settled (subscriptions CHECK) — reproduced |
| NEW-348 | P1 | OPEN | Annual subscriptions ingested with a 30 day renewal date ("ANNUALLY" typo) |
| NEW-349 | P1 | OPEN | Checkout compensation writes values the schema rejects — reproduced |
| NEW-350 | P1 | OPEN | Payments held as ANOMALY after capture are invisible to staff |
| NEW-351 | P0 | OPEN | Reactivation is free when Stripe is unconfigured, "dummy" or NODE_ENV=test |
| NEW-352 | P1 | OPEN | Paid reactivation of a terminated service restores no resource or capacity |
| NEW-353 | P2 | OPEN | Reactivation uses a fixed 30 day period |
| NEW-354 | P1 | OPEN | Stripe outbox dead-letter audit insert violates a foreign key — reproduced |
| NEW-355 | P1 | OPEN | Payment un-suspends services suspended for disputes, fraud or staff action |
| NEW-356 | P2 | OPEN | Grace period restarts on every failed payment |
| NEW-357 | P1 | OPEN | Termination releases capacity that was never reserved |
| NEW-358 | P1 | FIXED_IN_CODE | Passkey sign-in could never verify a real credential (fixed 9dacfcb, refined 32afdbb) |
| NEW-359 | P2 | OPEN | Service access grants full permissions when the role is omitted |
| NEW-360 | P2 | OPEN | WebAuthn challenges are never purged |
| NEW-361 | P1 | OPEN | Live process runs NODE_ENV=development under tsx watch (CONFIG_DEPENDENT) |

Existing `FTL-BILL-206` (OPEN) received additional evidence instead of a new ID. The coupon-on-expiry issue was folded into NEW-341, and the tax and discount mismatch into NEW-340.

Reproductions: `npx tsx audits/proofs/repro-3cb35de.mts` (NEW-347, NEW-349, NEW-354).

## New findings, batch 2 (4) — identity flows

| ID | Priority | Status | Summary |
|---|---|---|---|
| NEW-362 | P2 | OPEN | Account enumeration through registration errors and login timing |
| NEW-363 | P1 | OPEN | Verification link signs in whoever clicks it, enabling pre-registration hijack |
| NEW-364 | P2 | POLICY_DECISION | Account-wide failure limit lets anyone lock a known account out |
| NEW-365 | P2 | OPEN | No per-recipient cooldown on verification and reset emails |

NEW-361 also gained a note: `SESSION_SECRET` is empty in `.env`, so the process uses a random file secret in `data/` (see the register row). Totals after batch 2: 110 findings: 29 OPEN, 15 PARTIAL, 58 FIXED_IN_CODE, 6 NEEDS_VERIFICATION, 2 POLICY_DECISION, 0 TESTED or CLOSED. By priority: 39 P0, 62 P1, 9 P2.

## New findings, batch 3 (10) — MFA, sessions, DNS, attachments, backups

Reviewed at `fc02778`. Full detail (file:line, evidence, fix, acceptance test) is in the workbook.

| ID | Pri | Finding |
|---|---|---|
| NEW-366 | P2 | TOTP codes can be replayed inside their window (no used-step counter) |
| NEW-367 | P2 | Step-up, MFA disable, enrolment confirm and password change have no failed-attempt limiting |
| NEW-368 | P1 | Active workspace is always the oldest account; accepting an invite swaps the session context (reproduced: `audits/proofs/repro-batch3-fc02778.mts`) |
| NEW-369 | P1 | DNS zone/record mutations need authentication only, not a role permission |
| NEW-370 | P1 | Any account can claim any unclaimed domain without ownership proof (squatting; mock-verified default) |
| NEW-371 | P2 | Attachments above ~0.75 MB fail: default 1 MiB body limit vs advertised 5 MB |
| NEW-372 | P2 | No per-ticket/account attachment quota |
| NEW-373 | P1 | Backup script falls back to a hardcoded encryption key |
| NEW-374 | P1 | No scheduled/off-host backups; only backup on this host is unencrypted, from 2026-10-17 |
| NEW-375 | P2 | Restore without the same SESSION_SECRET breaks all MFA; secret is not in the backup |

Checked and not filed: attachment code otherwise sound (size cap, MIME allowlist, sanitized names, tenant scoping, internal-note filtering); the mod installer already uses manual redirects, a host allowlist and SHA-512 checks. Only NEW-368 was reproduced; the rest are source traces.

## New findings, batch 4 (12) — staff admin, sessions, DNS records, file manager, AI, sharing

Reviewed at `645bf61`; all are source traces (no runtime reproduction).

| ID | Pri | Finding |
|---|---|---|
| NEW-376 | P1 | `POST /admin/staff` upserts and skips the self-change and last-owner guards that `PATCH` enforces |
| NEW-377 | P2 | `cleanupExpiredSessions` has no caller; expired/MFA-pending sessions accumulate |
| NEW-378 | P2 | Staff "sync" with read-only permission mints keys, writes state, returns `success:true` on failure and leaks error text |
| NEW-379 | P2 | Manual renewal run needs no step-up (POLICY_DECISION) |
| NEW-380 | P2 | Audit export is unaudited, needs no step-up and silently truncates at 10 000 rows |
| NEW-381 | P2 | File manager mutations report provider timeouts as failures (only archive/unarchive/pull use pending) |
| NEW-382 | P2 | File read buffers the entire file before the 1 MB limit |
| NEW-383 | P2 | DNS names are case-sensitive in CNAME collision checks |
| NEW-384 | P2 | DNS records have no quota/duplicate check; SRV weight/port not forced to integers |
| NEW-385 | P1 | DNS data lives only in SQLite; nothing publishes it while the UI advertises Fortless nameservers (NEEDS_VERIFICATION) |
| NEW-386 | P2 | AI endpoints are wired to a keyword mock with fabricated confidence (no UI caller found) |
| NEW-387 | P2 | A shared service is granted to the recipient account's single panel user, so all its OWNER/TECH_ADMIN get panel access (NEEDS_VERIFICATION) |

Checked and not filed: session list/revoke paths are scoped to the user and audited; password reset and change revoke other sessions; `/oidc/authorize` enforces the OWNER/TECH_ADMIN role inside `resolvePanelIdentity`; file path normalisation rejects `..`, NUL and backslashes; team invite/removal role checks are present; the Wings token is never returned with the account key.

## New findings, batch 5 (6) — panel operations, reconcile, relink, sharing

Reviewed at `2fc2350`; source traces only. NEW-381 also received an evidence note (same pattern in `server-panel.ts`).

| ID | Pri | Finding |
|---|---|---|
| NEW-388 | P2 | Staff relink hands any unlinked panel server to the customer; DB update, panel access and audit are not atomic |
| NEW-389 | P2 | Reconcile deletes every shared member when the subuser listing is empty or malformed |
| NEW-390 | P2 | Reinstall, restore, backup/database delete need no step-up or server-side confirmation (POLICY_DECISION) |
| NEW-391 | P2 | Database passwords are returned without an audit event |
| NEW-392 | P2 | Reinstall completion inferred from the first running/offline reading (NEEDS_VERIFICATION) |
| NEW-393 | P2 | Service invitation accept is not retry-safe; orphan panel subuser possible |

## Chains followed in this batch

Quote → Checkout → Stripe → Webhook → Invoice → Provisioning; Renewal → Failure → Grace → Suspension → Recovery; Cancellation → Stripe → Worker → Provider; Refund → Ledger → Service lifecycle (all static). Payment chains are not safe for real money until NEW-344..347, NEW-349 and NEW-351 are closed.

## Not covered yet (scope checked, not "safe")

Runtime timing behaviour, frontend permission and provider-outage states (UI hides tabs by permission; per-button gating not audited), Wings websocket behaviour in a browser, Pterodactyl SSO panel-side configuration, backups/schedules/databases/startup endpoints of the game-tools installers beyond the earlier read, notification and email-template paths, and the cPanel and Proxmox adapters (cPanel not implemented yet).
