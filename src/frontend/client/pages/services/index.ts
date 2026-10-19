/**
 * Customer Portal — Service Detail Page Module
 * Route: /app/services/:id
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { hero, toast } from '../../../petal/index.js';
import { powerService } from '../dashboard/index.js';
import { capabilitiesStore } from '../../../core/state/capabilities.js';
import { initTabs } from '../../../petal/components/tabs.js';
import { initServiceConsole } from './console.js';
import { initServiceFiles } from './files.js';
import { initServiceActivity } from './activity.js';
import { initGame } from './game.js';
import { initFastDl } from './fastdl.js';
import { initPlayers } from './players.js';
import { mountLiveTiles } from './live-usage.js';
import { bindTabUrls } from '../../../core/router/tab-url.js';
import { serviceState, liveState } from './status.js';
import { initBackups, initNetwork, initStartup, initSettings, initUsers, initDatabases, initSchedules } from './panel-tabs.js';

function copyField(value: string | null | undefined, label: string): string {
  if (!value) return '<code class="mono muted">Pending</code>';
  return `<span class="cpf"><code>${esc(value)}</code><button class="ib xs" type="button" data-copy="${esc(value)}" data-copy-label="${esc(label)}" aria-label="Copy ${esc(label)}">${hero('copy', 'xs')}</button></span>`;
}

function kv(pairs: [string, string][]): string {
  return `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

function meter(label: string, icon: string, tone: string, valueText: string, pct: number, note: string): string {
  const w = Math.max(0, Math.min(100, pct));
  return `<div class="col" style="gap:6px"><div class="row nw" style="justify-content:space-between"><div class="row nw"><span class="tile ${tone} sm">${hero(icon)}</span><b>${esc(label)}</b></div><b>${esc(valueText)}</b></div><div class="mtr ${tone === 'violet' ? '' : tone}"><b style="width:${w}%"></b></div><small class="faint" style="font-weight:600">${esc(note)}</small></div>`;
}

export function syncPowerButtons(state: string): void {
  const offline = state === 'offline';
  const pill = document.getElementById('dtlRuntimePill');
  if (pill?.dataset['locked'] === '1') return;
  if (pill) {
    const live = liveState(state);
    pill.textContent = live.label;
    pill.className = `pill ${live.tone} d`;
  }
  document.querySelectorAll<HTMLButtonElement>('[data-pwr]').forEach((el) => {
    el.disabled = el.dataset['pwr'] === 'start' ? !offline : offline;
  });
}

async function loadLiveUsage(serviceId: string, ramMb: number, cpuPct: number, diskMb: number): Promise<void> {
  const box = document.getElementById('dtlLiveUsage');
  if (!box) return;
  try {
    const res = await api<{ available: boolean; usage?: { state: string; cpuPct: number; memoryBytes: number; diskBytes: number } }>(
      `/api/v1/services/${encodeURIComponent(serviceId)}/usage`);
    if (!res.available || !res.usage) return;
    const u = res.usage;
    syncPowerButtons(u.state);
    const memMb = u.memoryBytes / 1048576;
    const diskUsedMb = u.diskBytes / 1048576;
    box.innerHTML = `<div class="col" style="gap:18px">
      ${meter('CPU', 'cpu', 'info', `${u.cpuPct.toFixed(1)}%`, cpuPct ? (u.cpuPct / cpuPct) * 100 : 0, `of ${cpuPct}% limit`)}
      ${meter('Memory', 'database', 'violet', `${memMb.toFixed(0)} MB`, ramMb ? (memMb / ramMb) * 100 : 0, `of ${(ramMb / 1024).toFixed(1)} GB limit`)}
      ${meter('Storage', 'archive-01', 'good', `${(diskUsedMb / 1024).toFixed(2)} GB`, diskMb ? (diskUsedMb / diskMb) * 100 : 0, `of ${(diskMb / 1024).toFixed(0)} GB limit`)}
      <small class="faint" style="font-weight:600">${esc(u.state.charAt(0).toUpperCase() + u.state.slice(1))}</small>
    </div>`;
  } catch {
    /* keep the honest empty state */
  }
}

export async function renderServiceDetail(serviceId: string, tab?: string): Promise<void> {
  const host = document.getElementById('serviceDetailView');
  if (!serviceId || !host) return;

  host.innerHTML = `<div class="sk" role="status" aria-label="Loading service"><i></i><i></i><i></i></div>`;

  try {
    const { service } = await api<{ service: any }>(`/api/v1/services/${encodeURIComponent(serviceId)}`);

    const st = serviceState({ contractStatus: service.contractStatus, runtimeState: service.observedState?.runtimeState });
    const runtime = st.label;
    const tone = st.tone;
    const runningNow = st.running;
    const providerReady = Boolean(capabilitiesStore.get()?.provisioning.enabled);

    const ramMb = Number(service.desiredConfig?.memoryLimitMb || 0);
    const cpuPct = Number(service.desiredConfig?.cpuLimitPct || 0);
    const diskMb = Number(service.desiredConfig?.diskLimitMb || 0);

    const caps = service.providerCapabilities || {
      console: service.providerType === 'PTERODACTYL',
      files: service.providerType === 'PTERODACTYL',
      game: service.providerType === 'PTERODACTYL',
      databases: service.providerType === 'PTERODACTYL',
      schedules: service.providerType === 'PTERODACTYL',
      backups: service.providerType === 'PTERODACTYL' || service.providerType === 'PROXMOX',
      network: service.providerType === 'PTERODACTYL' || service.providerType === 'PROXMOX',
      startup: service.providerType === 'PTERODACTYL',
      settings: true,
      users: true,
      power: service.providerType !== 'CPANEL',
    };
    const perms = new Set<string>(service.access?.permissions ?? []);
    const can = (perm: string) => providerReady && st.controllable && perms.has(perm);
    const fastDlCtl = can('file.read') ? initFastDl(service.id) : null;
    const fastDlSupported = fastDlCtl ? await fastDlCtl.checkSupported() : false;
    const show = {
      c: caps.console && can('websocket.connect'),
      p: caps.game && (can('player.read') || can('control.console')),
      f: caps.files && can('file.read'),
      m: caps.game && can('file.read-content'),
      l: fastDlSupported,
      d: caps.databases && can('database.read'),
      h: caps.schedules && can('schedule.read'),
      b: caps.backups && can('backup.read'),
      n: caps.network && can('allocation.read'),
      s: caps.startup && can('startup.read'),
      g: caps.settings && can('settings.rename'),
      u: caps.users && providerReady && st.controllable && service.access?.kind === 'ACCOUNT' && perms.has('control.start'),
    };
    const canPower = caps.power && (can('control.start') || can('control.stop') || can('control.restart'));
    const powerBtns = !providerReady ? `<span class="pill warn">Provider controls unavailable</span>` : !canPower ? '' : `<button class="btn s sec" id="dtlRestartBtn" data-pwr="restart" ${runningNow ? '' : 'disabled'}>${hero('refresh', 'xs')}Restart</button><button class="btn s badt" id="dtlStopBtn" data-pwr="stop" ${runningNow ? '' : 'disabled'}>${hero('stop', 'xs')}Stop</button><button class="btn s goodt" id="dtlStartBtn" data-pwr="start" ${runningNow ? 'disabled' : ''}>${hero('play', 'xs')}Start</button>`;
    const advancedKeys = new Set(['d', 'h', 'n', 's', 'g', 'u', 'a']);
    const advancedSlugs = new Set(['databases', 'schedules', 'network', 'startup', 'settings', 'users', 'allocation']);
    let serviceMode: 'easy' | 'advanced' = advancedSlugs.has(tab || '') || localStorage.getItem(`fortless_service_mode_${serviceId}`) === 'advanced' ? 'advanced' : 'easy';
    const advancedTab = (key: string) => advancedKeys.has(key) ? ` data-service-level="advanced"${serviceMode === 'easy' ? ' hidden' : ''}` : '';

    host.innerHTML = `
      <div class="row faint" style="font-weight:650;padding:2px 0 8px">
        <a class="lk" href="/app/services" data-app-route="services" style="color:var(--ink3)">Services</a>
        <svg class="ic xs" aria-hidden="true"><use href="#i-arrow-right-01"/></svg>
        <span>${esc(service.planName || service.id)}</span>
      </div>

      <div class="hd" style="margin-bottom:0">
        <div class="tx">
          <div class="row" style="gap:8px;margin-bottom:8px">
            <span class="pill ${tone} d" id="dtlRuntimePill" data-locked="${st.controllable ? '' : '1'}">${esc(runtime)}</span>
          </div>
          <h2>${esc(service.planName || 'Service Detail')}</h2>
          <p>${esc(service.nodeName || '—')} (${esc(service.regionName || '—')}) · ${service.identifier ? `Provider ID ${esc(service.identifier)}` : 'Provisioning'}</p>
        </div>
        <div class="row act" style="gap:8px">
          <div class="seg" role="tablist" aria-label="Service view">
            <button type="button" role="tab" data-service-mode="easy" aria-selected="${serviceMode === 'easy'}" aria-checked="${serviceMode === 'easy'}">Easy</button>
            <button type="button" role="tab" data-service-mode="advanced" aria-selected="${serviceMode === 'advanced'}" aria-checked="${serviceMode === 'advanced'}">Advanced</button>
          </div>
          ${powerBtns}
        </div>
      </div>

      <div class="tabs under" id="serviceDetailTabs" role="tablist" aria-label="Service details" style="margin:24px 0 20px">
        <button class="tab" type="button" role="tab" aria-controls="dtlPaneOverview" aria-selected="true" data-t="o">Overview</button>
        ${([['c', 'Console', 'dtlPaneConsole'], ['p', 'Players', 'dtlPanePlayers'], ['f', 'Files', 'dtlPaneFiles'], ['m', 'Game', 'dtlPaneGame'], ['l', 'FastDL', 'dtlPaneFastdl'], ['d', 'Databases', 'dtlPaneDatabases'], ['h', 'Schedules', 'dtlPaneSchedules'], ['b', 'Backups', 'dtlPaneBackups'], ['n', 'Network', 'dtlPaneNetwork'], ['s', 'Startup', 'dtlPaneStartup'], ['g', 'Settings', 'dtlPaneSettings'], ['u', 'Users', 'dtlPaneUsers']] as const).filter(([k]) => show[k]).map(([k, l, c]) => `<button class="tab" type="button" role="tab" aria-controls="${c}" aria-selected="false" tabindex="-1" data-t="${k}"${advancedTab(k)}>${l}</button>`).join('')}
        ${show.n ? `<button class="tab" type="button" role="tab" aria-controls="dtlPaneAllocation" aria-selected="false" tabindex="-1" data-t="a"${advancedTab('a')}>Allocation</button>` : ''}
        <button class="tab" type="button" role="tab" aria-controls="dtlPaneActivity" aria-selected="false" tabindex="-1" data-t="e">Activity</button>
      </div>

      <div id="dtlPaneOverview" role="tabpanel" class="tp on">
        <div class="g g2" style="align-items:start">
          <section class="card">
            <div class="ch"><div class="tx"><h3>Connection &amp; Datacenter</h3><p>Where this service lives.</p></div></div>
            <div class="col" style="gap:12px">
              ${service.nodeFqdn ? copyField(service.nodeFqdn, 'node hostname') : ''}
              ${kv([
                ['Service ID', copyField(service.id, 'service ID')],
                ['Allocated RAM', esc(`${(ramMb / 1024).toFixed(1)} GB`)],
                ['CPU limit', esc(`${cpuPct}%`)],
                ['Allocated disk', esc(`${(diskMb / 1024).toFixed(0)} GB SSD`)],
                ['Provider type', `<span class="pill">${esc(service.providerType)}</span>`],
                ['Datacenter', esc(`${service.regionName || '—'} (${service.regionCode || '—'})`)],
                ['Provider ID', copyField(service.identifier, 'provider ID')],
                ['Created', esc(formatDate(service.createdAt))],
              ])}
            </div>
          </section>
          <section class="card">
            <div class="ch"><div class="tx"><h3>Live usage</h3></div></div>
            <div id="dtlLiveUsage">
              <div class="es" data-c="Empty state">
                <span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="#i-analytics-01"/></svg></span>
                <h4>Telemetry is not connected</h4>
              </div>
            </div>
          </section>
        </div>
      </div>

      ${show.c ? `<div id="dtlPaneConsole" role="tabpanel" class="tp" hidden>
        <section class="card">
          <div class="ch"><div class="tx"><h3>Console</h3><p id="dtlConsoleState">Not connected</p></div></div>
          <pre id="dtlConsoleOut" class="mono" style="height:360px;overflow:auto;margin:0 0 12px;padding:14px 16px;background:var(--s1);border-radius:var(--r, 16px);font-size:12.5px;line-height:1.55;color:var(--ink2);white-space:pre-wrap;word-break:break-all" tabindex="0" aria-live="off"></pre>
          ${perms.has('control.console')
            ? `<div class="inp">
            <svg class="ic s" aria-hidden="true"><use href="#i-arrow-right-01"/></svg>
            <input id="dtlConsoleInput" type="text" autocomplete="off" spellcheck="false" placeholder="Type a command and press Enter" aria-label="Server command">
          </div>`
            : '<small class="faint">You can watch the console but not send commands with this access level.</small>'}
        </section>
      </div>` : ''}

      ${show.f ? `<div id="dtlPaneFiles" role="tabpanel" class="tp" hidden>
        <section class="card"><div id="dtlFilesBody"></div></section>
      </div>` : ''}

      ${([['p', 'dtlPanePlayers', 'dtlPlayersBody'], ['m', 'dtlPaneGame', 'dtlGameBody'], ['l', 'dtlPaneFastdl', 'dtlFastdlBody'], ['d', 'dtlPaneDatabases', 'dtlDatabasesBody'], ['h', 'dtlPaneSchedules', 'dtlSchedulesBody'], ['b', 'dtlPaneBackups', 'dtlBackupsBody'], ['n', 'dtlPaneNetwork', 'dtlNetworkBody'], ['s', 'dtlPaneStartup', 'dtlStartupBody'], ['g', 'dtlPaneSettings', 'dtlSettingsBody'], ['u', 'dtlPaneUsers', 'dtlUsersBody']] as const).filter(([k]) => show[k]).map(([, p, b]) => `<div id="${p}" role="tabpanel" class="tp" hidden><section class="card" style="${p === 'dtlPaneFastdl' || p === 'dtlPanePlayers' ? 'background:transparent;border:none;padding:0' : ''}"><div id="${b}"></div></section></div>`).join('')}

      <div id="dtlPaneAllocation" role="tabpanel" class="tp" hidden>
        <div class="g g3 k2">
          <section class="card" data-c="Meter card">
            <div class="row nw"><span class="tile violet sm"><svg class="ic" aria-hidden="true"><use href="#i-database"/></svg></span><div><div class="faint" style="font-weight:700;font-size:12.5px">Memory</div><b style="font:800 24px var(--font);letter-spacing:-.04em">${esc(`${(ramMb / 1024).toFixed(1)} GB`)}</b></div></div>
            <div class="mtr" style="margin:14px 0 8px"><b style="width:100%;opacity:.35"></b></div>
          </section>
          <section class="card" data-c="Meter card">
            <div class="row nw"><span class="tile info sm"><svg class="ic" aria-hidden="true"><use href="#i-cpu"/></svg></span><div><div class="faint" style="font-weight:700;font-size:12.5px">CPU share</div><b style="font:800 24px var(--font);letter-spacing:-.04em">${esc(`${cpuPct}%`)}</b></div></div>
            <div class="mtr info" style="margin:14px 0 8px"><b style="width:100%;opacity:.35"></b></div>
          </section>
          <section class="card" data-c="Meter card">
            <div class="row nw"><span class="tile good sm"><svg class="ic" aria-hidden="true"><use href="#i-archive-01"/></svg></span><div><div class="faint" style="font-weight:700;font-size:12.5px">Storage</div><b style="font:800 24px var(--font);letter-spacing:-.04em">${esc(`${(diskMb / 1024).toFixed(0)} GB`)}</b></div></div>
            <div class="mtr good" style="margin:14px 0 8px"><b style="width:100%;opacity:.35"></b></div>
          </section>
        </div>
      </div>

      <div id="dtlPaneActivity" role="tabpanel" class="tp" hidden>
        <section class="card"><div id="dtlActivityBody"></div></section>
      </div>`;

    // With console access the Wings socket feeds the tiles live; without it we fall back to polling the panel.
    const liveViaSocket = show.c && st.controllable;
    if (!liveViaSocket && (service.externalId || service.identifier)) {
      void loadLiveUsage(service.id, ramMb, cpuPct, diskMb);
      const poll = window.setInterval(() => {
        if (!document.getElementById('dtlLiveUsage')) { window.clearInterval(poll); return; }
        void loadLiveUsage(service.id, ramMb, cpuPct, diskMb);
      }, 5000);
    }

    const tabsEl = document.getElementById('serviceDetailTabs');
    if (tabsEl) initTabs(tabsEl);
    const applyServiceMode = (nextMode: 'easy' | 'advanced', persist = true) => {
      serviceMode = nextMode;
      if (persist) localStorage.setItem(`fortless_service_mode_${serviceId}`, serviceMode);
      document.querySelectorAll<HTMLElement>('[data-service-mode]').forEach((item) => {
        const isCur = item.dataset['serviceMode'] === serviceMode;
        item.setAttribute('aria-selected', String(isCur));
        item.setAttribute('aria-checked', String(isCur));
      });
      if (serviceMode === 'easy' && tabsEl?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"][data-service-level="advanced"]')) {
        tabsEl.querySelector<HTMLElement>('[data-t="o"]')?.click();
      }
      tabsEl?.querySelectorAll<HTMLElement>('[data-service-level="advanced"]').forEach((item) => { item.hidden = serviceMode === 'easy'; });
    };
    document.querySelectorAll<HTMLButtonElement>('[data-service-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        applyServiceMode(button.dataset['serviceMode'] === 'advanced' ? 'advanced' : 'easy');
      });
    });
    const activityCtl = initServiceActivity(service.id);
    tabsEl?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-t="e"]')) activityCtl.open();
    });

    if (providerReady) {
      if (liveViaSocket) {
        const liveHost = document.getElementById('dtlLiveUsage');
        initServiceConsole(service.id, { onStatus: syncPowerButtons, onStats: liveHost ? mountLiveTiles(liveHost) : undefined }).connect();
      }
      const gameCtl = show.m ? initGame(service.id) : null;
      const playersCtl = show.p ? initPlayers(service.id) : null;
      const openers: Record<string, () => void> = {
        p: playersCtl?.open ?? (() => undefined),
        f: initServiceFiles(service.id).open,
        m: gameCtl?.open ?? (() => undefined),
        l: fastDlCtl?.open ?? (() => undefined),
        d: initDatabases(service.id).open,
        h: initSchedules(service.id).open,
        b: initBackups(service.id).open,
        n: initNetwork(service.id).open,
        s: initStartup(service.id).open,
        g: initSettings(service.id).open,
        u: initUsers(service.id).open,
      };
      void gameCtl?.checkEula();
      document.getElementById('serviceDetailTabs')?.addEventListener('click', (e) => {
        const tab = (e.target as HTMLElement).closest('[data-t]') as HTMLElement | null;
        if (!tab) return;
        openers[tab.dataset['t'] ?? '']?.();
      });
      const actions: Record<string, 'START' | 'STOP' | 'RESTART'> = { start: 'START', stop: 'STOP', restart: 'RESTART' };
      document.querySelectorAll<HTMLButtonElement>('[data-pwr]').forEach((btn) => {
        btn.addEventListener('click', (e) => powerService(service.id, actions[btn.dataset['pwr']!]!, e.currentTarget as HTMLButtonElement));
      });
    }

    if (tabsEl) {
      bindTabUrls({
        tabs: tabsEl, base: `/app/services/${encodeURIComponent(serviceId)}`, initial: tab, fallbackKey: 'o',
        slugs: { o: 'overview', c: 'console', p: 'players', f: 'files', m: 'game', l: 'fastdl', d: 'databases', h: 'schedules', b: 'backups', n: 'network', s: 'startup', g: 'settings', u: 'users', a: 'allocation', e: 'activity' },
        keyOf: (b) => b.dataset['t'],
        select: (key) => {
          if (advancedKeys.has(key) && serviceMode !== 'advanced') applyServiceMode('advanced', false);
          tabsEl.querySelector<HTMLElement>(`[data-t="${key}"]`)?.click();
        },
      });
    }

  } catch (error: any) {
    host.innerHTML = `<div class="alert bad">${hero('warning', 's')}<div><b>Failed to load service</b><span>${esc(error.message)}</span></div></div>`;
    toast(error.message, 'bad');
  }
}
