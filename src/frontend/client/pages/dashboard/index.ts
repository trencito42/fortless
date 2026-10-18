/**
 * Customer Portal — Services Inventory Page Module
 * Route: /app/services
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { hero, toast } from '../../../petal/index.js';
import { serviceState } from '../services/status.js';
import { isTerminated, loadFilters, saveFilters } from '../services/filters.js';
import { capabilitiesStore } from '../../../core/state/capabilities.js';

let serviceInventory: any[] = [];



function metricCard(label: string, value: string | number, icon: string, tone = '', sub = ''): string {
  return `<div class="card mt" data-c="Metric tile"><div><span class="l">${esc(label)}</span><b class="v">${esc(String(value))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div><span class="tile ${tone}"><svg class="ic" aria-hidden="true"><use href="#i-${icon}"/></svg></span></div>`;
}

function renderServiceInventory(): void {
  const host = document.getElementById('serversContainer');
  if (!host) return;
  const query = (document.getElementById('serviceSearch') as HTMLInputElement | null)?.value.trim().toLowerCase() || '';
  const type = (document.getElementById('serviceTypeFilter') as HTMLSelectElement | null)?.value || 'ALL';
  const state = document.querySelector('#serviceStateSeg button[aria-selected="true"]')?.getAttribute('data-v') || 'ALL';

  const showTerminated = document.getElementById('serviceShowTerminated')?.getAttribute('aria-checked') === 'true';
  saveFilters({ state, type, q: (document.getElementById('serviceSearch') as HTMLInputElement | null)?.value.trim() ?? '', showTerminated });

  const filtered = serviceInventory.filter((svc) => {
    if (isTerminated(svc) && !showTerminated) return false;
    const st = serviceState(svc);
    const matchQ = !query || [svc.plan_name, svc.identifier, svc.id, svc.node_name].some((v) => String(v || '').toLowerCase().includes(query));
    const matchT = type === 'ALL' || svc.plan_name === type;
    const matchS = state === 'ALL' || (state === 'RUNNING' ? st.running : !st.running);
    return matchQ && matchT && matchS;
  });

  const count = document.getElementById('serviceResultCount');
  if (count) count.textContent = `${filtered.length} of ${serviceInventory.length} services`;

  if (!filtered.length) {
    host.innerHTML = serviceInventory.length
      ? `<div class="es" data-c="Empty state"><span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="#i-search-01"/></svg></span><h4>No matching services</h4><p>Try a different name, product or runtime filter.</p></div>`
      : `<div class="es" data-c="Empty state"><span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="#i-server"/></svg></span><h4>No services yet</h4><p>Ordering stays unavailable until payment and infrastructure providers are configured and verified.</p><a class="btn s tint" href="/app/deploy" data-app-route="deploy"><svg class="ic s" aria-hidden="true"><use href="#i-add-01"/></svg>View catalog</a></div>`;
    return;
  }

  const providerReady = Boolean(capabilitiesStore.get()?.provisioning.enabled);
  host.innerHTML = filtered.map((svc) => {
    const st = serviceState(svc);
    const rt = st.label;
    const tone = st.tone;
    const running = st.running;
    const memMb = Number(svc.memory_limit_mb || 0);
    const mem = `${(memMb / 1024).toFixed(memMb % 1024 === 0 ? 0 : 1)} GB`;
    const diskMb = Number(svc.disk_limit_mb || 0);
    const disk = diskMb >= 1024 ? `${(diskMb / 1024).toFixed(diskMb % 1024 === 0 ? 0 : 1)} GB disk` : `${diskMb} MB disk`;
    const canControl = st.controllable && (!svc.shared_by || svc.shared_preset !== 'viewer');
    const powers = !canControl ? '' : providerReady
      ? `<button class="btn xs" data-power="RESTART" data-service="${esc(svc.id)}" ${running ? '' : 'disabled'}><svg class="ic xs" aria-hidden="true"><use href="#i-refresh"/></svg>Restart</button><button class="btn xs bad" data-power="STOP" data-service="${esc(svc.id)}" ${running ? '' : 'disabled'}><svg class="ic xs" aria-hidden="true"><use href="#i-stop"/></svg>Stop</button><button class="btn xs good" data-power="START" data-service="${esc(svc.id)}" ${running ? 'disabled' : ''}><svg class="ic xs" aria-hidden="true"><use href="#i-play"/></svg>Start</button>`
      : `<span class="pill warn">Provider controls unavailable</span>`;
    const searchTokens = `${esc(svc.plan_name || '')} ${esc(svc.identifier || '')} ${esc(svc.id || '')} ${esc(svc.node_name || '')}`.toLowerCase();
    return `<article class="li h" data-c="Service row" data-s="${running ? 'RUNNING' : 'OTHER'}" data-t="${searchTokens}" data-p="${esc(svc.plan_name || '')}" style="flex-wrap:wrap;padding:14px 16px"><span class="tile ${tone} sm"><svg class="ic" aria-hidden="true"><use href="#i-server"/></svg></span><div class="tx" style="min-width:160px"><div class="row" style="gap:8px"><b style="white-space:normal">${esc(svc.plan_name || 'Hosting service')}</b><span class="pill ${tone} d">${esc(rt)}</span>${svc.shared_by ? `<span class="pill info">Shared by ${esc(svc.shared_by)}</span>` : ''}</div><small style="white-space:normal">${esc(svc.node_name || svc.node_id || '—')} · ${esc(mem)} RAM · ${esc(String(svc.cpu_limit_pct || 0))}% CPU · ${esc(disk)}</small></div>${svc.identifier ? `<code class="hide-n">${esc(svc.identifier)}</code>` : ''}<div class="row" style="gap:6px">${powers}${isTerminated(svc) ? '' : `<a href="/app/services/${esc(svc.id)}" class="btn xs tint" data-app-route="service-detail"><svg class="ic xs" aria-hidden="true"><use href="#i-arrow-right-01"/></svg>Manage</a>`}</div></article>`;
  }).join('');
}

export function filterServices(): void {
  renderServiceInventory();
}

export async function renderServices(): Promise<void> {
  const host = document.getElementById('servicesView');
  if (!host) return;

  host.innerHTML = `<div class="sk" role="status" aria-label="Loading services"><i></i><i></i><i></i></div>`;

  try {
    const { services } = await api<{ services: any[] }>('/api/v1/services');
    serviceInventory = services;
    const saved = loadFilters();
    const counted = services.filter((s) => !isTerminated(s));
    const running = counted.filter((s) => serviceState(s).running).length;
    const memory = counted.reduce((sum, s) => sum + Number(s.memory_limit_mb || 0), 0);
    const cpu = counted.reduce((sum, s) => sum + Number(s.cpu_limit_pct || 0), 0);

    const typeOpts = Array.from(new Set(services.map((s) => String(s.plan_name || 'Hosting service')))).sort()
      .map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

    host.innerHTML = `
      <div class="hd" data-c="Header">
        <div class="tx">
          <h2>Servers &amp; Instances</h2>
          <p>Provider-observed runtime records for this account.</p>
        </div>
        <div class="row" style="gap:8px"><button class="btn" id="refreshServicesBtn"><svg class="ic s" aria-hidden="true"><use href="#i-refresh"/></svg>Refresh</button></div>
      </div>

      <div class="g g4 k2" style="margin-bottom:12px">
        ${metricCard('Running', running, 'play', 'good')}
        ${metricCard('Total', counted.length, 'server', '')}
        ${metricCard('Allocated RAM', `${(memory / 1024).toFixed(memory ? 1 : 0)} GB`, 'database', 'info')}
        ${metricCard('Allocated CPU', `${cpu}%`, 'cpu', 'violet')}
      </div>

      <div class="row" style="margin-bottom:12px">
        <label class="sch" data-c="Search field">
          <svg class="ic s" aria-hidden="true"><use href="#i-search-01"/></svg>
          <input id="serviceSearch" placeholder="Search services" aria-label="Search services" value="${esc(saved.q)}">
        </label>
        <div class="inp hide-n" style="min-height:44px;background:var(--s1);border-radius:999px;padding:0 14px">
          <select id="serviceTypeFilter" aria-label="Product"><option value="ALL">All products</option>${typeOpts}</select>
          <svg class="ic s" aria-hidden="true"><use href="#i-arrow-down-01"/></svg>
        </div>
        <div class="seg" role="tablist" id="serviceStateSeg">
          ${(['ALL', 'RUNNING', 'OTHER'] as const).map((v) => `<button role="tab" aria-selected="${saved.state === v}" data-v="${v}" type="button">${v === 'ALL' ? 'All' : v === 'RUNNING' ? 'Running' : 'Other'}</button>`).join('')}
        </div>
        <label class="row nw" style="gap:8px;font-weight:650;font-size:13px;cursor:pointer"><button type="button" class="sw s" role="switch" id="serviceShowTerminated" aria-checked="${saved.showTerminated}" aria-label="Show closed services"></button>Show closed</label>
        <span class="faint" style="font-weight:650;font-size:13px" id="serviceResultCount"></span>
      </div>

      <div id="serversContainer" class="col" style="gap:8px" data-flt></div>`;

    const typeSelect = document.getElementById('serviceTypeFilter') as HTMLSelectElement | null;
    if (typeSelect && [...typeSelect.options].some((o) => o.value === saved.type)) typeSelect.value = saved.type;
    renderServiceInventory();

    document.getElementById('serviceShowTerminated')?.addEventListener('click', (e) => {
      const sw = e.currentTarget as HTMLElement;
      sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true'));
      renderServiceInventory();
    });
    document.getElementById('serviceSearch')?.addEventListener('input', () => renderServiceInventory());
    document.getElementById('serviceTypeFilter')?.addEventListener('change', () => renderServiceInventory());
    document.getElementById('serviceStateSeg')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-v]');
      if (!btn) return;
      document.querySelectorAll('#serviceStateSeg button').forEach((b) => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      renderServiceInventory();
    });
    document.getElementById('refreshServicesBtn')?.addEventListener('click', () => {
      toast('Refreshed services list', 'info');
      renderServices();
    });

  } catch (error: any) {
    host.innerHTML = `<div class="alert bad">${hero('warning', 's')}<div><b>Failed to load services</b><span>${esc(error.message)}</span></div></div>`;
  }
}

export async function powerService(id: string, action: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    await api<{ runtimeState: string }>(`/api/v1/services/${encodeURIComponent(id)}/power`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    toast(`${action.charAt(0)}${action.slice(1).toLowerCase()} sent`, 'good');
    await renderServices();
  } catch (error: any) {
    toast(error.message, 'bad');
    button.disabled = false;
  }
}
