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

describe('FTL-UI-203: a superseded page load never settles', () => {
  it('aborts the GET tied to the previous navigation and leaves writes alone', async () => {
    const { apiClient } = await import('../src/frontend/core/api/client.js');
    vi.stubGlobal('window', { location: { pathname: '/app', search: '', href: '' } });
    const controller = new AbortController();
    apiClient.setNavigationSignal(() => controller.signal);
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      if (url === '/api/v1/auth/csrf') return resolve(new Response(JSON.stringify({ csrfToken: 't' }), { status: 200 }));
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      if (!init?.signal) resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }));
    let settled = false;
    const pending = apiClient.get('/api/v1/services').then(() => { settled = true; }, () => { settled = true; });
    controller.abort(); // the user navigated away
    await new Promise((r) => setTimeout(r, 30));
    expect(settled).toBe(false);
    void pending;
    // a write started during a navigation is not tied to its signal and completes normally
    await expect(apiClient.post('/api/v1/save', {})).resolves.toEqual({ ok: true });
    apiClient.setNavigationSignal(null);
  });
});

describe('UI-06: segmented filters are keyboard operable', () => {
  // A very small DOM stand-in: just the members initRadioGroups touches.
  function fakeGroup(labels: string[], checkedIndex: number) {
    const listeners: Record<string, Array<(e: any) => void>> = {};
    const group: any = { dataset: {}, addEventListener: (t: string, fn: (e: any) => void) => { (listeners[t] ??= []).push(fn); } };
    const radios = labels.map((value, i) => {
      const input: any = { type: 'radio', checked: i === checkedIndex, click: () => { radios.forEach((r) => { r.input.checked = r.input === input; }); (listeners['change'] ?? []).forEach((fn) => fn({})); } };
      const attrs: Record<string, string> = {};
      const el: any = { tabIndex: 0, setAttribute: (k: string, v: string) => { attrs[k] = v; }, attrs, focus: () => { (globalThis as any).document.activeElement = el; }, closest: () => ({ querySelector: () => input }) };
      return { el, input, value };
    });
    group.querySelectorAll = () => radios.map((r) => r.el);
    return { group, radios, fire: (key: string) => { const e = { key, preventDefault: () => undefined }; (listeners['keydown'] ?? []).forEach((fn) => fn(e)); } };
  }

  it('makes the checked control the only tab stop and moves the selection with the arrow keys', async () => {
    const { initRadioGroups } = await import('../src/frontend/petal/components/radiogroup.js');
    const { group, radios, fire } = fakeGroup(['ALL', 'AUTH', 'BILLING'], 0);
    vi.stubGlobal('document', { activeElement: null });
    initRadioGroups({ querySelectorAll: () => [group] } as never);
    expect(radios.map((r) => r.el.tabIndex)).toEqual([0, -1, -1]);
    expect(radios.map((r) => r.el.attrs['aria-checked'])).toEqual(['true', 'false', 'false']);

    radios[0]!.el.focus();
    fire('ArrowRight');
    expect(radios.map((r) => r.input.checked)).toEqual([false, true, false]);
    expect(radios.map((r) => r.el.tabIndex)).toEqual([-1, 0, -1]);
    expect(radios[1]!.el.attrs['aria-checked']).toBe('true');
    fire('ArrowLeft'); fire('ArrowLeft');
    expect(radios.map((r) => r.input.checked)).toEqual([false, false, true]); // wraps around
    fire('Home');
    expect(radios[0]!.input.checked).toBe(true);
  });
});

describe('FTL-UI-206: power controls follow the real lifecycle and runtime state', () => {
  it('only offers controls for an ACTIVE contract whose runtime is settled', async () => {
    const { serviceState } = await import('../src/frontend/client/pages/services/status.js');
    expect(serviceState({ contract_status: 'ACTIVE', runtime_state: 'RUNNING' })).toMatchObject({ running: true, controllable: true });
    expect(serviceState({ contract_status: 'ACTIVE', runtime_state: 'STOPPED' })).toMatchObject({ running: false, controllable: true });
    for (const runtime of ['INSTALLING', 'ERROR', 'UNKNOWN', 'STARTING']) {
      expect(serviceState({ contract_status: 'ACTIVE', runtime_state: runtime }).controllable).toBe(false);
    }
    for (const contract of ['SUSPENDED', 'TERMINATED', 'PAST_DUE']) {
      expect(serviceState({ contract_status: contract, runtime_state: 'RUNNING' })).toMatchObject({ controllable: false, running: false });
    }
  });
});
