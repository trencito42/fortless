/**
 * Players tab: Universal Player Manager & Game Administration.
 * Supports live player telemetry (Source, GoldSrc, Minecraft, Rust),
 * real-time filtering, moderation actions (Kick, Ban), and audit history.
 */
import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { toast } from '../../../petal/index.js';
import { formDialog } from './dialog.js';

interface ServerInfo {
  name: string;
  map: string;
  folder: string;
  game: string;
  players: number;
  maxPlayers: number;
  bots: number;
  serverType: string;
  environment: string;
  visibility: string;
  vac: boolean;
  version: string;
  pingMs: number;
}

interface PlayerInfo {
  index: number;
  name: string;
  score: number;
  duration: number;
  ping?: number;
  steamId?: string;
}

interface ServerStatusResponse {
  supported: boolean;
  state: 'ONLINE' | 'OFFLINE' | 'UNSUPPORTED' | 'ERROR';
  gameType: string;
  adapter: string;
  info?: ServerInfo;
  players: PlayerInfo[];
  error?: string;
}

interface ModerationRecord {
  id: string;
  action: 'KICK' | 'BAN' | 'UNBAN';
  targetIdentifier: string;
  targetName: string;
  reason: string | null;
  durationMinutes: number | null;
  createdAt: string;
}

interface HistoryResponse {
  total: number;
  records: ModerationRecord[];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

function formatTimeAgo(iso: string): string {
  try {
    const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return iso;
  }
}

export function initPlayers(serviceId: string): { open(): void; refresh(): Promise<void> } {
  const host = document.getElementById('dtlPlayersBody');
  const base = `/api/v1/services/${encodeURIComponent(serviceId)}`;
  let pollTimer: number | undefined;
  let filterText = '';
  let statusData: ServerStatusResponse | null = null;
  let historyData: HistoryResponse | null = null;
  let canModerate = false;

  async function checkPermissions(): Promise<void> {
    try {
      const res = await api<{ service: { access?: { permissions?: string[] } } }>(base);
      const perms = new Set<string>(res.service?.access?.permissions ?? []);
      canModerate = perms.has('player.moderate') || perms.has('ALL') || perms.has('control.console');
    } catch {
      canModerate = false;
    }
  }

  async function loadData(): Promise<void> {
    try {
      const [status, history] = await Promise.all([
        api.get<ServerStatusResponse>(`${base}/players`),
        api.get<HistoryResponse>(`${base}/players/history?limit=10`).catch(() => ({ total: 0, records: [] })),
      ]);
      statusData = status;
      historyData = history;
    } catch (err: any) {
      if (!statusData) {
        statusData = {
          supported: true,
          state: 'ERROR',
          gameType: 'unknown',
          adapter: 'none',
          players: [],
          error: err.message || 'Failed to query server status',
        };
      }
    }
  }

  function render(): void {
    if (!host) return;

    if (!statusData) {
      host.innerHTML = `<div class="sk" role="status" aria-label="Loading players"><i></i><i></i><i></i></div>`;
      return;
    }

    // 1. Unsupported game state
    if (!statusData.supported) {
      host.innerHTML = `
        <div class="es" data-c="Empty state">
          <span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="#i-server"/></svg></span>
          <h4>Player administration is unsupported</h4>
          <p>${esc(statusData.error || 'This service does not support native player management.')}</p>
        </div>`;
      return;
    }

    // 2. Offline state
    if (statusData.state === 'OFFLINE') {
      host.innerHTML = `
        <div class="col" style="gap:18px">
          <div class="alert info">
            <svg class="ic s" aria-hidden="true"><use href="#i-refresh"/></svg>
            <div><b>Server is offline</b><span>Start the server to query connected players and perform moderation actions.</span></div>
          </div>
          ${renderHistorySection()}
        </div>`;
      bindHistoryEvents();
      return;
    }

    // 3. Online State
    const info = statusData.info;
    const players = statusData.players;
    const filtered = players.filter((p) => {
      if (!filterText) return true;
      const q = filterText.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.steamId && p.steamId.toLowerCase().includes(q));
    });

    const infoBadges = info
      ? `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
          <span class="pill good d">Online</span>
          <span class="pill">${esc(info.game)}</span>
          <span class="pill">${esc(info.map)}</span>
          <span class="pill" title="Server latency">${info.pingMs} ms</span>
          <span class="pill info">${players.length} / ${info.maxPlayers} players</span>
        </div>`
      : `<span class="pill good d">Online (${players.length} online)</span>`;

    const playersTable = filtered.length
      ? `<div class="tbl-wrap" style="margin-top:12px">
          <table class="tbl" aria-label="Connected players">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Identifier</th>
                <th scope="col" style="text-align:right">Score</th>
                <th scope="col" style="text-align:right">Connected</th>
                ${canModerate ? '<th scope="col" style="text-align:right">Actions</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${filtered
                .map(
                  (p) => `
                <tr data-p-id="${esc(String(p.steamId || p.index))}" data-p-name="${esc(p.name)}">
                  <td>
                    <div class="row nw" style="gap:10px;align-items:center">
                      <span class="tile neu sm"><svg class="ic xs" aria-hidden="true"><use href="#i-user"/></svg></span>
                      <b style="font-weight:650">${esc(p.name)}</b>
                    </div>
                  </td>
                  <td><code class="mono faint" style="font-size:12px">${esc(p.steamId || `#${p.index}`)}</code></td>
                  <td style="text-align:right"><b class="faint">${p.score}</b></td>
                  <td style="text-align:right"><span class="faint">${formatDuration(p.duration)}</span></td>
                  ${
                    canModerate
                      ? `<td style="text-align:right">
                      <div class="row" style="justify-content:flex-end;gap:6px">
                        <button class="btn xs sec" type="button" data-act="kick" title="Disconnect player">Kick</button>
                        <button class="btn xs badt" type="button" data-act="ban" title="Ban player">Ban</button>
                      </div>
                    </td>`
                      : ''
                  }
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`
      : `<div class="es" style="padding:28px 0" data-c="Empty state">
          <span class="tile neu"><svg class="ic" aria-hidden="true"><use href="#i-user"/></svg></span>
          <h4>${filterText ? 'No matching players' : 'No players currently online'}</h4>
          <p>${filterText ? 'Try adjusting your search filter.' : 'When players connect to this server, they will appear here in real time.'}</p>
        </div>`;

    host.innerHTML = `
      <div class="col" style="gap:18px">
        <section class="card">
          <div class="ch">
            <div class="tx">
              <h3>Live Players</h3>
              <p>Real-time game server status and connected player administration.</p>
            </div>
            <div class="row" style="gap:8px">
              <button class="btn s sec" id="dtlPlayersRefreshBtn" type="button" title="Refresh player list">
                <svg class="ic xs" aria-hidden="true"><use href="#i-refresh"/></svg>Refresh
              </button>
            </div>
          </div>

          <div class="row" style="justify-content:space-between;align-items:center;gap:12px;margin:12px 0 16px;flex-wrap:wrap">
            ${infoBadges}
            <div class="inp s pill" style="min-width:200px;max-width:280px">
              <svg class="ic s" aria-hidden="true"><use href="#i-search"/></svg>
              <input id="dtlPlayersFilter" type="text" placeholder="Filter players…" value="${esc(filterText)}" aria-label="Filter players">
            </div>
          </div>

          ${playersTable}
        </section>

        ${renderHistorySection()}
      </div>`;

    bindTableEvents();
    bindHistoryEvents();
  }

  function renderHistorySection(): string {
    const records = historyData?.records ?? [];
    if (!records.length) {
      return `
        <section class="card">
          <div class="ch">
            <div class="tx">
              <h3>Moderation History</h3>
              <p>Recent kicks and bans executed through Fortless.</p>
            </div>
          </div>
          <div class="es" style="padding:20px 0">
            <span class="tile neu sm"><svg class="ic xs" aria-hidden="true"><use href="#i-shield"/></svg></span>
            <h4>No moderation records</h4>
            <p>Disciplinary actions taken against players will be recorded here.</p>
          </div>
        </section>`;
    }

    return `
      <section class="card">
        <div class="ch">
          <div class="tx">
            <h3>Moderation History</h3>
            <p>Recent kicks and bans executed through Fortless.</p>
          </div>
        </div>
        <div class="tbl-wrap" style="margin-top:12px">
          <table class="tbl" aria-label="Moderation history">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
                <th scope="col">Reason</th>
                <th scope="col" style="text-align:right">When</th>
              </tr>
            </thead>
            <tbody>
              ${records
                .map((r) => {
                  const badgeClass = r.action === 'BAN' ? 'bad' : r.action === 'KICK' ? 'warn' : 'good';
                  const durationStr = r.durationMinutes ? ` (${r.durationMinutes}m)` : '';
                  return `
                  <tr>
                    <td><span class="pill ${badgeClass} d">${esc(r.action)}${durationStr}</span></td>
                    <td>
                      <div>
                        <b>${esc(r.targetName)}</b>
                        <small class="faint mono" style="display:block">${esc(r.targetIdentifier)}</small>
                      </div>
                    </td>
                    <td><span class="faint">${esc(r.reason || '—')}</span></td>
                    <td style="text-align:right"><span class="faint" title="${esc(r.createdAt)}">${formatTimeAgo(r.createdAt)}</span></td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function bindTableEvents(): void {
    const filterInput = document.getElementById('dtlPlayersFilter') as HTMLInputElement | null;
    filterInput?.addEventListener('input', () => {
      filterText = filterInput.value.trim();
      render();
      const nextInput = document.getElementById('dtlPlayersFilter') as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        nextInput.selectionStart = nextInput.selectionEnd = nextInput.value.length;
      }
    });

    document.getElementById('dtlPlayersRefreshBtn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true;
      try {
        await loadData();
        render();
        toast('Player list refreshed', 'good');
      } finally {
        btn.disabled = false;
      }
    });

    host?.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const tr = (e.target as HTMLElement).closest('tr');
        if (!tr) return;
        const targetId = tr.dataset['pId'] || '';
        const targetName = tr.dataset['pName'] || targetId;
        const act = btn.dataset['act'];

        if (act === 'kick') {
          const res = await formDialog({
            title: 'Kick Player',
            message: `Are you sure you want to disconnect "${targetName}" from this server?`,
            confirmLabel: 'Kick player',
            danger: true,
            fields: [
              { key: 'reason', label: 'Reason (optional)', placeholder: 'e.g. Inappropriate behavior' },
            ],
          });
          if (!res) return;

          btn.disabled = true;
          try {
            await api.post(`${base}/players/kick`, {
              targetIdentifier: targetId,
              targetName,
              reason: res['reason'] ? String(res['reason']) : undefined,
            });
            toast(`Kicked "${targetName}"`, 'good');
            await loadData();
            render();
          } catch (err: any) {
            toast(err.message || 'Kick failed', 'bad');
          } finally {
            btn.disabled = false;
          }
        } else if (act === 'ban') {
          const res = await formDialog({
            title: 'Ban Player',
            message: `Ban "${targetName}" from this server? They will be immediately disconnected and prevented from reconnecting.`,
            confirmLabel: 'Ban player',
            danger: true,
            fields: [
              {
                key: 'duration',
                label: 'Duration',
                type: 'select',
                value: '0',
                options: [
                  ['0', 'Permanent'],
                  ['60', '1 hour'],
                  ['360', '6 hours'],
                  ['1440', '1 day (24 hours)'],
                  ['10080', '7 days'],
                  ['43200', '30 days'],
                ],
              },
              { key: 'reason', label: 'Reason (optional)', placeholder: 'e.g. Cheating or violating rules' },
            ],
          });
          if (!res) return;

          btn.disabled = true;
          try {
            await api.post(`${base}/players/ban`, {
              targetIdentifier: targetId,
              targetName,
              durationMinutes: Number(res['duration'] || 0),
              reason: res['reason'] ? String(res['reason']) : undefined,
            });
            toast(`Banned "${targetName}"`, 'good');
            await loadData();
            render();
          } catch (err: any) {
            toast(err.message || 'Ban failed', 'bad');
          } finally {
            btn.disabled = false;
          }
        }
      });
    });
  }

  function bindHistoryEvents(): void {
    // History refresh or navigation if needed
  }

  return {
    open: () => {
      void checkPermissions();
      void loadData().then(() => render());

      // Auto-poll every 6 seconds while open
      if (pollTimer) window.clearInterval(pollTimer);
      pollTimer = window.setInterval(() => {
        if (!document.getElementById('dtlPlayersBody')) {
          window.clearInterval(pollTimer);
          return;
        }
        void loadData().then(() => render());
      }, 6000);
    },
    refresh: async () => {
      await loadData();
      render();
    },
  };
}
