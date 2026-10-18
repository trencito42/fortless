/** Customer Portal — dedicated support list, create and conversation routes. */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { formatBytes } from '../../../core/utils/formatting.js';
import { renderMarkdown } from '../../../core/utils/markdown.js';
import { editorMarkdown, petalRichTextEditor, renderEmptyState, renderSkeleton, resetEditor, toast } from '../../../petal/index.js';

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
  const tone = priorityTone(ticket.priority) || 'info';
  const msgs = Number(ticket.message_count || 0);
  return `<a class="li support-ticket-row" href="/app/support/${esc(ticket.id)}" data-app-route="ticket-detail" data-ticket-search="${esc(search)}" data-ticket-status="${esc(ticket.status)}" style="padding:14px 16px">
    <span class="tile ${tone} sm"><svg class="ic" width="16" height="16"><use href="#i-message-01"/></svg></span>
    <span class="tx"><b>${esc(ticket.subject)}</b><small>${esc(ticket.id)} · updated ${esc(formatDate(ticket.updated_at || ticket.created_at))} · ${msgs} message${msgs === 1 ? '' : 's'}</small></span>
    <span class="pill ${tone}">${esc(ticket.priority)}</span>
    <span class="pill ${statusTone(ticket.status)}">${esc(ticket.status.replace('_', ' '))}</span>
    <svg class="ic s hide-n" width="16" height="16"><use href="#i-arrow-right-01"/></svg>
  </a>`;
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
      host.innerHTML = renderEmptyState({ icon: 'message-01', title: 'No support conversations', message: 'Open a ticket when you need help with an account or service.', actionHtml: `<a class="btn s tint" href="/app/support/new" data-app-route="ticket-new"><svg class="ic s" width="14" height="14"><use href="#i-add-01"/></svg>Open ticket</a>` });
      return;
    }
    host.className = 'col';
    host.innerHTML = tickets.map(ticketRow).join('');
    filterTickets();
  } catch (error: any) {
    host.className = 'col';
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
  return `<div class="fld">
    <span class="lbl">Attachment <small class="muted" style="font-weight:500">optional · max 5 MB</small></span>
    <label class="drop" for="${inputId}">
      <svg class="ic" width="28" height="28" style="color:var(--ink3)"><use href="#i-paperclip"/></svg>
      <b>Drop a file here or browse</b>
      <small>PNG, JPEG, GIF, WebP, PDF, text, JSON or ZIP</small>
      <input id="${inputId}" type="file" accept="image/jpeg,image/png,image/gif,image/webp,text/plain,text/markdown,application/pdf,application/json,application/zip" hidden>
      <span id="${labelId}" class="pill" style="display:none;margin-top:8px;font-weight:600"></span>
    </label>
  </div>`;
}

export function renderNewTicket(): void {
  const host = document.getElementById('newTicketPage');
  if (!host) return;
  host.innerHTML = `<div class="row faint" style="font-weight:650;padding:2px 0 8px;gap:6px">
      <a class="lk" style="color:var(--ink3)" href="/app/support" data-app-route="tickets">Support</a>
      <svg class="ic" width="12" height="12"><use href="#i-arrow-right-01"/></svg>
      <span>Open a ticket</span>
    </div>
    <div class="hd" style="margin-bottom:18px">
      <div class="tx">
        <h1 style="font:800 24px/1.2 var(--font);letter-spacing:-.03em;margin:0 0 4px">Open a ticket</h1>
        <p class="sub" style="margin:0">Tell us what happened and our team will investigate.</p>
      </div>
    </div>
    <div class="g c21" style="gap:20px;align-items:start">
      <form id="createTicketPageForm" class="card" style="padding:24px;display:flex;flex-direction:column;gap:18px" novalidate>
        <div class="fld">
          <span class="lbl">Priority</span>
          <div class="seg blk" role="radiogroup">
            ${['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => `
              <label>
                <input type="radio" name="ticketPriority" value="${value}"${value === 'NORMAL' ? ' checked' : ''} hidden>
                <button type="button" data-v="${value}" aria-selected="${value === 'NORMAL'}">${value[0]}${value.slice(1).toLowerCase()}</button>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="fld">
          <label for="ticketSubject">Subject</label>
          <div class="inp">
            <input id="ticketSubject" name="subject" required minlength="3" maxlength="160" autocomplete="off" placeholder="What do you need help with?">
          </div>
        </div>
        <div class="fld">
          <label>Message</label>
          ${petalRichTextEditor('newTicketEditor', 'Detailed message', 'Describe what happened and what you expected…')}
        </div>
        ${fileDrop('newTicketFileInput', 'newTicketFileLabel')}
        <div id="ticketFormError" class="err" role="alert" hidden></div>
        <div class="row" style="justify-content:flex-end;gap:10px;margin-top:6px">
          <a class="btn" href="/app/support" data-app-route="tickets">Cancel</a>
          <button type="submit" class="btn pri" id="submitTicketBtn">
            <svg class="ic s" width="16" height="16"><use href="#i-send"/></svg>
            Submit ticket
          </button>
        </div>
      </form>
      <aside class="card" style="padding:24px">
        <div class="ch"><div class="tx"><h3 style="margin:0 0 6px">Useful details</h3></div></div>
        <ul class="col" style="gap:8px;font-size:13px;padding-left:18px;color:var(--ink2);line-height:1.6">
          <li>Affected service name or identifier</li>
          <li>Exact timestamp when the issue started</li>
          <li>Error messages or reproduction steps</li>
          <li>Troubleshooting steps already attempted</li>
        </ul>
        <p class="muted" style="font-size:12px;margin:16px 0 0;line-height:1.5">
          Never share passwords, API tokens, private keys, or recovery codes in support messages.
        </p>
      </aside>
    </div>`;
}

function attachmentMarkup(ticketId: string, attachments: Attachment[]): string {
  if (!attachments.length) return '';
  return `<div class="att-list">${attachments.map((att) => `<a href="/api/v1/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(att.id)}" download class="att-chip"><svg class="ic xs" width="12" height="12"><use href="#i-paperclip"/></svg><span class="name">${esc(att.filename)}</span><span class="sz">${formatBytes(att.byte_size)}</span></a>`).join('')}</div>`;
}

export function openTicketModal(): void {
  const modal = document.getElementById('ticketModal');
  if (!modal) return;
  const editorHost = document.getElementById('modalTicketMessageHost');
  if (editorHost && !document.getElementById('modalTicketMessage')) {
    editorHost.innerHTML = petalRichTextEditor('modalTicketMessage', 'Detailed message', 'Describe what happened and what you expected…');
  }
  modal.hidden = false;

  // Populate services dropdown
  const select = document.getElementById('modalTicketService') as HTMLSelectElement | null;
  if (select && select.dataset['loaded'] !== 'true' && select.dataset['loading'] !== 'true') {
    select.dataset['loading'] = 'true';
    api<{ services: any[] }>('/api/v1/services')
      .then(({ services }) => {
        select.replaceChildren(new Option('None', ''));
        (services || []).filter((s) => s.contract_status !== 'TERMINATED').forEach((s) => {
          const opt = document.createElement('option');
          opt.value = s.id;
          const name = s.plan_name || s.planName || s.identifier || s.id;
          const identifier = s.identifier && s.identifier !== name ? ` · ${s.identifier}` : '';
          opt.textContent = `${name}${identifier}`;
          select.appendChild(opt);
        });
        select.dataset['loaded'] = 'true';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })
      .catch(() => {})
      .finally(() => { delete select.dataset['loading']; });
  }
}

export function closeTicketModal(): void {
  const modal = document.getElementById('ticketModal');
  if (modal) modal.hidden = true;
  const err = document.getElementById('modalTicketError');
  if (err) err.hidden = true;
}

export async function submitModalTicket(event: Event, navigate: Navigate): Promise<void> {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const subject = (document.getElementById('modalTicketSubject') as HTMLInputElement)?.value.trim() || '';
  const message = editorMarkdown('modalTicketMessage');
  const priority = (form.querySelector<HTMLInputElement>('input[name="modalTicketPriority"]:checked')?.value || 'NORMAL').toUpperCase();
  const serviceId = (document.getElementById('modalTicketService') as HTMLSelectElement)?.value || undefined;
  const errorEl = document.getElementById('modalTicketError');
  const submitBtn = document.getElementById('submitModalTicketBtn') as HTMLButtonElement | null;

  if (errorEl) errorEl.hidden = true;
  if (subject.length < 3 || message.length < 5) {
    if (errorEl) {
      errorEl.textContent = 'Add a clear subject and at least five characters of detail.';
      errorEl.hidden = false;
    }
    return;
  }

  if (submitBtn) submitBtn.disabled = true;

  try {
    const created = await api<{ ticketId: string; messageId: string }>('/api/v1/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, priority, message, serviceId }),
    });

    closeTicketModal();
    form.reset();
    resetEditor('modalTicketMessage');
    toast(`Ticket opened · ${created.ticketId}`, 'good');
    await renderTickets();
    navigate(`/app/support/${created.ticketId}`);
  } catch (err: any) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

export async function resolveTicketAction(ticketId: string): Promise<void> {
  const btn = document.getElementById('markTicketResolvedBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;

  try {
    await api(`/api/v1/tickets/${encodeURIComponent(ticketId)}/resolve`, { method: 'POST' });
    toast('Ticket marked resolved.', 'good');
    await renderTicketDetail(ticketId);
  } catch (err: any) {
    toast(err.message, 'bad');
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function renderTicketDetail(id: string): Promise<void> {
  const host = document.getElementById('ticketDetailPage');
  if (!host) return;
  host.innerHTML = renderSkeleton('article', 'Loading support conversation');
  try {
    const data = await api<{ ticket: Ticket; messages: any[]; attachments: Attachment[] }>(`/api/v1/tickets/${encodeURIComponent(id)}`);
    const closed = data.ticket.status === 'CLOSED';
    const isResolved = data.ticket.status === 'RESOLVED';
    const recentStart = Math.max(1, data.messages.length - 5);
    const olderCount = Math.max(0, recentStart - 1);

    host.innerHTML = `<div class="row faint" style="font-weight:650;padding:2px 0 8px;gap:6px">
        <a class="lk" style="color:var(--ink3)" href="/app/support" data-app-route="tickets">Support</a>
        <svg class="ic xs" width="12" height="12"><use href="#i-arrow-right-01"/></svg>
        <span>${esc(data.ticket.id)}</span>
      </div>
      <div class="hd" style="margin-bottom:14px">
        <div class="tx">
          <div class="row" style="margin-bottom:8px;gap:6px">
            <span class="pill ${priorityTone(data.ticket.priority)}">${esc(data.ticket.priority)}</span>
            <span class="pill ${statusTone(data.ticket.status)}">${esc(data.ticket.status.replace('_', ' '))}</span>
          </div>
          <h1 style="font:800 24px/1.2 var(--font);letter-spacing:-.03em;margin:0 0 4px">${esc(data.ticket.subject)}</h1>
          <p class="sub" style="margin:0">Opened ${esc(formatDate(data.ticket.created_at))} · updated ${esc(formatDate(data.ticket.updated_at || data.ticket.created_at))}</p>
        </div>
        ${
          closed || isResolved
            ? ''
            : `<button class="btn" id="markTicketResolvedBtn" data-ticket-id="${esc(data.ticket.id)}"><svg class="ic s" aria-hidden="true"><use href="#i-tick-02"/></svg>Mark resolved</button>`
        }
      </div>
      <div class="g c21">
        <div class="col" style="gap:12px">
          <div class="card" style="padding:24px" data-c="Thread">
            <div class="ch"><div class="tx"><h3 style="margin:0 0 4px">Conversation</h3><p>Showing the first message and the latest replies.</p></div></div>
            ${olderCount ? `<div class="row" style="justify-content:center;margin-bottom:12px"><button class="btn s" type="button" id="loadOlderTicketMessages" data-remaining="${olderCount}">Load ${Math.min(5, olderCount)} older message${Math.min(5, olderCount) === 1 ? '' : 's'}</button></div>` : ''}
            <div class="col" id="ticketConversation" style="gap:12px;max-height:min(680px,62vh);overflow-y:auto;padding-right:6px;scrollbar-gutter:stable">
              ${data.messages.map((message, index) => `
                <div class="row nw" data-ticket-message data-message-index="${index}" ${index > 0 && index < recentStart ? 'hidden' : ''} style="align-items:flex-start;gap:12px">
                  <span class="av ${message.is_staff ? 'v' : ''} s">${esc((message.author_name || (message.is_staff ? 'Support' : 'You')).slice(0, 2).toUpperCase())}</span>
                  <div class="li" style="display:block;border-radius:6px 20px 20px 20px;background:${message.is_staff ? 'var(--s2)' : 'var(--accent-bg)'};flex:1;padding:12px 16px">
                    <div class="row" style="gap:8px;margin-bottom:6px">
                      <b>${esc(message.is_staff ? message.author_name || 'Support · Staff' : message.author_name || 'You')}</b>
                      ${message.is_staff ? '<span class="pill violet" style="font-size:11px">Staff</span>' : ''}
                      <small class="faint" style="font-weight:600">${esc(formatDate(message.created_at))}</small>
                    </div>
                    <div style="font-weight:500;line-height:1.55;font-size:13.5px">${renderMarkdown(message.body)}${attachmentMarkup(id, data.attachments.filter((att) => att.message_id === message.id))}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          ${closed ? `<div class="alert warn"><div><b>Ticket closed</b><span>New replies are disabled.</span></div></div>` : `
          <form id="ticketReplyForm" data-ticket-id="${esc(id)}" class="card support-composer" style="padding:24px;display:flex;flex-direction:column;gap:18px" data-c="Composer">
            <div class="ch">
              <div class="tx">
                <h3 style="margin:0 0 4px">Reply</h3>
                <p class="sub" style="margin:0;color:var(--ink2);font-size:13px">Your message is stored securely.</p>
              </div>
            </div>
            <div class="fld">
              ${petalRichTextEditor('ticketReplyEditor', 'Ticket reply', 'Write a reply…')}
            </div>
            ${fileDrop('ticketReplyFileInput', 'ticketReplyFileLabel')}
            <div id="ticketReplyError" class="err" role="alert" hidden></div>
            <div class="row" style="justify-content:flex-end;margin-top:4px">
              <button id="sendReplyBtn" class="btn pri" type="submit">
                <svg class="ic s" width="16" height="16"><use href="#i-send"/></svg>
                Send reply
              </button>
            </div>
          </form>
          `}
        </div>
        <aside class="card" style="align-self:start" data-c="Key-value list">
          <div class="ch"><div class="tx"><h3>Ticket details</h3></div></div>
          <dl class="kv">
            <dt>Reference</dt><dd><code>${esc(data.ticket.id)}</code></dd>
            <dt>Status</dt><dd><span class="pill ${statusTone(data.ticket.status)}">${esc(data.ticket.status.replace('_', ' '))}</span></dd>
            <dt>Priority</dt><dd><span class="pill ${priorityTone(data.ticket.priority)}">${esc(data.ticket.priority)}</span></dd>
            <dt>Created</dt><dd>${esc(formatDate(data.ticket.created_at))}</dd>
            <dt>Updated</dt><dd>${esc(formatDate(data.ticket.updated_at))}</dd>
            <dt>Messages</dt><dd>${data.messages.length}</dd>
          </dl>
          ${attachmentMarkup(id, data.attachments.filter((att) => !att.message_id))}
        </aside>
      </div>`;
    const conversation = document.getElementById('ticketConversation');
    const loadOlder = document.getElementById('loadOlderTicketMessages') as HTMLButtonElement | null;
    loadOlder?.addEventListener('click', () => {
      if (!conversation) return;
      const hidden = Array.from(conversation.querySelectorAll<HTMLElement>('[data-ticket-message][hidden]'));
      const before = conversation.scrollHeight;
      hidden.slice(-5).forEach((message) => { message.hidden = false; });
      const remaining = conversation.querySelectorAll('[data-ticket-message][hidden]').length;
      conversation.scrollTop += conversation.scrollHeight - before;
      if (!remaining) loadOlder.remove();
      else {
        loadOlder.dataset.remaining = String(remaining);
        loadOlder.textContent = `Load ${Math.min(5, remaining)} older message${Math.min(5, remaining) === 1 ? '' : 's'}`;
      }
    });
    window.requestAnimationFrame(() => { if (conversation) conversation.scrollTop = conversation.scrollHeight; });
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
  if (label) {
    if (file) {
      label.textContent = `${file.name} · ${formatBytes(file.size)}`;
      label.style.display = 'inline-flex';
    } else {
      label.textContent = '';
      label.style.display = 'none';
    }
  }
}
