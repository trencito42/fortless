/** Customer Portal — dedicated support list, create and conversation routes. */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { formatBytes } from '../../../core/utils/formatting.js';
import { renderMarkdown } from '../../../core/utils/markdown.js';
import { editorMarkdown, hero, petalRichTextEditor, renderEmptyState, renderSkeleton, resetEditor, toast } from '../../../petal/index.js';

type Navigate = (path: string) => void;
type Ticket = { id: string; subject: string; priority: string; status: string; created_at: string; updated_at: string; message_count?: number };
type Attachment = { id: string; filename: string; byte_size: number; message_id?: string | null; created_at?: string };

let ticketCache: Ticket[] = [];

function priorityTone(value: string): string {
  return value === 'URGENT' ? 'bad' : value === 'HIGH' ? 'warn' : value === 'LOW' ? '' : 'info';
}

function statusTone(value: string): string {
  return ['OPEN', 'WAITING_STAFF'].includes(value) ? 'info' : value === 'RESOLVED' ? 'good' : '';
}

function ticketRow(ticket: Ticket): string {
  const search = `${ticket.subject} ${ticket.id} ${ticket.status} ${ticket.priority}`.toLowerCase();
  const tone = priorityTone(ticket.priority) || 'acc';
  const msgs = Number(ticket.message_count || 0);
  return `<a class="li support-ticket-row" href="/app/support/${esc(ticket.id)}" data-app-route="ticket-detail" data-ticket-search="${esc(search)}" data-ticket-status="${esc(ticket.status)}"><span class="tile ${tone} sm">${hero('support', 's')}</span><span class="tx"><b>${esc(ticket.subject)}</b><small>${esc(ticket.id)} · ${msgs} message${msgs === 1 ? '' : 's'} · ${esc(formatDate(ticket.updated_at || ticket.created_at))}</small></span><span class="row" style="gap:6px;flex-shrink:0"><span class="pill ${statusTone(ticket.status)}">${esc(ticket.status.replace('_', ' '))}</span><span class="pill ${tone}">${esc(ticket.priority)}</span>${hero('chevron', 's')}</span></a>`;
}

export async function renderTickets(): Promise<void> {
  const host = document.getElementById('ticketsList');
  if (!host) return;
  host.className = 'support-loading';
  host.innerHTML = renderSkeleton('list', 'Loading support conversations');
  try {
    const { tickets } = await api<{ tickets: Ticket[] }>('/api/v1/tickets');
    ticketCache = tickets;
    if (!tickets.length) {
      host.className = 'support-empty';
      host.innerHTML = renderEmptyState({ icon: 'support', title: 'No support conversations', message: 'Open a ticket when you need help with an account or service.', actionHtml: `<a class="btn s tint" href="/app/support/new" data-app-route="ticket-new">${hero('plus', 's')}Open ticket</a>` });
      return;
    }
    host.className = '';
    host.innerHTML = tickets.map(ticketRow).join('');
    filterTickets();
  } catch (error: any) {
    host.className = '';
    host.innerHTML = `<div class="alert bad"><div><b>Failed to load tickets</b><span>${esc(error.message)}</span></div></div>`;
  }
}

export function filterTickets(): void {
  const query = (document.getElementById('ticketSearch') as HTMLInputElement | null)?.value.trim().toLowerCase() || '';
  const status = (document.querySelector<HTMLInputElement>('input[name="ticketStatus"]:checked')?.value || 'ALL').toUpperCase();
  let visible = 0;
  document.querySelectorAll<HTMLElement>('.support-ticket-row').forEach((row) => {
    const rowStatus = row.dataset.ticketStatus || '';
    const matches = (!query || (row.dataset.ticketSearch || '').includes(query)) && (status === 'ALL' || (status === 'OPEN' ? ['OPEN', 'WAITING_STAFF', 'WAITING_CUSTOMER'].includes(rowStatus) : rowStatus === status));
    row.hidden = !matches;
    if (matches) visible++;
  });
  const count = document.getElementById('ticketResultCount');
  if (count) count.textContent = ticketCache.length ? `${visible} of ${ticketCache.length} conversations` : '';
}

function fileDrop(inputId: string, labelId: string): string {
  return `<div class="field"><span class="lbl">Attachment <small class="muted">optional · max 5 MB</small></span><label class="drop support-drop" tabindex="0" role="button" for="${inputId}">${hero('document', 'l')}<b>Drop a file here or browse</b><small>PNG, JPEG, GIF, WebP, PDF, text, JSON or ZIP</small><input id="${inputId}" type="file" accept="image/jpeg,image/png,image/gif,image/webp,text/plain,text/markdown,application/pdf,application/json,application/zip" hidden><span id="${labelId}" class="support-file-label"></span></label></div>`;
}

export function renderNewTicket(): void {
  const host = document.getElementById('newTicketPage');
  if (!host) return;
  host.innerHTML = `<div class="support-form-layout">
    <form id="createTicketPageForm" class="card support-form" novalidate>
      <div class="section-card-head"><span class="ico-b accent">${hero('support')}</span><div class="tx"><h2>Tell us what happened</h2><p>Include the affected service, timing and current impact. Markdown is stored safely.</p></div></div>
      <div class="field"><label for="ticketSubject">Subject</label><div class="inp"><input id="ticketSubject" name="subject" required minlength="3" maxlength="160" autocomplete="off" placeholder="e.g. Instance cannot start"></div></div>
      <fieldset class="field"><legend class="lbl">Priority</legend><div class="seg block support-priority" role="radiogroup">${['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => `<label><input type="radio" name="ticketPriority" value="${value}"${value === 'NORMAL' ? ' checked' : ''}><span>${value[0]}${value.slice(1).toLowerCase()}</span></label>`).join('')}</div></fieldset>
      <div class="field"><span class="lbl">Detailed message</span>${petalRichTextEditor('newTicketEditor', 'Detailed message', 'Describe what happened, when it started, and what is affected…')}</div>
      ${fileDrop('newTicketFileInput', 'newTicketFileLabel')}
      <div id="ticketFormError" class="err" role="alert" hidden></div>
      <div class="support-form-actions"><a class="btn sec" href="/app/support" data-app-route="tickets">Cancel</a><button type="submit" class="btn" id="submitTicketBtn">${hero('paper', 's')}Open ticket</button></div>
    </form>
    <aside class="card support-help"><span class="ico-b info">${hero('document')}</span><h3>Useful details</h3><ul><li>Service name or identifier</li><li>When the issue started</li><li>Exact error message</li><li>Steps already attempted</li></ul><p class="truth-note">Do not include passwords, recovery codes or private keys.</p></aside>
  </div>`;
}

function attachmentMarkup(ticketId: string, attachments: Attachment[]): string {
  if (!attachments.length) return '';
  return `<div class="att-list">${attachments.map((att) => `<a href="/api/v1/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(att.id)}" download class="att-chip">${hero('document', 'xs')}<span class="name">${esc(att.filename)}</span><span class="sz">${formatBytes(att.byte_size)}</span></a>`).join('')}</div>`;
}

export async function renderTicketDetail(id: string): Promise<void> {
  const host = document.getElementById('ticketDetailPage');
  if (!host) return;
  host.innerHTML = renderSkeleton('article', 'Loading support conversation');
  try {
    const data = await api<{ ticket: Ticket; messages: any[]; attachments: Attachment[] }>(`/api/v1/tickets/${encodeURIComponent(id)}`);
    const closed = data.ticket.status === 'CLOSED';
    host.innerHTML = `<nav class="support-breadcrumb" aria-label="Breadcrumb"><a href="/app/support" data-app-route="tickets">Support</a>${hero('chevron', 'xs')}<span>${esc(data.ticket.id)}</span></nav>
      <div class="support-thread-layout">
        <article class="card support-thread">
          <header class="support-thread-head"><div class="tx"><div class="row wrap"><span class="pill ${priorityTone(data.ticket.priority)}">${esc(data.ticket.priority)}</span><span class="pill ${statusTone(data.ticket.status)}">${esc(data.ticket.status.replace('_', ' '))}</span></div><h2>${esc(data.ticket.subject)}</h2><p>${esc(data.ticket.id)} · Updated ${esc(formatDate(data.ticket.updated_at || data.ticket.created_at))}</p></div></header>
          <div class="support-messages z-cmt">${data.messages.map((message) => `<article class="z-cmi ${message.is_staff ? 'staff' : 'customer'}"><span class="av s">${esc((message.author_name || (message.is_staff ? 'Support' : 'You')).slice(0, 2).toUpperCase())}</span><div class="tx"><div class="hd"><b>${esc(message.is_staff ? message.author_name || 'Fortless support' : message.author_name || 'You')}</b><small>${message.is_staff ? 'Fortless support' : 'Customer'} · ${esc(formatDate(message.created_at))}</small></div><div class="bd">${renderMarkdown(message.body)}${attachmentMarkup(id, data.attachments.filter((att) => att.message_id === message.id))}</div></div></article>`).join('')}</div>
          ${closed ? `<div class="alert warn"><div><b>Ticket closed</b><span>New replies are disabled.</span></div></div>` : `<form id="ticketReplyForm" data-ticket-id="${esc(id)}" class="support-composer"><div class="section-card-head"><div class="tx"><h3>Reply</h3><p>Your message is stored as Markdown.</p></div></div>${petalRichTextEditor('ticketReplyEditor', 'Ticket reply', 'Write a reply…')}${fileDrop('ticketReplyFileInput', 'ticketReplyFileLabel')}<div id="ticketReplyError" class="err" role="alert" hidden></div><div class="support-form-actions"><button id="sendReplyBtn" class="btn" type="submit">${hero('paper', 's')}Send reply</button></div></form>`}
        </article>
        <aside class="card support-context"><h3>Ticket details</h3><dl class="kv"><dt>Reference</dt><dd><code>${esc(data.ticket.id)}</code></dd><dt>Status</dt><dd><span class="pill ${statusTone(data.ticket.status)}">${esc(data.ticket.status)}</span></dd><dt>Priority</dt><dd><span class="pill ${priorityTone(data.ticket.priority)}">${esc(data.ticket.priority)}</span></dd><dt>Created</dt><dd>${esc(formatDate(data.ticket.created_at))}</dd><dt>Updated</dt><dd>${esc(formatDate(data.ticket.updated_at))}</dd></dl>${attachmentMarkup(id, data.attachments.filter((att) => !att.message_id))}</aside>
      </div>`;
  } catch (error: any) {
    host.innerHTML = `<div class="alert bad"><div><b>Failed to load ticket</b><span>${esc(error.message)}</span></div></div><a class="btn sec s" style="margin-top:12px" href="/app/support" data-app-route="tickets">Back to support</a>`;
  }
}

async function fileAsBase64(file: File): Promise<string> {
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '').split(',')[1] || ''); reader.onerror = () => reject(reader.error || new Error('Could not read the selected file.')); reader.readAsDataURL(file); });
}

async function uploadAttachment(ticketId: string, file: File, messageId?: string): Promise<void> {
  const dataBase64 = await fileAsBase64(file);
  await api(`/api/v1/tickets/${encodeURIComponent(ticketId)}/attachments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', dataBase64, messageId }) });
}

export async function createTicket(event: Event, navigate: Navigate): Promise<void> {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const subject = (form.elements.namedItem('subject') as HTMLInputElement).value.trim();
  const priority = String(new FormData(form).get('ticketPriority') || 'NORMAL');
  const message = editorMarkdown('newTicketEditor');
  const file = (document.getElementById('newTicketFileInput') as HTMLInputElement | null)?.files?.[0];
  const error = document.getElementById('ticketFormError')!;
  const submit = document.getElementById('submitTicketBtn') as HTMLButtonElement;
  error.hidden = true;
  if (subject.length < 3 || message.length < 5) { error.textContent = 'Add a clear subject and at least five characters of detail.'; error.hidden = false; return; }
  submit.disabled = true;
  try {
    const created = await api<{ ticketId: string; messageId: string }>('/api/v1/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, priority, message }) });
    if (file) { try { await uploadAttachment(created.ticketId, file, created.messageId); } catch (uploadError: any) { toast(`Ticket opened, but attachment failed: ${uploadError.message}`, 'warn'); navigate(`/app/support/${created.ticketId}`); return; } }
    form.reset(); resetEditor('newTicketEditor'); toast('Ticket opened.', 'good'); navigate(`/app/support/${created.ticketId}`);
  } catch (requestError: any) { error.textContent = requestError.message; error.hidden = false; }
  finally { submit.disabled = false; }
}

export async function sendReply(event: Event): Promise<void> {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const ticketId = form.dataset.ticketId || '';
  const message = editorMarkdown('ticketReplyEditor');
  const fileInput = document.getElementById('ticketReplyFileInput') as HTMLInputElement | null;
  const file = fileInput?.files?.[0];
  const error = document.getElementById('ticketReplyError')!;
  const submit = document.getElementById('sendReplyBtn') as HTMLButtonElement;
  error.hidden = true;
  if (!message && !file) { error.textContent = 'Write a reply or choose an attachment.'; error.hidden = false; return; }
  submit.disabled = true;
  let messageId: string | undefined;
  try {
    if (message) { const response = await api<{ messageId: string }>(`/api/v1/tickets/${encodeURIComponent(ticketId)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: message }) }); messageId = response.messageId; resetEditor('ticketReplyEditor'); }
    if (file) { try { await uploadAttachment(ticketId, file, messageId); } catch (uploadError: any) { error.textContent = `${message ? 'Reply was saved, but ' : ''}attachment failed: ${uploadError.message}`; error.hidden = false; toast('Attachment upload failed.', 'warn'); return; } }
    resetEditor('ticketReplyEditor'); if (fileInput) fileInput.value = ''; toast('Reply added.', 'good'); await renderTicketDetail(ticketId);
  } catch (requestError: any) { error.textContent = requestError.message; error.hidden = false; }
  finally { submit.disabled = false; }
}

export function updateFileLabel(input: HTMLInputElement): void {
  const labelId = input.id === 'newTicketFileInput' ? 'newTicketFileLabel' : 'ticketReplyFileLabel';
  const label = document.getElementById(labelId);
  const file = input.files?.[0];
  if (label) label.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : '';
}
