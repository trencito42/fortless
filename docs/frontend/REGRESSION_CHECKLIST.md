# Frontend Regression & Acceptance Checklist

## 1. Authentication & Session Security
- [ ] User registration, activation link verification, and error display.
- [ ] Login with valid credentials generates HttpOnly session cookie and redirects.
- [ ] Invalid credentials trigger brute-force penalty without leaking account existence.
- [ ] TOTP MFA challenge verifies valid code and handles one-time recovery codes.
- [ ] WebAuthn / Passkeys authentication succeeds with hardware token or biometric prompt.
- [ ] Session expiration redirects to `/login?next=...` and preserves destination.
- [ ] Changing password revokes all other active sessions and sends notification.

## 2. Customer Application Shell & Navigation
- [ ] Deep-link page refresh on `/app`, `/app/deploy`, `/app/billing`, `/app/support`, `/app/activity`, `/app/settings`.
- [ ] Browser Back and Forward buttons update view state without full page reload.
- [ ] Mobile bottom tab bar navigates smoothly between primary sections.
- [ ] Theme switcher toggles between light and dark themes and persists in `localStorage`.
- [ ] Notification bell popover displays unread count and marks notifications as read.

## 3. Command Palette (`Ctrl+K` / `⌘K`)
- [ ] Pressing `Ctrl+K` (or `Cmd+K`) opens Petal Command Palette.
- [ ] `Escape` key closes palette, returns focus.
- [ ] Debounced query updates search results categorized by Navigation, Services, Tickets, Invoices.
- [ ] Arrow Up/Down navigates highlighted item; `Enter` executes action or navigation.
- [ ] No cross-tenant or unauthorized admin actions appear for standard customers.

## 4. Customer Feature Workflows
- [ ] **Dashboard:** Real service metrics rendered in stat tiles with Petal SVG trend sparklines.
- [ ] **Deploy:** Catalog plans and datacenter regions load dynamically; quote calculation updates with coupon discounts.
- [ ] **Billing:** Sequential invoices displayed; receipt download button streams plaintext invoice receipt.
- [ ] **Support:** Customer tickets listed; detail view renders Markdown prose and downloadable attachment chips.
- [ ] **Ticket Attachments:** Customer can attach files (max 5MB, whitelisted MIME) and download them securely.
- [ ] **Activity:** Audit log renders events with IP and metadata; search filters rows; expandable inspection works.
- [ ] **Settings:** Active device sessions listed with revoke capability; team invitations sent; Passkey credentials managed.
- [ ] **Services Detail:** Runtime state, allocation gauges, and connection info render real database values. Honest unavailable message for unconfigured remote console.

## 5. Staff Admin Control Plane
- [ ] `/admin` requires staff role + active MFA; redirects unauthenticated or non-staff users.
- [ ] Navigation links dynamically filter based on staff member's granular RBAC permissions.
- [ ] Account locking and staff permission updates require Step-Up MFA Challenge (`#modalStepUp`).
- [ ] Staff ticket reply adds message and updates ticket status; staff internal notes remain hidden from customer views.

## 6. Build & Code Quality
- [ ] `npx tsc --noEmit` passes with 0 compiler errors.
- [ ] `npm test` passes 100% of automated test suites (72/72 tests).
- [ ] Bundle size of `public/app.html` reduced by >85% compared to monolithic baseline.
