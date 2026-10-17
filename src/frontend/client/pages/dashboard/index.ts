/**
 * Customer Portal — Services Inventory Page Module
 * Route: /app/services
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { hero, toast } from '../../../petal/index.js';
import { capabilitiesStore } from '../../../core/state/capabilities.js';

let serviceInventory: any[] = [];

const RT: Record<string, string> = { RUNNING: 'good', INSTALLING: 'warn', ERROR: 'bad' };

function metricCard(label: string, value: string | number): string {
  return `<div class="card mt"><div><span class="l">${esc(label)}</span><b class="v">${esc(String(value))}</b></div></div>`;
}

function renderServiceInventory(): void {
  const host = document.getElementById('serversContainer');
  if (!host) return;
  const query = (document.getElementById('serviceSearch') as HTMLInputElement | null)?.value.trim().toLowerCase() || '';
  const type = (document.getElementById('serviceTypeFilter') as HTMLSelectElement | null)?.value || 'ALL';
  const state = document.querySelector<HTMLInputElement>('input[name="serviceState"]:checked')?.value || 'ALL';

  const filtered = serviceInventory.filter((svc) => {
    const rt = svc.runtime_state || 'UNKNOWN';
    const matchQ = !query || [svc.plan_name, svc.identifier, svc.id, svc.node_name].some((v) => String(v || '').toLowerCase().includes(query));
    const matchT = type === 'ALL' || svc.plan_name === type;
    const matchS = state === 'ALL' || (state === 'RUNNING' ? rt === 'RUNNING' : rt !== 'RUNNING');
    return matchQ && matchT && matchS;
  });

  const count = document.getElementById('serviceResultCount');
  if (count) count.textContent = `${filtered.length} of ${serviceInventory.length}`;

  if (!filtered.length) {
    host.innerHTML = `<div class="es">${hero('server', 'xl')}<h4>${esc(serviceInventory.length ? 'No matching services' : 'No services yet')}</h4><p>${esc(serviceInventory.length ? 'Try a different name, product or runtime filter.' : 'Ordering stays unavailable until payment and infrastructure providers are configured and verified.')}</p>${serviceInventory.length ? '' : `<a class="btn s tint" href="/app/deploy" data-app-route="deploy">${hero('plus', 's')}View catalog</a>`}</div>`;
    return;
  }

  const providerReady = Boolean(capabilitiesStore.get()?.provisioning.enabled);
  host.innerHTML = filtered.map((svc) => {
    const rt = svc.runtime_state || 'UNKNOWN';
    const tone = RT[rt] || 'info';
    const running = rt === 'RUNNING';
    const mem = `${(Number(svc.memory_limit_mb || 0) / 1024).toFixed(Number(svc.memory_limit_mb) ? 1 : 0)} GB`;
    const powers = providerReady
      ? `<button class="btn xs sec" data-power="RESTART" data-service="${esc(svc.id)}" ${running ? '' : 'disabled'}>${hero('refresh', 'xs')}Restart</button><button class="btn xs badt" data-power="STOP" data-service="${esc(svc.id)}" ${running ? '' : 'disabled'}>${hero('stop', 'xs')}Stop</button><button class="btn xs goodt" data-power="START" data-service="${esc(svc.id)}" ${running ? 'disabled' : ''}>${hero('play', 'xs')}Start</button>`
      : '';
    return `<div class="li"><span class="tile ${tone} sm">${hero('server')}</span><span class="tx"><b>${esc(svc.plan_name || 'Hosting service')}</b><small>${esc(svc.node_name || svc.node_id || '—')} · ${esc(mem)} RAM · ${esc(String(svc.cpu_limit_pct || 0))}% CPU</small></span><span class="row" style="gap:6px;flex-shrink:0">${powers}<span class="pill ${tone} d">${esc(rt)}</span><a href="/app/services/${esc(svc.id)}" class="btn xs sec" data-app-route="service-detail">${hero('chevron', 'xs')}Manage</a></span></div>`;
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
    const running = services.filter((s) => s.runtime_state === 'RUNNING').length;
    const memory = services.reduce((sum, s) => sum + Number(s.memory_limit_mb || 0), 0);
    const cpu = services.reduce((sum, s) => sum + Number(s.cpu_limit_pct || 0), 0);

    const typeOpts = Array.from(new Set(services.map((s) => String(s.plan_name || 'Hosting service')))).sort()
      .map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

    host.innerHTML = `
      <div class="hd">
        <div class="tx">
          <span class="pill acc">Services</span>
          <h2>Your services.</h2>
          <p>Provider-observed runtime records for this account.</p>
        </div>
        <div class="act">
          <a class="btn pri" href="/app/deploy" data-app-route="deploy">${hero('plus', 's')}Deploy service</a>
        </div>
      </div>

      <div class="g g4 k2" style="margin-bottom:12px">
        ${metricCard('Running', running)}
        ${metricCard('Total services', services.length)}
        ${metricCard('Allocated RAM', `${(memory / 1024).toFixed(memory ? 1 : 0)} GB`)}
        ${metricCard('Allocated CPU', `${cpu}%`)}
      </div>

      <div class="card" style="padding:20px">
        <div class="ch" style="margin-bottom:14px">
          <div class="row" style="gap:10px;flex-wrap:wrap;flex:1">
            <label class="sch" style="flex:1;min-width:180px">
              ${hero('search', 's')}
              <input id="serviceSearch" type="search" placeholder="Search name or identifier" aria-label="Search services">
            </label>
            <div class="inp sel s"><select id="serviceTypeFilter" aria-label="Filter by product"><option value="ALL">All products</option>${typeOpts}</select></div>
            <div class="seg s" role="radiogroup" aria-label="Filter service state">
              <label><input type="radio" name="serviceState" value="ALL" checked><span>All</span></label>
              <label><input type="radio" name="serviceState" value="RUNNING"><span>Running</span></label>
              <label><input type="radio" name="serviceState" value="OTHER"><span>Other</span></label>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <small id="serviceResultCount" class="muted"></small>
            <button class="ib s" id="refreshServicesBtn" aria-label="Refresh services">${hero('refresh', 's')}</button>
          </div>
        </div>
        <div id="serversContainer"></div>
      </div>`;

    renderServiceInventory();

    document.getElementById('refreshServicesBtn')?.addEventListener('click', renderServices);

  } catch (error: any) {
    host.innerHTML = `<div class="alert bad">${hero('warning', 's')}<div><b>Failed to load services</b><span>${esc(error.message)}</span></div></div>`;
  }
}

export async function powerService(id: string, action: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    const data = await api<{ runtimeState: string }>(`/api/v1/services/${encodeURIComponent(id)}/power`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    toast(`Runtime state: ${data.runtimeState}`, 'good');
    await renderServices();
  } catch (error: any) {
    toast(error.message, 'bad');
    button.disabled = false;
  }
}
