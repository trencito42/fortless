/**
 * Customer Portal — Service Detail Page Module
 * Route: /app/services/:id
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { toast } from '../../../petal/index.js';
import { powerService } from '../dashboard/index.js';
import { capabilitiesStore } from '../../../core/state/capabilities.js';

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
      specsList.innerHTML = `
        <div class="row"><span class="muted" style="width:140px">Service ID:</span><code class="mono">${esc(service.id)}</code></div>
        <div class="row"><span class="muted" style="width:140px">Allocated RAM:</span><b>${Number(service.desiredConfig?.memoryLimitMb || 0) / 1024} GB</b></div>
        <div class="row"><span class="muted" style="width:140px">CPU Limit:</span><b>${esc(service.desiredConfig?.cpuLimitPct || 0)}%</b></div>
        <div class="row"><span class="muted" style="width:140px">Allocated Disk:</span><b>${Number(service.desiredConfig?.diskLimitMb || 0) / 1024} GB SSD</b></div>
        <div class="row"><span class="muted" style="width:140px">Provider Type:</span><span class="badge s">${esc(service.providerType)}</span></div>
      `;
    }

    const connList = document.getElementById('detailConnectionList');
    if (connList) {
      connList.innerHTML = `
        <div class="row"><span class="muted" style="width:140px">Node Hostname:</span><code class="mono">${esc(service.nodeFqdn)}</code></div>
        <div class="row"><span class="muted" style="width:140px">Datacenter:</span><b>${esc(service.regionName)} (${esc(service.regionCode)})</b></div>
        <div class="row"><span class="muted" style="width:140px">Remote ID:</span><code class="mono">${esc(service.externalId || 'Pending')}</code></div>
        <div class="row"><span class="muted" style="width:140px">Short Identifier:</span><code class="mono">${esc(service.identifier || 'Pending')}</code></div>
        <div class="row"><span class="muted" style="width:140px">Created At:</span><span>${formatDate(service.createdAt)}</span></div>
      `;
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
        timeline.innerHTML = '<div class="state-message">No recorded activity yet for this service.</div>';
      } else {
        timeline.innerHTML = service.auditTrail
          .map(
            (ev: any) => `
          <div class="row" style="padding:10px 0;border-bottom:1px solid var(--s2)">
            <span class="badge s ${ev.action.includes('power') ? 'info' : 'accent'}">${esc(ev.action)}</span>
            <span class="faint" style="font-size:12px">${formatDate(ev.createdAt)}</span>
            <span class="muted" style="font-size:12px">${esc(ev.metadata || '')}</span>
          </div>
        `
          )
          .join('');
      }
    }

  } catch (error: any) {
    toast(error.message, 'bad');
  }
}
