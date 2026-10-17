# Fortless redesign: migration tracker

Reference: `docs/design/views.html` (open in a browser; use Phone, Components, Loaded/Loading/Empty/Error, Providers toggles).
Landing: `docs/design/landing.html` (separate task, wave 6).

Status values: TODO, IN PROGRESS, DONE (only after `scripts/verify-views.py` passes for that view).

| # | View id | Old file(s) | Wave | Status | Evidence |
|---|---------|-------------|------|--------|----------|
| 1 | login | public/login.html, public/assets/auth-ui.js | 1 | TODO | |
| 2 | register | public/register.html | 1 | TODO | |
| 3 | mfa | public/mfa-challenge.html | 1 | TODO | |
| 4 | forgot | public/forgot-password.html | 1 | TODO | |
| 5 | reset | public/reset-password.html | 1 | TODO | |
| 6 | verify | public/verify-email.html | 1 | TODO | |
| 7 | home | public/app.html, src/frontend/client/pages/home | 2 | DONE | commit Wave 1 (home) |
| 8 | services | src/frontend/client/pages/dashboard, pages/services | 2 | DONE | commit 2af538a |
| 9 | service | src/frontend/client/pages/services (detail) | 2 | DONE | commit 2af538a |
| 10 | deploy | src/frontend/client/pages/deploy | 3 | DONE | commit e3e657a |
| 11 | domains | src/frontend/client/pages/domains | 3 | DONE | commit 32d1b15 |
| 12 | billing | src/frontend/client/pages/billing | 3 | DONE | commit 8af73fd |
| 13 | support | src/frontend/client/pages/support | 3 | DONE | commit 5c53f84 |
| 14 | ticket | src/frontend/client/pages/support (detail) | 3 | DONE | commit 5c53f84 |
| 15 | activity | src/frontend/client/pages/activity | 3 | DONE | commit dff5f19 |
| 16 | settings | src/frontend/client/pages/settings | 3 | DONE | commit 684c7a8 |
| 17 | o-over | public/admin.html, src/frontend/admin/pages/overview | 4 | TODO | |
| 18 | o-acc | src/frontend/admin/pages/accounts | 4 | TODO | |
| 19 | o-svc | src/frontend/admin/pages/services | 4 | TODO | |
| 20 | o-tix | src/frontend/admin/pages/tickets | 4 | TODO | |
| 21 | o-aud | src/frontend/admin/pages/audit | 4 | TODO | |
| 22 | o-staff | src/frontend/admin/pages/staff | 4 | TODO | |
| 23 | status | public/status.html | 5 | TODO | |
| 24 | legal | public/legal.html | 5 | TODO | |

Wave 0 (before any view): tokens, shared components (src/frontend/petal), shells (client sidebar + tabbar, ops shell, auth layout).
Wave 6: landing page replaces public/index.html.
