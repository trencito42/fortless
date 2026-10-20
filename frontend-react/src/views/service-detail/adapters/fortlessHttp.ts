import type * as C from '../contracts';
import { ServiceApiError, type ConsoleConnection, type ConsoleHandlers, type ServiceDetailPorts, type UploadHandle } from '../ports';

/**
 * Transport for the real Fortless API. It is the ONLY place that knows URLs, CSRF, cookies or the Wings socket protocol.
 * No Pterodactyl Application API, admin key or panel client key is ever used or reachable here: the browser authenticates to
 * Fortless with its session cookie, and for the console it receives a short-lived, server-scoped Wings token from
 * GET /api/v1/services/:id/console (see console.ts in the backend). Not wired to the production app yet.
 */
export interface HttpOptions {
  /** Prefix for same-origin requests, normally ''. */
  /** Origin only, for example `https://fortless.example` or empty for same-origin. A trailing slash or `/api/v1` is stripped (see normalizeBaseUrl). */
  baseUrl?: string;
  fetchFn?: typeof fetch;
  /** Used for the Wings websocket. Injected so tests and the Workbench never open a real socket. */
  webSocket?: (url: string) => WebSocket;
  /** Called when a response says STEP_UP_REQUIRED, so the host app can run its MFA flow. The view only shows the message. */
  onStepUp?: () => void;
  /** Called on 401. The shipped client redirects to /login; the standalone kit leaves it to the host. */
  onSessionExpired?: () => void;
  setTimeoutFn?: typeof setTimeout;
}

const enc = encodeURIComponent;

/**
 * Base URL contract: `baseUrl` is an ORIGIN (or empty for same-origin), never an API prefix. Every path in this adapter already
 * starts with `/api/v1`, so a trailing slash or an accidental `/api/v1` suffix is removed instead of producing `/api/v1/api/v1/...`.
 */
export function normalizeBaseUrl(baseUrl?: string): string {
  let b = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (/\/api\/v1$/i.test(b)) b = b.replace(/\/api\/v1$/i, '');
  return b.replace(/\/+$/, '');
}

export function createFortlessHttpPorts(opts: HttpOptions = {}): ServiceDetailPorts {
  const base = normalizeBaseUrl(opts.baseUrl);
  const doFetch: typeof fetch = (...a) => (opts.fetchFn ?? fetch)(...a);
  let csrf: string | null = null;

  const token = async () => {
    if (csrf) return csrf;
    const res = await doFetch(`${base}/api/v1/auth/csrf`, { credentials: 'same-origin' });
    if (!res.ok) throw new ServiceApiError('Could not start a secure session.', res.status);
    csrf = ((await res.json()) as { csrfToken: string }).csrfToken;
    return csrf;
  };

  async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal, retried = false): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF-Token'] = await token();
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body), signal });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ServiceApiError('Could not reach Fortless. Check your connection and try again.', 0, 'NETWORK');
    }
    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (text) { try { data = JSON.parse(text) as Record<string, unknown>; } catch { data = { raw: text }; } }
    const code = typeof data['code'] === 'string' ? data['code'] : typeof data['error'] === 'string' && /^[A-Z_]+$/.test(data['error']) ? data['error'] : undefined;
    if (res.status === 401) { opts.onSessionExpired?.(); throw new ServiceApiError('Your session has expired. Sign in again.', 401, 'UNAUTHENTICATED'); }
    if (res.status === 403 && code === 'CSRF_INVALID' && !retried && method !== 'GET') { csrf = null; return request<T>(method, path, body, signal, true); }
    if (res.status === 403 && code === 'STEP_UP_REQUIRED') { opts.onStepUp?.(); throw new ServiceApiError('Confirm your identity to continue.', 403, 'STEP_UP_REQUIRED'); }
    if (!res.ok) {
      const msg = (typeof data['message'] === 'string' && data['message']) || (typeof data['error'] === 'string' && !/^[A-Z_]+$/.test(data['error']) && data['error']) || `Request failed (${res.status}).`;
      throw new ServiceApiError(msg, res.status, code);
    }
    return data as T;
  }
  const get = <T>(p: string, s?: AbortSignal) => request<T>('GET', p, undefined, s);
  const send = <T>(m: 'POST' | 'PUT' | 'PATCH' | 'DELETE', p: string, b?: unknown) => request<T>(m, p, b);
  const svc = (id: string) => `/api/v1/services/${enc(id)}`;
  const confirm = { confirm: true };

  // ---- console: Fortless mints the credentials, the browser talks to Wings, Wings protocol per frontend/console.ts ------
  function connectConsole(id: string, h: ConsoleHandlers): ConsoleConnection {
    let active = true; let ws: WebSocket | null = null; let retries = 0; let timer: ReturnType<typeof setTimeout> | undefined; let authed = false;
    const later = opts.setTimeoutFn ?? setTimeout;
    const MAX_RETRIES = 8;
    const creds = () => get<C.ConsoleCredentialsDto>(`${svc(id)}/console`);
    const retry = () => {
      if (!active) return;
      if (retries >= MAX_RETRIES) { h.onStatus('error', 'Connection lost. Reload to try again.'); return; }
      const delay = Math.min(30000, 1000 * 2 ** retries++);
      h.onStatus('reconnecting', `Reconnecting in ${Math.round(delay / 1000)}s`);
      timer = later(() => void open(), delay);
    };
    async function open() {
      if (!active || (ws && ws.readyState <= WebSocket.OPEN)) return;
      h.onStatus(retries ? 'reconnecting' : 'connecting');
      let c: C.ConsoleCredentialsDto;
      try { c = await creds(); }
      catch (e) {
        const err = e as ServiceApiError;
        if (err.terminal) { h.onStatus(err.status === 403 ? 'denied' : 'error', err.message); return; }
        retry(); return;
      }
      if (!active) return;
      const socket = (opts.webSocket ?? ((u) => new WebSocket(u)))(c.socket);
      ws = socket; authed = false;
      const emit = (event: string, args: unknown[]) => socket.send(JSON.stringify({ event, args }));
      socket.onopen = () => emit('auth', [c.token]);
      socket.onmessage = async (m) => {
        let d: { event: string; args?: string[] };
        try { d = JSON.parse(String(m.data)); } catch { return; }
        const a = d.args ?? [];
        switch (d.event) {
          case 'auth success': authed = true; retries = 0; h.onStatus('connected'); emit('send logs', [null]); break;
          case 'console output': case 'install output': case 'daemon message': h.onLine(String(a[0] ?? '')); break;
          case 'status': h.onPowerState?.(String(a[0] ?? '')); break;
          case 'stats': try { h.onStats?.(JSON.parse(String(a[0] ?? '{}')) as C.WingsStats); } catch { /* malformed event */ } break;
          case 'token expiring': case 'token expired': try { emit('auth', [(await creds()).token]); } catch { h.onStatus('error', 'Your console session expired. Reconnect to continue.'); } break;
          case 'jwt error': h.onStatus('denied', 'The console rejected the session token.'); active = false; socket.close(); break;
        }
      };
      socket.onerror = () => { /* onclose follows and decides */ };
      socket.onclose = () => { if (ws === socket) ws = null; if (active) { if (!authed && retries >= 2) h.onStatus('error', 'The console did not accept the connection.'); retry(); } else h.onStatus('closed'); };
    }
    void open();
    return {
      send: async (command) => {
        if (!ws || ws.readyState !== WebSocket.OPEN || !authed) throw new ServiceApiError('The console is not connected, so the command was not sent.', 0, 'NOT_CONNECTED');
        ws.send(JSON.stringify({ event: 'send command', args: [command] }));
      },
      close: () => { active = false; if (timer) clearTimeout(timer); ws?.close(); },
    };
  }

  const q = (o: Record<string, string | number | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v)); const s = p.toString(); return s ? `?${s}` : ''; };

  function upload(id: string, dir: string, file: File, onProgress: (pct: number) => void): UploadHandle {
    const xhr = new XMLHttpRequest();
    const promise = (async () => {
      const { url } = await get<{ url: string }>(`${svc(id)}/files/upload-url${q({ dir })}`);
      await new Promise<void>((resolve, reject) => {
        xhr.open('POST', `${url}&directory=${enc(dir)}`);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ServiceApiError('The server did not accept the file.', xhr.status, 'UPLOAD_FAILED')));
        xhr.onerror = () => reject(new ServiceApiError('The upload was interrupted. Try again.', 0, 'NETWORK'));
        xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
        const form = new FormData(); form.append('files', file, file.name); xhr.send(form);
      });
    })();
    return { promise, cancel: () => xhr.abort() };
  }

  return {
    platform: { capabilities: (s) => get('/api/v1/platform/capabilities', s) },
    service: {
      get: async (id, s) => (await get<{ service: C.ServiceDetailDto }>(svc(id), s)).service,
      power: (id, action) => send('POST', `${svc(id)}/power`, { action }),
      usage: (id, s) => get(`${svc(id)}/usage`, s),
      diagnose: (id, recentLogs) => send('POST', `${svc(id)}/diagnostics`, recentLogs === undefined ? {} : { recentLogs }),
      activity: (id, f, s) => get(`${svc(id)}/activity${q({ category: f.category, range: f.range, q: f.q, page: f.page })}`, s),
    },
    console: {
      connect: connectConsole,
      history: (id, s) => get(`${svc(id)}/console/history?limit=50`, s),
      recordCommand: async (id, command, delivered) => { await send('POST', `${svc(id)}/console/history`, { command, delivered }); },
    },
    files: {
      list: (id, dir, s) => get(`${svc(id)}/files${q({ dir })}`, s),
      read: (id, path, s) => get(`${svc(id)}/files/content${q({ path })}`, s),
      write: (id, path, content) => send('PUT', `${svc(id)}/files/content`, { path, content }),
      createFolder: (id, dir, name) => send('POST', `${svc(id)}/files/folder`, { dir, name }),
      remove: (id, dir, names) => send('POST', `${svc(id)}/files/delete`, { dir, names }),
      rename: (id, dir, from, to) => send('POST', `${svc(id)}/files/rename`, { dir, from, to }),
      move: (id, dir, name, destDir) => send('POST', `${svc(id)}/files/move`, { dir, name, destDir }),
      copy: (id, path) => send('POST', `${svc(id)}/files/copy`, { path }),
      archive: (id, dir, names) => send('POST', `${svc(id)}/files/archive`, { dir, names }),
      unarchive: (id, dir, file) => send('POST', `${svc(id)}/files/unarchive`, { dir, file }),
      chmod: (id, dir, names, mode) => send('POST', `${svc(id)}/files/chmod`, { dir, names, mode }),
      pull: (id, dir, url, filename) => send('POST', `${svc(id)}/files/pull`, { dir, url, filename }),
      downloadUrl: async (id, path) => (await get<{ url: string }>(`${svc(id)}/files/download-url${q({ path })}`)).url,
      upload,
    },
    players: {
      status: (id, s) => get(`${svc(id)}/players`, s),
      kick: (id, b) => send('POST', `${svc(id)}/players/kick`, b),
      ban: (id, b) => send('POST', `${svc(id)}/players/ban`, b),
      unban: (id, b) => send('POST', `${svc(id)}/players/unban`, b),
      history: (id, page, limit, s) => get(`${svc(id)}/players/history${q({ page, limit })}`, s),
      administration: (id, s) => get(`${svc(id)}/game-administration`, s),
      detect: (id) => send('POST', `${svc(id)}/game-administration/detect`),
      testAdministration: (id) => send('POST', `${svc(id)}/game-administration/test`),
      autoConfigure: (id, b) => send('POST', `${svc(id)}/game-administration/auto-configure`, b),
      saveAdministration: (id, b) => send('PUT', `${svc(id)}/game-administration`, b),
      resetAdministration: (id) => send('DELETE', `${svc(id)}/game-administration`),
    },
    game: {
      info: (id, s) => get(`${svc(id)}/game`, s),
      saveConfig: async (id, values) => { await send('PUT', `${svc(id)}/game/config`, { values }); },
      acceptEula: (id) => send('POST', `${svc(id)}/game/eula/accept`),
      searchMods: (id, f, s) => get(`${svc(id)}/game/mods/search${q({ source: f.source, q: f.q, page: f.page })}`, s),
      installMod: (id, b) => send('POST', `${svc(id)}/game/mods/install`, b),
      installed: (id, source, s) => get(`${svc(id)}/game/mods/installed${q({ source })}`, s),
      setIcon: async (id, png) => { await send('POST', `${svc(id)}/game/icon`, { png }); },
    },
    fastdl: {
      status: (id, s) => get(`${svc(id)}/fastdl`, s),
      sync: (id) => send('POST', `${svc(id)}/fastdl/sync`, {}),
      cancel: (id) => send('POST', `${svc(id)}/fastdl/sync/cancel`, {}),
      retry: (id) => send('POST', `${svc(id)}/fastdl/sync/retry`, {}),
      manifest: (id, f, s) => get(`${svc(id)}/fastdl/manifest${q({ page: f.page, limit: f.limit, search: f.search, status: f.status })}`, s),
      configureCvar: (id) => send('POST', `${svc(id)}/fastdl/configure-cvar`, {}),
      saveSettings: (id, patch) => send('PUT', `${svc(id)}/fastdl/settings`, patch),
    },
    backups: {
      list: (id, s) => get(`${svc(id)}/backups`, s),
      create: (id, b) => send('POST', `${svc(id)}/backups`, b),
      remove: (id, uuid) => send('DELETE', `${svc(id)}/backups/${enc(uuid)}`, confirm),
      lock: (id, uuid) => send('POST', `${svc(id)}/backups/${enc(uuid)}/lock`),
      restore: (id, uuid, truncate) => send('POST', `${svc(id)}/backups/${enc(uuid)}/restore`, { confirm: true, truncate }),
      downloadUrl: async (id, uuid) => (await get<{ url: string }>(`${svc(id)}/backups/${enc(uuid)}/download-url`)).url,
    },
    network: {
      list: (id, s) => get(`${svc(id)}/network`, s),
      assign: (id) => send('POST', `${svc(id)}/network`),
      setNotes: (id, aid, notes) => send('PATCH', `${svc(id)}/network/${aid}`, { notes }),
      setPrimary: (id, aid) => send('POST', `${svc(id)}/network/${aid}/primary`),
      remove: (id, aid) => send('DELETE', `${svc(id)}/network/${aid}`),
    },
    databases: {
      list: (id, s) => get(`${svc(id)}/databases`, s),
      create: (id, b) => send('POST', `${svc(id)}/databases`, b),
      rotate: (id, did) => send('POST', `${svc(id)}/databases/${enc(did)}/rotate`),
      remove: (id, did) => send('DELETE', `${svc(id)}/databases/${enc(did)}`, confirm),
    },
    schedules: {
      list: (id, s) => get(`${svc(id)}/schedules`, s),
      save: (id, sid, input) => send('POST', sid === null ? `${svc(id)}/schedules` : `${svc(id)}/schedules/${sid}`, input),
      remove: (id, sid) => send('DELETE', `${svc(id)}/schedules/${sid}`),
      execute: (id, sid) => send('POST', `${svc(id)}/schedules/${sid}/execute`),
      addTask: (id, sid, input) => send('POST', `${svc(id)}/schedules/${sid}/tasks`, input),
      updateTask: (id, sid, tid, input) => send('POST', `${svc(id)}/schedules/${sid}/tasks/${tid}`, input),
      removeTask: (id, sid, tid) => send('DELETE', `${svc(id)}/schedules/${sid}/tasks/${tid}`),
    },
    startup: {
      get: (id, s) => get(`${svc(id)}/startup`, s),
      setVariable: (id, key, value) => send('PUT', `${svc(id)}/startup/variable`, { key, value }),
      setImage: (id, image) => send('PUT', `${svc(id)}/startup/image`, { image }),
    },
    settings: {
      get: (id, s) => get(`${svc(id)}/settings`, s),
      rename: (id, name, description) => send('POST', `${svc(id)}/settings/rename`, { name, description }),
      reinstall: (id) => send('POST', `${svc(id)}/settings/reinstall`, confirm),
      panelActivity: (id, page, s) => get(`${svc(id)}/panel-activity${q({ page })}`, s),
    },
    members: {
      list: (id, s) => get(`${svc(id)}/members`, s),
      invite: (id, email, preset) => send('POST', `${svc(id)}/members/invite`, { email, preset }),
      revoke: async (id, iid) => { await send('DELETE', `${svc(id)}/invitations/${enc(iid)}`); },
      remove: async (id, mid) => { await send('DELETE', `${svc(id)}/members/${enc(mid)}`); },
      setPreset: async (id, mid, preset) => { await send('PATCH', `${svc(id)}/members/${enc(mid)}`, { preset }); },
    },
  };
}
