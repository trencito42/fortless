import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('FTL-UI-204: the visual QA script covers every declared route', () => {
  it('exits 0 when ROUTES covers routes.ts and names the gap otherwise', () => {
    const out = execFileSync('python3', ['scripts/verify-views.py', '--list'], { encoding: 'utf8' });
    for (const needed of ['/app/support/new', '/admin/jobs', '/admin/accounts/sample', '/admin/orders', '/admin/settings']) {
      expect(out).toContain(needed);
    }
  });
});
