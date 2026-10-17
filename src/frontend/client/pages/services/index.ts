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

function copyField(value: string | null | undefined, label: string): string {
  if (!value) return '<code class="mono muted">Pending</code>';
  return `<span class="cpf"><code>${esc(value)}</code><button class="ib xs" type="button" data-copy="${esc(value)}" data-copy-label="${esc(label)}" aria-label="Copy ${esc(label)}">${hero('copy', 'xs')}</button></span>`;
}

function kv(pairs: [string, string][]): string {
  return `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

export async function renderServiceDetail(serviceId: string): Promise<void> {
  const host = document.getElementById('serviceDetailView');
  if (!serviceId || !host) return;

  host.innerHTML = `<div class="sk" role="status" aria-label="Loading service"><i></i><i></i><i></i></div>`;

  try {
    const { service } = await api<{ service: any }>(`/api/v1/services/${encodeURIComponent(serviceId)}`);

    const runtime = service.observedState?.runtimeState || 'UNKNOWN';
    const tone = runtime === 'RUNNING' ? 'good' : runtime === 'INSTALLING' ? 'warn' : runtime === 'ERROR' ? 'bad' : 'info';
    const runningNow = runtime === 'RUNNING';
    const providerReady = Boolean(capabilitiesStore.get()?.provisioning.enabled);

    const ramMb = Number(service.desiredConfig?.memoryLimitMb || 0);
    const cpuPct = Number(service.desiredConfig?.cpuLimitPct || 0);
    const diskMb = Number(service.desiredConfig?.diskLimitMb || 0);

    const powerBtns = providerReady
      ? `<button class="btn s sec" id="dtlRestartBtn" ${runningNow ? '' : 'disabled'}>${hero('refresh', 'xs')}Restart</button><button class="btn s badt" id="dtlStopBtn" ${runningNow ? '' : 'disabled'}>${hero('stop', 'xs')}Stop</button><button class="btn s goodt" id="dtlStartBtn" ${runningNow ? 'disabled' : ''}>${hero('play', 'xs')}Start</button>`
      : `<span class="pill warn">Provider controls unavailable</span>`;

    const auditHtml = service.auditTrail?.length
      ? `<div class="tl2">${(service.auditTrail as any[]).map((ev) => {
          const ispower = String(ev.action || '').includes('power');
          return `<div class="tl2-row"><span class="tile ${ispower ? 'info' : 'acc'} sm">${hero(ispower ? 'refresh' : 'shield')}</span><span class="tx"><b>${esc(String(ev.action || '').replace(/\./g, ' · '))}</b><small>${esc(formatDate(ev.createdAt))}${ev.metadata ? ` · ${esc(String(ev.metadata))}` : ''}</small></span></div>`;
        }).join('')}</div>`
      : `<div class="es">${hero('shield', 'xl')}<h4>No recorded activity</h4><p>Provider and account events for this service will appear here.</p></div>`;

    host.innerHTML = `
      <nav class="breadcrumb-bar" aria-label="Breadcrumb" style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:14px">
        <a href="/app/services" data-app-route="services" style="color:var(--accent);font-weight:600">Services</a>
        <span aria-hidden="true" class="muted">/</span>
        <b>${esc(service.planName || service.id)}</b>
      </nav>

      <div class="hd" style="margin-bottom:0">
        <div class="tx">
          <div class="row" style="gap:8px;margin-bottom:6px">
            <span class="pill ${tone} d">${esc(runtime)}</span>
            <span class="pill ${service.contractStatus === 'ACTIVE' ? 'good' : 'warn'}">${esc(service.contractStatus)}</span>
          </div>
          <h2>${esc(service.planName || 'Service Detail')}</h2>
          <p>${esc(service.nodeName || '—')} (${esc(service.regionName || '—')}) · ${service.identifier ? `Provider ID ${esc(service.identifier)}` : 'Provisioning'}</p>
        </div>
        <div class="act" style="gap:8px">
          ${powerBtns}
        </div>
      </div>

      <div class="tabs under" id="serviceDetailTabs" role="tablist" aria-label="Service details" style="margin:20px 0 0">
        <button class="tab" type="button" role="tab" aria-controls="dtlPaneOverview" aria-selected="true">Overview</button>
        <button class="tab" type="button" role="tab" aria-controls="dtlPaneAllocation" aria-selected="false" tabindex="-1">Allocation</button>
        <button class="tab" type="button" role="tab" aria-controls="dtlPaneActivity" aria-selected="false" tabindex="-1">Activity</button>
      </div>

      <div id="dtlPaneOverview" role="tabpanel" class="tp">
        <div class="g g2">
          <section class="card">
            <h3 style="font:700 16px var(--font);margin-bottom:14px">Technical Specifications</h3>
            ${kv([
              ['Service ID', copyField(service.id, 'service ID')],
              ['Allocated RAM', esc(`${(ramMb / 1024).toFixed(1)} GB`)],
              ['CPU limit', esc(`${cpuPct}%`)],
              ['Allocated disk', esc(`${(diskMb / 1024).toFixed(0)} GB SSD`)],
              ['Provider type', `<span class="pill">${esc(service.providerType)}</span>`],
            ])}
          </section>
          <section class="card">
            <h3 style="font:700 16px var(--font);margin-bottom:14px">Connection &amp; Datacenter</h3>
            ${kv([
              ['Node hostname', copyField(service.nodeFqdn, 'node hostname')],
              ['Datacenter', esc(`${service.regionName || '—'} (${service.regionCode || '—'})`)],
              ['Remote ID', copyField(service.externalId, 'remote ID')],
              ['Short identifier', copyField(service.identifier, 'short identifier')],
              ['Created', esc(formatDate(service.createdAt))],
            ])}
          </section>
        </div>
      </div>

      <div id="dtlPaneAllocation" role="tabpanel" class="tp" hidden>
        <div class="g g3">
          <section class="card">
            <span class="muted" style="font-size:12px">Memory Allocation</span>
            <b style="font:800 24px/1.2 var(--font);display:block;margin:8px 0">${esc(`${(ramMb / 1024).toFixed(1)} GB`)}</b>
            <small class="muted">Purchased limit, not live utilization.</small>
          </section>
          <section class="card">
            <span class="muted" style="font-size:12px">CPU Share Limit</span>
            <b style="font:800 24px/1.2 var(--font);display:block;margin:8px 0">${esc(`${cpuPct}%`)}</b>
            <small class="muted">Configured CPU limit, not measured usage.</small>
          </section>
          <section class="card">
            <span class="muted" style="font-size:12px">Storage Allocation</span>
            <b style="font:800 24px/1.2 var(--font);display:block;margin:8px 0">${esc(`${(diskMb / 1024).toFixed(0)} GB`)}</b>
            <small class="muted">Purchased storage, not current disk use.</small>
          </section>
        </div>
      </div>

      <div id="dtlPaneActivity" role="tabpanel" class="tp" hidden>
        <section class="card" style="padding:20px">
          <h3 style="font:700 16px var(--font);margin-bottom:14px">Service Audit Events</h3>
          ${auditHtml}
        </section>
      </div>`;

    const tabsEl = document.getElementById('serviceDetailTabs');
    if (tabsEl) initTabs(tabsEl);

    if (providerReady) {
      document.getElementById('dtlRestartBtn')?.addEventListener('click', (e) =>
        powerService(service.id, 'RESTART', e.currentTarget as HTMLButtonElement));
      document.getElementById('dtlStopBtn')?.addEventListener('click', (e) =>
        powerService(service.id, 'STOP', e.currentTarget as HTMLButtonElement));
      document.getElementById('dtlStartBtn')?.addEventListener('click', (e) =>
        powerService(service.id, 'START', e.currentTarget as HTMLButtonElement));
    }

  } catch (error: any) {
    host.innerHTML = `<div class="alert bad">${hero('warning', 's')}<div><b>Failed to load service</b><span>${esc(error.message)}</span></div></div>`;
    toast(error.message, 'bad');
  }
}
