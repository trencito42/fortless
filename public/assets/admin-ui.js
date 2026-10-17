(() => {
  'use strict';
  const paths = {
    home: '<path d="M2.25 12 11.2 3.05a1.13 1.13 0 0 1 1.6 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-5.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/>',
    users: '<path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.34 9.34 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.03-.265-1.998-.73-2.84M15 19.128v.106A12.3 12.3 0 0 1 8.624 21C6.33 21 4.18 20.37 2.34 19.273l-.001-.14a6.375 6.375 0 0 1 11.93-3.238M12 6.75a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/>',
    server: '<path d="M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.15-9.432a2.25 2.25 0 0 0-2.194-1.75H6.714A2.25 2.25 0 0 0 4.52 6.56l-2.15 9.432a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25m19.5 0v-.844c0-1.124-.91-2.034-2.034-2.034H4.284c-1.124 0-2.034.91-2.034 2.034v.844M6.75 17.25h.008v.008H6.75v-.008Zm3 0h.008v.008H9.75v-.008Z"/>',
    support: '<path d="M18.364 5.636A9 9 0 1 1 5.636 18.364 9 9 0 0 1 18.364 5.636Z"/><path d="m15.182 8.818-2.121 2.121m-2.122 2.122-2.121 2.121m0-6.364 2.121 2.121m2.122 2.122 2.121 2.121"/>',
    shield: '<path d="M9 12.75 11.25 15 15 9.75"/><path d="M12 2.25c2.146 1.648 4.892 2.3 7.5 2.25v6c0 5.25-3.438 9.438-7.5 11.25C7.938 19.938 4.5 15.75 4.5 10.5v-6c2.608.05 5.354-.602 7.5-2.25Z"/>',
    search: '<path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.197 5.197a7.5 7.5 0 0 0 10.606 10.606Z"/>',
    arrow: '<path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>',
    warning: '<path d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.052 3.38c.866-1.5 3.03-1.5 3.896 0l7.355 12.746ZM12 15.75h.008v.008H12v-.008Z"/>',
    check: '<path d="m4.5 12.75 6 6 9-13.5"/>'
  };

  const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${paths[n] || paths.home}</svg>`;
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
  const date = (v) => {
    if (!v) return '—';
    const x = /^\d{4}-\d{2}-\d{2} /.test(v) ? `${v.replace(' ', 'T')}Z` : v;
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(x));
  };
  const badge = (v) => {
    const x = String(v || 'UNKNOWN');
    const c = /ACTIVE|RUNNING|RESOLVED|CLOSED|COMPLETED/.test(x) ? 'good' : /URGENT|ERROR|DEAD|OVERDUE|SUSPENDED|LOCKED/.test(x) ? 'bad' : /PENDING|WAITING|HIGH|MOCK|NOT_CONFIGURED/.test(x) ? 'warn' : 'info';
    return `<span class="badge ${c} s">${esc(x.replaceAll('_', ' '))}</span>`;
  };

  const routes = {
    overview: ['/admin', 'Operations overview', 'Real platform records, without simulated operational controls.'],
    accounts: ['/admin/accounts', 'Customer accounts', 'Ownership, membership and workload counts. Click an account to inspect or lock.'],
    services: ['/admin/services', 'Service inventory', 'Contract and provider-observed state.'],
    tickets: ['/admin/tickets', 'Support queue', 'Real customer threads. Click a ticket to view and reply.'],
    audit: ['/admin/audit', 'Global audit trail', 'Security-relevant events across accounts.'],
    staff: ['/admin/staff', 'Staff access', 'Persisted roles, access status and MFA readiness. Click to edit role.']
  };

  const state = {
    loaded: new Set(),
    permissions: new Set(),
    csrfToken: null,
    activeTicketId: null,
    activeAccountId: null,
    pendingStepUpAction: null,
  };

  function renderMarkdown(text) {
    if (!text) return '';
    let s = esc(text);
    s = s.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, _lang, code) => `<pre><code class="code">${code.trim()}</code></pre>`);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    s = s.replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>');
    s = s.replace(/^[*-]\s+(.+)$/gm, '<li>$1</li>');
    s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    const paragraphs = s.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    return `<div class="prose">${paragraphs.map(p => p.startsWith('<pre') || p.startsWith('<ul') || p.startsWith('<blockquote') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
  }

  function promptStepUp(onSuccess, onError) {
    state.pendingStepUpAction = { onSuccess, onError };
    const modal = document.getElementById('modalStepUp');
    if (!modal) {
      if (onError) onError(new Error('Step-up verification modal not found.'));
      return;
    }
    document.getElementById('stepUpPassword').value = '';
    document.getElementById('stepUpTotpCode').value = '';
    const errEl = document.getElementById('stepUpError');
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
    modal.hidden = false;
    setTimeout(() => document.getElementById('stepUpPassword')?.focus(), 50);
  }

  async function api(url, options) {
    const request = { ...(options || {}), headers: { ...((options && options.headers) || {}) } };
    if (request.method && !['GET', 'HEAD'].includes(request.method.toUpperCase())) {
      if (!state.csrfToken) {
        const csrfRes = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
        if (csrfRes.ok) state.csrfToken = (await csrfRes.json()).csrfToken;
      }
      if (state.csrfToken) request.headers['X-CSRF-Token'] = state.csrfToken;
    }
    request.credentials = 'same-origin';
    const r = await fetch(url, request);
    let d = {};
    try { d = await r.json(); } catch {}
    if (r.status === 401) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      throw Error('Session expired');
    }
    if (r.status === 403 && (d.code === 'STEP_UP_REQUIRED' || d.error === 'Recent verification required')) {
      return new Promise((resolve, reject) => {
        promptStepUp(
          async () => {
            try {
              const res = await api(url, options);
              resolve(res);
            } catch (err) {
              reject(err);
            }
          },
          reject
        );
      });
    }
    if (!r.ok) throw Error(d.message || d.error || `Request failed (${r.status})`);
    return d;
  }

  function current() {
    return Object.entries(routes).find(([, x]) => x[0] === location.pathname.replace(/\/$/, '') || (x[0] === '/admin' && location.pathname === '/admin/'))?.[0] || 'overview';
  }

  function empty(host, text) {
    host.innerHTML = `<div class="empty"><span class="row-icon">${icon('search')}</span><b>${esc(text)}</b></div>`;
  }
  function fail(host, e) {
    host.innerHTML = `<div class="empty"><span class="row-icon">${icon('warning')}</span><b>${esc(e.message)}</b></div>`;
  }

  function row({ symbol = 'home', title, sub = '', status = '', meta = '', dataAttr = '' }) {
    return `<article class="row" ${dataAttr} style="cursor:pointer;transition:background .15s"><span class="row-icon">${icon(symbol)}</span><div class="row-copy"><b>${esc(title)}</b><small>${esc(sub)}</small></div>${status ? badge(status) : ''}${meta ? `<div class="row-meta">${esc(meta)}</div>` : ''}</article>`;
  }

  async function overview() {
    const d = await api('/api/v1/admin/overview');
    const metrics = [
      ['Users', d.users], ['Accounts', d.accounts], ['Active services', d.activeServices], ['Open tickets', d.openTickets],
      ['Orders', d.orders], ['Overdue invoices', d.overdueInvoices], ['Pending events', d.pendingOutboxEvents], ['Dead letters', d.deadLetterEvents]
    ];
    document.querySelector('#overviewMetrics').innerHTML = metrics.map((x) => `<article class="metric"><span>${esc(x[0])}</span><strong>${Number(x[1] || 0)}</strong></article>`).join('');
    document.querySelector('#capabilityList').innerHTML = Object.entries(d.capabilities).map(([k, v]) => row({ symbol: 'shield', title: k.replace(/([A-Z])/g, ' $1'), sub: 'Release gate from server configuration', status: v })).join('');
    document.querySelector('#attentionList').innerHTML = [
      row({ symbol: 'support', title: 'Open support tickets', sub: 'Unresolved customer conversations', meta: `${d.openTickets} open` }),
      row({ symbol: 'server', title: 'Pending outbox events', sub: 'Async work awaiting worker dispatch', meta: `${d.pendingOutboxEvents} pending` }),
      row({ symbol: 'warning', title: 'Dead-letter events', sub: 'Events requiring engineering review', status: d.deadLetterEvents ? 'ATTENTION' : 'CLEAR', meta: `${d.deadLetterEvents} dead` })
    ].join('');
  }

  async function accounts(q = '') {
    const h = document.querySelector('#accountsList');
    try {
      const d = await api(`/api/v1/admin/accounts?q=${encodeURIComponent(q)}`);
      if (!d.accounts.length) return empty(h, 'No matching accounts.');
      h.innerHTML = d.accounts.map((x) => row({
        symbol: 'users',
        title: x.name,
        sub: `${x.owner_name} · ${x.owner_email}`,
        status: x.status,
        meta: `${x.member_count} members · ${x.service_count} services · ${x.open_ticket_count} tickets`,
        dataAttr: `data-account-id="${esc(x.id)}"`
      })).join('');
    } catch (e) { fail(h, e); }
  }

  async function services(q = '') {
    const h = document.querySelector('#servicesList');
    try {
      const d = await api(`/api/v1/admin/services?q=${encodeURIComponent(q)}`);
      if (!d.services.length) return empty(h, 'No matching services.');
      h.innerHTML = d.services.map((x) => row({
        symbol: 'server',
        title: x.plan_name || x.product_name,
        sub: `${x.account_name} · ${x.region_name} · ${x.node_name}`,
        status: x.runtime_state || x.contract_status,
        meta: `${x.provider_type} · ${x.identifier || x.id}`
      })).join('');
    } catch (e) { fail(h, e); }
  }

  async function tickets(q = '') {
    const h = document.querySelector('#ticketsList');
    try {
      const d = await api(`/api/v1/admin/tickets?q=${encodeURIComponent(q)}`);
      if (!d.tickets.length) return empty(h, 'No matching support tickets.');
      h.innerHTML = d.tickets.map((x) => row({
        symbol: 'support',
        title: x.subject,
        sub: `${x.account_name} · ${x.customer_name} · ${x.message_count} messages`,
        status: `${x.priority} · ${x.status}`,
        meta: `Updated ${date(x.updated_at)}`,
        dataAttr: `data-ticket-id="${esc(x.id)}"`
      })).join('');
    } catch (e) { fail(h, e); }
  }

  async function audit(q = '') {
    const h = document.querySelector('#auditList');
    try {
      const d = await api(`/api/v1/admin/audit?q=${encodeURIComponent(q)}`);
      if (!d.logs.length) return empty(h, 'No matching audit events.');
      h.innerHTML = d.logs.map((x) => row({
        symbol: 'shield',
        title: x.action,
        sub: `${x.actor_name || x.actor_type} · ${x.account_name || 'Platform'} · ${x.resource_type} ${x.resource_id}`,
        status: x.actor_type,
        meta: date(x.created_at)
      })).join('');
    } catch (e) { fail(h, e); }
  }

  async function staff(q = '') {
    const h = document.querySelector('#staffList');
    try {
      const d = await api(`/api/v1/admin/staff?q=${encodeURIComponent(q)}`);
      if (!d.staff.length) return empty(h, 'No matching staff identities.');
      h.innerHTML = d.staff.map((x) => row({
        symbol: 'users',
        title: x.name,
        sub: `${x.email} · MFA ${x.mfa_enabled ? 'enabled' : 'required'}`,
        status: `${x.role} · ${x.status}`,
        meta: `Updated ${date(x.updated_at)}`,
        dataAttr: `data-staff-user-id="${esc(x.id)}" data-staff-name="${esc(x.name)}" data-staff-role="${esc(x.role)}" data-staff-status="${esc(x.status)}"`
      })).join('');
    } catch (e) { fail(h, e); }
  }

  // MODAL LOGIC
  async function openTicketDetail(ticketId) {
    state.activeTicketId = ticketId;
    const modal = document.getElementById('modalTicketDetail');
    const msgBox = document.getElementById('adminTicketMessages');
    msgBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink2)">Loading ticket thread…</div>';
    modal.hidden = false;
    try {
      const d = await api(`/api/v1/admin/tickets/${encodeURIComponent(ticketId)}`);
      document.getElementById('adminTicketSubject').textContent = d.ticket.subject;
      document.getElementById('adminTicketMeta').textContent = `${d.ticket.account_name} · Customer: ${d.ticket.creator_name} (${d.ticket.creator_email}) · Created ${date(d.ticket.created_at)}`;
      document.getElementById('adminTicketStatusSelect').value = d.ticket.status;
      msgBox.innerHTML = d.messages.map((m) => `
        <div style="padding:10px 14px;border-radius:12px;background:${m.is_staff_internal_note ? 'var(--warn-bg)' : m.is_staff_author ? 'var(--accent-bg)' : 'var(--s2)'};border:1px solid ${m.is_staff_internal_note ? 'var(--warn)' : 'transparent'}">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px">
            <b>${esc(m.author_name)} ${m.is_staff_internal_note ? '<span class="badge warn s">INTERNAL NOTE</span>' : m.is_staff_author ? '<span class="badge accent s">STAFF</span>' : ''}</b>
            <span class="muted">${date(m.created_at)}</span>
          </div>
          ${renderMarkdown(m.body)}
        </div>
      `).join('');
      const attBox = document.getElementById('adminTicketAttachments');
      if (attBox) {
        const atts = d.attachments || [];
        if (atts.length) {
          attBox.innerHTML = '<b>Attachments:</b> ' + atts.map((a) => `
            <a class="att-chip" href="/api/v1/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(a.id)}" target="_blank" download>
              <span class="row-icon">${icon('support')}</span>
              <span>${esc(a.filename)}</span>
              <small class="muted">(${(a.byte_size / 1024).toFixed(1)} KB)</small>
            </a>
          `).join('');
        } else {
          attBox.innerHTML = '';
        }
      }
    } catch (err) {
      msgBox.innerHTML = `<div style="color:var(--bad);padding:20px">Error loading thread: ${esc(err.message)}</div>`;
    }
  }

  async function openAccountDetail(accountId) {
    state.activeAccountId = accountId;
    const modal = document.getElementById('modalAccountDetail');
    const content = document.getElementById('adminAccountContent');
    content.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink2)">Loading account profile…</div>';
    modal.hidden = false;
    try {
      const d = await api(`/api/v1/admin/accounts/${encodeURIComponent(accountId)}`);
      document.getElementById('adminAccountTitle').textContent = d.account.name;
      document.getElementById('adminAccountMeta').textContent = `Owner: ${d.account.owner_name} (${d.account.owner_email}) · Created ${date(d.account.created_at)}`;
      document.getElementById('adminAccountStatusSelect').value = d.account.status;
      content.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
          <div class="card s2" style="padding:12px"><b>Members (${d.members.length})</b><div style="font-size:12px;color:var(--ink2);margin-top:4px">${d.members.map((m) => `${esc(m.name)} (${m.role})`).join(', ') || 'None'}</div></div>
          <div class="card s2" style="padding:12px"><b>Active Services (${d.services.length})</b><div style="font-size:12px;color:var(--ink2);margin-top:4px">${d.services.map((s) => `${esc(s.plan_name)} [${s.contract_status}]`).join(', ') || 'None'}</div></div>
          <div class="card s2" style="padding:12px"><b>Invoices (${d.invoices.length})</b><div style="font-size:12px;color:var(--ink2);margin-top:4px">${d.invoices.slice(0, 3).map((i) => `${esc(i.invoice_number)} (${i.status})`).join(', ') || 'None'}</div></div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div style="color:var(--bad);padding:20px">Error loading account: ${esc(err.message)}</div>`;
    }
  }

  function openStaffEditor(userId, name, currentRole, currentStatus) {
    document.getElementById('adminStaffUserId').value = userId;
    document.getElementById('adminStaffTitle').textContent = `Edit Staff: ${name}`;
    document.getElementById('adminStaffMeta').textContent = `User ID: ${userId}`;
    document.getElementById('adminStaffRoleSelect').value = currentRole;
    document.getElementById('adminStaffStatusSelect').value = currentStatus;
    document.getElementById('adminStaffReason').value = '';
    document.getElementById('modalStaffEditor').hidden = false;
  }

  const loaders = { overview, accounts, services, tickets, audit, staff };

  function navigate() {
    const r = current();
    const cfg = routes[r];
    document.querySelectorAll('.page').forEach((x) => x.classList.toggle('on', x.id === `page-${r}`));
    document.querySelectorAll('[data-route]').forEach((x) => x.getAttribute('data-route') === r ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'));
    document.querySelector('#pageTitle').textContent = cfg[1];
    document.querySelector('#pageSubtitle').textContent = cfg[2];
    if (!state.loaded.has(r)) {
      state.loaded.add(r);
      loaders[r]();
    }
  }

  document.querySelectorAll('[data-icon]').forEach((x) => x.outerHTML = icon(x.dataset.icon));

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-route]');
    if (a && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      history.pushState({}, '', a.href);
      navigate();
      return;
    }
    const ticketRow = e.target.closest('[data-ticket-id]');
    if (ticketRow) {
      openTicketDetail(ticketRow.dataset.ticketId);
      return;
    }
    const accountRow = e.target.closest('[data-account-id]');
    if (accountRow) {
      openAccountDetail(accountRow.dataset.accountId);
      return;
    }
    const staffRow = e.target.closest('[data-staff-user-id]');
    if (staffRow) {
      openStaffEditor(staffRow.dataset.staffUserId, staffRow.dataset.staffName, staffRow.dataset.staffRole, staffRow.dataset.staffStatus);
      return;
    }
    if (e.target.closest('[data-close-ticket-modal]')) document.getElementById('modalTicketDetail').hidden = true;
    if (e.target.closest('[data-close-account-modal]')) document.getElementById('modalAccountDetail').hidden = true;
    if (e.target.closest('[data-close-staff-modal]')) document.getElementById('modalStaffEditor').hidden = true;
    if (e.target.closest('[data-close-stepup-modal]')) document.getElementById('modalStepUp').hidden = true;
    if (e.target.closest('[data-cmd]')) { openCmd(); return; }
    const cmdItem = e.target.closest('[data-cmd-idx]');
    if (cmdItem) { runCmd(+cmdItem.dataset.cmdIdx); return; }
    if (e.target.id === 'cmd') closeCmd();
  });

  window.addEventListener('popstate', navigate);

  // Command Palette State & Methods
  let cmdList = [];
  let cmdIdx = 0;
  let cmdTimer = null;

  function openCmd() {
    const modal = document.getElementById('cmd');
    if (!modal) return;
    modal.hidden = false;
    const inp = document.getElementById('cmd-in');
    if (inp) {
      inp.value = '';
      inp.focus();
    }
    renderCmd('');
  }

  function closeCmd() {
    const modal = document.getElementById('cmd');
    if (modal) modal.hidden = true;
  }

  async function renderCmd(q) {
    q = (q || '').trim();
    const resBox = document.getElementById('cmd-res');
    if (!resBox) return;

    try {
      const d = await api(`/api/v1/search?q=${encodeURIComponent(q)}`);
      cmdList = [];
      const res = d.results || {};

      if (res.adminPages && res.adminPages.length) {
        res.adminPages.forEach((p) => cmdList.push({ category: p.category || 'Admin Pages', title: p.title, icon: 'shield', action: () => { location.href = p.path; } }));
      }
      if (res.pages && res.pages.length) {
        res.pages.forEach((p) => cmdList.push({ category: 'Customer Pages', title: p.title, icon: 'home', action: () => { location.href = p.path; } }));
      }
      if (res.actions && res.actions.length) {
        res.actions.forEach((a) => cmdList.push({
          category: 'Actions',
          title: a.title,
          icon: 'server',
          action: () => {
            if (a.action === 'toggle_theme') {
              const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
              document.documentElement.setAttribute('data-theme', next);
              localStorage.setItem('fortless_theme', next);
            } else if (a.path) {
              location.href = a.path;
            }
          },
        }));
      }
      if (res.services && res.services.length) {
        res.services.forEach((s) => cmdList.push({ category: 'Services', title: s.title, subtitle: s.subtitle, icon: 'server', action: () => { location.href = `/admin/services?q=${encodeURIComponent(s.title)}`; } }));
      }
      if (res.tickets && res.tickets.length) {
        res.tickets.forEach((t) => cmdList.push({ category: 'Tickets', title: t.title, subtitle: t.subtitle, icon: 'support', action: () => { openTicketDetail(t.id); } }));
      }

      if (!cmdList.length) {
        resBox.innerHTML = `<div style="padding:24px;text-align:center;color:var(--ink2)"><p>No matching resources for “${esc(q)}”</p></div>`;
        return;
      }

      cmdIdx = 0;
      let html = '';
      let lastCat = '';
      cmdList.slice(0, 15).forEach((item, i) => {
        if (item.category !== lastCat) {
          html += `<div class="hd">${esc(item.category)}</div>`;
          lastCat = item.category;
        }
        html += `<button type="button" class="it ${i === 0 ? 'act' : ''}" data-cmd-idx="${i}">
          <span class="row-icon">${icon(item.icon || 'search')}</span>
          <div class="tx"><b>${esc(item.title)}</b>${item.subtitle ? `<small>${esc(item.subtitle)}</small>` : ''}</div>
        </button>`;
      });
      resBox.innerHTML = html;
    } catch {
      resBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--bad)">Search unavailable.</div>';
    }
  }

  function moveCmd(dir) {
    const items = document.querySelectorAll('#cmd-res .it');
    if (!items.length) return;
    cmdIdx = (cmdIdx + dir + items.length) % items.length;
    items.forEach((btn, i) => {
      btn.classList.toggle('act', i === cmdIdx);
      if (i === cmdIdx) btn.scrollIntoView({ block: 'nearest' });
    });
  }

  function runCmd(idx) {
    const item = cmdList[idx];
    if (item && item.action) {
      closeCmd();
      item.action();
    }
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const c = document.getElementById('cmd');
      if (c && c.hidden) openCmd();
      else closeCmd();
      return;
    }
    if (e.key === 'Escape') {
      closeCmd();
      document.getElementById('modalTicketDetail').hidden = true;
      document.getElementById('modalAccountDetail').hidden = true;
      document.getElementById('modalStaffEditor').hidden = true;
      document.getElementById('modalStepUp').hidden = true;
    }
    const cmdEl = document.getElementById('cmd');
    if (cmdEl && !cmdEl.hidden) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveCmd(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveCmd(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runCmd(cmdIdx);
      }
    }
  });

  document.getElementById('cmd-in')?.addEventListener('input', (e) => {
    clearTimeout(cmdTimer);
    cmdTimer = setTimeout(() => renderCmd(e.target.value), 180);
  });

  document.querySelectorAll('[data-search]').forEach((input) => {
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => loaders[input.dataset.search](input.value), 220);
    });
  });

  // Ticket attachment file selection
  document.getElementById('adminTicketFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    const lbl = document.getElementById('adminTicketFileLabel');
    if (lbl) lbl.textContent = file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : '';
  });

  // Step-up Form Submission
  document.getElementById('adminStepUpForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('stepUpPassword').value;
    const code = document.getElementById('stepUpTotpCode').value.trim();
    const btn = document.getElementById('stepUpSubmitBtn');
    const errEl = document.getElementById('stepUpError');
    btn.disabled = true;
    if (errEl) errEl.style.display = 'none';

    try {
      await api('/api/v1/auth/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, code }),
      });
      document.getElementById('modalStepUp').hidden = true;
      if (state.pendingStepUpAction && state.pendingStepUpAction.onSuccess) {
        state.pendingStepUpAction.onSuccess();
      }
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Verification failed.';
        errEl.style.display = 'block';
      }
    } finally {
      btn.disabled = false;
    }
  });

  // Form Submissions
  document.getElementById('adminTicketReplyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeTicketId) return;
    const body = document.getElementById('adminReplyBody').value.trim();
    const isInternalNote = document.getElementById('adminTicketInternalNote').checked;
    const newStatus = document.getElementById('adminTicketStatusSelect').value;
    const fileInput = document.getElementById('adminTicketFileInput');
    const btn = document.getElementById('adminSendReplyBtn');
    btn.disabled = true;
    try {
      await api(`/api/v1/admin/tickets/${encodeURIComponent(state.activeTicketId)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, isInternalNote }),
      });
      if (fileInput && fileInput.files?.[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        await new Promise((resolve, reject) => {
          reader.onload = async () => {
            try {
              const base64 = (reader.result || '').split(',')[1];
              await api(`/api/v1/admin/tickets/${encodeURIComponent(state.activeTicketId)}/attachments`, {
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
        if (document.getElementById('adminTicketFileLabel')) document.getElementById('adminTicketFileLabel').textContent = '';
      }
      await api(`/api/v1/admin/tickets/${encodeURIComponent(state.activeTicketId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      document.getElementById('adminReplyBody').value = '';
      await openTicketDetail(state.activeTicketId);
      tickets();
    } catch (err) {
      alert(`Error submitting reply: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('adminAccountStatusForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeAccountId) return;
    const status = document.getElementById('adminAccountStatusSelect').value;
    const reason = document.getElementById('adminAccountReason').value.trim();
    const btn = document.getElementById('adminUpdateAccountBtn');
    btn.disabled = true;
    try {
      await api(`/api/v1/admin/accounts/${encodeURIComponent(state.activeAccountId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason }),
      });
      alert('Account status updated successfully.');
      document.getElementById('modalAccountDetail').hidden = true;
      accounts();
    } catch (err) {
      alert(`Error updating account status: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('adminStaffForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('adminStaffUserId').value;
    const role = document.getElementById('adminStaffRoleSelect').value;
    const status = document.getElementById('adminStaffStatusSelect').value;
    const reason = document.getElementById('adminStaffReason').value.trim();
    const btn = document.getElementById('adminSaveStaffBtn');
    btn.disabled = true;
    try {
      await api(`/api/v1/admin/staff/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, status, reason }),
      });
      alert('Staff permissions updated.');
      document.getElementById('modalStaffEditor').hidden = true;
      staff();
    } catch (err) {
      alert(`Error modifying staff: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  Promise.all([api('/api/v1/auth/me'), api('/api/v1/admin/me')]).then(([identity, access]) => {
    document.querySelector('#userName').textContent = identity.user.name;
    document.querySelector('#userAvatar').textContent = identity.user.name.slice(0, 2).toUpperCase();
    document.querySelector('#staffRole').textContent = `${access.staff.role.replaceAll('_', ' ')} · MFA`;
    state.permissions = new Set(access.staff.permissions);
    const required = { accounts: 'accounts:read', services: 'services:read', tickets: 'tickets:read', audit: 'audit:read', staff: 'staff:read' };
    document.querySelectorAll('[data-route]').forEach((link) => {
      const permission = required[link.dataset.route];
      if (permission && !state.permissions.has(permission)) link.remove();
    });
  }).catch(() => {});

  navigate();
})();
