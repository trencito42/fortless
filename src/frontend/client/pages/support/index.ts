/**
 * Customer Portal — Support & Ticketing Page Module
 * Route: /app/support
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { formatBytes } from '../../../core/utils/formatting.js';
import { renderMarkdown } from '../../../core/utils/markdown.js';
import { hero, renderEmptyState, toast } from '../../../petal/index.js';

let activeTicketId: string | null = null;

export function getActiveTicketId(): string | null {
  return activeTicketId;
}

export function setActiveTicketId(id: string | null): void {
  activeTicketId = id;
}

export async function renderTickets(): Promise<void> {
  const host = document.getElementById('ticketsList');
  if (!host) return;

  host.innerHTML = `<div class="state-message">${hero('refresh')}<span>Loading support conversations…</span></div>`;

  try {
    const { tickets } = await api<{ tickets: any[] }>('/api/v1/tickets');
    host.className = 'col';
    host.style.gap = '8px';

    if (!tickets.length) {
      host.innerHTML = renderEmptyState({
        icon: 'support',
        title: 'No support conversations',
        message: 'When you open a ticket, its account-scoped thread will appear here.',
        actionHtml: `<button class="btn s tint" type="button" data-open-ticket>${hero('plus', 's')}Open ticket</button>`,
      });
      return;
    }

    host.innerHTML = tickets
      .map((ticket) => {
        const priorityClass = ticket.priority === 'URGENT' ? 'bad' : ticket.priority === 'HIGH' ? 'warn' : '';
        const stateClass = ['OPEN', 'WAITING_STAFF'].includes(ticket.status)
          ? 'info'
          : ticket.status === 'RESOLVED'
          ? 'good'
          : '';
        return `
          <button type="button" class="li card s2" data-ticket-id="${esc(ticket.id)}">
            <span class="ico-b ${priorityClass || 'accent'}">${hero('support')}</span>
            <span class="tx">
              <b>${esc(ticket.subject)}</b>
              <span>${esc(formatDate(ticket.updated_at || ticket.created_at))}</span>
            </span>
            <span class="badge ${priorityClass} s">${esc(ticket.priority)}</span>
            <span class="badge ${stateClass} s">${esc(ticket.status)}</span>
          </button>
        `;
      })
      .join('');
  } catch (error: any) {
    host.innerHTML = `<div class="state-message bad">${hero('warning')}<span>${esc(error.message)}</span></div>`;
  }
}

export async function openTicketModal(id: string): Promise<void> {
  activeTicketId = id;
  const modal = document.getElementById('ticketModal');
  const host = document.getElementById('modalTicketMessages');
  const attHost = document.getElementById('modalTicketAttachments');

  if (modal) modal.hidden = false;
  if (host) host.innerHTML = `<div class="state-message">${hero('refresh')}<span>Loading conversation…</span></div>`;
  if (attHost) attHost.innerHTML = '';

  const replyFile = document.getElementById('ticketReplyFileInput') as HTMLInputElement | null;
  if (replyFile) replyFile.value = '';
  const replyLabel = document.getElementById('ticketReplyFileLabel');
  if (replyLabel) replyLabel.textContent = '';

  try {
    const data = await api<{ ticket: any; messages: any[]; attachments?: any[] }>(
      `/api/v1/tickets/${encodeURIComponent(id)}`
    );

    const subEl = document.getElementById('modalTicketSubject');
    const metaEl = document.getElementById('modalTicketMeta');
    if (subEl) subEl.textContent = data.ticket.subject;
    if (metaEl) metaEl.textContent = `${data.ticket.priority} · ${data.ticket.status}`;

    if (host) {
      host.className = 'message-list';
      host.innerHTML =
        data.messages
          .map(
            (item) => `
          <div class="message ${item.is_staff ? 'staff' : ''}">
            <small>${esc(item.is_staff ? item.author_name || 'Support' : 'You')} · ${esc(formatDate(item.created_at))}</small>
            <div class="bubble">${renderMarkdown(item.body)}</div>
          </div>
        `
          )
          .join('') || '<div class="muted">No messages.</div>';
    }

    if (attHost && data.attachments && data.attachments.length) {
      attHost.innerHTML =
        `<small class="muted" style="display:block;margin-bottom:6px">Attachments (${data.attachments.length}):</small>` +
        data.attachments
          .map(
            (att) => `
            <a href="/api/v1/tickets/${encodeURIComponent(id)}/attachments/${encodeURIComponent(att.id)}" download class="att-chip">
              ${hero('document', 'xs')}
              <span class="name">${esc(att.filename)}</span>
              <span class="sz">${formatBytes(att.byte_size)}</span>
            </a>
          `
          )
          .join('');
    }
  } catch (error: any) {
    if (host) host.innerHTML = `<div class="state-message bad">${hero('warning')}<span>${esc(error.message)}</span></div>`;
  }
}

export async function sendReply(): Promise<void> {
  if (!activeTicketId) return;
  const field = document.getElementById('modalTicketReply') as HTMLTextAreaElement | null;
  const body = field?.value.trim() || '';
  const fileInput = document.getElementById('ticketReplyFileInput') as HTMLInputElement | null;
  const btn = document.getElementById('sendReplyBtn') as HTMLButtonElement | null;

  if (!body && (!fileInput || !fileInput.files || !fileInput.files.length)) return;
  if (btn) btn.disabled = true;

  try {
    if (body) {
      await api(`/api/v1/tickets/${encodeURIComponent(activeTicketId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
    }

    if (fileInput && fileInput.files?.[0]) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      await new Promise<void>((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64 = String(reader.result || '').split(',')[1];
            await api(`/api/v1/tickets/${encodeURIComponent(activeTicketId!)}/attachments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: file.name,
                contentType: file.type || 'application/octet-stream',
                dataBase64: base64,
              }),
            });
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      fileInput.value = '';
      const replyFileLabel = document.getElementById('ticketReplyFileLabel');
      if (replyFileLabel) replyFileLabel.textContent = '';
    }

    if (field) field.value = '';
    toast('Reply added.', 'good');
    await openTicketModal(activeTicketId);
  } catch (error: any) {
    toast(error.message, 'bad');
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function createTicket(event: Event): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const errorHost = document.getElementById('ticketFormError') as HTMLElement;
  const submit = document.getElementById('submitTicketBtn') as HTMLButtonElement;
  const subject = (document.getElementById('ticketSubject') as HTMLInputElement).value.trim();
  const messageBody = (document.getElementById('ticketMessage') as HTMLTextAreaElement).value.trim();
  const priority = (new FormData(form).get('ticketPriority') as string) || 'NORMAL';
  const fileInput = document.getElementById('newTicketFileInput') as HTMLInputElement | null;

  errorHost.hidden = true;
  if (subject.length < 3 || messageBody.length < 5) {
    errorHost.textContent = 'Add a clear subject and at least five characters of detail.';
    errorHost.hidden = false;
    return;
  }

  const payload = { subject, priority, message: messageBody };
  submit.disabled = true;
  submit.classList.add('load');

  try {
    const created = await api<{ ticketId: string }>('/api/v1/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (fileInput && fileInput.files?.[0]) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      await new Promise<void>((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64 = String(reader.result || '').split(',')[1];
            await api(`/api/v1/tickets/${encodeURIComponent(created.ticketId)}/attachments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: file.name,
                contentType: file.type || 'application/octet-stream',
                dataBase64: base64,
              }),
            });
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      fileInput.value = '';
      const newFileLabel = document.getElementById('newTicketFileLabel');
      if (newFileLabel) newFileLabel.textContent = '';
    }

    const newTicketModal = document.getElementById('newTicketModal');
    if (newTicketModal) newTicketModal.hidden = true;
    form.reset();
    toast('Ticket opened.', 'good');
    await renderTickets();
    await openTicketModal(created.ticketId);
  } catch (error: any) {
    errorHost.textContent = error.message;
    errorHost.hidden = false;
  } finally {
    submit.disabled = false;
    submit.classList.remove('load');
  }
}
