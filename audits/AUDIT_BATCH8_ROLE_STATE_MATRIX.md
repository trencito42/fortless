# Role × state × action matrix (source-read, batch 8)

Reviewed at `a236de9`. Every cell comes from reading the route guard and the frontend code; nothing was clicked in a browser, so UI cells are `[SOURCE_READ]` and any runtime behaviour is TEST_NEEDED. "Backend" is what the server enforces; "UI" is what the page offers.

Roles: workspace OWNER, TECH_ADMIN, BILLING_MANAGER, VIEWER; shared-service members (preset viewer / operator / admin); staff roles are in the second table.

## Customer app — account roles

| Action | OWNER | TECH_ADMIN | BILLING_MANAGER | VIEWER | UI behaviour | Findings |
|---|---|---|---|---|---|---|
| Read invoices, orders, subscriptions | allow | allow | allow | allow | shown to all | NEW-408 |
| Read account audit (`/audit`, export) | allow | allow | allow | allow | shown to all | NEW-399, NEW-408 |
| Quote | allow | allow | allow | allow | deploy page open to all; country fixed to DE | NEW-403 |
| Checkout | allow | 403 | allow | 403 | button shown to all, 403 toast | NEW-408 |
| Cancel / reactivate subscription | allow | 403 | allow | 403 | button shown to all | NEW-408 |
| Edit billing details | allow | 403 | allow | 403 | button disabled for other roles (correct) | — |
| Rename workspace | allow | 403 | 403 | 403 | field only rendered for OWNER (correct) | — |
| Invite member | allow | allow (not OWNER role) | 403 | 403 | shown to all | NEW-408 |
| Remove member | allow | 403 | 403 | 403 | revoke button shown to all | NEW-408 |
| DNS zones and records (create/edit/delete) | allow | allow | **allow** | **allow** | shown to all | NEW-369, NEW-370 |
| Support tickets, replies, attachments | allow | allow | allow | allow | shown to all | NEW-371, NEW-372 |
| Own MFA, passkeys, sessions, notification prefs | allow | allow | allow | allow | shown to all | NEW-366, NEW-367 |
| Service overview and activity | allow | allow | activity only | activity only | tabs follow `access.permissions` (correct) | — |
| Power, console, files, backups, databases, schedules, network, startup, settings | allow | allow | 403 | 403 | tabs hidden by permission (correct) | NEW-381, NEW-390 |
| Share a service | allow | allow | 403 | 403 | Users tab only for ACCOUNT kind with control.start | NEW-387, NEW-393 |
| Open hosting panel (SSO) | allow | allow | 403 | 403 | `/panel/open` and `resolvePanelIdentity` check role | NEW-396 |

## Customer app — shared-service members

| Action | viewer | operator | admin | Findings |
|---|---|---|---|---|
| Console connect | allow | allow | allow | |
| Send console commands | **allow** | allow | allow | NEW-404 |
| Read file contents | **allow** | allow | allow | NEW-404 |
| Write/delete files | 403 | allow | allow | NEW-381 |
| Backups read / create / delete / restore | read | read, create, download | all | NEW-390 |
| Databases read (passwords with `database.view_password`) | read | read | all | NEW-391 |
| Startup / settings / reinstall | read | 403 | allow | NEW-390, NEW-392 |
| Manage sharing | 403 | 403 | 403 (owner account only) | |

## Staff roles (backend)

| Action | OWNER | ADMINISTRATOR | BILLING | SUPPORT | INFRASTRUCTURE | AUDITOR | Findings |
|---|---|---|---|---|---|---|---|
| Admin shell, settings page | allow | allow | allow | allow | allow | allow | NEW-406 |
| Accounts read / status change | allow / allow | allow / allow | read | read | read | read | NEW-409 |
| Services read / manage | allow | allow | 403 | read | allow | read | NEW-378 |
| Service `sync` | allow | allow | 403 | **allow** | allow | **allow** | NEW-378 |
| Tickets read / manage | allow | allow | 403 | allow | 403 | read | |
| Audit read and export | allow | allow | 403 | 403 | allow | allow | NEW-380 |
| Staff read / manage | allow | read | 403 | 403 | 403 | read | NEW-376 |
| Catalog read / manage | allow | allow | read | read | allow | read | |
| Manual renewal run | allow | allow | 403 | 403 | 403 | 403 | NEW-379 |

Admin navigation entries are pruned by permission; mutating buttons inside pages are not (a role without `services:manage` still sees the suspend and relink buttons and receives a 403). Global search lists admin pages with permissions that do not exist (NEW-407).

## States

| State | Backend result | UI result | Findings |
|---|---|---|---|
| Session expired / account LOCKED or FLAGGED_FRAUD (no active workspace) | 401 | redirect to `/login?next=`; no explanation | NEW-368, NEW-409 |
| Multi-workspace user, oldest workspace locked | silently uses the next ACTIVE workspace | no notice | NEW-368 |
| CSRF cookie older than 1 h | 403 `CSRF_INVALID` | generic error, no retry | NEW-405 |
| Service SUSPENDED / TERMINATED | console, files and panel calls return 403 `SERVICE_NOT_ACTIVE` | tabs hidden through `controllable` | |
| Service still provisioning | 409 `SERVICE_PROVISIONING` | tabs hidden | |
| Provider not configured | 503 `PROVIDER_NOT_CONFIGURED` | "Provider controls unavailable" pill | |
| Provider offline or timeout on a read | 502 `PROVIDER_ERROR` | error toast / empty state | |
| Provider offline or timeout on a write | 502, outcome unknown | shown as failure; retry invites duplicates | NEW-381, NEW-393 |
| Account locked, service shared with another account | member keeps full access | none | NEW-409 |
| Double submission | checkout, ticket and DNS forms disable the button; no idempotency key on ticket or DNS create; checkout key is a new UUID per click | | not filed (guarded in the UI) |
| False success | domain "Register" toast states no registrar purchase was made (honest); `sync` answers `success:true` on failure; AI endpoints return mock output | | NEW-378, NEW-386, FTL-DNS-201 |

## Not verified here

Visual state of each page in a browser (loading, empty and error skeletons), keyboard/focus behaviour, and phone-width layout were not exercised; they need a browser run on the staging site with one account per role.
