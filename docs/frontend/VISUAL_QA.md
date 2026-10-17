# Visual QA

## Required matrix

Widths: 375, 390, 430, 768, 1024, 1440 and 1920 px. Themes: light and dark. Mobile landscape is checked separately.

| Area | Light | Dark | Mobile portrait | Mobile landscape | Notes |
|---|---|---|---|---|---|
| Dashboard | pending | pending | pending | pending | Must verify populated and empty states |
| Services | pending | pending | pending | pending | Service detail included |
| Deploy | pending | pending | pending | pending | Wizard, horizontal plan scroller and summary |
| Domains | pending | pending | pending | pending | Catalog result truth copy, zones and DNS records |
| Support list | pending | pending | pending | pending | Search/status filters |
| New ticket | pending | pending | pending | pending | Editor, toolbar, picker, validation |
| Ticket detail | pending | pending | pending | pending | Long thread and partial upload error |
| Billing | pending | pending | pending | pending | Empty and populated records |
| Activity | pending | pending | pending | pending | Search, segmented categories and expanded details |
| Settings | pending | pending | pending | pending | TOTP QR, passkeys, sessions, team |

## Automated checks

- TypeScript/esbuild: passing after current source changes.
- Unit/integration: 128/128 passing, including tenant-safe ticket lifecycle and attachment isolation.
- Browser screenshots: pending authenticated local/live capture. No visual pass is claimed yet.

## Acceptance checks

- No horizontal page overflow.
- 44px minimum primary touch targets.
- No clipped popovers or route content under safe areas.
- Correct logo/theme contrast and Petal token use.
- Hover only communicates a real interaction.
- Keyboard focus is visible; toolbar and command palette are labelled.
- No fake runtime, finance, registration, ticket or activity data.
