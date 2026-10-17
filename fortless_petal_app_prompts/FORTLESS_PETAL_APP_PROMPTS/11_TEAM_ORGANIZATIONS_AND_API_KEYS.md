# Task 11: workspace, team and API developer experience

**Existing:** teams membership APIs recently implemented, session-based account model, staff memberships separate from customer account memberships. Preserve role boundaries; customer OWNER is NOT staff OWNER.

**Canonical Petal:** Account & business > API keys with permissions; Data > profile cards, avatar stacks, tables; Forms pro > repeater and copy; Communication > Share dialog with permissions; Dropdowns > searchable select; Overlays > confirmation; Navigation > tabs.

Build team management around actual `Account -> Membership -> User`. List active members/pending invites, invite with role and confirmation, revoke invitations, change role with privilege check and audit, leave workspace with last-owner rule, org picker only if session/backend supports it. All displayed team rows must be real. Cross-tenant role and invite acceptance tests are required.

API key management is separate: scoped service API tokens, secret shown only once, hashed at rest, no admin-style wildcard permissions for customers, key name/expiry/last used, rate limiting/revoke/rotate, recent MFA for sensitive actions and correct Petal `.z-ak` permissions UI. Do not expose root Pterodactyl credentials. Integrate with command search only within allowed accounts. Write negative tests for self-role escalation, invite reuse, token replay/overscoped access and secret visibility.
