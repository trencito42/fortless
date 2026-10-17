# Task 09: finish `/app/settings` without changing the beautiful MFA wizard

**Existing:** working Petal `.z-2f` TOTP flow, QR, 6-digit OTP, recovery-code grid, session cards, password change, team membership listing/invitation. Some status/download/provider features remain blocked.

**Canonical Petal:** Account & business > Two-factor QR, active sessions, API keys with permissions; Navigation > Underline tabs; Selection > switches; Advanced forms > profile/password; System > 403/500; Inputs > OTP; Data > key-value; Feedback > status and confirmation; Onboarding > checklist.

Tabs (only where real): Profile, Security, Sessions, Team, Notifications, Appearance, API Access, Data & privacy. Profile edit with verified email change flow and audit. Security: current password change, working MFA enrollment exactly preserved, backup code regenerate with recent step-up, trusted session list and revoke others, optional WebAuthn/passkeys using approved server library and origin/RPID verification. Handle enrollment changes and recovery securely. Notification settings: persist per-user toggles with real delivery policy; no toggles claiming effect without backend.

Sessions: timezone-aware device/IP/last active and revoke, current-session protection, paginated if needed. Team: role-safe invitations, pending invitation revocation, least privilege, last-owner guarantees. Appearance: Petal light/dark + optional system mode, retained across page reloads; don't fork theme. API keys: build with Petal `.z-ak` visual; only when backend supports scoped hashed tokens, creation with one-time reveal, expiry/revocation, per-key audit and step-up; never expose a fake 'Generated' key.

Keep `.z-2f`, `.steps`, `.z-qr`, `.otp`, `.z-bc` and `window.PetalQR` integrated, and avoid replacing them with generic forms. Run regression tests for recovery-code one-time use, QR secret redaction, 2FA reload, multi-session revocation, last-owner denial, light/dark mobile and no secret leakage.
