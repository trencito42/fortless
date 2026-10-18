/**
 * Live server console (Wings websocket). The browser only ever receives a short-lived,
 * server-scoped Wings token from /api/v1/services/:id/console, never a panel API key.
 */
import { api } from '../../../core/api/client.js';

interface ConsoleCredentials { token: string; socket: string }


const MAX_LINES = 1000;
const MAX_HISTORY = 50;
const MAX_RETRIES = 8;
const SGR = /\u001b\[([0-9;]*)m/g;
// Any other escape sequence (cursor movement, clear line...) is dropped.
const OTHER_ESC = /\u001b\[[0-9;?]*[ -/]*[@-ln-~]/g;
const COLORS: Record<number, string> = {
  30: 'var(--ink3)', 31: 'var(--bad)', 32: 'var(--good)', 33: 'var(--warn)',
  34: 'var(--info)', 35: 'var(--violet)', 36: 'var(--info)', 37: 'var(--ink)',
};

/** Renders one console line as a block of text nodes and styled spans. Never uses innerHTML. */
function renderLine(line: string): HTMLElement {
  const frag = document.createElement('div');
  frag.style.minHeight = '1.55em';
  const clean = line.replace(OTHER_ESC, '');
  let color = '';
  let bold = false;
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    if (!color && !bold) { frag.appendChild(document.createTextNode(text)); return; }
    const span = document.createElement('span');
    if (color) span.style.color = color;
    if (bold) span.style.fontWeight = '700';
    span.textContent = text;
    frag.appendChild(span);
  };
  for (const m of clean.matchAll(SGR)) {
    push(clean.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const codes = (m[1] || '0').split(';').map((c) => parseInt(c || '0', 10));
    for (const code of codes) {
      if (code === 0) { color = ''; bold = false; }
      else if (code === 1) bold = true;
      else if (code === 22) bold = false;
      else if (code === 39) color = '';
      else if (COLORS[code]) color = COLORS[code]!;
      else if (code >= 90 && code <= 97) color = COLORS[code - 60]!;
    }
  }
  push(clean.slice(last));
  return frag;
}

export function initServiceConsole(serviceId: string, hooks: { onStatus?: (state: string) => void; onStats?: (stats: Record<string, any>) => void } = {}): { connect(): void; disconnect(): void } {
  const out = document.getElementById('dtlConsoleOut');
  const host = document.getElementById('dtlPaneConsole') ?? document.body;
  const input = document.getElementById('dtlConsoleInput') as HTMLInputElement | null;
  const state = document.getElementById('dtlConsoleState');
  let ws: WebSocket | null = null;
  let active = false;
  let retries = 0;
  let retryTimer: number | undefined;
  const history: string[] = [];
  let historyPos = 0;

  const setState = (text: string) => { if (state) state.textContent = text; };
  const append = (line: string) => {
    if (!out) return;
    const atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 24;
    out.appendChild(renderLine(line));
    while (out.childElementCount > MAX_LINES && out.firstChild) out.removeChild(out.firstChild);
    if (atBottom) out.scrollTop = out.scrollHeight;
  };

  const fetchCreds = () => api.get<ConsoleCredentials>(`/api/v1/services/${encodeURIComponent(serviceId)}/console`);

  function scheduleRetry() {
    if (!active || !document.body.contains(host)) return;
    if (retries >= MAX_RETRIES) { setState('Connection lost'); return; }
    const delay = Math.min(30000, 1000 * 2 ** retries);
    retries += 1;
    setState(`Reconnecting in ${Math.round(delay / 1000)}s…`);
    retryTimer = window.setTimeout(() => { void connect(); }, delay);
  }

  async function connect() {
    if (!active || (ws && ws.readyState <= WebSocket.OPEN)) return;
    setState('Connecting…');
    let creds: ConsoleCredentials;
    try { creds = await fetchCreds(); }
    catch (e: any) {
      const code = e?.code;
      // Typed refusals (suspended, not configured, provisioning) will not fix themselves.
      if (code && code !== 'PROVIDER_ERROR') { setState(e?.message || 'Unavailable'); return; }
      scheduleRetry();
      return;
    }
    if (!active) return;

    const socket = new WebSocket(creds.socket);
    ws = socket;
    const send = (event: string, args: unknown[]) => socket.send(JSON.stringify({ event, args }));
    let authFailed = false;
    socket.onopen = () => send('auth', [creds.token]);
    socket.onmessage = async (msg) => {
      if (!document.body.contains(host)) { active = false; socket.close(); return; }
      let data: { event: string; args?: string[] };
      try { data = JSON.parse(String(msg.data)); } catch { return; }
      const a = data.args ?? [];
      switch (data.event) {
        case 'auth success': retries = 0; setState('Connected'); send('send logs', [null]); break;
        case 'console output':
        case 'install output':
        case 'daemon message': append(String(a[0] ?? '')); break;
        case 'status': setState(`Connected · ${String(a[0] ?? '')}`); hooks.onStatus?.(String(a[0] ?? '')); break;
        case 'stats': try { hooks.onStats?.(JSON.parse(String(a[0] ?? '{}'))); } catch { /* malformed event, ignore */ } break;
        case 'token expiring':
        case 'token expired':
          try { send('auth', [(await fetchCreds()).token]); } catch { setState('Session expired'); }
          break;
        case 'jwt error': authFailed = true; setState('Authentication failed'); socket.close(); break;
      }
    };
    socket.onclose = () => {
      if (ws === socket) ws = null;
      if (active && !authFailed) scheduleRetry();
      else if (!active) setState('Disconnected');
    };
  }

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!history.length) return;
      e.preventDefault();
      historyPos = Math.max(0, Math.min(history.length, historyPos + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[historyPos] ?? '';
      return;
    }
    if (e.key !== 'Enter' || !input.value.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ event: 'send command', args: [input.value] }));
    if (history[history.length - 1] !== input.value) history.push(input.value);
    if (history.length > MAX_HISTORY) history.shift();
    historyPos = history.length;
    input.value = '';
  });

  return {
    connect: () => { active = true; retries = 0; void connect(); },
    disconnect: () => { active = false; window.clearTimeout(retryTimer); ws?.close(); },
  };
}
