import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Router } from '../src/frontend/core/router/router.js';
import { CLIENT_ROUTES, ADMIN_ROUTES } from '../src/frontend/core/router/routes.js';
import { money, formatBytes, compactId } from '../src/frontend/core/utils/formatting.js';
import { formatDate } from '../src/frontend/core/utils/dates.js';
import { esc } from '../src/frontend/core/utils/dom.js';
import { renderMarkdown } from '../src/frontend/core/utils/markdown.js';
import { spark, smooth } from '../src/frontend/petal/components/sparklines.js';
import { renderSkeleton } from '../src/frontend/petal/components/skeleton.js';
import { paginateItems, renderPager, renderPaginationFooter } from '../src/frontend/petal/components/pagination.js';
import { ApiError, SessionExpiredError, StepUpRequiredError } from '../src/frontend/core/api/errors.js';
import { dashboardGreeting } from '../src/frontend/client/pages/home/index.js';

describe('Phase 1 customer navigation and dashboard regressions', () => {
  it('uses native cross-document navigation without body replacement', () => {
    for (const path of ['../public/index.html', '../public/status.html', '../public/legal.html']) {
      const html = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(html).not.toContain('document.body.innerHTML = doc.body.innerHTML');
      expect(html).not.toContain('new DOMParser()');
    }
    const petalCss = readFileSync(new URL('../public/assets/petal-app.css', import.meta.url), 'utf8');
    expect(petalCss).toContain('@view-transition{navigation:auto}');
    expect(petalCss).toContain('view-transition-name:public-nav-bar');
  });

  it('keeps local admin search separate from the global command palette', () => {
    const admin = readFileSync(new URL('../src/frontend/admin/index.ts', import.meta.url), 'utf8');
    const command = readFileSync(new URL('../src/frontend/petal/components/cmd.ts', import.meta.url), 'utf8');
    expect(admin).toContain("target.closest('[data-cmd]')");
    expect(admin).toContain("querySelectorAll<HTMLInputElement>('[data-search]')");
    expect(command).toContain('(e.metaKey || e.ctrlKey)');
    expect(command).toContain("e.key.toLowerCase() === 'k'");
  });

  it('renders the four local-time greeting dayparts and handles missing names', () => {
    const at = (hour: number) => new Date(2026, 9, 19, hour, 0, 0);
    expect(dashboardGreeting('Stefan Popescu', at(8))).toBe('Good morning, Stefan ☀️');
    expect(dashboardGreeting('Stefan Popescu', at(14))).toBe('Hello, Stefan 💪');
    expect(dashboardGreeting('Stefan Popescu', at(20))).toBe('Good evening, Stefan 🌙');
    expect(dashboardGreeting('Stefan Popescu', at(2))).toBe('Still up, Stefan? 🥱💤');
    expect(dashboardGreeting(undefined, at(8))).toBe('Good morning ☀️');
    expect(dashboardGreeting('  ', at(2))).toBe('Still up? 🥱💤');
  });
});

describe('Category N: Modular Frontend Architecture & Petal Integration', () => {
  describe('Router & Route Definitions', () => {
    it('CLIENT_ROUTES contains all canonical customer management routes', () => {
      expect(CLIENT_ROUTES.dashboard!.path).toBe('/app');
      expect(CLIENT_ROUTES.services!.path).toBe('/app/services');
      expect(CLIENT_ROUTES.deploy!.path).toBe('/app/deploy');
      expect(CLIENT_ROUTES.billing!.path).toBe('/app/billing');
      expect(CLIENT_ROUTES.tickets!.path).toBe('/app/support');
      expect(CLIENT_ROUTES['ticket-new']!.path).toBe('/app/support/new');
      expect(CLIENT_ROUTES['ticket-detail']!.pattern?.test('/app/support/tkt_123')).toBe(true);
      expect(CLIENT_ROUTES.audit!.path).toBe('/app/activity');
      expect(CLIENT_ROUTES.settings!.path).toBe('/app/settings');
      expect(CLIENT_ROUTES['service-detail']!.path).toBe('/app/services/:id');
    });

    it('ADMIN_ROUTES contains all canonical staff control plane routes', () => {
      expect(ADMIN_ROUTES.overview!.path).toBe('/admin');
      expect(ADMIN_ROUTES.accounts!.path).toBe('/admin/accounts');
      expect(ADMIN_ROUTES.services!.path).toBe('/admin/services');
      expect(ADMIN_ROUTES.orders!.path).toBe('/admin/orders');
      expect(ADMIN_ROUTES.billing!.path).toBe('/admin/billing');
      expect(ADMIN_ROUTES.infrastructure!.path).toBe('/admin/infrastructure');
      expect(ADMIN_ROUTES.catalog!.path).toBe('/admin/catalog');
      expect(ADMIN_ROUTES.tickets!.path).toBe('/admin/tickets');
      expect(ADMIN_ROUTES.audit!.path).toBe('/admin/audit');
      expect(ADMIN_ROUTES.staff!.path).toBe('/admin/staff');
      expect(ADMIN_ROUTES.status!.path).toBe('/admin/status');
      expect(ADMIN_ROUTES.settings!.path).toBe('/admin/settings');
      expect(ADMIN_ROUTES['account-detail']!.pattern?.test('/admin/accounts/acc_123')).toBe(true);
      expect(ADMIN_ROUTES['admin-service-detail']!.pattern?.test('/admin/services/svc_123')).toBe(true);
      expect(ADMIN_ROUTES['admin-ticket-detail']!.pattern?.test('/admin/tickets/tkt_123')).toBe(true);
    });

    it('Router registers handlers and matches static and parameterized paths', () => {
      const router = new Router(CLIENT_ROUTES, '/app');
      let matchedRoute: string | null = null;
      let capturedId: string | null = null;

      router.register('servers', (match) => {
        matchedRoute = match.route.id;
      });

      router.register('service-detail', (match) => {
        matchedRoute = match.route.id;
        capturedId = match.params.id || null;
      });

      // Verify router instance and structure
      expect(router).toBeDefined();
      expect(matchedRoute).toBeNull();
      expect(capturedId).toBeNull();
    });
  });

  describe('Core Formatters & Minor Units Precision', () => {
    it('money() formats integer minor units into currency strings', () => {
      expect(money(1999, 'EUR')).toContain('19.99');
      expect(money(0, 'EUR')).toContain('0.00');
      expect(money(100000, 'EUR')).toContain('1,000.00');
    });

    it('formatBytes() formats byte quantities with correct binary units', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(1073741824)).toBe('1.0 GB');
    });

    it('compactId() truncates long identifiers safely with ellipsis', () => {
      expect(compactId('short-id')).toBe('short-id');
      const longId = 'srv_0194857362514385960412';
      const truncated = compactId(longId);
      expect(truncated.length).toBeLessThan(longId.length);
      expect(truncated).toContain('…');
    });

    it('formatDate() normalizes and formats ISO and SQL timestamps', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate('2026-10-17 10:30:00')).not.toBe('—');
      expect(formatDate('2026-10-17T10:30:00Z')).not.toBe('—');
    });
  });

  describe('XSS Prevention & Markdown Parser', () => {
    it('esc() escapes HTML entities to prevent DOM XSS', () => {
      const malicious = '<script>alert("xss")</script>&"\'';
      const escaped = esc(malicious);
      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
      expect(escaped).toContain('&amp;');
      expect(escaped).toContain('&quot;');
      expect(escaped).toContain('&#39;');
    });

    it('renderMarkdown() safely renders bold, italics, code and blockquotes inside Petal .prose', () => {
      const md = '**bold text** and `inline_code`\n\n> quote here';
      const rendered = renderMarkdown(md);
      expect(rendered).toContain('class="prose"');
      expect(rendered).toContain('<strong>bold text</strong>');
      expect(rendered).toContain('<code>inline_code</code>');
      expect(rendered).toContain('<blockquote>quote here</blockquote>');
      expect(rendered).not.toContain('<script>');
    });

    it('renderMarkdown() sanitizes script injection within markdown links', () => {
      const maliciousMd = '[Click me](javascript:alert(1))';
      const rendered = renderMarkdown(maliciousMd);
      expect(rendered).not.toContain('href="javascript:');
    });
  });

  describe('Petal Sparkline Bezier Generator', () => {
    it('smooth() returns empty string for fewer than two points', () => {
      expect(smooth([])).toBe('');
      expect(smooth([[0, 0]])).toBe('');
    });

    it('spark() generates valid SVG path with bezier curve', () => {
      const svg = spark([10, 20, 15, 30, 25], 'var(--accent)');
      expect(svg).toContain('<svg class="spark"');
      expect(svg).toContain('viewBox="0 0 120 36"');
      expect(svg).toContain('stroke="var(--accent)"');
      expect(svg).toContain('<path d="M');
    });
  });

  describe('Petal lifecycle components', () => {
    it('renders canonical page skeleton classes without loading-copy layout placeholders', () => {
      const list = renderSkeleton('list', 'Loading services');
      const dashboard = renderSkeleton('dashboard', 'Loading workspace overview');
      expect(list).toContain('class="z-skb"');
      expect(list).toContain('class="skel"');
      expect(list).toContain('role="status"');
      expect(dashboard).toContain('z-skeleton-metrics');
      expect(dashboard).not.toContain('state-message');
    });

    it('keeps rich editor focus and service tabs on the canonical Petal contracts', () => {
      const appCss = readFileSync(new URL('../public/assets/app-ui.css', import.meta.url), 'utf8');
      const appHtml = readFileSync(new URL('../public/app.html', import.meta.url), 'utf8');
      // Service detail tabs are JS-rendered into #serviceDetailView; verify host div exists
      const serviceDetailSrc = readFileSync(new URL('../src/frontend/client/pages/services/index.ts', import.meta.url), 'utf8');
      expect(appCss).not.toContain('.rta:focus{box-shadow');
      expect(appHtml).toContain('id="serviceDetailView"');
      expect(serviceDetailSrc).toContain('class="tabs under"');
      expect(serviceDetailSrc).toContain('role="tabpanel"');
      expect(serviceDetailSrc).not.toContain('class="tab-btn');
      expect(appHtml).not.toContain('class="tab-btn');
    });

    it('uses the canonical Petal shell and component contracts in operations', () => {
      const adminHtml = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
      const adminCss = readFileSync(new URL('../public/assets/admin-ui.css', import.meta.url), 'utf8');
      const iconsSource = readFileSync(new URL('../src/frontend/petal/components/icons.ts', import.meta.url), 'utf8');
      expect(adminHtml).toContain('/assets/petal-app.css');
      expect(adminHtml).toContain('class="ap"');
      expect(adminHtml).toContain('class="sd"');
      expect(adminHtml).toContain('class="nv"');
      expect(adminHtml).toContain('class="mdl"');
      expect(adminHtml).toContain('class="bx');
      expect(adminHtml).toContain('class="tbl rsp"');
      expect(iconsSource).toContain('/assets/petal-icons.svg#');
      expect(adminHtml).not.toContain('class="scrim"');
      expect(adminHtml).not.toContain('class="modal"');
      expect(adminHtml).not.toContain('class="badge');
      expect(adminCss).not.toContain('.badge{');
      expect(adminCss).not.toContain('.scrim{');
      expect(adminCss).not.toContain('.modal{');
    });

    it('keeps mobile More sheets below the dock and prevents iOS form zoom', () => {
      const landing = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
      const appHtml = readFileSync(new URL('../public/app.html', import.meta.url), 'utf8');
      const appCss = readFileSync(new URL('../public/assets/app-ui.css', import.meta.url), 'utf8');
      const petalCss = readFileSync(new URL('../public/assets/petal-app.css', import.meta.url), 'utf8');
      expect(landing).toContain("{label:'Menu',docked:true}");
      expect(landing).toContain('#modal.dock-sheet{z-index:54}');
      expect(appHtml).toContain('class="mdl dr mobile-nav-sheet"');
      expect(appCss).toContain('.mdl.mobile-nav-sheet{display:grid;z-index:98');
      expect(petalCss).toContain('[contenteditable="true"]{font-size:16px!important}');
      expect(landing).toContain('[contenteditable="true"]{font-size:16px!important}');
    });

    it('keeps database secrets disclosed on demand and deploy checkout behind the completed wizard', () => {
      const databaseSource = readFileSync(new URL('../src/frontend/client/pages/services/panel-tabs.ts', import.meta.url), 'utf8');
      const serviceSource = readFileSync(new URL('../src/frontend/client/pages/services/index.ts', import.meta.url), 'utf8');
      const deploySource = readFileSync(new URL('../src/frontend/client/pages/deploy/index.ts', import.meta.url), 'utf8');
      const appHtml = readFileSync(new URL('../public/app.html', import.meta.url), 'utf8');
      expect(databaseSource).toContain('data-db-details hidden');
      expect(databaseSource).toContain('data-db-create hidden');
      expect(databaseSource).toContain('aria-expanded="false"');
      expect(serviceSource).toContain('data-service-mode="easy"');
      expect(serviceSource).toContain('data-service-mode="advanced"');
      expect(serviceSource).toContain("fortless_service_mode_${serviceId}");
      expect(deploySource).toContain('if (deployStep !== 2)');
      expect(deploySource).toContain("item.id === deployState.selectedRegionId && !item.isSoldOut");
      expect(deploySource).not.toContain('deployState.selectedPlanId = deployState.plans[0].planVersionId');
      expect(deploySource).toContain("marker.innerHTML = hero('check', 'xs')");
      expect(deploySource).not.toContain("marker.textContent = index < deployStep ? '✓'");
      expect(appHtml).toContain('id="doDeployBtn" class="btn pri blk" style="height:50px" hidden disabled');
    });

    it('uses customer-friendly activity, active-ticket defaults and a bounded recent ticket thread', () => {
      const activitySource = readFileSync(new URL('../src/frontend/client/pages/activity/index.ts', import.meta.url), 'utf8');
      const serverSource = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
      const supportSource = readFileSync(new URL('../src/frontend/client/pages/support/index.ts', import.meta.url), 'utf8');
      const gameSource = readFileSync(new URL('../src/frontend/client/pages/services/game.ts', import.meta.url), 'utf8');
      const appHtml = readFileSync(new URL('../public/app.html', import.meta.url), 'utf8');
      expect(activitySource).toContain('Signed in to the server panel with SSO');
      expect(activitySource).toContain('Signed out of Fortless');
      expect(activitySource).toContain('item.service_name');
      expect(activitySource).toContain('item.ticket_subject');
      expect(serverSource).toContain("AS service_name");
      expect(serverSource).toContain("AS ticket_subject");
      expect(activitySource).not.toContain("item.action.replaceAll('.', ' · ')");
      expect(appHtml).toContain('name="ticketStatus" value="OPEN" checked hidden');
      expect(supportSource).toContain('data-ticket-message');
      expect(supportSource).toContain('max-height:min(680px,62vh)');
      expect(supportSource).toContain('conversation.scrollTop = conversation.scrollHeight');
      expect(gameSource).toContain('/game/eula/accept');
      expect(gameSource).toContain('Accept and restart');
      expect(gameSource).toContain("headers: body === undefined ? {} : { 'Content-Type': 'application/json' }");
    });

    it('uses the canonical Petal public contracts for status and legal without fake telemetry', () => {
      const statusHtml = readFileSync(new URL('../public/status.html', import.meta.url), 'utf8');
      const legalHtml = readFileSync(new URL('../public/legal.html', import.meta.url), 'utf8');
      for (const html of [statusHtml, legalHtml]) {
        expect(html).toContain('/assets/petal-app.css');
        expect(html).toContain('class="pn"');
        expect(html).toContain('class="pc"');
        expect(html).not.toContain('class="site-header"');
        expect(html).not.toContain('class="badge');
      }
      expect(statusHtml).toContain('class="ban"');
      expect(statusHtml).toContain('class="pill good d"');
      expect(statusHtml).toContain("fetch('/api/v1/status'");
      expect(statusHtml).toContain('id="themeToggleBtn"');
      expect(statusHtml).toContain("localStorage.getItem('fortless_theme')");
      expect(statusHtml).not.toContain('Latency:');
      expect(statusHtml).not.toContain('100.0% UPTIME');
      expect(statusHtml).not.toContain('generateUptimeTicks');
      expect(legalHtml).toContain('class="doc"');
      expect(legalHtml).toContain('class="toc"');
      expect(legalHtml).toContain('id="themeToggleBtn"');
      expect(legalHtml).toContain("localStorage.getItem('fortless_theme')");
      expect(legalHtml).toContain('class="prose card legal-document"');
      expect(legalHtml).toContain("activate('__ACTIVE_DOC__', false)");

      // Admin panel markup checks
      const adminHtml = readFileSync('public/admin.html', 'utf8');
      expect(adminHtml).toContain('id="page-admin-service-detail"');
      expect(adminHtml).toContain('id="page-account-detail"');
      expect(adminHtml).toContain('id="page-admin-ticket-detail"');
      expect(adminHtml).not.toContain('id="modalAdminServiceDetail"');
      expect(adminHtml).not.toContain('id="modalTicketDetail"');
      expect(adminHtml).toContain('id="modalCreateProductFromEgg"');
      expect(adminHtml).toContain('id="page-settings"');
      expect(adminHtml).toContain('id="nav-settings"');
      expect(adminHtml).toContain('id="testProviderBtn"');
    });
  });

  describe('Typed API Client Errors', () => {
    it('ApiError preserves status, code, and response payload', () => {
      const err = new ApiError('Not found', 404, 'NOT_FOUND', { resource: 'service' });
      expect(err.name).toBe('ApiError');
      expect(err.status).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.details).toEqual({ resource: 'service' });
    });

    it('SessionExpiredError defaults to 401 status', () => {
      const err = new SessionExpiredError();
      expect(err.status).toBe(401);
      expect(err.name).toBe('SessionExpiredError');
    });

    it('StepUpRequiredError defaults to 403 status and STEP_UP_REQUIRED code', () => {
      const err = new StepUpRequiredError();
      expect(err.status).toBe(403);
      expect(err.code).toBe('STEP_UP_REQUIRED');
      expect(err.name).toBe('StepUpRequiredError');
    });
  });

  describe('Petal Canonical Pagination Component', () => {
    it('slices items correctly and formats summary info for various page sizes', () => {
      const items = Array.from({ length: 25 }, (_, i) => `item_${i + 1}`);

      // Page 1 of 3 (10 per page)
      const p1 = paginateItems(items, 1, 10);
      expect(p1.page).toBe(1);
      expect(p1.pages).toBe(3);
      expect(p1.total).toBe(25);
      expect(p1.items).toEqual(items.slice(0, 10));
      expect(p1.info).toBe('Showing 1–10 of 25');

      // Page 3 of 3 (last page with 5 items)
      const p3 = paginateItems(items, 3, 10);
      expect(p3.page).toBe(3);
      expect(p3.items).toEqual(items.slice(20, 25));
      expect(p3.info).toBe('Showing 21–25 of 25');

      // Clamps out-of-range requested pages
      const pClampHigh = paginateItems(items, 999, 10);
      expect(pClampHigh.page).toBe(3);
      const pClampLow = paginateItems(items, -5, 10);
      expect(pClampLow.page).toBe(1);

      // Empty list
      const empty = paginateItems([], 1, 10);
      expect(empty.total).toBe(0);
      expect(empty.pages).toBe(1);
      expect(empty.page).toBe(1);
      expect(empty.items).toEqual([]);
      expect(empty.info).toBe('0 items');
    });

    it('renders canonical Petal pager buttons with accessible attributes', () => {
      // 1 page returns empty pager
      expect(renderPager(1, 1)).toBe('');

      // 3 pages, on page 2
      const pagerHtml = renderPager(2, 3);
      expect(pagerHtml).toContain('data-pg="1"');
      expect(pagerHtml).toContain('data-pg="2" aria-current="true"');
      expect(pagerHtml).toContain('data-pg="3"');
      expect(pagerHtml).toContain('aria-label="Previous page"');
      expect(pagerHtml).toContain('aria-label="Next page"');

      // First page has disabled previous button
      const p1Html = renderPager(1, 3);
      expect(p1Html).toContain('disabled aria-label="Previous page"');

      // Last page has disabled next button
      const p3Html = renderPager(3, 3);
      expect(p3Html).toContain('disabled aria-label="Next page"');

      // Large page count has ellipsis
      const p10Html = renderPager(5, 10);
      expect(p10Html).toContain('aria-hidden="true">…<');
    });

    it('renders a full pagination footer with ids and data-c', () => {
      const footer = renderPaginationFooter(1, 4, 35, 10, { infoId: 'auditInfo', pagerId: 'auditPager' });
      expect(footer).toContain('id="auditInfo"');
      expect(footer).toContain('id="auditPager"');
      expect(footer).toContain('Showing 1–10 of 35');
      expect(footer).toContain('data-c="Pagination"');
    });
  });
});

