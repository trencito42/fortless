/**
 * Staff Control Plane — Staff Access Page Module
 * Route: /admin/staff
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { row } from '../../shell/admin-shell.js';

export async function renderStaff(q = ''): Promise<void> {
  const host = document.querySelector<HTMLElement>('#staffList');
  if (!host) return;

  try {
    const d = await api<{ staff: any[] }>(`/api/v1/admin/staff?q=${encodeURIComponent(q)}`);
    if (!d.staff.length) {
      host.innerHTML = `<div class="empty"><b>No matching staff identities.</b></div>`;
      return;
    }

    host.innerHTML = d.staff
      .map((x) =>
        row({
          symbol: 'users',
          title: x.name,
          sub: `${x.email} · MFA ${x.mfa_enabled ? 'enabled' : 'required'}`,
          status: `${x.role} · ${x.status}`,
          meta: `Updated ${formatDate(x.updated_at)}`,
          dataAttr: `data-staff-user-id="${esc(x.id)}" data-staff-name="${esc(x.name)}" data-staff-role="${esc(
            x.role
          )}" data-staff-status="${esc(x.status)}"`,
        })
      )
      .join('');
  } catch (e: any) {
    host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
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
