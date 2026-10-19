import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiClientForTest } from './helpers/api-client.js';

afterEach(() => vi.unstubAllGlobals());

describe('NEW-405: the browser client recovers from an expired CSRF token', () => {
  it('fetches a fresh token once and repeats the write when the server answers CSRF_INVALID', async () => {
    const calls: Array<{ url: string; token?: string }> = [];
    let tokenSeq = 0;
    vi.stubGlobal('window', { location: { pathname: '/app', search: '', href: '' } });
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, token: headers['X-CSRF-Token'] });
      if (url === '/api/v1/auth/csrf') return new Response(JSON.stringify({ csrfToken: `tok_${++tokenSeq}` }), { status: 200 });
      if (headers['X-CSRF-Token'] === 'tok_1' && calls.filter((c) => c.url === '/api/v1/save').length === 1 && tokenSeq === 1 && (globalThis as any).__expire) {
        return new Response(JSON.stringify({ error: 'CSRF validation failed', code: 'CSRF_INVALID' }), { status: 403 });
      }
      return new Response(JSON.stringify({ saved: true }), { status: 200 });
    });
    const client = new ApiClientForTest();
    await client.post('/api/v1/other', {});            // caches tok_1
    (globalThis as any).__expire = true;                // from now on the server rejects tok_1
    const result = await client.post<{ saved: boolean }>('/api/v1/save', { a: 1 });
    expect(result.saved).toBe(true);
    const saves = calls.filter((c) => c.url === '/api/v1/save');
    expect(saves.map((c) => c.token)).toEqual(['tok_1', 'tok_2']);
    expect(calls.filter((c) => c.url === '/api/v1/auth/csrf')).toHaveLength(2);
  });

  it('gives up after one retry so a persistent refusal is shown, not looped on', async () => {
    vi.stubGlobal('window', { location: { pathname: '/app', search: '', href: '' } });
    let writes = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === '/api/v1/auth/csrf') return new Response(JSON.stringify({ csrfToken: 'tok' }), { status: 200 });
      writes++;
      return new Response(JSON.stringify({ error: 'CSRF validation failed', code: 'CSRF_INVALID' }), { status: 403 });
    });
    const client = new ApiClientForTest();
    await expect(client.post('/api/v1/save', {})).rejects.toMatchObject({ code: 'CSRF_INVALID' });
    expect(writes).toBe(2);
  });
});
