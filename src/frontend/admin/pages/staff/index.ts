/**
 * Staff Control Plane — Staff Access Page Module
 * Route: /admin/staff
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { badge } from '../../shell/admin-shell.js';
import { renderPager } from '../../../petal/index.js';

let currentQuery = '';
let currentPage = 1;
let total = 0;
const pageSize = 20;
let listenersBound = false;

function bindListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  document.getElementById('adminStaffPager')?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-pg]');
    if (button && !button.disabled) void renderStaff(currentQuery, Number(button.dataset.pg) || 1);
  });
}

export async function renderStaff(q = '', page = 1): Promise<void> {
  const host = document.querySelector<HTMLElement>('#staffList');
  if (!host) return;

  try {
    currentQuery = q;
    currentPage = Math.max(1, page);
    const params = new URLSearchParams({ q, limit: String(pageSize), offset: String((currentPage - 1) * pageSize) });
    const d = await api<{ staff: any[]; total: number }>(`/api/v1/admin/staff?${params}`);
    total = Number(d.total || 0);
    if (!d.staff.length) {
      host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>No matching staff identities.</b></div></td></tr>`;
      const row = document.getElementById('adminStaffPaginationRow');
      if (row) row.style.display = 'none';
      return;
    }

    host.innerHTML = d.staff.map((x) => `<tr class="h"><td data-l="Member"><div class="row nw"><span class="av v">${esc(x.name.split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase())}</span><div><b>${esc(x.name)}</b><small>${esc(x.email)}</small></div></div></td><td data-l="Role">${badge(x.role)}</td><td data-l="MFA">${badge(x.mfa_enabled ? 'READY' : 'NOT SET UP')}</td><td data-l="Access">${badge(x.status)}</td><td data-l="Action"><button class="btn xs" data-staff-user-id="${esc(x.id)}" data-staff-name="${esc(x.name)}" data-staff-role="${esc(x.role)}" data-staff-status="${esc(x.status)}" data-permission="staff:manage">Edit</button></td></tr>`).join('');
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const start = (currentPage - 1) * pageSize;
    const info = document.getElementById('adminStaffPageInfo');
    const pager = document.getElementById('adminStaffPager');
    const row = document.getElementById('adminStaffPaginationRow');
    if (info) info.textContent = `Showing ${start + 1}–${start + d.staff.length} of ${total}`;
    if (pager) pager.innerHTML = renderPager(currentPage, pages);
    if (row) row.style.display = total > pageSize ? 'flex' : 'none';
    bindListeners();
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
