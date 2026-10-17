/**
 * Staff Control Plane — Support Tickets Page Module
 * Route: /admin/tickets
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { renderMarkdown } from '../../../core/utils/markdown.js';
import { row } from '../../shell/admin-shell.js';

let activeTicketId: string | null = null;

export function getActiveTicketId(): string | null {
  return activeTicketId;
}

export function setActiveTicketId(id: string | null): void {
  activeTicketId = id;
}

export async function renderTickets(q = ''): Promise<void> {
  const host = document.querySelector<HTMLElement>('#ticketsList');
  if (!host) return;

  try {
    const d = await api<{ tickets: any[] }>(`/api/v1/admin/tickets?q=${encodeURIComponent(q)}`);
    if (!d.tickets.length) {
      host.innerHTML = `<div class="empty"><b>No matching support tickets.</b></div>`;
      return;
    }

    host.innerHTML = d.tickets
      .map((x) =>
        row({
          symbol: 'support',
          title: x.subject,
          sub: `${x.account_name} · ${x.customer_name} · ${x.message_count} messages`,
          status: `${x.priority} · ${x.status}`,
          meta: `Updated ${formatDate(x.updated_at)}`,
          dataAttr: `data-ticket-id="${esc(x.id)}"`,
        })
      )
      .join('');
  } catch (e: any) {
    host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
  }
}

export async function openTicketDetail(ticketId: string): Promise<void> {
  activeTicketId = ticketId;
  const modal = document.getElementById('modalTicketDetail');
  const msgBox = document.getElementById('adminTicketMessages');
  if (!modal || !msgBox) return;

  msgBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink2)">Loading ticket thread…</div>';
  modal.hidden = false;

  try {
    const d = await api<{
      ticket: any;
      messages: any[];
      attachments?: any[];
    }>(`/api/v1/admin/tickets/${encodeURIComponent(ticketId)}`);

    const subEl = document.getElementById('adminTicketSubject');
    const metaEl = document.getElementById('adminTicketMeta');
    const statusSelect = document.getElementById('adminTicketStatusSelect') as HTMLSelectElement | null;

    if (subEl) subEl.textContent = d.ticket.subject;
    if (metaEl)
      metaEl.textContent = `${d.ticket.account_name} · Customer: ${d.ticket.creator_name} (${
        d.ticket.creator_email
      }) · Created ${formatDate(d.ticket.created_at)}`;
    if (statusSelect) statusSelect.value = d.ticket.status;

    msgBox.innerHTML = d.messages
      .map(
        (m) => `
        <div style="padding:10px 14px;border-radius:12px;background:${
          m.is_staff_internal_note ? 'var(--warn-bg)' : m.is_staff_author ? 'var(--accent-bg)' : 'var(--s2)'
        };border:1px solid ${m.is_staff_internal_note ? 'var(--warn)' : 'transparent'}">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px">
            <b>${esc(m.author_name)} ${
          m.is_staff_internal_note
            ? '<span class="badge warn s">INTERNAL NOTE</span>'
            : m.is_staff_author
            ? '<span class="badge accent s">STAFF</span>'
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
