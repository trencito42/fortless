/**
 * Customer Portal — Service Detail Page Module
 * Route: /app/services/:id
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { hero, renderEmptyState, toast } from '../../../petal/index.js';
import { powerService } from '../dashboard/index.js';
import { capabilitiesStore } from '../../../core/state/capabilities.js';

function copyValue(value: string | null | undefined, label: string): string {
  if (!value) return '<code class="mono">Pending</code>';
  return `<span class="row service-copy"><code class="cd2">${esc(value)}</code><button class="btn xs sq sec" type="button" data-copy="${esc(value)}" data-copy-label="${esc(label)}" aria-label="Copy ${esc(label)}">${hero('copy', 'xs')}</button></span>`;
}

export async function renderServiceDetail(serviceId: string): Promise<void> {
  if (!serviceId) return;

  try {
    const { service } = await api<{ service: any }>(`/api/v1/services/${encodeURIComponent(serviceId)}`);

    const breadcrumb = document.getElementById('detailBreadcrumbName');
    const heading = document.getElementById('detailHeadingName');
    const subtitle = document.getElementById('detailSubtitle');

    if (breadcrumb) breadcrumb.textContent = service.planName || service.id;
    if (heading) heading.textContent = service.planName || 'Service Detail';
    if (subtitle)
      subtitle.textContent = `${service.nodeName} (${service.regionName}) · ${
        service.identifier ? 'Provider ID ' + service.identifier : 'Provisioning'
      }`;

    const runtimeBadge = document.getElementById('detailRuntimeBadge');
    const contractBadge = document.getElementById('detailContractBadge');
    const runtime = service.observedState?.runtimeState || 'UNKNOWN';

    if (runtimeBadge) {
      runtimeBadge.textContent = runtime;
      runtimeBadge.className = `badge s ${
        runtime === 'RUNNING' ? 'good' : runtime === 'INSTALLING' ? 'warn' : runtime === 'ERROR' ? 'bad' : 'info'
      }`;
    }

    if (contractBadge) {
      contractBadge.textContent = service.contractStatus;
      contractBadge.className = `badge s ${service.contractStatus === 'ACTIVE' ? 'good' : 'warn'}`;
    }

    const runningNow = runtime === 'RUNNING';
    const providerReady = Boolean(capabilitiesStore.get()?.provisioning.enabled);
    const powerActions = document.getElementById('detailPowerActions');
    if (powerActions && !providerReady) {
      powerActions.innerHTML = '<span class="badge warn">Provider controls unavailable</span>';
    }
    const restartBtn = document.getElementById('detailRestartBtn') as HTMLButtonElement | null;
    const stopBtn = document.getElementById('detailStopBtn') as HTMLButtonElement | null;
    const startBtn = document.getElementById('detailStartBtn') as HTMLButtonElement | null;

    if (restartBtn && providerReady) {
      restartBtn.disabled = !runningNow;
      restartBtn.onclick = () => powerService(service.id, 'RESTART', restartBtn);
    }
    if (stopBtn && providerReady) {
      stopBtn.disabled = !runningNow;
      stopBtn.onclick = () => powerService(service.id, 'STOP', stopBtn);
    }
    if (startBtn && providerReady) {
      startBtn.disabled = runningNow;
      startBtn.onclick = () => powerService(service.id, 'START', startBtn);
    }

    const specsList = document.getElementById('detailSpecsList');
    if (specsList) {
      specsList.innerHTML = `<dl class="kv service-kv"><dt>Service ID</dt><dd>${copyValue(service.id, 'service ID')}</dd><dt>Allocated RAM</dt><dd>${Number(service.desiredConfig?.memoryLimitMb || 0) / 1024} GB</dd><dt>CPU limit</dt><dd>${esc(service.desiredConfig?.cpuLimitPct || 0)}%</dd><dt>Allocated disk</dt><dd>${Number(service.desiredConfig?.diskLimitMb || 0) / 1024} GB SSD</dd><dt>Provider type</dt><dd><span class="badge s">${esc(service.providerType)}</span></dd></dl>`;
    }

    const connList = document.getElementById('detailConnectionList');
    if (connList) {
      connList.innerHTML = `<dl class="kv service-kv"><dt>Node hostname</dt><dd>${copyValue(service.nodeFqdn, 'node hostname')}</dd><dt>Datacenter</dt><dd>${esc(service.regionName)} (${esc(service.regionCode)})</dd><dt>Remote ID</dt><dd>${copyValue(service.externalId, 'remote ID')}</dd><dt>Short identifier</dt><dd>${copyValue(service.identifier, 'short identifier')}</dd><dt>Created</dt><dd>${formatDate(service.createdAt)}</dd></dl>`;
    }

    const ramMb = Number(service.desiredConfig?.memoryLimitMb || 0);
    const cpuPct = Number(service.desiredConfig?.cpuLimitPct || 0);
    const diskMb = Number(service.desiredConfig?.diskLimitMb || 0);

    const gaugeRamVal = document.getElementById('gaugeRamValue');
    const gaugeCpuVal = document.getElementById('gaugeCpuValue');
    const gaugeDiskVal = document.getElementById('gaugeDiskValue');

    if (gaugeRamVal) gaugeRamVal.textContent = `${(ramMb / 1024).toFixed(1)} GB`;
    if (gaugeCpuVal) gaugeCpuVal.textContent = `${cpuPct}%`;
    if (gaugeDiskVal) gaugeDiskVal.textContent = `${(diskMb / 1024).toFixed(0)} GB`;

    // Audit Timeline
    const timeline = document.getElementById('detailAuditTimeline');
    if (timeline) {
      if (!service.auditTrail || !service.auditTrail.length) {
        timeline.innerHTML = renderEmptyState({ icon: 'shield', title: 'No recorded activity', message: 'Provider and account events for this service will appear here.' });
      } else {
        timeline.className = 'tl';
        timeline.innerHTML = service.auditTrail.map((ev: any) => `<div class="tli"><span class="ico-b ${ev.action.includes('power') ? 'info' : 'accent'} round">${hero(ev.action.includes('power') ? 'refresh' : 'shield', 's')}</span><div class="tx"><b>${esc(String(ev.action || '').replaceAll('.', ' · '))}</b><span>${formatDate(ev.createdAt)}${ev.metadata ? ` · ${esc(ev.metadata)}` : ''}</span></div></div>`).join('');
      }
    }

  } catch (error: any) {
    toast(error.message, 'bad');
  }
}
