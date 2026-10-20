import { test, expect } from '@playwright/test';
import { API_MAP } from '../src/views/service-detail/api-map';
import { createFortlessHttpPorts, normalizeBaseUrl } from '../src/views/service-detail/adapters/fortlessHttp';
import { gateFor } from '../src/views/service-detail/access';
import { ServiceApiError } from '../src/views/service-detail/ports';

/**
 * Contract tests for the HTTP adapter. They run without a browser and without a backend: a recording fetch stands in for
 * Fortless, and every entry of the typed API map is called through the real adapter. What this proves: method, URL, query,
 * body, CSRF header and the destructive `confirm` flag match the routes in trencito42/fortless src/server.ts.
 * What it does NOT prove: that a live Fortless or panel answers (see docs/SERVICE_DETAIL_API_MAP.md, level 5).
 */
type Call = { method: string; url: string; body: unknown; csrf: string | null };
function recorder(reply: (url: string) => { status?: number; json: unknown } = () => ({ json: {} })) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/v1/auth/csrf') return new Response(JSON.stringify({ csrfToken: 'tok-1' }), { status: 200 });
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined, csrf: headers['X-CSRF-Token'] ?? null });
    const r = reply(url);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { calls, fetchFn };
}

const resolve = (ports: unknown, path: string): (...a: unknown[]) => unknown => path.split(".").reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], ports) as (...a: unknown[]) => unknown;

test.describe('typed API map vs HTTP adapter', () => {
  for (const e of API_MAP.filter((x) => x.expect)) {
    test(`${e.port} -> ${e.method} ${e.expect!.url}`, async () => {
      const { calls, fetchFn } = recorder();
      const ports = createFortlessHttpPorts({ fetchFn });
      const fn = resolve(ports, e.port);
      expect(typeof fn, `${e.port} exists on the ports`).toBe('function');
      const args: unknown[] = e.port === 'platform.capabilities' ? [] : ['svc1', ...(e.args ?? [])];
      if (e.method === 'GET' && fn.length > args.length) args.push(new AbortController().signal);
      await fn(...args);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.method).toBe(e.method);
      expect(calls[0]!.url).toBe(e.expect!.url);
      expect(calls[0]!.body).toEqual(e.expect!.body);
      expect(calls[0]!.csrf).toBe(e.method === 'GET' ? null : 'tok-1');
      if (e.confirm) expect((calls[0]!.body as { confirm?: boolean }).confirm).toBe(true);
    });
  }

  test('every port function is covered by the map', () => {
    const ports = createFortlessHttpPorts({ fetchFn: recorder().fetchFn });
    const listed = new Set(API_MAP.map((e) => e.port));
    const missing: string[] = [];
    for (const [group, methods] of Object.entries(ports)) for (const name of Object.keys(methods as object)) if (!listed.has(`${group}.${name}`)) missing.push(`${group}.${name}`);
    expect(missing).toEqual([]);
  });

  test('every mutating route that the backend confirms sends confirm:true', () => {
    for (const e of API_MAP.filter((x) => x.confirm)) expect(['DELETE', 'POST'], e.port).toContain(e.method);
    expect(API_MAP.filter((x) => x.confirm).map((x) => x.port).sort()).toEqual(['backups.remove', 'backups.restore', 'databases.remove', 'settings.reinstall']);
  });
});

test.describe('adapter error handling', () => {
  test('typed backend errors keep status and code, and terminal ones are flagged', async () => {
    const { fetchFn } = recorder(() => ({ status: 503, json: { error: 'Infrastructure provider is not configured.', code: 'PROVIDER_NOT_CONFIGURED' } }));
    const ports = createFortlessHttpPorts({ fetchFn });
    const err = await ports.service.usage('svc1', new AbortController().signal).catch((x) => x);
    expect(err).toBeInstanceOf(ServiceApiError);
    expect(err.status).toBe(503);
    expect(err.code).toBe('PROVIDER_NOT_CONFIGURED');
    expect(err.terminal).toBe(true);
    expect(err.message).toBe('Infrastructure provider is not configured.');
  });

  test('a 502 PROVIDER_ERROR is retryable, not terminal', async () => {
    const { fetchFn } = recorder(() => ({ status: 502, json: { error: 'File manager is temporarily unavailable.', code: 'PROVIDER_ERROR' } }));
    const err = await createFortlessHttpPorts({ fetchFn }).files.list('svc1', '/', new AbortController().signal).catch((x) => x);
    expect(err.terminal).toBe(false);
  });

  test('an expired CSRF token is refreshed once and the write is retried', async () => {
    let first = true; const seen: string[] = []; let csrfFetches = 0;
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/auth/csrf') { csrfFetches++; return new Response(JSON.stringify({ csrfToken: `t${csrfFetches}` }), { status: 200 }); }
      seen.push((init?.headers as Record<string, string>)['X-CSRF-Token'] ?? '');
      if (first) { first = false; return new Response(JSON.stringify({ code: 'CSRF_INVALID' }), { status: 403 }); }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    await createFortlessHttpPorts({ fetchFn }).service.power('svc1', 'STOP');
    expect(seen).toEqual(['t1', 't2']);
  });

  test('STEP_UP_REQUIRED calls the host hook and surfaces a plain message', async () => {
    let called = 0;
    const { fetchFn } = recorder(() => ({ status: 403, json: { code: 'STEP_UP_REQUIRED' } }));
    const err = await createFortlessHttpPorts({ fetchFn, onStepUp: () => { called++; } }).service.power('svc1', 'STOP').catch((x) => x);
    expect(called).toBe(1);
    expect(err.code).toBe('STEP_UP_REQUIRED');
  });

  test('network failure becomes a readable error, abort stays an abort', async () => {
    const down = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    const err = await createFortlessHttpPorts({ fetchFn: down }).service.get('svc1', new AbortController().signal).catch((x) => x);
    expect(err.code).toBe('NETWORK');
    const aborted = (async () => { throw new DOMException('Aborted', 'AbortError'); }) as typeof fetch;
    const a = await createFortlessHttpPorts({ fetchFn: aborted }).service.get('svc1', new AbortController().signal).catch((x) => x);
    expect(a).toBeInstanceOf(DOMException);
  });
});

test.describe('console credentials flow', () => {
  class FakeSocket {
    static OPEN = 1; static CONNECTING = 0; readyState = 0; sent: string[] = [];
    onopen: (() => void) | null = null; onmessage: ((m: { data: string }) => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(public url: string) { sockets.push(this); }
    send(s: string) { this.sent.push(s); }
    close() { this.readyState = 3; this.onclose?.(); }
    open() { this.readyState = 1; this.onopen?.(); }
    emit(event: string, args: string[] = []) { this.onmessage?.({ data: JSON.stringify({ event, args }) }); }
  }
  const sockets: FakeSocket[] = [];
  test.beforeEach(() => { sockets.length = 0; (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket; });

  test('uses the minted token, never a panel key, and speaks the Wings protocol', async () => {
    const { calls, fetchFn } = recorder(() => ({ json: { token: 'wings-jwt', socket: 'wss://node.example/api/servers/x/ws' } }));
    const lines: string[] = []; const status: string[] = []; const power: string[] = []; let stats: unknown;
    const conn = createFortlessHttpPorts({ fetchFn, webSocket: (u) => new FakeSocket(u) as unknown as WebSocket }).console.connect('svc1', {
      onLine: (l) => lines.push(l), onStatus: (s) => status.push(s), onPowerState: (s) => power.push(s), onStats: (s) => { stats = s; },
    });
    await expect.poll(() => sockets.length).toBe(1);
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/services/svc1/console']);
    expect(sockets[0]!.url).toBe('wss://node.example/api/servers/x/ws');
    sockets[0]!.open();
    expect(JSON.parse(sockets[0]!.sent[0]!)).toEqual({ event: 'auth', args: ['wings-jwt'] });
    await expect(conn.send('say hi')).rejects.toThrow(/not connected/);
    sockets[0]!.emit('auth success');
    expect(JSON.parse(sockets[0]!.sent[1]!)).toEqual({ event: 'send logs', args: [null] });
    sockets[0]!.emit('console output', ['hello']); sockets[0]!.emit('install output', ['installing']); sockets[0]!.emit('daemon message', ['daemon']);
    sockets[0]!.emit('status', ['running']);
    sockets[0]!.emit('stats', [JSON.stringify({ cpu_absolute: 3.5, memory_bytes: 10 })]);
    expect(lines).toEqual(['hello', 'installing', 'daemon']);
    expect(power).toEqual(['running']);
    expect(stats).toEqual({ cpu_absolute: 3.5, memory_bytes: 10 });
    await conn.send('say hi');
    expect(JSON.parse(sockets[0]!.sent[2]!)).toEqual({ event: 'send command', args: ['say hi'] });
    expect(status).toContain('connected');
    conn.close();
  });

  test('a terminal refusal from Fortless stops the connection with a reason instead of retrying', async () => {
    const { calls, fetchFn } = recorder(() => ({ status: 501, json: { error: 'Console is not available for this provider.', code: 'CONSOLE_UNSUPPORTED' } }));
    const status: Array<[string, string | undefined]> = [];
    createFortlessHttpPorts({ fetchFn, webSocket: (u) => new FakeSocket(u) as unknown as WebSocket }).console.connect('svc1', { onLine: () => undefined, onStatus: (s, d) => status.push([s, d]) });
    await expect.poll(() => status.some(([s]) => s === 'error')).toBe(true);
    expect(status.at(-1)).toEqual(['error', 'Console is not available for this provider.']);
    expect(sockets).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  test('token expiring re-mints credentials through Fortless and re-authenticates', async () => {
    let n = 0;
    const { fetchFn } = recorder(() => ({ json: { token: `jwt-${++n}`, socket: 'wss://node/ws' } }));
    createFortlessHttpPorts({ fetchFn, webSocket: (u) => new FakeSocket(u) as unknown as WebSocket }).console.connect('svc1', { onLine: () => undefined, onStatus: () => undefined });
    await expect.poll(() => sockets.length).toBe(1);
    sockets[0]!.open(); sockets[0]!.emit('auth success'); sockets[0]!.emit('token expiring');
    await expect.poll(() => sockets[0]!.sent.length).toBe(3);
    expect(JSON.parse(sockets[0]!.sent[2]!)).toEqual({ event: 'auth', args: ['jwt-2'] });
  });

  test('jwt error is reported as denied and does not reconnect', async () => {
    const { fetchFn } = recorder(() => ({ json: { token: 't', socket: 'wss://node/ws' } }));
    const status: string[] = [];
    createFortlessHttpPorts({ fetchFn, webSocket: (u) => new FakeSocket(u) as unknown as WebSocket }).console.connect('svc1', { onLine: () => undefined, onStatus: (s) => status.push(s) });
    await expect.poll(() => sockets.length).toBe(1);
    sockets[0]!.open(); sockets[0]!.emit('jwt error');
    expect(status).toContain('denied');
    await new Promise((r) => setTimeout(r, 50));
    expect(sockets).toHaveLength(1);
  });
});

test.describe('base URL contract', () => {
  test('normalizeBaseUrl strips trailing slashes and an accidental /api/v1', () => {
    for (const [input, want] of [[undefined, ''], ['', ''], ['/', ''], ['https://f.example', 'https://f.example'], ['https://f.example/', 'https://f.example'], ['https://f.example/api/v1', 'https://f.example'], ['https://f.example/api/v1/', 'https://f.example'], ['/api/v1', '']] as const) expect(normalizeBaseUrl(input)).toBe(want);
  });
  for (const base of ['', 'https://f.example', 'https://f.example/', 'https://f.example/api/v1', '/api/v1/']) {
    test(`no duplicated /api/v1 for baseUrl ${JSON.stringify(base)}`, async () => {
      const urls: string[] = [];
      const fetchFn = (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response(JSON.stringify({ csrfToken: 't', ok: true }), { status: 200 }); }) as typeof fetch;
      const ports = createFortlessHttpPorts({ baseUrl: base, fetchFn });
      await ports.service.get('s1', new AbortController().signal).catch(() => undefined);
      await ports.service.power('s1', 'START').catch(() => undefined);
      expect(urls.length).toBeGreaterThan(1);
      for (const u of urls) { expect(u).not.toContain('/api/v1/api/v1'); expect(u).toMatch(/^(https:\/\/f\.example)?\/api\/v1\//); }
    });
  }
});

test.describe('settings permissions', () => {
  const svc = (permissions: string[]) => ({ access: { kind: 'ACCOUNT', permissions }, providerType: 'PTERODACTYL', contractStatus: 'ACTIVE', externalId: 'x', observedState: { runtimeState: 'RUNNING' }, providerCapabilities: undefined }) as never;
  test('read-only settings do not require settings.rename', () => {
    expect(gateFor('settings', { service: svc(['startup.read']) }).open).toBe(true);
  });
  test('settings stay hidden without any read permission', () => {
    expect(gateFor('settings', { service: svc(['file.read']) }).open).toBe(false);
  });
});
