/**
 * Customer Portal — Services Inventory Page Module
 * Route: /app/services
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { hero, renderEmptyState, renderSkeleton, toast } from '../../../petal/index.js';
import { capabilitiesStore } from '../../../core/state/capabilities.js';

let serviceInventory: any[] = [];

function renderServiceInventory(): void {
  const host = document.getElementById('serversContainer');
  if (!host) return;
  const query = (document.getElementById('serviceSearch') as HTMLInputElement | null)?.value.trim().toLowerCase() || '';
  const type = (document.getElementById('serviceTypeFilter') as HTMLSelectElement | null)?.value || 'ALL';
  const state = document.querySelector<HTMLInputElement>('input[name="serviceState"]:checked')?.value || 'ALL';
  const filtered = serviceInventory.filter((service) => {
    const runtime = service.runtime_state || 'UNKNOWN';
    const matchesQuery = !query || [service.plan_name, service.identifier, service.id, service.node_name].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesType = type === 'ALL' || service.plan_name === type;
    const matchesState = state === 'ALL' || (state === 'RUNNING' ? runtime === 'RUNNING' : runtime !== 'RUNNING');
    return matchesQuery && matchesType && matchesState;
  });
  const count = document.getElementById('serviceResultCount');
  if (count) count.textContent = `${filtered.length} of ${serviceInventory.length} services`;
  if (!filtered.length) {
    host.innerHTML = renderEmptyState({ icon: 'search', title: serviceInventory.length ? 'No matching services' : 'No services yet', message: serviceInventory.length ? 'Try a different name, product or runtime filter.' : 'Ordering stays unavailable until payment and infrastructure providers are configured and verified.', actionHtml: serviceInventory.length ? '' : `<a class="btn s tint" href="/app/deploy" data-app-route="deploy">${hero('plus', 's')}View catalog</a>` });
    return;
  }
  const providerReady = Boolean(capabilitiesStore.get()?.provisioning.enabled);
  host.innerHTML = `<div class="col" style="gap:8px">${filtered.map((service) => {
    const runtime = service.runtime_state || 'UNKNOWN';
    const runningNow = runtime === 'RUNNING';
    const badge = runningNow ? 'good' : runtime === 'INSTALLING' ? 'warn' : runtime === 'ERROR' ? 'bad' : 'info';
    const endpoint = service.identifier ? `Provider ID · ${service.identifier}` : 'Provisioning record';
    return `<article class="li card s2 service-row">
      <span class="ico-b ${badge}">${hero('servers')}</span><div class="tx"><div class="title-row"><b>${esc(service.plan_name || 'Hosting service')}</b><span class="badge ${badge} s">${esc(runtime)}</span><span class="badge s">${esc(service.contract_status)}</span></div><div class="meta">${esc(service.node_name || service.node_id)} · ${Number(service.memory_limit_mb || 0) / 1024} GB RAM · ${esc(service.cpu_limit_pct || 0)}% CPU · ${Number(service.disk_limit_mb || 0) / 1024} GB disk</div></div>
      <code class="endpoint">${esc(endpoint)}</code><div class="actions">${providerReady ? `<button class="btn s sec" data-power="RESTART" data-service="${esc(service.id)}" ${runningNow ? '' : 'disabled'}>${hero('refresh', 'xs')}Restart</button><button class="btn s badt" data-power="STOP" data-service="${esc(service.id)}" ${runningNow ? '' : 'disabled'}>${hero('stop', 'xs')}Stop</button><button class="btn s goodt" data-power="START" data-service="${esc(service.id)}" ${runningNow ? 'disabled' : ''}>${hero('play', 'xs')}Start</button>` : `<span class="badge warn s">Provider controls unavailable</span>`}<a href="/app/services/${esc(service.id)}" class="btn s tint" data-app-route="service-detail">${hero('chevron', 'xs')}Manage</a></div>
    </article>`;
  }).join('')}</div>`;
}

export function filterServices(): void { renderServiceInventory(); }

export async function renderServices(): Promise<void> {
  const host = document.getElementById('serversContainer');
  if (!host) return;

  host.innerHTML = renderSkeleton('list', 'Loading services');

  try {
    const { services } = await api<{ services: any[] }>('/api/v1/services');
    serviceInventory = services;
    const running = services.filter((s) => s.runtime_state === 'RUNNING').length;
    const memory = services.reduce((sum, s) => sum + Number(s.memory_limit_mb || 0), 0);
    const cpu = services.reduce((sum, s) => sum + Number(s.cpu_limit_pct || 0), 0);

    const statRunning = document.getElementById('statRunning');
    const statTotal = document.getElementById('statTotal');
    const statRam = document.getElementById('statRam');
    const statCpu = document.getElementById('statCpu');

    if (statRunning) statRunning.textContent = String(running);
    if (statTotal) statTotal.textContent = String(services.length);
    if (statRam) statRam.textContent = `${(memory / 1024).toFixed(memory ? 1 : 0)} GB`;
    if (statCpu) statCpu.textContent = `${cpu}%`;

    const typeFilter = document.getElementById('serviceTypeFilter') as HTMLSelectElement | null;
    if (typeFilter) typeFilter.innerHTML = `<option value="ALL">All products</option>${Array.from(new Set(services.map((item) => String(item.plan_name || 'Hosting service')))).sort().map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}`;
    renderServiceInventory();
  } catch (error: any) {
    host.innerHTML = `<div class="state-message bad">${hero('warning')}<span>${esc(error.message)}</span></div>`;
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
