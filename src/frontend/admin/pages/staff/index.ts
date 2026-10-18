/**
 * Staff Control Plane — Staff Access Page Module
 * Route: /admin/staff
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { badge } from '../../shell/admin-shell.js';

export async function renderStaff(q = ''): Promise<void> {
  const host = document.querySelector<HTMLElement>('#staffList');
  if (!host) return;

  try {
    const d = await api<{ staff: any[] }>(`/api/v1/admin/staff?q=${encodeURIComponent(q)}`);
    if (!d.staff.length) {
      host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>No matching staff identities.</b></div></td></tr>`;
      return;
    }

    host.innerHTML = d.staff.map((x) => `<tr class="h"><td data-l="Member"><div class="row nw"><span class="av v">${esc(x.name.split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase())}</span><div><b>${esc(x.name)}</b><small>${esc(x.email)}</small></div></div></td><td data-l="Role">${badge(x.role)}</td><td data-l="MFA">${badge(x.mfa_enabled ? 'READY' : 'NOT SET UP')}</td><td data-l="Access">${badge(x.status)}</td><td data-l="Action"><button class="btn xs" data-staff-user-id="${esc(x.id)}" data-staff-name="${esc(x.name)}" data-staff-role="${esc(x.role)}" data-staff-status="${esc(x.status)}">Edit</button></td></tr>`).join('');
  } catch (e: any) {
    host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
  }
}

export function openStaffEditor(userId: string, name: string, currentRole: string, currentStatus: string): void {
  const idInput = document.getElementById('adminStaffUserId') as HTMLInputElement | null;
  const titleEl = document.getElementById('adminStaffTitle');
  const metaEl = document.getElementById('adminStaffMeta');
  const roleSelect = document.getElementById('adminStaffRoleSelect') as HTMLSelectElement | null;
  const statusSelect = document.getElementById('adminStaffStatusSelect') as HTMLSelectElement | null;
  const reasonInput = document.getElementById('adminStaffReason') as HTMLInputElement | null;
  const modal = document.getElementById('modalStaffEditor');

  if (idInput) idInput.value = userId;
  if (titleEl) titleEl.textContent = `Edit Staff: ${name}`;
  if (metaEl) metaEl.textContent = `User ID: ${userId}`;
  if (roleSelect) roleSelect.value = currentRole;
  if (statusSelect) statusSelect.value = currentStatus;
  if (reasonInput) reasonInput.value = '';
  if (modal) modal.hidden = false;
}
