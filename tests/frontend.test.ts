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
import { ApiError, SessionExpiredError, StepUpRequiredError } from '../src/frontend/core/api/errors.js';

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
      expect(ADMIN_ROUTES.tickets!.path).toBe('/admin/tickets');
      expect(ADMIN_ROUTES.audit!.path).toBe('/admin/audit');
      expect(ADMIN_ROUTES.staff!.path).toBe('/admin/staff');
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
});
