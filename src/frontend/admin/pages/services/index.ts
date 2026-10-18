/**
 * Staff Control Plane — Service Inventory & Management Page Module
 * Route: /admin/services
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { badge } from '../../shell/admin-shell.js';
import { hero, toast } from '../../../petal/index.js';

let activeServiceId: string | null = null;

export function getActiveServiceId(): string | null {
  return activeServiceId;
}

export async function renderServices(q = ''): Promise<void> {
  const host = document.querySelector<HTMLElement>('#servicesList');
  if (!host) return;

  try {
    const d = await api<{ services: any[] }>(`/api/v1/admin/services?q=${encodeURIComponent(q)}`);
    if (!d.services.length) {
      host.innerHTML = `<tr><td colspan="6"><div class="empty"><b>No matching services.</b></div></td></tr>`;
      return;
    }

    host.innerHTML = d.services.map((x) => `<tr class="h" data-filter-state="${x.runtime_state === 'RUNNING' ? 'RUNNING' : 'OTHER'}" data-service-id="${esc(x.id)}" style="cursor:pointer">
      <td data-l="Service"><b>${esc(x.plan_name || x.product_name)}</b><small class="mono">${esc(x.identifier || x.id)}</small></td>
      <td data-l="Account">${esc(x.account_name)}</td>
      <td data-l="Node"><span class="mono">${esc(x.node_name)}</span><small>${esc(x.region_name)}</small></td>
      <td data-l="Contract">${badge(x.contract_status)}</td>
      <td data-l="Runtime">${badge(x.runtime_state || 'UNKNOWN')}</td>
      <td class="r" data-l="Manage"><button type="button" class="btn xs pri" data-service-id="${esc(x.id)}">Manage</button></td>
    </tr>`).join('');
  } catch (e: any) {
    host.innerHTML = `<tr><td colspan="6"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
  }
}

export async function openServiceDetail(serviceId: string): Promise<void> {
  activeServiceId = serviceId;
  const modal = document.getElementById('modalAdminServiceDetail');
  const body = document.getElementById('adminServiceBody');
  if (!modal || !body) return;

  body.innerHTML = '<div style="padding:28px;text-align:center;color:var(--ink2)"><div class="sk"><i></i><i></i><i></i></div></div>';
  modal.hidden = false;

  try {
    const data = await api<{
      service: any;
      audit: any[];
    }>(`/api/v1/admin/services/${encodeURIComponent(serviceId)}`);

    const s = data.service;
    const titleEl = document.getElementById('adminServiceTitle');
    const eyebrowEl = document.getElementById('adminServiceEyebrow');
    if (titleEl) titleEl.textContent = `${s.plan_name || s.product_name} (${s.identifier || s.id.slice(0, 8)})`;
    if (eyebrowEl) eyebrowEl.textContent = `${s.provider_type} Instance · ${s.account_name}`;

    body.innerHTML = `
      <!-- Status & Identity Bar -->
      <div class="row nw" style="justify-content:space-between;align-items:center;background:var(--s2);padding:12px 14px;border-radius:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="tile ${s.runtime_state === 'RUNNING' ? 'good' : 'neu'}">${hero('server')}</span>
          <div>
            <b>${esc(s.account_name)}</b>
            <div class="faint" style="font-size:12px">Owner: ${esc(s.owner_name)} (${esc(s.owner_email)})</div>
          </div>
        </div>
        <div class="row nw" style="gap:8px">
          ${badge(s.contract_status)}
          ${badge(s.runtime_state || 'UNKNOWN')}
        </div>
      </div>

      <!-- Quick Specs & Node Grid -->
      <div class="g g4">
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">NODE & REGION</small>
          <div style="font-size:14px;font-weight:700" class="mono">${esc(s.node_name)}</div>
          <small class="faint">${esc(s.region_name)}</small>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">ALLOCATED RAM</small>
          <div style="font-size:14px;font-weight:700">${s.memory_limit_mb ? (s.memory_limit_mb >= 1024 ? `${s.memory_limit_mb / 1024} GB` : `${s.memory_limit_mb} MB`) : 'Unspecified'}</div>
          <small class="faint">${s.cpu_limit_pct || 100}% CPU Limit</small>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">NVMe STORAGE</small>
          <div style="font-size:14px;font-weight:700">${s.disk_limit_mb ? `${Math.round(s.disk_limit_mb / 1024)} GB` : 'Unspecified'}</div>
          <small class="faint">High IOPS SSD</small>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">EXTERNAL ID</small>
          <div style="font-size:13px;font-weight:700" class="mono">${esc(s.external_id || 'Pending')}</div>
          <small class="faint">${esc(s.provider_instance_id || 'local')}</small>
        </div>
      </div>

      <!-- Live Provider Controls -->
      <div class="card flat" style="padding:14px">
        <div class="row nw" style="justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <div class="dh">HYPERVISOR POWER ACTIONS</div>
            <small class="muted">Send audited power instructions to the hypervisor instance.</small>
          </div>
          <button type="button" class="btn xs" id="btnAdminSyncService" data-service-id="${esc(s.id)}">
            ${hero('refresh-cw', 'xs')} Sync State
          </button>
        </div>
        <div class="row nw" style="gap:8px">
          <button type="button" class="btn xs" id="btnPowerRestart" data-action="restart" data-service-id="${esc(s.id)}">
            ${hero('refresh-cw', 'xs')} Restart
          </button>
          <button type="button" class="btn xs good" id="btnPowerStart" data-action="start" data-service-id="${esc(s.id)}">
            ${hero('play', 'xs')} Start
          </button>
          <button type="button" class="btn xs bad" id="btnPowerStop" data-action="stop" data-service-id="${esc(s.id)}">
            ${hero('square', 'xs')} Stop
          </button>
        </div>
        <div id="servicePowerFeedback" style="margin-top:8px" hidden></div>
      </div>

      <div class="card flat" style="padding:14px">
        <div class="dh" style="margin-bottom:4px">RELINK TO PANEL SERVER</div>
        <small class="muted">Use when the server was recreated on the panel under another id. Current link: <code>${esc(String(s.external_id || 'none'))}</code></small>
        <div class="row nw" style="gap:8px;margin-top:10px">
          <div class="inp s pill" style="flex:1"><input id="relinkId" inputmode="numeric" placeholder="Panel server id (number)" aria-label="Panel server id"></div>
          <button type="button" class="btn xs" id="btnRelink" data-service-id="${esc(s.id)}">Relink</button>
        </div>
      </div>

      <!-- Lifecycle Management Form -->
      <div class="card flat" style="padding:14px">
        <div class="dh" style="margin-bottom:4px">LIFECYCLE SUSPENSION & TERMINATION</div>
        <small class="muted" style="display:block;margin-bottom:10px">Administrative actions require audit rationale and recording.</small>

        <div class="field" style="margin-bottom:10px">
          <label for="adminServiceAuditReason">Audit reason (min 5 characters)</label>
          <div class="inp"><input type="text" id="adminServiceAuditReason" placeholder="e.g. Chargeback investigation or Terms of Service violation"></div>
        </div>

        <div class="row nw" style="gap:8px;justify-content:flex-end">
          ${s.contract_status === 'ACTIVE' ? `
            <button type="button" class="btn xs bad" id="btnAdminSuspend" data-service-id="${esc(s.id)}">Suspend Service</button>
          ` : s.contract_status === 'SUSPENDED' ? `
            <button type="button" class="btn xs good" id="btnAdminUnsuspend" data-service-id="${esc(s.id)}">Unsuspend Service</button>
          ` : ''}
          ${s.contract_status !== 'TERMINATED' ? `
            <button type="button" class="btn xs bad" id="btnAdminTerminate" data-service-id="${esc(s.id)}">Terminate Service</button>
          ` : ''}
        </div>
      </div>

      <!-- Recent Audit Events -->
      <div>
        <div class="dh" style="margin-bottom:6px">AUDIT & LIFECYCLE HISTORY</div>
        <div class="table-scroll" style="max-height:160px">
          <table class="tbl rsp">
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor Type</th>
                <th class="r">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              ${(data.audit || []).length ? data.audit.map((a: any) => `<tr>
                <td><b>${esc(a.action)}</b></td>
                <td><span class="pill sm ${a.actor_type === 'STAFF' ? 'pri' : ''}">${esc(a.actor_type)}</span></td>
                <td class="r faint" style="font-size:12px">${formatDate(a.created_at)}</td>
              </tr>`).join('') : '<tr><td colspan="3"><div class="empty"><b>No audit events recorded for this service.</b></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    wireServiceDetailEvents(s.id);
  } catch (err: any) {
    body.innerHTML = `<div class="alert bad"><div><b>Error loading service details</b><span>${esc(err.message)}</span></div></div>`;
  }
}

function wireServiceDetailEvents(serviceId: string): void {
  const syncBtn = document.getElementById('btnAdminSyncService');
  const powerRestart = document.getElementById('btnPowerRestart');
  const powerStart = document.getElementById('btnPowerStart');
  const powerStop = document.getElementById('btnPowerStop');
  const suspendBtn = document.getElementById('btnAdminSuspend');
  const unsuspendBtn = document.getElementById('btnAdminUnsuspend');
  const terminateBtn = document.getElementById('btnAdminTerminate');
  const feedback = document.getElementById('servicePowerFeedback');
  document.getElementById('btnRelink')?.addEventListener('click', async () => {
    const value = (document.getElementById('relinkId') as HTMLInputElement | null)?.value.trim() || '';
    if (!value || !window.confirm(`Link this service to panel server ${value}?`)) return;
    try {
      await api(`/api/v1/admin/services/${encodeURIComponent(serviceId)}/relink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ panelServerId: value }) });
      toast('Service relinked', 'good');
    } catch (e: any) { toast(e?.message || 'Relink failed', 'bad'); }
  });

  const executePower = async (action: 'start' | 'stop' | 'restart') => {
    if (!feedback) return;
    feedback.hidden = false;
    feedback.className = 'alert info';
    feedback.innerHTML = `<span>Sending <b>${action}</b> signal to hypervisor…</span>`;
    try {
      const res = await api<{ success: boolean; action: string; runtimeState: string }>(
        `/api/v1/admin/services/${encodeURIComponent(serviceId)}/power`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      feedback.className = 'alert good';
      feedback.innerHTML = `<span>Power action <b>${res.action}</b> acknowledged. State: <b>${res.runtimeState}</b>.</span>`;
      setTimeout(() => openServiceDetail(serviceId), 1200);
    } catch (err: any) {
      feedback.className = 'alert bad';
      feedback.innerHTML = `<span>Power command failed: ${esc(err.message)}</span>`;
    }
  };

  if (powerRestart) powerRestart.addEventListener('click', () => executePower('restart'));
  if (powerStart) powerStart.addEventListener('click', () => executePower('start'));
  if (powerStop) powerStop.addEventListener('click', () => executePower('stop'));

  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      if (!feedback) return;
      feedback.hidden = false;
      feedback.className = 'alert info';
      feedback.innerHTML = `<span>Synchronizing state with Pterodactyl adapter…</span>`;
      try {
        const res = await api<{ success: boolean; runtimeState: string }>(
          `/api/v1/admin/services/${encodeURIComponent(serviceId)}/sync`,
          { method: 'POST' }
        );
        feedback.className = 'alert good';
        feedback.innerHTML = `<span>Synchronized. Current runtime state: <b>${res.runtimeState}</b>.</span>`;
        setTimeout(() => openServiceDetail(serviceId), 1000);
      } catch (err: any) {
        feedback.className = 'alert bad';
        feedback.innerHTML = `<span>Sync failed: ${esc(err.message)}</span>`;
      }
    });
  }

  const handleLifecycle = async (action: 'suspend' | 'unsuspend' | 'terminate') => {
    const reasonInput = document.getElementById('adminServiceAuditReason') as HTMLInputElement | null;
    const reason = reasonInput?.value.trim() || '';
    if (reason.length < 5) {
      alert('Please enter an audit reason of at least 5 characters.');
      return;
    }
    if (!confirm(`Are you sure you want to ${action.toUpperCase()} this service?`)) return;

    try {
      await api(`/api/v1/admin/services/${encodeURIComponent(serviceId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      alert(`Service ${action} completed successfully.`);
      await openServiceDetail(serviceId);
      await renderServices();
    } catch (err: any) {
      alert(`Operation failed: ${err.message}`);
    }
  };

  if (suspendBtn) suspendBtn.addEventListener('click', () => handleLifecycle('suspend'));
  if (unsuspendBtn) unsuspendBtn.addEventListener('click', () => handleLifecycle('unsuspend'));
  if (terminateBtn) terminateBtn.addEventListener('click', () => handleLifecycle('terminate'));
}
