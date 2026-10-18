/** Service activity: category and range filters, search, pagination. Data comes from /api/v1/services/:id/activity. */
import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { hero } from '../../../petal/index.js';

interface Ev { id: string; action: string; actorType: string; createdAt: string; metadata: string }
interface Page { events: Ev[]; total: number; page: number; pageSize: number }

const CATEGORIES: Array<[string, string]> = [['all', 'All'], ['power', 'Power'], ['files', 'Files'], ['backups', 'Backups'], ['network', 'Network'], ['settings', 'Settings'], ['game', 'Game'], ['databases', 'Databases'], ['schedules', 'Schedules'], ['billing', 'Billing'], ['lifecycle', 'Lifecycle'], ['panel', 'Panel']];
const RANGES: Array<[string, string]> = [['1', '24h'], ['7', '7d'], ['30', '30d'], ['all', 'All time']];

const actor = (t: string) => (t === 'USER' ? 'You' : t === 'STAFF' ? 'Fortless staff' : t === 'PSP_WEBHOOK' ? 'Payment provider' : 'System');

function describe(action: string, raw: string): { label: string; detail: string; icon: string; tone: string } {
  let m: Record<string, any> = {};
  try { m = JSON.parse(raw) || {}; } catch { /* ignore */ }
  const names = Array.isArray(m['names']) ? m['names'].join(', ') : '';
  switch (action) {
    case 'order.paid': return { label: 'Payment verified', detail: '', icon: 'credit-card', tone: 'good' };
    case 'service.created': return { label: 'Service created', detail: '', icon: 'settings-01', tone: 'info' };
    case 'service.provisioned': return { label: 'Provisioning completed', detail: '', icon: 'rocket-01', tone: 'violet' };
    case 'service.provision_failed': return { label: 'Provisioning failed', detail: '', icon: 'alert-02', tone: 'bad' };
    case 'service.suspend': return { label: 'Suspended', detail: String(m['reason'] || ''), icon: 'stop', tone: 'warn' };
    case 'service.unsuspend': return { label: 'Unsuspended', detail: '', icon: 'play', tone: 'good' };
    case 'service.terminate': return { label: 'Terminated', detail: '', icon: 'x', tone: 'bad' };
    case 'service.owner_assigned': return { label: 'Linked to your panel account', detail: '', icon: 'shield', tone: 'info' };
    case 'service.provider_missing': return { label: 'Server missing on the panel', detail: '', icon: 'alert-02', tone: 'bad' };
    case 'service.power': {
      const a = String(m['action'] || '').toLowerCase();
      const label = a === 'start' ? 'Started' : a === 'stop' ? 'Stopped' : a === 'restart' ? 'Restarted' : a === 'kill' ? 'Killed' : 'Power action';
      const bad = a === 'stop' || a === 'kill';
      return { label, detail: '', icon: bad ? 'stop' : a === 'restart' ? 'refresh' : 'play', tone: bad ? 'bad' : 'good' };
    }
    case 'service.file.write': return { label: 'File saved', detail: String(m['path'] || ''), icon: 'document', tone: 'info' };
    case 'service.file.mkdir': return { label: 'Folder created', detail: String(m['path'] || ''), icon: 'folder-01', tone: 'info' };
    case 'service.file.delete': return { label: 'Deleted', detail: `${m['dir'] || ''}: ${names}`, icon: 'x', tone: 'bad' };
    case 'service.file.rename': return { label: 'Renamed', detail: `${m['from'] || ''} to ${m['to'] || ''}`, icon: 'settings-01', tone: 'info' };
    case 'service.file.archive': return { label: 'Archived', detail: String(m['archive'] || names), icon: 'archive-01', tone: 'info' };
    case 'service.file.unarchive': return { label: 'Extracted', detail: String(m['file'] || ''), icon: 'archive-01', tone: 'info' };
    case 'service.file.move': return { label: 'Moved', detail: `${m['name'] || ''} to ${m['to'] || ''}`, icon: 'folder-01', tone: 'info' };
    case 'service.file.chmod': return { label: 'Permissions changed', detail: `${names} · ${m['mode'] || ''}`, icon: 'shield', tone: 'info' };
    case 'service.file.pull': return { label: 'Downloaded to server', detail: String(m['host'] || ''), icon: 'arrow', tone: 'info' };
    case 'service.file.copy': return { label: 'Copied', detail: String(m['path'] || ''), icon: 'copy', tone: 'info' };
    case 'service.backup.create': return { label: 'Backup created', detail: String(m['name'] || ''), icon: 'archive-01', tone: 'good' };
    case 'service.backup.delete': return { label: 'Backup deleted', detail: '', icon: 'x', tone: 'bad' };
    case 'service.backup.lock': return { label: 'Backup lock changed', detail: '', icon: 'shield', tone: 'info' };
    case 'service.backup.restore': return { label: 'Backup restored', detail: m['truncate'] ? 'Files were wiped first' : '', icon: 'refresh', tone: 'warn' };
    case 'service.network.assign': return { label: 'Port added', detail: '', icon: 'plus', tone: 'good' };
    case 'service.network.notes': return { label: 'Port notes changed', detail: '', icon: 'settings-01', tone: 'info' };
    case 'service.network.primary': return { label: 'Primary port changed', detail: '', icon: 'settings-01', tone: 'info' };
    case 'service.network.remove': return { label: 'Port removed', detail: '', icon: 'x', tone: 'bad' };
    case 'service.startup.variable': return { label: 'Startup variable changed', detail: String(m['key'] || ''), icon: 'settings-01', tone: 'info' };
    case 'service.startup.image': return { label: 'Docker image changed', detail: String(m['image'] || ''), icon: 'settings-01', tone: 'warn' };
    case 'service.mod.install': return { label: 'Mod or plugin installed', detail: String(m['file'] || ''), icon: 'plus', tone: 'good' };
    case 'service.game.icon': return { label: 'Server icon changed', detail: '', icon: 'settings-01', tone: 'info' };
    case 'service.database.create': return { label: 'Database created', detail: String(m['name'] || ''), icon: 'database', tone: 'good' };
    case 'service.database.rotate': return { label: 'Database password rotated', detail: '', icon: 'shield', tone: 'warn' };
    case 'service.database.delete': return { label: 'Database deleted', detail: '', icon: 'x', tone: 'bad' };
    case 'service.schedule.create': return { label: 'Schedule created', detail: String(m['name'] || ''), icon: 'plus', tone: 'good' };
    case 'service.schedule.update': return { label: 'Schedule updated', detail: String(m['name'] || ''), icon: 'settings-01', tone: 'info' };
    case 'service.schedule.delete': return { label: 'Schedule deleted', detail: '', icon: 'x', tone: 'bad' };
    case 'service.schedule.execute': return { label: 'Schedule run manually', detail: '', icon: 'play', tone: 'info' };
    case 'service.schedule.task_add': return { label: 'Schedule task added', detail: String(m['action'] || ''), icon: 'plus', tone: 'info' };
    case 'service.schedule.task_update': return { label: 'Schedule task changed', detail: String(m['action'] || ''), icon: 'settings-01', tone: 'info' };
    case 'service.schedule.task_delete': return { label: 'Schedule task removed', detail: '', icon: 'x', tone: 'warn' };
    case 'service.settings.rename': return { label: 'Server renamed', detail: '', icon: 'settings-01', tone: 'info' };
    case 'service.settings.reinstall': return { label: 'Reinstall started', detail: '', icon: 'refresh', tone: 'warn' };
    default: return { label: action.replace(/[._]/g, ' '), detail: '', icon: 'shield', tone: 'neu' };
  }
}

export function initServiceActivity(serviceId: string): { open(): void } {
  const host = document.getElementById('dtlActivityBody');
  if (!host) return { open() { /* none */ } };
  const state = { category: 'all', range: '30', q: '', page: 1 };
  let loaded = false;
  let timer: number | undefined;

  const seg = (name: string, items: Array<[string, string]>, value: string) =>
    `<div class="seg" role="tablist" data-seg="${name}">${items.map(([v, l]) => `<button type="button" role="tab" aria-selected="${v === value}" data-v="${v}">${l}</button>`).join('')}</div>`;

  host.innerHTML = `<div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div class="inp s pill" style="flex:1;min-width:180px">${hero('search', 's')}<input id="actQ" placeholder="Search activity" aria-label="Search activity"></div>
      ${seg('range', RANGES, state.range)}
    </div>
    <div style="margin-bottom:14px;overflow-x:auto">${seg('category', CATEGORIES, state.category)}</div>
    <div id="actList"></div>
    <div class="row" style="justify-content:space-between;margin-top:14px"><span class="faint" id="actInfo" style="font-size:12.5px"></span><div class="pager" id="actPager"></div></div>`;

  const list = document.getElementById('actList')!;
  const info = document.getElementById('actInfo')!;
  const pager = document.getElementById('actPager')!;

  function renderPager(page: number, pages: number) {
    const nums = new Set<number>([1, pages, page - 1, page, page + 1]);
    const seq = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
    const btn = (label: string, p: number, extra = '') => `<button type="button" data-pg="${p}" ${extra}>${label}</button>`;
    let html = btn(hero('arrow-left-01', 's'), page - 1, page === 1 ? 'disabled aria-label="Previous"' : 'aria-label="Previous"');
    let prev = 0;
    for (const n of seq) {
      if (n - prev > 1) html += '<button type="button" disabled>…</button>';
      html += btn(String(n), n, n === page ? 'aria-current="true"' : '');
      prev = n;
    }
    html += btn(hero('arrow-right-01', 's'), page + 1, page === pages ? 'disabled aria-label="Next"' : 'aria-label="Next"');
    pager.innerHTML = pages > 1 ? html : '';
  }

  const humanize = (event: string) => event.replace(/^server:/, '').replace(/[.:_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

  async function loadPanel() {
    try {
      const res = await api.get<{ events: Array<{ event: string; timestamp: string; actor: string | null; api: boolean }>; page: number; pages: number; total: number }>(`/api/v1/services/${encodeURIComponent(serviceId)}/panel-activity?page=${state.page}`);
      state.page = res.page;
      list.innerHTML = res.events.length
        ? `<div class="tl2">${res.events.map((e) => `<div class="ev"><span class="tile neu">${hero('shield')}</span><div style="min-width:0"><b>${esc(humanize(e.event))}</b><small style="display:block">${esc(e.actor ?? 'System')}${e.api ? ' · API' : ''}</small></div><small>${esc(formatDate(e.timestamp))}</small></div>`).join('')}</div>`
        : `<div class="es"><span class="tile neu lg">${hero('shield')}</span><h4>No panel activity</h4></div>`;
      info.textContent = res.total ? `${res.total} events` : '';
      renderPager(res.page, res.pages);
    } catch (e: any) {
      list.innerHTML = `<div class="alert bad"><div><b>Could not load panel activity</b><span>${esc(e?.message || '')}</span></div></div>`;
    }
  }

  async function load() {
    if (state.category === 'panel') return loadPanel();
    const qs = new URLSearchParams({ category: state.category, range: state.range, q: state.q, page: String(state.page) });
    try {
      const res = await api.get<Page>(`/api/v1/services/${encodeURIComponent(serviceId)}/activity?${qs}`);
      state.page = res.page;
      const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
      list.innerHTML = res.events.length
        ? `<div class="tl2">${res.events.map((ev) => {
            const d = describe(ev.action, ev.metadata);
            return `<div class="ev"><span class="tile ${d.tone}">${hero(d.icon)}</span><div style="min-width:0"><b>${esc(d.label)}</b><small style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(actor(ev.actorType))}${d.detail ? ' · ' + esc(d.detail) : ''}</small></div><small>${esc(formatDate(ev.createdAt))}</small></div>`;
          }).join('')}</div>`
        : `<div class="es"><span class="tile neu lg">${hero('shield')}</span><h4>No activity</h4></div>`;
      info.textContent = res.total ? `${(res.page - 1) * res.pageSize + 1}-${(res.page - 1) * res.pageSize + res.events.length} of ${res.total}` : '';
      renderPager(res.page, pages);
    } catch (e: any) {
      list.innerHTML = `<div class="alert bad"><div><b>Could not load activity</b><span>${esc(e?.message || '')}</span></div></div>`;
    }
  }

  host.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const segBtn = t.closest<HTMLElement>('[data-seg] [data-v]');
    if (segBtn) {
      const name = (segBtn.closest('[data-seg]') as HTMLElement).dataset['seg'] as 'category' | 'range';
      state[name] = segBtn.dataset['v']!;
      state.page = 1;
      segBtn.parentElement!.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === segBtn)));
      void load();
      return;
    }
    const pg = t.closest<HTMLElement>('[data-pg]');
    if (pg && !(pg as HTMLButtonElement).disabled) { state.page = Number(pg.dataset['pg']); void load(); }
  });
  host.addEventListener('input', (ev) => {
    if ((ev.target as HTMLElement).id !== 'actQ') return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { state.q = (ev.target as HTMLInputElement).value.trim(); state.page = 1; void load(); }, 300);
  });

  return { open() { if (!loaded) { loaded = true; void load(); } } };
}
