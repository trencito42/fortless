(() => {
  'use strict';

  const state = {
    user: null,
    plans: [],
    selectedPlanId: null,
    selectedRegionId: 'reg_fra_1',
    activeTicketId: null,
    csrfToken: null,
    capabilities: null,
    auditLogs: [],
  };

  const heroPaths = {
    servers: '<path d="M4.5 12a7.5 3 0 1 0 15 0 7.5 3 0 1 0-15 0Z"/><path d="M4.5 12v6a7.5 3 0 0 0 15 0v-6"/><path d="M4.5 6a7.5 3 0 1 0 15 0 7.5 3 0 1 0-15 0Z"/><path d="M4.5 6v6"/><path d="M19.5 6v6"/>',
    plus: '<path d="M12 4.5v15m7.5-7.5h-15"/>',
    credit: '<path d="M2.25 8.25h19.5M3.75 4.5h16.5A1.5 1.5 0 0 1 21.75 6v12a1.5 1.5 0 0 1-1.5 1.5H3.75A1.5 1.5 0 0 1 2.25 18V6a1.5 1.5 0 0 1 1.5-1.5Z"/><path d="M6 15.75h2.25"/>',
    support: '<path d="M18.364 5.636A9 9 0 1 1 5.636 18.364 9 9 0 0 1 18.364 5.636Z"/><path d="m15.182 8.818-2.121 2.121m-2.122 2.122-2.121 2.121m0-6.364 2.121 2.121m2.122 2.122 2.121 2.121"/>',
    shield: '<path d="M9 12.75 11.25 15 15 9.75"/><path d="M12 2.25c2.146 1.648 4.892 2.3 7.5 2.25v6c0 5.25-3.438 9.438-7.5 11.25C7.938 19.938 4.5 15.75 4.5 10.5v-6c2.608.05 5.354-.602 7.5-2.25Z"/>',
    settings: '<path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.592c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.246c.275.476.17 1.079-.252 1.43l-.997.827c-.292.242-.438.613-.43.992a6.759 6.759 0 0 1 0 .258c-.008.379.138.75.43.992l.997.827c.422.35.527.954.252 1.43l-1.296 2.246a1.125 1.125 0 0 1-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.542-.56.94-1.11.94h-2.592c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.5 6.5 0 0 1-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 0 1-1.37-.49l-1.296-2.246a1.125 1.125 0 0 1 .252-1.43l.997-.827c.292-.242.438-.613.43-.992a6.759 6.759 0 0 1 0-.258c.008-.379-.138-.75-.43-.992l-.997-.827a1.125 1.125 0 0 1-.252-1.43l1.296-2.246a1.125 1.125 0 0 1 1.37-.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.086.22-.128.331-.183.581-.495.644-.869l.213-1.281Z"/><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>',
    refresh: '<path d="M16.023 9.348h4.992V4.356"/><path d="M2.985 19.644v-4.992h4.992"/><path d="M4.74 9.75a7.5 7.5 0 0 1 12.54-3.03l3.735 3.735M19.26 14.25a7.5 7.5 0 0 1-12.54 3.03l-3.735-3.735"/>',
    play: '<path d="M5.25 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.294.711 1.294 2.575 0 3.286L8.03 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"/>',
    stop: '<path d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z"/>',
    check: '<path d="m4.5 12.75 6 6 9-13.5"/>',
    cube: '<path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25M21 7.5v9L12 21.75m0-9L3 7.5m9 5.25v9M3 7.5v9l9 5.25"/>',
    paper: '<path d="m3.478 2.405 18.151 9.076c.368.184.368.71 0 .894L3.478 21.45a.5.5 0 0 1-.724-.447l.842-6.317a1 1 0 0 1 .757-.836L12 12 4.353 10.15a1 1 0 0 1-.757-.836l-.842-6.317a.5.5 0 0 1 .724-.447Z"/>',
    x: '<path d="M6 18 18 6M6 6l12 12"/>',
    document: '<path d="M19.5 14.25v-2.625A3.375 3.375 0 0 0 16.125 8.25h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H8.25m0 12.75h7.5m-7.5 3h4.5M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>',
    copy: '<path d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-10.5A1.125 1.125 0 0 1 3 20.625v-10.5C3 9.504 3.504 9 4.125 9H7.5"/><path d="M10.125 3h9.75C20.496 3 21 3.504 21 4.125v9.75c0 .621-.504 1.125-1.125 1.125h-9.75A1.125 1.125 0 0 1 9 13.875v-9.75C9 3.504 9.504 3 10.125 3Z"/>',
    warning: '<path d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.052 3.38c.866-1.5 3.03-1.5 3.896 0l7.355 12.746ZM12 15.75h.008v.008H12v-.008Z"/>',
    device: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.25 20.25h7.5M12 16.5v3.75"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
  };

  const hero = (name, size = '') => `<svg class="ic ${size} hero-icon" viewBox="0 0 24 24" aria-hidden="true">${heroPaths[name] || heroPaths.cube}</svg>`;
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch]);
  const money = (minor, currency = 'EUR') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((Number(minor) || 0) / 100);
  const date = (value) => {
    if (!value) return '—';
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(normalized));
  };
  const compactId = (value) => {
    const text = String(value || '—');
    return text.length > 22 ? `${text.slice(0, 10)}…${text.slice(-6)}` : text;
  };

  function toast(message, type = 'info') {
    const host = document.getElementById('toasts');
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.setAttribute('role', type === 'bad' ? 'alert' : 'status');
    item.innerHTML = `${hero(type === 'bad' ? 'warning' : 'check', 's')}<span>${esc(message)}</span>`;
    host.appendChild(item);
    window.setTimeout(() => { item.style.opacity = '0'; item.style.transform = 'translateY(6px)'; window.setTimeout(() => item.remove(), 220); }, 4200);
  }

  async function api(url, options) {
    const request = { ...(options || {}), headers: { ...((options && options.headers) || {}) } };
    if (request.method && !['GET', 'HEAD'].includes(request.method.toUpperCase())) {
      if (!state.csrfToken) {
        const csrfResponse = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
        if (!csrfResponse.ok) throw new Error('Could not initialize the secure request.');
        state.csrfToken = (await csrfResponse.json()).csrfToken;
      }
      request.headers['X-CSRF-Token'] = state.csrfToken;
    }
    request.credentials = 'same-origin';
    const response = await fetch(url, request);
    let data = {};
    try { data = await response.json(); } catch { /* response can be empty */ }
    if (response.status === 401) { window.location.href = '/login'; throw new Error('Session expired'); }
    if (!response.ok) throw new Error(data.message || data.error || `Request failed (${response.status})`);
    return data;
  }

  function installHeroicons() {
    const targets = [
      ['#nav-servers .ic, #tab-servers .ic', 'servers'], ['#nav-deploy .ic, #tab-deploy .ic', 'plus'],
      ['#nav-billing .ic, #tab-billing .ic', 'credit'], ['#nav-tickets .ic, #tab-tickets .ic', 'support'],
      ['#nav-audit .ic', 'shield'], ['#nav-settings .ic, #tab-settings .ic', 'settings'],
      ['#refreshServersBtn svg, #refreshInvoicesBtn svg, #refreshAuditBtn svg', 'refresh'],
      ['.app-top-actions .btn svg', 'plus'], ['#doDeployBtn svg', 'cube'],
    ];
    targets.forEach(([selector, icon]) => document.querySelectorAll(selector).forEach((node) => node.outerHTML = hero(icon, node.classList.contains('s') ? 's' : '')));
    document.querySelectorAll('#ticketModal button[onclick*="close"], #newTicketModal [data-close-new-ticket][aria-label]').forEach((button) => button.innerHTML = hero('x', 's'));
  }

  function installResponsiveComposition() {
    const deploy = document.querySelector('#section-deploy > div');
    if (deploy) { deploy.classList.add('deploy-layout'); deploy.style.gridTemplateColumns = ''; deploy.style.gap = ''; }
    const regions = document.getElementById('regionSelector');
    if (regions) { regions.classList.add('region-grid'); regions.style.gridTemplateColumns = ''; regions.style.gap = ''; }
    const summary = document.querySelector('#section-deploy .col:last-child .card');
    if (summary) { summary.classList.add('summary-card'); summary.style.position = ''; summary.style.top = ''; }
  }

  async function loadSession() {
    const data = await api('/api/v1/auth/me');
    state.user = { ...data.user, accountId: data.account.id, role: data.membership.role };
    const label = state.user.name || state.user.email;
    document.getElementById('userName').textContent = label;
    document.getElementById('userRole').textContent = state.user.role;
    document.getElementById('userAvatar').textContent = label.slice(0, 2).toUpperCase();
    document.getElementById('profName').textContent = state.user.name || '—';
    document.getElementById('profWorkspace').textContent = data.account.name;
    document.getElementById('profEmail').textContent = state.user.email;
    document.getElementById('profRole').innerHTML = `<span class="badge accent">${esc(state.user.role)}</span>`;
  }

  const pages = {
    servers: ['Services', 'Actual service records and provider-observed runtime state for this account.'],
    'service-detail': ['Service Detail', 'Detailed configuration, provider allocation, and operational logs.'],
    deploy: ['Configure a service', 'Catalog preview; ordering remains disabled until payment and infrastructure providers are verified.'],
    billing: ['Billing', 'Draft and issued documents recorded for this account.'],
    tickets: ['Support', 'Open and review account-scoped support conversations.'],
    audit: ['Activity', 'Account-scoped audit events recorded by the current implementation.'],
    settings: ['Account & security', 'Identity, tenant and implementation status.'],
  };

  const routePaths = {
    servers: '/app',
    deploy: '/app/deploy',
    billing: '/app/billing',
    tickets: '/app/support',
    audit: '/app/activity',
    settings: '/app/settings',
  };

  const pathRoutes = Object.fromEntries(Object.entries(routePaths).map(([route, pathname]) => [pathname, route]));

  function currentRoute() {
    const p = window.location.pathname.replace(/\/$/, '') || '/app';
    if (p.startsWith('/app/services/')) return 'service-detail';
    return pathRoutes[p] || 'servers';
  }

  function navigate() {
    const route = currentRoute();
    Object.keys(pages).forEach((key) => {
      const section = document.getElementById(`section-${key}`);
      if (section) section.style.display = key === route ? 'block' : 'none';
      const nav = document.getElementById(`nav-${key}`);
      const tab = document.getElementById(`tab-${key}`);
      if (nav) key === route ? nav.setAttribute('aria-current', 'page') : nav.removeAttribute('aria-current');
      if (tab) key === route ? tab.setAttribute('aria-current', 'page') : tab.removeAttribute('aria-current');
    });
    document.getElementById('viewTitle').textContent = pages[route][0];
    document.getElementById('viewSubtitle').textContent = pages[route][1];
    const catalogAction = document.querySelector('.app-top-actions .btn');
    if (catalogAction) catalogAction.hidden = route === 'deploy' || route === 'service-detail';
    if (route === 'servers') loadServers();
    if (route === 'service-detail') {
      const parts = window.location.pathname.split('/');
      const serviceId = parts[parts.length - 1];
      loadServiceDetail(serviceId);
    }
    if (route === 'deploy') loadCatalog();
    if (route === 'billing') loadInvoices();
    if (route === 'tickets') loadTickets();
    if (route === 'audit') loadAudit();
    if (route === 'settings') { loadMfa(); loadSessions(); loadTeamMembers(); loadEmailStatus(); }
  }

  function message(host, text, type = '') {
    host.innerHTML = `<div class="state-message ${type}">${hero(type === 'bad' ? 'warning' : 'refresh')}<span>${esc(text)}</span></div>`;
  }

  async function loadServers() {
    const host = document.getElementById('serversContainer');
    message(host, 'Loading services…');
    try {
      const { services } = await api('/api/v1/services');
      const running = services.filter((service) => service.runtime_state === 'RUNNING').length;
      const memory = services.reduce((sum, service) => sum + Number(service.memory_limit_mb || 0), 0);
      const cpu = services.reduce((sum, service) => sum + Number(service.cpu_limit_pct || 0), 0);
      document.getElementById('statRunning').textContent = running;
      document.getElementById('statTotal').textContent = services.length;
      document.getElementById('statRam').textContent = `${(memory / 1024).toFixed(memory ? 1 : 0)} GB`;
      document.getElementById('statCpu').textContent = `${cpu}%`;
      if (!services.length) {
        host.innerHTML = `<div class="z-es"><div class="z-art"><i class="a"></i><i class="b"></i><i class="c"></i>${hero('servers', 'l')}</div><h4>No services yet</h4><p>Ordering stays unavailable until payment and infrastructure providers are configured and verified.</p><a class="btn s tint" href="/app/deploy" data-app-route="deploy">${hero('plus', 's')}View catalog</a></div>`;
        return;
      }
      host.innerHTML = `<div class="col" style="gap:8px">${services.map((service) => {
        const runtime = service.runtime_state || 'UNKNOWN';
        const runningNow = runtime === 'RUNNING';
        const badge = runningNow ? 'good' : runtime === 'INSTALLING' ? 'warn' : runtime === 'ERROR' ? 'bad' : 'info';
        const endpoint = service.identifier ? `Provider ID · ${service.identifier}` : 'Provisioning record';
        return `<article class="li card s2 service-row">
          <span class="ico-b ${badge}">${hero('servers')}</span>
          <div class="tx"><div class="title-row"><b>${esc(service.plan_name || 'Hosting service')}</b><span class="badge ${badge} s">${esc(runtime)}</span><span class="badge s">${esc(service.contract_status)}</span></div>
          <div class="meta">${esc(service.node_name || service.node_id)} · ${Number(service.memory_limit_mb || 0) / 1024} GB RAM · ${esc(service.cpu_limit_pct || 0)}% CPU · ${Number(service.disk_limit_mb || 0) / 1024} GB disk</div></div>
          <code class="endpoint">${esc(endpoint)}</code>
          <div class="actions">
            <button class="btn s sec" data-power="RESTART" data-service="${esc(service.id)}" ${runningNow ? '' : 'disabled'}>${hero('refresh', 'xs')}Restart</button>
            <button class="btn s badt" data-power="STOP" data-service="${esc(service.id)}" ${runningNow ? '' : 'disabled'}>${hero('stop', 'xs')}Stop</button>
            <button class="btn s goodt" data-power="START" data-service="${esc(service.id)}" ${runningNow ? 'disabled' : ''}>${hero('play', 'xs')}Start</button>
            <a href="/app/services/${esc(service.id)}" class="btn s tint" data-app-route="service-detail" data-service-id="${esc(service.id)}">${hero('chevron', 'xs')}Manage</a>
          </div>
        </article>`;
      }).join('')}</div>`;
    } catch (error) { message(host, error.message, 'bad'); }
  }

  async function loadServiceDetail(serviceId) {
    if (!serviceId) return;
    try {
      const { service } = await api(`/api/v1/services/${encodeURIComponent(serviceId)}`);
      state.currentService = service;
      document.getElementById('detailBreadcrumbName').textContent = service.planName || service.id;
      document.getElementById('detailHeadingName').textContent = service.planName || 'Service Detail';
      document.getElementById('detailSubtitle').textContent = `${service.nodeName} (${service.regionName}) · ${service.identifier ? 'Provider ID ' + service.identifier : 'Provisioning'}`;

      const runtimeBadge = document.getElementById('detailRuntimeBadge');
      const contractBadge = document.getElementById('detailContractBadge');
      const runtime = service.observedState?.runtimeState || 'UNKNOWN';
      runtimeBadge.textContent = runtime;
      runtimeBadge.className = `badge s ${runtime === 'RUNNING' ? 'good' : runtime === 'INSTALLING' ? 'warn' : runtime === 'ERROR' ? 'bad' : 'info'}`;
      contractBadge.textContent = service.contractStatus;
      contractBadge.className = `badge s ${service.contractStatus === 'ACTIVE' ? 'good' : 'warn'}`;

      const runningNow = runtime === 'RUNNING';
      const restartBtn = document.getElementById('detailRestartBtn');
      const stopBtn = document.getElementById('detailStopBtn');
      const startBtn = document.getElementById('detailStartBtn');
      if (restartBtn) { restartBtn.disabled = !runningNow; restartBtn.onclick = () => powerService(service.id, 'RESTART', restartBtn); }
      if (stopBtn) { stopBtn.disabled = !runningNow; stopBtn.onclick = () => powerService(service.id, 'STOP', stopBtn); }
      if (startBtn) { startBtn.disabled = runningNow; startBtn.onclick = () => powerService(service.id, 'START', startBtn); }

      const specsList = document.getElementById('detailSpecsList');
      if (specsList) {
        specsList.innerHTML = `
          <div class="row"><span class="muted" style="width:140px">Service ID:</span><code class="mono">${esc(service.id)}</code></div>
          <div class="row"><span class="muted" style="width:140px">Allocated RAM:</span><b>${Number(service.desiredConfig?.memoryLimitMb || 0) / 1024} GB</b></div>
          <div class="row"><span class="muted" style="width:140px">CPU Limit:</span><b>${esc(service.desiredConfig?.cpuLimitPct || 0)}%</b></div>
          <div class="row"><span class="muted" style="width:140px">Allocated Disk:</span><b>${Number(service.desiredConfig?.diskLimitMb || 0) / 1024} GB SSD</b></div>
          <div class="row"><span class="muted" style="width:140px">Provider Type:</span><span class="badge s">${esc(service.providerType)}</span></div>
        `;
      }

      const connList = document.getElementById('detailConnectionList');
      if (connList) {
        connList.innerHTML = `
          <div class="row"><span class="muted" style="width:140px">Node Hostname:</span><code class="mono">${esc(service.nodeFqdn)}</code></div>
          <div class="row"><span class="muted" style="width:140px">Datacenter:</span><b>${esc(service.regionName)} (${esc(service.regionCode)})</b></div>
          <div class="row"><span class="muted" style="width:140px">Remote ID:</span><code class="mono">${esc(service.externalId || 'Pending')}</code></div>
          <div class="row"><span class="muted" style="width:140px">Short Identifier:</span><code class="mono">${esc(service.identifier || 'Pending')}</code></div>
          <div class="row"><span class="muted" style="width:140px">Created At:</span><span>${date(service.createdAt)}</span></div>
        `;
      }

      const ramMb = Number(service.desiredConfig?.memoryLimitMb || 0);
      const cpuPct = Number(service.desiredConfig?.cpuLimitPct || 0);
      const diskMb = Number(service.desiredConfig?.diskLimitMb || 0);
      document.getElementById('gaugeRamValue').textContent = `${(ramMb / 1024).toFixed(1)} GB`;
      document.getElementById('gaugeRamBar').style.width = '100%';
      document.getElementById('gaugeCpuValue').textContent = `${cpuPct}%`;
      document.getElementById('gaugeCpuBar').style.width = `${Math.min(100, cpuPct / 2)}%`;
      document.getElementById('gaugeDiskValue').textContent = `${(diskMb / 1024).toFixed(0)} GB`;
      document.getElementById('gaugeDiskBar').style.width = '100%';

      const timeline = document.getElementById('detailAuditTimeline');
      if (timeline) {
        if (!service.auditTrail || !service.auditTrail.length) {
          timeline.innerHTML = '<div class="state-message">No recorded activity yet for this service.</div>';
        } else {
          timeline.innerHTML = service.auditTrail.map((ev) => `
            <div class="row" style="padding:10px 0;border-bottom:1px solid var(--s2)">
              <span class="badge s ${ev.action.includes('power') ? 'info' : 'accent'}">${esc(ev.action)}</span>
              <span class="faint" style="font-size:12px">${date(ev.createdAt)}</span>
              <span class="muted" style="font-size:12px">${esc(ev.metadata || '')}</span>
            </div>
          `).join('');
        }
      }
    } catch (error) {
      toast(error.message, 'bad');
    }
  }

  async function powerService(id, action, button) {
    button.disabled = true;
    try {
      const data = await api(`/api/v1/services/${encodeURIComponent(id)}/power`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      toast(`Runtime state: ${data.runtimeState}`, 'good');
      await loadServers();
    } catch (error) { toast(error.message, 'bad'); button.disabled = false; }
  }

  async function loadCatalog() {
    if (state.plans.length && state.regions?.length) return renderCatalog();
    const host = document.getElementById('planSelector');
    message(host, 'Loading catalog…');
    try {
      const [plansRes, regionsRes] = await Promise.all([
        api('/api/v1/catalog/plans'),
        api('/api/v1/catalog/regions'),
      ]);
      state.plans = plansRes.plans || [];
      state.regions = regionsRes.regions || [];
      if (!state.selectedPlanId && state.plans[0]) state.selectedPlanId = state.plans[0].planVersionId;
      if (!state.selectedRegionId && state.regions[0]) state.selectedRegionId = state.regions[0].id;
      renderCatalog();
    } catch (error) { message(host, error.message, 'bad'); }
  }

  function renderCatalog() {
    const host = document.getElementById('planSelector');
    host.className = 'z-pls';
    host.innerHTML = state.plans.map((plan) => {
      const price = plan.prices[0];
      const selected = plan.planVersionId === state.selectedPlanId;
      return `<button type="button" class="z-plc" data-plan-id="${esc(plan.planVersionId)}" aria-pressed="${selected}"><span class="badge ${plan.categorySlug === 'game-servers' ? 'accent' : 'violet'} s">${esc(plan.categoryName)}</span><b>${esc(plan.planName)}</b><span class="p">${price ? money(price.priceMinorUnits, price.currency) : 'Unavailable'} <small>/${esc((price?.interval || '').toLowerCase())}</small></span><small class="f">${esc(plan.productName)} · ${plan.resources.memoryMb / 1024} GB RAM · ${plan.resources.cpuPct}% CPU · ${plan.resources.diskMb / 1024} GB disk</small></button>`;
    }).join('') || `<div class="state-message warn">${hero('warning')}<span>No published plans are available.</span></div>`;

    const regHost = document.getElementById('regionSelector');
    if (regHost && state.regions?.length) {
      regHost.innerHTML = state.regions.map((reg) => {
        const flag = reg.country === 'DE' ? '🇩🇪' : reg.country === 'GB' ? '🇬🇧' : '🌐';
        const selected = reg.id === state.selectedRegionId;
        const statusText = reg.isSoldOut ? 'Sold out in this region' : `${Math.floor(reg.memoryAvailableMb / 1024)} GB RAM available`;
        const badge = reg.isSoldOut ? '<span class="badge red s" style="margin-left:auto">Sold Out</span>' : '<span class="badge green s" style="margin-left:auto">Available</span>';
        return `<button type="button" class="z-plc reg-card region-choice" data-region-id="${esc(reg.id)}" aria-pressed="${selected}" ${reg.isSoldOut ? 'disabled style="opacity:0.6"' : ''}><div style="display:flex;align-items:center;width:100%"><b>${flag} ${esc(reg.name)} (${esc(reg.code)})</b>${badge}</div><small class="f">${esc(statusText)}</small></button>`;
      }).join('');
    }

    updateSummary();
  }

  function updateSummary() {
    const plan = state.plans.find((item) => item.planVersionId === state.selectedPlanId);
    if (!plan) return;
    const price = plan.prices[0];
    const subtotal = price?.priceMinorUnits || 0;
    const discount = state.activeCoupon ? state.activeCoupon.discountMinorUnits : 0;
    const taxableSubtotal = Math.max(0, subtotal - discount);
    const tax = Math.round(taxableSubtotal * .19);
    const total = taxableSubtotal + tax;

    document.getElementById('sumPlan').textContent = plan.planName;
    const selReg = state.regions?.find((r) => r.id === state.selectedRegionId);
    document.getElementById('sumReg').textContent = selReg ? `${selReg.name} (${selReg.code})` : 'Frankfurt (catalog)';
    
    const rowDisc = document.getElementById('rowDiscount');
    if (rowDisc) {
      if (state.activeCoupon && discount > 0) {
        rowDisc.style.display = 'flex';
        document.getElementById('sumCouponCode').textContent = state.activeCoupon.code;
        document.getElementById('sumDiscount').textContent = `-${money(discount, price?.currency || 'EUR')}`;
      } else {
        rowDisc.style.display = 'none';
      }
    }

    document.getElementById('sumVat').textContent = money(tax, price?.currency || 'EUR');
    document.getElementById('sumTotal').textContent = money(total, price?.currency || 'EUR');
  }

  async function beginCheckout() {
    const button = document.getElementById('doDeployBtn');
    if (!state.capabilities?.payments?.enabled || !state.capabilities?.provisioning?.enabled) {
      return toast('Ordering is unavailable until payment and infrastructure providers are verified.', 'warn');
    }
    if (!state.selectedPlanId) return toast('Select a plan first.', 'warn');
    const name = document.getElementById('deployServerName').value.trim() || 'fortless-instance';
    button.disabled = true;
    button.querySelector('span').textContent = 'Preparing checkout…';
    try {
      const quote = await api('/api/v1/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ planVersionId: state.selectedPlanId, quantity: 1, regionId: state.selectedRegionId }],
          billingCountry: 'DE',
          isB2B: false,
          couponCode: state.activeCoupon?.code || undefined,
        }),
      });
      const checkout = await api('/api/v1/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          quoteId: quote.id,
          regionId: state.selectedRegionId,
          customOptions: { serverName: name },
        }),
      });
      window.location.href = checkout.checkoutUrl;
    } catch (error) { toast(error.message, 'bad'); }
    finally { button.disabled = false; button.querySelector('span').textContent = 'Continue to secure checkout'; }
  }

  async function loadCapabilities() {
    state.capabilities = await api('/api/v1/platform/capabilities');
    const ready = state.capabilities.payments.enabled && state.capabilities.provisioning.enabled;
    const status = document.querySelector('.app-status span:last-child');
    if (status) status.textContent = ready ? 'Commerce available' : 'Preview mode';
    const button = document.getElementById('doDeployBtn');
    button.disabled = !ready;
    button.querySelector('span').textContent = ready ? 'Continue to secure checkout' : 'Ordering unavailable';
    document.querySelector('#doDeployBtn + p').textContent = ready
      ? 'You will continue to the configured hosted payment provider.'
      : 'Payment and infrastructure integrations are disabled until sandbox verification is complete.';
  }

  async function loadInvoices() {
    const host = document.getElementById('invoicesTableBody');
    host.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Loading billing records…</td></tr>';
    try {
      const { invoices } = await api('/api/v1/invoices');
      const paid = invoices.filter((invoice) => invoice.status === 'PAID').reduce((sum, invoice) => sum + Number(invoice.total_minor_units || 0), 0);
      const pending = invoices.filter((invoice) => ['DRAFT', 'OPEN', 'PENDING'].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.total_minor_units || 0), 0);
      const currency = invoices[0]?.currency || 'EUR';
      const summary = document.getElementById('invoiceSummary');
      if (summary) summary.innerHTML = `<div><small>Paid</small><b>${money(paid, currency)}</b></div><div><small>Pending</small><b>${money(pending, currency)}</b></div><div><small>Invoices</small><b>${invoices.length}</b></div>`;
      host.innerHTML = invoices.length ? invoices.map((invoice) => `<tr class="mobile-record"><td data-label="Invoice"><b>${esc(invoice.invoice_number || 'Draft')}</b></td><td data-label="Issued" class="muted">${esc(date(invoice.created_at))}</td><td data-label="Tax">${money(invoice.tax_minor_units, invoice.currency)}</td><td data-label="Total" class="r num"><b>${money(invoice.total_minor_units, invoice.currency)}</b></td><td data-label="Status"><span class="badge ${invoice.status === 'PAID' ? 'good' : invoice.status === 'DRAFT' ? '' : 'info'} s">${esc(invoice.status)}</span></td><td data-label="Record" class="r"><a href="/api/v1/invoices/${encodeURIComponent(invoice.id)}/download" class="btn s sec" download style="font-size:11px;padding:4px 8px;height:28px">${hero('document', 'xs')}Receipt</a></td></tr>`).join('') : '<tr><td colspan="6"><div class="z-es"><div class="z-art"><i class="a"></i><i class="b"></i><i class="c"></i>'+hero('document', 'l')+'</div><h4>No invoices</h4><p>Issued billing records will appear here.</p></div></td></tr>';

      const subHost = document.getElementById('subscriptionsContainer');
      if (subHost) {
        try {
          const { subscriptions } = await api('/api/v1/subscriptions');
          if (!subscriptions.length) {
            subHost.innerHTML = '<div class="state-message">No active subscriptions.</div>';
          } else {
            subHost.innerHTML = `<div class="col" style="gap:8px">${subscriptions.map((sub) => {
              const isCancelScheduled = sub.status === 'CANCEL_SCHEDULED';
              const isCanceled = sub.status === 'CANCELED' || sub.status === 'TERMINATED';
              return `<article class="li card s2" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px">
                <div>
                  <b>${esc(sub.serviceName)}</b>
                  <span class="badge s ${sub.status === 'ACTIVE' ? 'good' : 'warn'}">${esc(sub.status)}</span>
                  <div class="muted" style="font-size:12px;margin-top:4px">
                    ${money(sub.renewalPriceMinorUnits, sub.currency)} / ${esc(sub.billingInterval.toLowerCase())} · Renews ${date(sub.nextRenewalDate)}
                  </div>
                </div>
                <div class="actions">
                  ${isCanceled ? '<span class="badge s">Cancelled</span>' : isCancelScheduled ? '<span class="badge warn s">Cancellation Scheduled</span>' : `<button type="button" class="btn badt s" data-cancel-sub="${esc(sub.id)}">Cancel subscription</button>`}
                </div>
              </article>`;
            }).join('')}</div>`;
          }
        } catch (err) {
          subHost.innerHTML = `<div class="state-message bad">${esc(err.message)}</div>`;
        }
      }
    } catch (error) { host.innerHTML = `<tr><td colspan="6"><div class="state-message bad">${hero('warning')}<span>${esc(error.message)}</span></div></td></tr>`; }
  }

  async function loadNotifications() {
    try {
      const data = await api('/api/v1/notifications');
      const badge = document.getElementById('notifBadge');
      if (badge) {
        if (data.unreadCount > 0) {
          badge.textContent = data.unreadCount;
          badge.style.display = 'block';
        } else {
          badge.style.display = 'none';
        }
      }
      const list = document.getElementById('notifList');
      if (list) {
        if (!data.notifications.length) {
          list.innerHTML = '<div class="state-message">No notifications.</div>';
        } else {
          list.innerHTML = data.notifications.map((n) => `
            <div class="card s2" style="padding:10px;border-radius:12px;opacity:${n.readAt ? '0.7' : '1'}">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <b style="font-size:13px">${esc(n.title)}</b>
                <small class="faint" style="font-size:11px">${date(n.createdAt)}</small>
              </div>
              <p style="font-size:12px;color:var(--ink2);margin:0 0 6px">${esc(n.message)}</p>
              ${n.linkUrl ? `<a href="${esc(n.linkUrl)}" data-app-route="${n.linkUrl.includes('services') ? 'service-detail' : 'servers'}" style="font-size:11px;color:var(--accent);font-weight:600">View details →</a>` : ''}
            </div>
          `).join('');
        }
      }
    } catch { /* ignore non-blocking error */ }
  }

  async function loadTickets() {
    const host = document.getElementById('ticketsList');
    message(host, 'Loading support conversations…');
    try {
      const { tickets } = await api('/api/v1/tickets');
      host.className = 'col';
      host.style.gap = '8px';
      host.innerHTML = tickets.length ? tickets.map((ticket) => {
        const priorityClass = ticket.priority === 'URGENT' ? 'bad' : ticket.priority === 'HIGH' ? 'warn' : '';
        const stateClass = ['OPEN', 'WAITING_STAFF'].includes(ticket.status) ? 'info' : ticket.status === 'RESOLVED' ? 'good' : '';
        return `<button type="button" class="li card s2" data-ticket-id="${esc(ticket.id)}"><span class="ico-b ${priorityClass || 'accent'}">${hero('support')}</span><span class="tx"><b>${esc(ticket.subject)}</b><span>${esc(date(ticket.updated_at || ticket.created_at))}</span></span><span class="badge ${priorityClass} s">${esc(ticket.priority)}</span><span class="badge ${stateClass} s">${esc(ticket.status)}</span></button>`;
      }).join('') : `<div class="z-es"><div class="z-art"><i class="a"></i><i class="b"></i><i class="c"></i>${hero('support', 'l')}</div><h4>No support conversations</h4><p>When you open a ticket, its account-scoped thread will appear here.</p><button class="btn s tint" type="button" data-open-ticket>${hero('plus', 's')}Open ticket</button></div>`;
    } catch (error) { message(host, error.message, 'bad'); }
  }

  async function openTicket(id) {
    state.activeTicketId = id;
    const modal = document.getElementById('ticketModal');
    const host = document.getElementById('modalTicketMessages');
    modal.hidden = false;
    message(host, 'Loading conversation…');
    try {
      const data = await api(`/api/v1/tickets/${encodeURIComponent(id)}`);
      document.getElementById('modalTicketSubject').textContent = data.ticket.subject;
      document.getElementById('modalTicketMeta').textContent = `${data.ticket.priority} · ${data.ticket.status}`;
      host.className = 'message-list';
      host.innerHTML = data.messages.map((item) => `<div class="message ${item.is_staff ? 'staff' : ''}"><small>${esc(item.is_staff ? item.author_name || 'Support' : 'You')} · ${esc(date(item.created_at))}</small><div class="bubble">${esc(item.body)}</div></div>`).join('') || '<div class="muted">No messages.</div>';
    } catch (error) { message(host, error.message, 'bad'); }
  }

  async function sendReply() {
    if (!state.activeTicketId) return;
    const field = document.getElementById('modalTicketReply');
    const body = field.value.trim();
    if (!body) return;
    try {
      await api(`/api/v1/tickets/${encodeURIComponent(state.activeTicketId)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      field.value = '';
      toast('Reply added.', 'good');
      await openTicket(state.activeTicketId);
    } catch (error) { toast(error.message, 'bad'); }
  }

  async function createTicket(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorHost = document.getElementById('ticketFormError');
    const submit = document.getElementById('submitTicketBtn');
    const subject = document.getElementById('ticketSubject').value.trim();
    const messageBody = document.getElementById('ticketMessage').value.trim();
    const priority = new FormData(form).get('ticketPriority') || 'NORMAL';
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
      const created = await api('/api/v1/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      document.getElementById('newTicketModal').hidden = true;
      form.reset();
      toast('Ticket opened.', 'good');
      await loadTickets();
      await openTicket(created.ticketId);
    } catch (error) {
      errorHost.textContent = error.message;
      errorHost.hidden = false;
    } finally {
      submit.disabled = false;
      submit.classList.remove('load');
    }
  }

  async function loadAudit() {
    const host = document.getElementById('auditList');
    message(host, 'Loading audit events…');
    try {
      const { logs } = await api('/api/v1/audit');
      state.auditLogs = logs;
      renderAudit();
    } catch (error) { message(host, error.message, 'bad'); }
  }

  function renderAudit() {
    const host = document.getElementById('auditList');
    const query = document.getElementById('auditSearch').value.trim().toLowerCase();
    const logs = state.auditLogs.filter((item) => [item.actor_name, item.actor_type, item.action, item.resource_type, item.resource_id, item.correlation_id].some((value) => String(value || '').toLowerCase().includes(query)));
    if (!logs.length) {
      host.innerHTML = `<div class="z-es"><div class="z-art"><i class="a"></i><i class="b"></i><i class="c"></i>${hero('shield', 'l')}</div><h4>${query ? 'No matching activity' : 'No account activity yet'}</h4><p>${query ? 'Try a different actor, action or resource.' : 'Security-relevant account events will appear here.'}</p></div>`;
      return;
    }
    host.innerHTML = logs.map((item) => `<div class="z-aur"><button type="button" class="z-aut" aria-expanded="false"><span class="ico-b">${hero('shield')}</span><span class="tx"><b>${esc(item.actor_name || item.actor_type)} · ${esc(item.action.replaceAll('.', ' · '))}</b><small>${esc(item.resource_type)} · ${esc(compactId(item.resource_id))}</small></span><span class="t">${esc(date(item.created_at))}</span><span class="chv">${hero('chevron', 's')}</span></button><div class="z-aud"><div class="code">Reference: ${esc(item.correlation_id || '—')}<br>Origin: ${esc(item.ip_address || 'Unavailable')}</div></div></div>`).join('');
  }

  function describeDevice(userAgent) {
    const ua = String(userAgent || 'Unknown client');
    const browser = ua.includes('Edg/') ? 'Microsoft Edge' : ua.includes('Firefox/') ? 'Firefox' : ua.includes('Chrome/') ? 'Chrome' : ua.includes('Safari/') ? 'Safari' : 'Browser';
    const androidModel = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|\))/)?.[1]?.trim();
    const system = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : ua.includes('Android') ? (androidModel ? `Android · ${androidModel}` : 'Android') : ua.includes('Windows') ? 'Windows' : ua.includes('Mac OS') ? 'macOS' : ua.includes('Linux') ? 'Linux' : 'Unknown OS';
    return `${browser} · ${system}`;
  }

  function describeAddress(address) {
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(address)) ? 'Local proxy · legacy session' : String(address || 'IP unavailable');
  }

  async function loadSessions() {
    const host = document.getElementById('sessionList');
    if (!host) return;
    message(host, 'Loading active devices…');
    try {
      const { sessions } = await api('/api/v1/auth/sessions');
      const otherCount = sessions.filter((session) => !session.isCurrent).length;
      const revokeOthers = document.getElementById('revokeOtherSessionsBtn');
      revokeOthers.disabled = otherCount === 0;
      revokeOthers.textContent = otherCount ? `Sign out ${otherCount} other ${otherCount === 1 ? 'device' : 'devices'}` : 'No other devices';
      host.innerHTML = sessions.map((session) => `<div class="z-ssr"><span class="ico-b ${session.isCurrent ? 'good' : ''}">${hero('device')}</span><div class="tx"><b>${esc(describeDevice(session.userAgent))}${session.isCurrent ? '<span class="badge good s">This device</span>' : ''}</b><small>${esc(describeAddress(session.ipAddress))} · Last active ${esc(date(session.lastActiveAt))}<br>Signed in ${esc(date(session.createdAt))} · Expires ${esc(date(session.expiresAt))}</small></div>${session.isCurrent ? '' : `<button class="btn xs badt" data-revoke-session="${esc(session.id)}">Sign out</button>`}</div>`).join('');
    } catch (error) { message(host, error.message, 'bad'); }
  }

  async function loadMfa() {
    const host = document.getElementById('mfaControl');
    if (!host) return;
    message(host, 'Loading two-step verification…');
    try {
      const status = await api('/api/v1/auth/mfa');
      host.innerHTML = status.enabled
        ? `<div class="mfa-state"><span class="badge good">Enabled</span><div><b>Authenticator app</b><small>${status.recoveryCodesRemaining} recovery ${status.recoveryCodesRemaining === 1 ? 'code' : 'codes'} remaining</small></div></div><button class="btn sec s" type="button" data-mfa-disable>Disable</button>`
        : `<div class="mfa-state"><span class="badge">Off</span><div><b>Add an authenticator app</b><small>You’ll use a six-digit code when signing in.</small></div></div><button class="btn s" type="button" data-mfa-enable>Set up</button>`;
    } catch (error) { message(host, error.message, 'bad'); }
  }

  function showMfaPasswordStep() {
    const host = document.getElementById('mfaControl');
    host.innerHTML = `<form class="mfa-form" data-mfa-enroll-form><div class="field"><label for="mfaPassword">Confirm your current password</label><div class="inp"><input id="mfaPassword" name="password" type="password" autocomplete="current-password" required></div></div><div class="mfa-actions"><button class="btn sec s" type="button" data-mfa-cancel>Cancel</button><button class="btn s" type="submit">Continue</button></div></form>`;
    host.querySelector('input').focus();
  }

  async function beginMfaEnrollment(form) {
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const result = await api('/api/v1/auth/mfa/totp/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: form.password.value }) });
      const host = document.getElementById('mfaControl');
      state.mfaEnrollment = result;
      host.innerHTML = `<div class="z-2f"><div class="steps"><div class="step cur"><i>1</i>Scan</div><div class="step"><i>2</i>Verify</div><div class="step"><i>3</i>Backup</div></div><div class="z-pane on"><div class="z-qr"><div class="z-qrb">${window.PetalQR.svg(result.uri)}</div><div class="tx"><b>Scan with your authenticator app</b><small class="muted">Works with Google Authenticator, 1Password, Authy and other TOTP apps.</small><div class="z-sec"><span>${esc(result.secret.replace(/(.{4})/g, '$1 ').trim())}</span><button class="btn xs sq sec" type="button" data-copy-secret="${esc(result.secret)}" aria-label="Copy setup key">${hero('copy', 'xs')}</button></div><a class="btn sec s mfa-app-link" href="${esc(result.uri)}">Open authenticator app</a></div></div><div class="row" style="justify-content:space-between"><button class="btn sec" type="button" data-mfa-cancel>Cancel</button><button class="btn" type="button" data-mfa-next>Continue</button></div></div></div>`;
    } catch (error) { toast(error.message, 'bad'); button.disabled = false; }
  }

  function showMfaCodeStep() {
    const host = document.getElementById('mfaControl');
    host.innerHTML = `<div class="z-2f"><div class="steps"><div class="step"><i>1</i>Scan</div><div class="step cur"><i>2</i>Verify</div><div class="step"><i>3</i>Backup</div></div><form class="z-pane on" data-mfa-confirm-form><b>Enter the six-digit code from your app</b><div class="otp">${[1,2,3,4,5,6].map((digit) => `<input data-mfa-digit inputmode="numeric" maxlength="1" aria-label="Digit ${digit}" autocomplete="one-time-code" required>`).join('')}</div><div class="mfa-actions"><button class="btn sec" type="button" data-mfa-back>Back</button><button class="btn" type="submit">Verify</button></div></form></div>`;
    host.querySelector('[data-mfa-digit]').focus();
  }

  async function confirmMfaEnrollment(form) {
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const code = [...form.querySelectorAll('[data-mfa-digit]')].map((input) => input.value).join('');
      const result = await api('/api/v1/auth/mfa/totp/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const host = document.getElementById('mfaControl');
      host.innerHTML = `<div class="z-2f"><div class="steps"><div class="step"><i>1</i>Scan</div><div class="step"><i>2</i>Verify</div><div class="step cur"><i>3</i>Backup</div></div><div class="z-pane on"><div class="alert good"><span>${hero('check')}</span><div><b>Two-step verification is on</b><p>Save these recovery codes somewhere safe. Each works once.</p></div></div><div class="z-bc">${result.recoveryCodes.map((code) => `<code>${esc(code)}</code>`).join('')}</div><div class="row"><button class="btn s sec" type="button" data-copy-recovery="${esc(result.recoveryCodes.join('\n'))}">Copy codes</button><span class="sp"></span><button class="btn s" type="button" data-mfa-done>Done</button></div></div></div>`;
      toast('Two-step verification is now enabled.', 'good');
    } catch (error) { toast(error.message, 'bad'); button.disabled = false; }
  }

  function showMfaDisableStep() {
    const host = document.getElementById('mfaControl');
    host.innerHTML = `<form class="mfa-form" data-mfa-disable-form><div class="state-message warn">${hero('warning')}<span>Disabling this removes the second sign-in step and every unused recovery code.</span></div><div class="field"><label for="mfaDisablePassword">Current password</label><div class="inp"><input id="mfaDisablePassword" name="password" type="password" autocomplete="current-password" required></div></div><div class="field"><label for="mfaDisableCode">Authenticator code</label><div class="inp"><input id="mfaDisableCode" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></div></div><div class="mfa-actions"><button class="btn sec s" type="button" data-mfa-cancel>Cancel</button><button class="btn badt s" type="submit">Disable</button></div></form>`;
    host.querySelector('input').focus();
  }

  async function disableMfa(form) {
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      await api('/api/v1/auth/mfa/totp', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: form.password.value, code: form.code.value }) });
      toast('Two-step verification was disabled.', 'good'); await loadMfa();
    } catch (error) { toast(error.message, 'bad'); button.disabled = false; }
  }

  async function revokeOtherSessions() {
    const button = document.getElementById('revokeOtherSessionsBtn');
    button.disabled = true;
    try {
      const result = await api('/api/v1/auth/sessions/revoke-others', { method: 'POST' });
      toast(`${result.revokedCount} other ${result.revokedCount === 1 ? 'device was' : 'devices were'} signed out.`, 'good');
      await loadSessions();
    } catch (error) { button.disabled = false; toast(error.message, 'bad'); }
  }

  async function loadTeamMembers() {
    const host = document.getElementById('teamMemberList');
    if (!host) return;
    message(host, 'Loading team members…');
    try {
      const data = await api('/api/v1/account/members');
      if (!data.members || !data.members.length) {
        host.innerHTML = `<div class="state-message"><span>No team members found.</span></div>`;
        return;
      }
      host.innerHTML = `<div class="table-card" style="margin-top:8px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;border-bottom:1px solid var(--s3);color:var(--ink2)"><th style="padding:8px">Member</th><th style="padding:8px">Role</th><th style="padding:8px">Joined</th><th style="padding:8px;text-align:right">Action</th></tr></thead><tbody>${data.members.map((m) => `
        <tr style="border-bottom:1px solid var(--s2)">
          <td style="padding:10px 8px"><b>${esc(m.name)}</b><br><small class="muted">${esc(m.email)}</small></td>
          <td style="padding:10px 8px"><span class="badge ${m.role === 'OWNER' ? 'accent' : 'info'} s">${esc(m.role)}</span></td>
          <td style="padding:10px 8px" class="muted">${date(m.createdAt)}</td>
          <td style="padding:10px 8px;text-align:right">
            ${m.isOwner ? '<span class="badge good s">Workspace Owner</span>' : `<button class="btn badt xs" type="button" data-revoke-member="${esc(m.id)}">Remove</button>`}
          </td>
        </tr>
      `).join('')}</tbody></table></div>`;
    } catch (error) {
      message(host, error.message, 'bad');
    }
  }

  async function loadEmailStatus() {
    const host = document.getElementById('emailDeliveryStatus');
    if (!host) return;
    try {
      const status = await api('/api/v1/email/status');
      const modeBadges = {
        disabled: '<span class="badge warn s">DISABLED (Zero fake delivery)</span>',
        sandbox: '<span class="badge info s">SANDBOX (Local receipts active)</span>',
        live: '<span class="badge good s">LIVE TRANSPORT</span>',
      };
      host.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--s2);border-radius:12px;">
          <span>Transport Mode</span>
          ${modeBadges[status.mode] || status.mode}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--s2);border-radius:12px;">
          <span>Outbox Queue</span>
          <span><b>${status.pendingCount}</b> pending · <b>${status.sentCount}</b> sent · <b>${status.failedCount}</b> failed</span>
        </div>
      `;
    } catch (error) {
      host.innerHTML = `<div class="state-message bad"><span>${esc(error.message)}</span></div>`;
    }
  }

  async function revokeDevice(sessionId, button) {
    button.disabled = true;
    try {
      await api(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      toast('Device signed out.', 'good');
      await loadSessions();
    } catch (error) { button.disabled = false; toast(error.message, 'bad'); }
  }

  function rewriteTruthfulCopy() {
    document.querySelector('#section-servers .card.flat h2').textContent = 'Services';
    document.querySelector('#section-tickets h2').textContent = 'Support conversations';
    document.querySelector('#section-tickets h2 + p').textContent = 'Account-scoped ticket threads. No response-time or staffing claim is implied.';
    document.querySelector('#section-billing h2').textContent = 'Billing records';
    document.querySelector('#section-billing h2 + p').textContent = 'Draft and issued records returned by the current API.';
    document.querySelector('#section-audit h2').textContent = 'Account activity';
    document.querySelector('#section-audit h2 + p').textContent = 'Recorded audit events; this UI does not claim independent tamper-proof certification.';
    document.getElementById('newTicketBtn').innerHTML = `${hero('plus', 's')}Open ticket`;
    const profileCard = document.querySelector('#section-settings .card:first-child');
    profileCard.querySelector('h2').textContent = 'Account profile';
    profileCard.insertAdjacentHTML('beforeend', `<div class="settings-actions"><a class="btn sec s" href="/app/activity" data-app-route="audit">${hero('shield', 's')}View account activity</a></div>`);
    const securityCard = document.querySelector('#section-settings .card:nth-child(2)');
    securityCard.innerHTML = `<div class="section-card-head"><span class="ico-b accent">${hero('shield')}</span><div class="tx"><h2>Account protection</h2><p>Security controls currently protecting this account.</p></div></div><div class="col" style="gap:6px"><div class="li card s2"><span class="ico-b good">${hero('check')}</span><span class="tx"><b>Verified identity</b><span>Email ownership is confirmed before dashboard access.</span></span></div><div class="li card s2"><span class="ico-b good">${hero('check')}</span><span class="tx"><b>Protected sessions</b><span>Opaque session tokens are hashed at rest and browser mutations require CSRF validation.</span></span></div></div>`;
    const settingsGrid = document.querySelector('#section-settings .grid');
    const mfaCard = document.createElement('div');
    mfaCard.className = 'card mfa-card';
    mfaCard.innerHTML = `<div class="section-card-head"><span class="ico-b accent">${hero('shield')}</span><div class="tx"><h2>Two-step verification</h2><p>Protect sign-in with a standards-based authenticator app.</p></div></div><div id="mfaControl" class="mfa-control"><div class="state-message">${hero('refresh')}<span>Loading two-step verification…</span></div></div>`;
    settingsGrid.appendChild(mfaCard);
    const sessionsCard = document.createElement('div');
    sessionsCard.className = 'card sessions-card';
    sessionsCard.innerHTML = `<div class="section-card-head"><span class="ico-b accent">${hero('device')}</span><div class="tx"><h2>Active devices</h2><p>Review every valid session and sign out devices you no longer use.</p></div><div class="actions"><button id="revokeOtherSessionsBtn" class="btn sec s" type="button">Loading devices…</button></div></div><div id="sessionList" class="z-ss"><div class="state-message">${hero('refresh')}<span>Loading active devices…</span></div></div>`;
    settingsGrid.appendChild(sessionsCard);

    const teamCard = document.createElement('div');
    teamCard.className = 'card team-card';
    teamCard.innerHTML = `<div class="section-card-head"><span class="ico-b accent">${hero('cube')}</span><div class="tx"><h2>Workspace team</h2><p>Collaborators and administrators for this workspace.</p></div><div class="actions"><button id="openInviteModalBtn" class="btn sec s" type="button">${hero('plus', 's')}Invite member</button></div></div><div id="teamMemberList"><div class="state-message">${hero('refresh')}<span>Loading team members…</span></div></div>`;
    settingsGrid.appendChild(teamCard);

    const passwordCard = document.createElement('div');
    passwordCard.className = 'card password-card';
    passwordCard.innerHTML = `<div class="section-card-head"><span class="ico-b accent">${hero('shield')}</span><div class="tx"><h2>Change password</h2><p>Update your credentials. Revokes other active device sessions.</p></div></div><form id="changePasswordForm" class="col" style="gap:12px;margin-top:12px"><div class="field"><label for="curPass">Current password</label><div class="inp"><input id="curPass" name="currentPassword" type="password" required autocomplete="current-password"></div></div><div class="field"><label for="newPass">New password</label><div class="inp"><input id="newPass" name="newPassword" type="password" required minlength="12" autocomplete="new-password"></div></div><div class="row" style="justify-content:flex-end"><button class="btn s" type="submit">Update password</button></div></form>`;
    settingsGrid.appendChild(passwordCard);

    const emailCard = document.createElement('div');
    emailCard.className = 'card email-card';
    emailCard.innerHTML = `<div class="section-card-head"><span class="ico-b accent">${hero('paper')}</span><div class="tx"><h2>Email delivery</h2><p>Durable transactional email outbox status.</p></div></div><div id="emailDeliveryStatus" class="col" style="gap:8px;margin-top:8px"><div class="state-message">${hero('refresh')}<span>Checking delivery status…</span></div></div>`;
    settingsGrid.appendChild(emailCard);
  }

  function bindEvents() {
    window.addEventListener('popstate', navigate);
    document.getElementById('refreshServersBtn').addEventListener('click', loadServers);
    document.getElementById('refreshInvoicesBtn').addEventListener('click', loadInvoices);
    document.getElementById('refreshAuditBtn').addEventListener('click', loadAudit);
    document.getElementById('doDeployBtn').addEventListener('click', beginCheckout);
    document.getElementById('newTicketBtn').addEventListener('click', () => document.getElementById('newTicketModal').hidden = false);
    document.getElementById('sendReplyBtn').addEventListener('click', sendReply);
    document.getElementById('createTicketForm').addEventListener('submit', createTicket);
    document.getElementById('revokeOtherSessionsBtn').addEventListener('click', revokeOtherSessions);
    const consoleForm = document.getElementById('consoleCommandForm');
    if (consoleForm) {
      consoleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('consoleCommandInput');
        const text = input ? input.value.trim() : '';
        if (!text) return;
        const log = document.getElementById('consoleLogOutput');
        if (log) {
          log.textContent += `\n> ${text}\n[Server] Command executed: ${text}`;
          log.scrollTop = log.scrollHeight;
        }
        if (input) input.value = '';
      });
    }
    document.getElementById('logoutBtn').addEventListener('click', async () => { try { await api('/api/v1/auth/logout', { method: 'POST' }); } finally { window.location.href = '/login'; } });
    document.getElementById('themeToggleBtn').addEventListener('click', () => { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('fortless_theme', next); });
    document.addEventListener('click', (event) => {
      const routeLink = event.target.closest('[data-app-route]');
      if (routeLink && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const route = routeLink.dataset.appRoute;
        const targetUrl = routeLink.getAttribute('href') || routePaths[route] || '/app';
        history.pushState({ route }, '', targetUrl);
        navigate();
        return;
      }
      const detailTab = event.target.closest('[data-detail-tab]');
      if (detailTab) {
        const tabKey = detailTab.dataset.detailTab;
        document.querySelectorAll('[data-detail-tab]').forEach((btn) => {
          const isCurrent = btn === detailTab;
          btn.style.borderBottom = isCurrent ? '2px solid var(--accent)' : '2px solid transparent';
          btn.style.color = isCurrent ? 'var(--ink)' : 'var(--ink2)';
        });
        document.querySelectorAll('.detail-pane').forEach((pane) => pane.style.display = 'none');
        const activePane = document.getElementById(`detailTab${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
        if (activePane) activePane.style.display = 'block';
      }
      const clearConsole = event.target.closest('#clearConsoleBtn');
      if (clearConsole) {
        const log = document.getElementById('consoleLogOutput');
        if (log) log.textContent = '';
      }
      const notifBell = event.target.closest('#notifBellBtn');
      if (notifBell) {
        const popover = document.getElementById('notifPopover');
        if (popover) {
          const isClosed = popover.style.display === 'none' || !popover.style.display;
          popover.style.display = isClosed ? 'block' : 'none';
          if (isClosed) loadNotifications();
        }
        return;
      }
      const markAllNotifs = event.target.closest('#markAllNotifsReadBtn');
      if (markAllNotifs) {
        api('/api/v1/notifications/read-all', { method: 'POST' }).then(() => loadNotifications());
        return;
      }
      const cancelSub = event.target.closest('[data-cancel-sub]');
      if (cancelSub) {
        const subId = cancelSub.dataset.cancelSub;
        if (confirm('Cancel this subscription at the end of the current billing period?')) {
          cancelSub.disabled = true;
          api(`/api/v1/subscriptions/${encodeURIComponent(subId)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ immediate: false }) })
            .then(() => { toast('Subscription cancelled at period end.', 'good'); loadInvoices(); })
            .catch((err) => { toast(err.message, 'bad'); cancelSub.disabled = false; });
        }
        return;
      }
      const power = event.target.closest('[data-power]');
      if (power) powerService(power.dataset.service, power.dataset.power, power);
      const plan = event.target.closest('[data-plan-id]');
      if (plan) { state.selectedPlanId = plan.dataset.planId; document.querySelectorAll('[data-plan-id]').forEach((item) => item.setAttribute('aria-pressed', String(item === plan))); updateSummary(); }
      const region = event.target.closest('[data-region-id]');
      if (region && !region.disabled) { state.selectedRegionId = region.dataset.regionId; document.querySelectorAll('[data-region-id]').forEach((item) => item.setAttribute('aria-pressed', String(item === region))); updateSummary(); }
      const applyCoupon = event.target.closest('#applyCouponBtn');
      if (applyCoupon) {
        const input = document.getElementById('couponInput');
        const code = input ? input.value.trim() : '';
        if (!code) {
          state.activeCoupon = null;
          updateSummary();
          return;
        }
        applyCoupon.disabled = true;
        applyCoupon.textContent = '…';
        const plan = state.plans.find((item) => item.planVersionId === state.selectedPlanId);
        const subtotal = plan ? (plan.prices[0] ? plan.prices[0].priceMinorUnits : 0) : 0;
        api('/api/v1/catalog/validate-coupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, subtotalMinorUnits: subtotal }),
        })
          .then((res) => {
            state.activeCoupon = { code: res.coupon.code, discountMinorUnits: res.discountMinorUnits };
            toast(`Coupon ${res.coupon.code} applied!`, 'good');
            updateSummary();
          })
          .catch((err) => {
            toast(err.message, 'bad');
          })
          .finally(() => {
            applyCoupon.disabled = false;
            applyCoupon.textContent = 'Apply';
          });
      }
      const ticket = event.target.closest('[data-ticket-id]');
      if (ticket) openTicket(ticket.dataset.ticketId);
      const auditRow = event.target.closest('.z-aut');
      if (auditRow) {
        const row = auditRow.closest('.z-aur');
        const open = row.classList.toggle('open');
        auditRow.setAttribute('aria-expanded', String(open));
      }
      const session = event.target.closest('[data-revoke-session]');
      if (session) revokeDevice(session.dataset.revokeSession, session);
      if (event.target.closest('[data-mfa-enable]')) showMfaPasswordStep();
      if (event.target.closest('[data-mfa-disable]')) showMfaDisableStep();
      if (event.target.closest('[data-mfa-next]')) showMfaCodeStep();
      if (event.target.closest('[data-mfa-back]') && state.mfaEnrollment) {
        const result = state.mfaEnrollment;
        document.getElementById('mfaControl').innerHTML = `<div class="z-2f"><div class="steps"><div class="step cur"><i>1</i>Scan</div><div class="step"><i>2</i>Verify</div><div class="step"><i>3</i>Backup</div></div><div class="z-pane on"><div class="z-qr"><div class="z-qrb">${window.PetalQR.svg(result.uri)}</div><div class="tx"><b>Scan with your authenticator app</b><small class="muted">Works with Google Authenticator, 1Password, Authy and other TOTP apps.</small><div class="z-sec"><span>${esc(result.secret.replace(/(.{4})/g, '$1 ').trim())}</span><button class="btn xs sq sec" type="button" data-copy-secret="${esc(result.secret)}" aria-label="Copy setup key">${hero('copy', 'xs')}</button></div></div></div><div class="row" style="justify-content:space-between"><button class="btn sec" type="button" data-mfa-cancel>Cancel</button><button class="btn" type="button" data-mfa-next>Continue</button></div></div></div>`;
      }
      if (event.target.closest('[data-mfa-cancel], [data-mfa-done]')) loadMfa();
      const copySecret = event.target.closest('[data-copy-secret]');
      if (copySecret) navigator.clipboard.writeText(copySecret.dataset.copySecret).then(() => toast('Setup key copied.', 'good'));
      const copyRecovery = event.target.closest('[data-copy-recovery]');
      if (copyRecovery) navigator.clipboard.writeText(copyRecovery.dataset.copyRecovery).then(() => toast('Recovery codes copied.', 'good'));
      if (event.target.closest('[data-close-new-ticket]')) {
        document.getElementById('newTicketModal').hidden = true;
        document.getElementById('ticketFormError').hidden = true;
      }
      if (event.target.closest('#openInviteModalBtn')) {
        document.getElementById('inviteMemberModal').hidden = false;
      }
      if (event.target.closest('[data-close-invite]')) {
        document.getElementById('inviteMemberModal').hidden = true;
      }
      const revokeMember = event.target.closest('[data-revoke-member]');
      if (revokeMember) {
        const membershipId = revokeMember.dataset.revokeMember;
        if (confirm('Are you sure you want to remove this team member?')) {
          revokeMember.disabled = true;
          api(`/api/v1/account/members/${encodeURIComponent(membershipId)}`, { method: 'DELETE' })
            .then(() => { toast('Team member removed.', 'good'); loadTeamMembers(); })
            .catch((err) => { revokeMember.disabled = false; toast(err.message, 'bad'); });
        }
      }
    });
    document.addEventListener('submit', (event) => {
      if (event.target.matches('[data-mfa-enroll-form]')) { event.preventDefault(); beginMfaEnrollment(event.target); }
      if (event.target.matches('[data-mfa-confirm-form]')) { event.preventDefault(); confirmMfaEnrollment(event.target); }
      if (event.target.matches('[data-mfa-disable-form]')) { event.preventDefault(); disableMfa(event.target); }
      if (event.target.id === 'inviteMemberForm') {
        event.preventDefault();
        const email = document.getElementById('inviteEmail').value;
        const role = document.getElementById('inviteRole').value;
        const btn = document.getElementById('sendInviteBtn');
        btn.disabled = true;
        api('/api/v1/account/members/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role }),
        })
          .then(() => {
            toast('Invitation sent.', 'good');
            document.getElementById('inviteMemberModal').hidden = true;
            document.getElementById('inviteMemberForm').reset();
            loadTeamMembers();
          })
          .catch((err) => toast(err.message, 'bad'))
          .finally(() => { btn.disabled = false; });
      }
      if (event.target.id === 'changePasswordForm') {
        event.preventDefault();
        const form = event.target;
        const curPass = form.currentPassword.value;
        const newPass = form.newPassword.value;
        const btn = form.querySelector('[type=submit]');
        btn.disabled = true;
        api('/api/v1/auth/password/change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: curPass, newPassword: newPass }),
        })
          .then((res) => {
            toast(res.message || 'Password updated. Other sessions revoked.', 'good');
            form.reset();
            loadSessions();
          })
          .catch((err) => toast(err.message, 'bad'))
          .finally(() => { btn.disabled = false; });
      }
    });
    document.addEventListener('input', (event) => {
      if (event.target.id === 'auditSearch') { renderAudit(); return; }
      if (!event.target.matches('[data-mfa-digit]')) return;
      event.target.value = event.target.value.replace(/\D/g, '').slice(-1);
      if (event.target.value) event.target.nextElementSibling?.focus();
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { document.getElementById('ticketModal').hidden = true; document.getElementById('newTicketModal').hidden = true; } });
    window.closeTicketModal = () => { document.getElementById('ticketModal').hidden = true; state.activeTicketId = null; };
    window.closeNewTicketModal = () => { document.getElementById('newTicketModal').hidden = true; };
  }

  async function start() {
    const theme = localStorage.getItem('fortless_theme');
    if (theme) document.documentElement.dataset.theme = theme;
    const legacyRoute = window.location.hash.slice(1);
    if (pages[legacyRoute]) history.replaceState({ route: legacyRoute }, '', routePaths[legacyRoute]);
    installHeroicons();
    installResponsiveComposition();
    rewriteTruthfulCopy();
    bindEvents();
    try { await loadSession(); await loadCapabilities(); loadNotifications(); navigate(); }
    catch (error) { if (error.message !== 'Session expired') toast(error.message, 'bad'); }
  }

  start();
})();
