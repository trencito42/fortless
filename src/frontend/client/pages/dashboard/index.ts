/**
 * Customer Portal — Services Dashboard Page Module
 * Route: /app
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { hero, spark, renderEmptyState, toast } from '../../../petal/index.js';

export async function renderDashboard(): Promise<void> {
  const host = document.getElementById('serversContainer');
  if (!host) return;

  host.innerHTML = `<div class="state-message">${hero('refresh')}<span>Loading services…</span></div>`;

  try {
    const { services } = await api<{ services: any[] }>('/api/v1/services');
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

    // Render Petal sparklines
    document.querySelectorAll('#section-servers .stat .spark').forEach((s) => s.remove());
    const sRunning = spark([Math.max(0, running - 1), running, running, running], 'var(--good)');
    const sTotal = spark([Math.max(0, services.length - 1), services.length, services.length], 'var(--accent)');
    const sRam = spark([Math.max(0, memory * 0.8), memory * 0.9, memory], 'var(--violet)');
    const sCpu = spark([Math.max(0, cpu * 0.7), cpu * 0.85, cpu], 'var(--warn)');

    statRunning?.insertAdjacentHTML('afterend', sRunning);
    statTotal?.insertAdjacentHTML('afterend', sTotal);
    statRam?.insertAdjacentHTML('afterend', sRam);
    statCpu?.insertAdjacentHTML('afterend', sCpu);

    if (!services.length) {
      host.innerHTML = renderEmptyState({
        icon: 'servers',
        title: 'No services yet',
        message: 'Ordering stays unavailable until payment and infrastructure providers are configured and verified.',
        actionHtml: `<a class="btn s tint" href="/app/deploy" data-app-route="deploy">${hero('plus', 's')}View catalog</a>`,
      });
      return;
    }

    host.innerHTML = `
      <div class="col" style="gap:8px">
        ${services
          .map((service) => {
            const runtime = service.runtime_state || 'UNKNOWN';
            const runningNow = runtime === 'RUNNING';
            const badge = runningNow
              ? 'good'
              : runtime === 'INSTALLING'
              ? 'warn'
              : runtime === 'ERROR'
              ? 'bad'
              : 'info';
            const endpoint = service.identifier
              ? `Provider ID · ${service.identifier}`
              : 'Provisioning record';

            return `
              <article class="li card s2 service-row">
                <span class="ico-b ${badge}">${hero('servers')}</span>
                <div class="tx">
                  <div class="title-row">
                    <b>${esc(service.plan_name || 'Hosting service')}</b>
                    <span class="badge ${badge} s">${esc(runtime)}</span>
                    <span class="badge s">${esc(service.contract_status)}</span>
                  </div>
                  <div class="meta">
                    ${esc(service.node_name || service.node_id)} · ${Number(service.memory_limit_mb || 0) / 1024} GB RAM · ${esc(service.cpu_limit_pct || 0)}% CPU · ${Number(service.disk_limit_mb || 0) / 1024} GB disk
                  </div>
                </div>
                <code class="endpoint">${esc(endpoint)}</code>
                <div class="actions">
                  <button class="btn s sec" data-power="RESTART" data-service="${esc(service.id)}" ${runningNow ? '' : 'disabled'}>
                    ${hero('refresh', 'xs')}Restart
                  </button>
                  <button class="btn s badt" data-power="STOP" data-service="${esc(service.id)}" ${runningNow ? '' : 'disabled'}>
                    ${hero('stop', 'xs')}Stop
                  </button>
                  <button class="btn s goodt" data-power="START" data-service="${esc(service.id)}" ${runningNow ? 'disabled' : ''}>
                    ${hero('play', 'xs')}Start
                  </button>
                  <a href="/app/services/${esc(service.id)}" class="btn s tint" data-app-route="service-detail" data-service-id="${esc(service.id)}">
                    ${hero('chevron', 'xs')}Manage
                  </a>
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;
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
    await renderDashboard();
  } catch (error: any) {
    toast(error.message, 'bad');
    button.disabled = false;
  }
}
