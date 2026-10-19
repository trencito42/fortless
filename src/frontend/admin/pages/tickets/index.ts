/**
 * Staff Control Plane — Support Tickets Page Module
 * Route: /admin/tickets
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { renderMarkdown } from '../../../core/utils/markdown.js';
import { badge } from '../../shell/admin-shell.js';
import { renderPager } from '../../../petal/index.js';

let activeTicketId: string | null = null;
let cachedTickets: any[] = [];
let adminTicketsTotal = 0;
let adminTicketsQuery = '';
let adminTicketsPage = 1;
const adminTicketsPageSize = 10;
let adminTicketsListenersBound = false;
let supportMeta: { departments: any[]; macros: any[]; staff: any[] } = { departments: [], macros: [], staff: [] };

function ticketFilters() {
  return {
    status: (document.getElementById('ticketsStatusFilter') as HTMLSelectElement | null)?.value || '',
    departmentId: (document.getElementById('ticketsDepartmentFilter') as HTMLSelectElement | null)?.value || '',
    assignedTo: (document.getElementById('ticketsAssignmentFilter') as HTMLSelectElement | null)?.value || '',
  };
}

function hydrateSupportMeta(): void {
  const departments = supportMeta.departments.filter((item) => item.is_active);
  for (const id of ['ticketsDepartmentFilter', 'supportMacroDepartment']) {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (!select) continue;
    const selected = select.value;
    const first = id === 'ticketsDepartmentFilter' ? '<option value="">All departments</option>' : '<option value="">Any</option>';
    select.innerHTML = first + departments.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
    select.value = selected;
  }
  const assignment = document.getElementById('ticketsAssignmentFilter') as HTMLSelectElement | null;
  if (assignment) { const selected = assignment.value; assignment.innerHTML = '<option value="">All assignees</option><option value="UNASSIGNED">Unassigned</option>' + supportMeta.staff.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join(''); assignment.value = selected; }
  const workload = document.getElementById('supportWorkload');
  if (workload) workload.innerHTML = supportMeta.staff.slice(0, 4).map((item) => `<article class="card flat"><small class="muted">${esc(item.role)}</small><b>${esc(item.name)}</b><span>${Number(item.active_count || 0)} active · ${Number(item.waiting_count || 0)} waiting</span></article>`).join('') || '<div class="empty"><b>No active support staff.</b></div>';
}

export function getActiveTicketId(): string | null {
  return activeTicketId;
}

export function setActiveTicketId(id: string | null): void {
  activeTicketId = id;
}

function paintTicketsList(): void {
  const host = document.querySelector<HTMLElement>('#ticketsList');
  const paginationRow = document.getElementById('adminTicketsPaginationRow');
  const infoEl = document.getElementById('adminTicketsPageInfo');
  const pagerEl = document.getElementById('adminTicketsPager');
  if (!host) return;

  if (!cachedTickets.length) {
    if (paginationRow) paginationRow.style.display = 'none';
    host.innerHTML = `<tr><td colspan="6"><div class="empty"><b>No matching support tickets.</b></div></td></tr>`;
    return;
  }

  const pages = Math.max(1, Math.ceil(adminTicketsTotal / adminTicketsPageSize));
  const start = (adminTicketsPage - 1) * adminTicketsPageSize;
  if (paginationRow) paginationRow.style.display = adminTicketsTotal > adminTicketsPageSize ? 'flex' : 'none';
  if (infoEl) infoEl.textContent = `Showing ${start + 1}–${start + cachedTickets.length} of ${adminTicketsTotal}`;
  if (pagerEl) pagerEl.innerHTML = renderPager(adminTicketsPage, pages);

  host.innerHTML = cachedTickets.map((x) => `<tr class="h" data-ticket-id="${esc(x.id)}" style="cursor:pointer"><td data-l="Priority">${badge(x.priority)}</td><td data-l="Subject"><b>${esc(x.subject)}</b><small>${Number(x.message_count)} messages · ${esc(x.customer_name)} · ${esc(x.account_name)}</small></td><td data-l="Department">${esc(x.department_name || 'Unrouted')}</td><td data-l="Assigned">${esc(x.assigned_staff_name || 'Unassigned')}</td><td data-l="Status">${badge(x.status)}</td><td data-l="Updated" class="muted">${formatDate(x.updated_at)}</td></tr>`).join('');
}

function bindAdminTicketsListeners(): void {
  if (adminTicketsListenersBound) return;
  adminTicketsListenersBound = true;

  const pagerEl = document.getElementById('adminTicketsPager');
  pagerEl?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pg]');
    if (btn && !btn.disabled) {
      const p = Number(btn.dataset.pg);
      if (p && p !== adminTicketsPage) {
        adminTicketsPage = p;
        renderTickets(adminTicketsQuery, p);
      }
    }
  });
  for (const id of ['ticketsStatusFilter', 'ticketsDepartmentFilter', 'ticketsAssignmentFilter']) {
    document.getElementById(id)?.addEventListener('change', () => void renderTickets(adminTicketsQuery, 1));
  }
  document.getElementById('adminTicketMacro')?.addEventListener('change', (event) => {
    const macro = supportMeta.macros.find((item) => item.id === (event.target as HTMLSelectElement).value);
    if (!macro) return;
    const body = document.getElementById('adminReplyBody') as HTMLTextAreaElement | null;
    const status = document.getElementById('adminTicketStatusSelect') as HTMLSelectElement | null;
    if (body) body.value = macro.body;
    if (status && macro.status) status.value = macro.status;
  });
}

export async function renderTickets(q = '', page = 1): Promise<void> {
  const host = document.querySelector<HTMLElement>('#ticketsList');
  if (!host) return;

  try {
    adminTicketsQuery = q;
    adminTicketsPage = Math.max(1, page);
    const offset = (adminTicketsPage - 1) * adminTicketsPageSize;
    const filter = ticketFilters();
    const params = new URLSearchParams({ q, limit: String(adminTicketsPageSize), offset: String(offset) });
    if (filter.status) params.set('status', filter.status);
    if (filter.departmentId) params.set('departmentId', filter.departmentId);
    if (filter.assignedTo) params.set('assignedTo', filter.assignedTo);
    const [d, meta] = await Promise.all([
      api<{ tickets: any[]; total: number }>(`/api/v1/admin/tickets?${params}`),
      api<{ departments: any[]; macros: any[]; staff: any[] }>('/api/v1/admin/support/meta'),
    ]);
    supportMeta = meta;
    hydrateSupportMeta();
    cachedTickets = d.tickets || [];
    adminTicketsTotal = Number(d.total || 0);
    paintTicketsList();
    bindAdminTicketsListeners();
  } catch (e: any) {
    host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
  }
}

export function openTicketDetail(ticketId: string): void {
  const path = `/admin/tickets/${encodeURIComponent(ticketId)}`;
  if (window.location.pathname !== path) window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export async function renderTicketDetail(ticketId: string): Promise<void> {
  activeTicketId = ticketId;
  const msgBox = document.getElementById('adminTicketMessages');
  if (!msgBox) return;

  msgBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink2)">Loading ticket thread…</div>';

  try {
    const [d, meta] = await Promise.all([api<{
      ticket: any;
      messages: any[];
      attachments?: any[];
    }>(`/api/v1/admin/tickets/${encodeURIComponent(ticketId)}`), api<{ departments: any[]; macros: any[]; staff: any[] }>('/api/v1/admin/support/meta')]);
    supportMeta = meta;

    const subEl = document.getElementById('adminTicketSubject');
    const metaEl = document.getElementById('adminTicketMeta');
    const statusSelect = document.getElementById('adminTicketStatusSelect') as HTMLSelectElement | null;

    if (subEl) subEl.textContent = d.ticket.subject;
    if (metaEl)
      metaEl.textContent = `${d.ticket.account_name} · Customer: ${d.ticket.creator_name} (${
        d.ticket.creator_email
      }) · Created ${formatDate(d.ticket.created_at)}`;
    if (statusSelect) statusSelect.value = d.ticket.status;
    const department = document.getElementById('adminTicketDepartment') as HTMLSelectElement | null;
    const assignee = document.getElementById('adminTicketAssignee') as HTMLSelectElement | null;
    const priority = document.getElementById('adminTicketPriority') as HTMLSelectElement | null;
    const macro = document.getElementById('adminTicketMacro') as HTMLSelectElement | null;
    if (department) { department.innerHTML = '<option value="">Unrouted</option>' + supportMeta.departments.filter((item) => item.is_active).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join(''); department.value = d.ticket.department_id || ''; }
    if (assignee) { assignee.innerHTML = '<option value="">Unassigned</option>' + supportMeta.staff.map((item) => `<option value="${esc(item.id)}">${esc(item.name)} · ${Number(item.active_count || 0)} active</option>`).join(''); assignee.value = d.ticket.assigned_staff_id || ''; }
    if (priority) priority.value = d.ticket.priority;
    if (macro) macro.innerHTML = '<option value="">Write custom response</option>' + supportMeta.macros.filter((item) => !item.department_id || item.department_id === d.ticket.department_id).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
    const context = document.getElementById('adminTicketContext');
    if (context) {
      context.innerHTML = `<a class="btn s" href="/admin/accounts/${encodeURIComponent(d.ticket.account_id)}" data-route="account-detail">View customer account</a>${
        d.ticket.service_id
          ? `<a class="btn s" href="/admin/services/${encodeURIComponent(d.ticket.service_id)}" data-route="admin-service-detail">View related service</a>`
          : '<span class="pill">No related service</span>'
      }${badge(d.ticket.priority)}${badge(d.ticket.status)}`;
    }

    msgBox.innerHTML = d.messages
      .map(
        (m) => `
        <div style="padding:10px 14px;border-radius:12px;background:${
          m.is_staff_internal_note ? 'var(--warn-bg)' : m.is_staff_author ? 'var(--accent-bg)' : 'var(--s2)'
        };border:1px solid ${m.is_staff_internal_note ? 'var(--warn)' : 'transparent'}">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px">
            <b>${esc(m.author_name)} ${
          m.is_staff_internal_note
            ? '<span class="pill warn" style="height:22px;padding:0 8px;font-size:11px">INTERNAL NOTE</span>'
            : m.is_staff_author
            ? '<span class="pill acc" style="height:22px;padding:0 8px;font-size:11px">STAFF</span>'
            : ''
        }</b>
            <span class="muted">${formatDate(m.created_at)}</span>
          </div>
          ${renderMarkdown(m.body)}
        </div>
      `
      )
      .join('');

    const attBox = document.getElementById('adminTicketAttachments');
    if (attBox) {
      const atts = d.attachments || [];
      if (atts.length) {
        attBox.innerHTML =
          '<b>Attachments:</b> ' +
          atts
            .map(
              (a) => `
            <a class="att-chip" href="/api/v1/tickets/${encodeURIComponent(
              ticketId
            )}/attachments/${encodeURIComponent(a.id)}" target="_blank" download>
              <span>${esc(a.filename)}</span>
              <small class="muted">(${(a.byte_size / 1024).toFixed(1)} KB)</small>
            </a>
          `
            )
            .join('');
      } else {
        attBox.innerHTML = '';
      }
    }
  } catch (err: any) {
    msgBox.innerHTML = `<div style="color:var(--bad);padding:20px">Error loading thread: ${esc(err.message)}</div>`;
  }
}
