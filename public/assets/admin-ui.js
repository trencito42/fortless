"use strict";
(() => {
  // src/frontend/core/router/router.ts
  var Router = class {
    routes = [];
    handlers = /* @__PURE__ */ new Map();
    cleanups = [];
    currentMatch = null;
    basePath;
    navigationSeq = 0;
    activeAbortController = null;
    constructor(routes = [], basePath = "/app") {
      this.routes = Array.isArray(routes) ? [...routes] : Object.values(routes);
      this.basePath = basePath;
      if (typeof window !== "undefined") {
        window.addEventListener("popstate", () => this.resolve());
      }
    }
    register(routeOrId, handler) {
      if (typeof routeOrId === "string") {
        const def = this.routes.find((r) => r.id === routeOrId);
        if (def) {
          this.handlers.set(def.id, handler);
        } else {
          const customDef = {
            id: routeOrId,
            path: `${this.basePath}/${routeOrId}`,
            title: routeOrId
          };
          this.routes.push(customDef);
          this.handlers.set(routeOrId, handler);
        }
      } else {
        if (!this.routes.some((r) => r.id === routeOrId.id)) {
          this.routes.push(routeOrId);
        }
        this.handlers.set(routeOrId.id, handler);
      }
      return this;
    }
    onCleanup(cleanupFn) {
      this.cleanups.push(cleanupFn);
    }
    getCurrentMatch() {
      return this.currentMatch;
    }
    getNavigationSeq() {
      return this.navigationSeq;
    }
    isCurrentNavigation(seq) {
      return this.navigationSeq === seq;
    }
    getSignal() {
      return this.activeAbortController?.signal;
    }
    navigate(pathOrId, params) {
      let targetPath = pathOrId;
      if (this.routes.some((r) => r.id === pathOrId)) {
        const def = this.routes.find((r) => r.id === pathOrId);
        targetPath = def.path;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            targetPath = targetPath.replace(`:${k}`, encodeURIComponent(v));
          }
        }
      }
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, "", targetPath);
      }
      this.resolve();
    }
    init() {
      this.resolve();
    }
    resolve() {
      this.navigationSeq++;
      const currentSeq = this.navigationSeq;
      if (this.activeAbortController) {
        try {
          this.activeAbortController.abort();
        } catch {
        }
      }
      this.activeAbortController = typeof AbortController !== "undefined" ? new AbortController() : null;
      const path = window.location.pathname;
      const prev = this.currentMatch;
      if (prev?.route.tabbed) {
        const route = prev.route;
        const params = this.matchRoute(route, path);
        if (params !== null) {
          const { tab: nextTab, ...rest } = params;
          const { tab: _prevTab, ...prevRest } = prev.params;
          if (JSON.stringify(rest) === JSON.stringify(prevRest)) {
            this.currentMatch = { route, params, pathname: path };
            window.dispatchEvent(new CustomEvent("fortless:tab", { detail: { route: route.id, tab: nextTab ?? null } }));
            return;
          }
        }
      }
      while (this.cleanups.length) {
        const cleanup = this.cleanups.pop();
        try {
          cleanup?.();
        } catch {
        }
      }
      const currentPath = window.location.pathname;
      for (const route of this.routes) {
        const params = this.matchRoute(route, currentPath);
        if (params !== null) {
          this.currentMatch = {
            route,
            params,
            pathname: currentPath
          };
          this.updateActiveLinks(route.id);
          const handler = this.handlers.get(route.id);
          if (handler) {
            try {
              const res = handler(this.currentMatch);
              if (res && typeof res.then === "function") {
                res.catch((err) => {
                  if (this.isCurrentNavigation(currentSeq)) {
                    console.error("Route handler error:", err);
                  }
                });
              }
            } catch (err) {
              if (this.isCurrentNavigation(currentSeq)) {
                console.error("Route handler error:", err);
              }
            }
          }
          return;
        }
      }
      const defaultRoute = this.routes[0];
      if (defaultRoute && currentPath === this.basePath) {
        this.navigate(defaultRoute.path);
      }
    }
    matchRoute(route, pathname) {
      if (route.path === pathname) return {};
      if (route.pattern) {
        const match = pathname.match(route.pattern);
        if (match) {
          return match.groups || {};
        }
      }
      return null;
    }
    updateActiveLinks(activeId) {
      const navId = activeId === "service-detail" || activeId === "admin-service-detail" ? "services" : activeId === "account-detail" ? "accounts" : activeId === "order-detail" ? "orders" : activeId === "invoice-detail" ? "billing" : activeId === "ticket-detail" || activeId === "ticket-new" || activeId === "admin-ticket-detail" ? "tickets" : activeId;
      document.querySelectorAll("[data-app-route], [data-route]").forEach((el) => {
        const rId = el.dataset.appRoute || el.dataset.route;
        if (rId === navId) {
          el.setAttribute("aria-current", "page");
          el.classList.add("act");
        } else {
          el.removeAttribute("aria-current");
          el.classList.remove("act");
        }
      });
      const more = document.getElementById("mobileMoreBtn");
      if (more) {
        const isOverflowRoute = ["domains", "billing", "audit", "settings"].includes(navId);
        more.toggleAttribute("aria-current", isOverflowRoute);
        more.classList.toggle("act", isOverflowRoute);
      }
    }
  };

  // src/frontend/core/router/routes.ts
  var ADMIN_ROUTES = {
    overview: {
      id: "overview",
      path: "/admin",
      title: "Operations Overview \xB7 FORTLESS",
      subtitle: "Real platform records, without simulated operational controls."
    },
    accounts: {
      id: "accounts",
      path: "/admin/accounts",
      title: "Customer Accounts \xB7 FORTLESS",
      subtitle: "Ownership, membership and workload counts. Click an account to inspect or lock."
    },
    "account-detail": {
      id: "account-detail",
      path: "/admin/accounts/:id",
      title: "Customer Account \xB7 FORTLESS",
      subtitle: "Account identity, access, services, billing, support and lifecycle history.",
      pattern: /^\/admin\/accounts\/(?<id>[^/]+)$/
    },
    services: {
      id: "services",
      path: "/admin/services",
      title: "Service Inventory \xB7 FORTLESS",
      subtitle: "Contract and provider-observed state."
    },
    "admin-service-detail": {
      id: "admin-service-detail",
      path: "/admin/services/:id",
      title: "Service Operations \xB7 FORTLESS",
      subtitle: "Provider state, allocation, lifecycle controls and audit history.",
      pattern: /^\/admin\/services\/(?<id>[^/]+)$/
    },
    orders: {
      id: "orders",
      path: "/admin/orders",
      title: "Orders \xB7 FORTLESS",
      subtitle: "Commercial order lifecycle and fulfillment state."
    },
    "order-detail": {
      id: "order-detail",
      path: "/admin/orders/:id",
      title: "Order Detail \xB7 FORTLESS",
      subtitle: "Payment, fulfillment, provisioning and related service records.",
      pattern: /^\/admin\/orders\/(?<id>[^/]+)$/
    },
    billing: {
      id: "billing",
      path: "/admin/billing",
      title: "Billing Operations \xB7 FORTLESS",
      subtitle: "Invoices, credit notes and payment state."
    },
    "invoice-detail": {
      id: "invoice-detail",
      path: "/admin/billing/:id",
      title: "Invoice Detail \xB7 FORTLESS",
      subtitle: "Authoritative invoice lines, payments, refunds and related services.",
      pattern: /^\/admin\/billing\/(?<id>[^/]+)$/
    },
    infrastructure: {
      id: "infrastructure",
      path: "/admin/infrastructure",
      title: "Infrastructure \xB7 FORTLESS",
      subtitle: "Capacity pools and provider readiness."
    },
    catalog: {
      id: "catalog",
      path: "/admin/catalog",
      title: "Catalog & Providers \xB7 FORTLESS",
      subtitle: "Commercial products mapped explicitly to provider inventory."
    },
    tickets: {
      id: "tickets",
      path: "/admin/tickets",
      title: "Support Queue \xB7 FORTLESS",
      subtitle: "Real customer threads. Click a ticket to view and reply."
    },
    "admin-ticket-detail": {
      id: "admin-ticket-detail",
      path: "/admin/tickets/:id",
      title: "Support Ticket \xB7 FORTLESS",
      subtitle: "Customer and service context, complete thread and staff actions.",
      pattern: /^\/admin\/tickets\/(?<id>[^/]+)$/
    },
    audit: {
      id: "audit",
      path: "/admin/audit",
      title: "Global Audit Trail \xB7 FORTLESS",
      subtitle: "Security-relevant events across accounts."
    },
    jobs: {
      id: "jobs",
      path: "/admin/jobs",
      title: "Operational Jobs \xB7 FORTLESS",
      subtitle: "Provisioning, outbox, email and webhook workflow state."
    },
    staff: {
      id: "staff",
      path: "/admin/staff",
      title: "Staff Access \xB7 FORTLESS",
      subtitle: "Persisted roles, access status and MFA readiness. Click to edit role."
    },
    status: {
      id: "status",
      path: "/admin/status",
      title: "System Status \xB7 FORTLESS",
      subtitle: "Components and customer-visible incidents."
    },
    settings: {
      id: "settings",
      path: "/admin/settings",
      title: "Platform Settings \xB7 FORTLESS",
      subtitle: "System integrations, provider verification, and security governance."
    }
  };

  // src/frontend/core/api/errors.ts
  var ApiError = class extends Error {
    status;
    code;
    details;
    constructor(message, status, code, details) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
      this.details = details;
    }
  };
  var StepUpRequiredError = class extends ApiError {
    constructor(message = "Recent authentication required for this action.") {
      super(message, 403, "STEP_UP_REQUIRED");
      this.name = "StepUpRequiredError";
    }
  };
  var SessionExpiredError = class extends ApiError {
    constructor(message = "Session expired. Please log in again.") {
      super(message, 401, "UNAUTHORIZED");
      this.name = "SessionExpiredError";
    }
  };

  // src/frontend/core/api/client.ts
  var ApiClient = class {
    csrfToken = null;
    stepUpInterceptor = null;
    setStepUpInterceptor(interceptor) {
      this.stepUpInterceptor = interceptor;
    }
    async getCsrfToken() {
      if (this.csrfToken) return this.csrfToken;
      const res = await fetch("/api/v1/auth/csrf", { credentials: "same-origin" });
      if (!res.ok) throw new ApiError("Failed to initialize secure session.", res.status);
      const data = await res.json();
      this.csrfToken = data.csrfToken;
      return this.csrfToken;
    }
    invalidateCsrfToken() {
      this.csrfToken = null;
    }
    async request(url, options = {}) {
      const method = (options.method || "GET").toUpperCase();
      const headers = { ...options.headers || {} };
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        if (!headers["X-CSRF-Token"]) {
          headers["X-CSRF-Token"] = await this.getCsrfToken();
        }
      }
      const res = await fetch(url, {
        ...options,
        method,
        headers,
        credentials: "same-origin"
      });
      let data = {};
      const text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }
      if (res.status === 401) {
        if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/register")) {
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?next=${next}`;
        }
        throw new SessionExpiredError(data.message || data.error);
      }
      if (res.status === 403 && (data.error === "STEP_UP_REQUIRED" || data.code === "STEP_UP_REQUIRED")) {
        if (this.stepUpInterceptor) {
          return new Promise((resolve, reject) => {
            this.stepUpInterceptor(
              () => this.request(url, options).then(resolve).catch(reject),
              reject
            );
          });
        }
        throw new StepUpRequiredError(data.message || "Recent MFA step-up verification required.");
      }
      if (!res.ok) {
        const msg = data.message || data.error || `HTTP ${res.status} error`;
        throw new ApiError(msg, res.status, data.code || data.error, data);
      }
      return data;
    }
    get(url, options) {
      return this.request(url, { ...options, method: "GET" });
    }
    post(url, body, options) {
      const headers = { ...options?.headers || {} };
      if (body !== void 0) {
        headers["Content-Type"] = "application/json";
      }
      return this.request(url, {
        ...options,
        method: "POST",
        headers,
        body: body !== void 0 ? JSON.stringify(body) : void 0
      });
    }
    patch(url, body, options) {
      const headers = { ...options?.headers || {} };
      if (body !== void 0) {
        headers["Content-Type"] = "application/json";
      }
      return this.request(url, {
        ...options,
        method: "PATCH",
        headers,
        body: body !== void 0 ? JSON.stringify(body) : void 0
      });
    }
    delete(url, options) {
      return this.request(url, { ...options, method: "DELETE" });
    }
  };
  var apiClient = new ApiClient();
  var apiFn = ((url, options) => {
    return apiClient.request(url, options);
  });
  apiFn.get = (url, opts) => apiClient.get(url, opts);
  apiFn.post = (url, body, opts) => apiClient.post(url, body, opts);
  apiFn.patch = (url, body, opts) => apiClient.patch(url, body, opts);
  apiFn.delete = (url, opts) => apiClient.delete(url, opts);
  apiFn.setStepUpInterceptor = (interceptor) => apiClient.setStepUpInterceptor(interceptor);
  apiFn.getCsrfToken = () => apiClient.getCsrfToken();
  apiFn.invalidateCsrfToken = () => apiClient.invalidateCsrfToken();
  var api = apiFn;
  function setStepUpInterceptor(interceptor) {
    apiClient.setStepUpInterceptor(interceptor);
  }

  // src/frontend/core/utils/dom.ts
  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[ch] || ch);
  }

  // src/frontend/petal/components/icons.ts
  function hero(name, size = "") {
    const petalNames = {
      home: "dashboard-square-01",
      users: "user-group",
      server: "server",
      servers: "server",
      plus: "add-01",
      credit: "credit-card",
      support: "message-01",
      shield: "shield-01",
      settings: "settings-01",
      refresh: "circle-arrow-reload-01",
      play: "play",
      stop: "stop",
      check: "tick-02",
      cube: "package",
      paper: "sent",
      x: "cancel-01",
      document: "invoice-01",
      copy: "copy-01",
      warning: "alert-circle",
      fingerprint: "finger-print-scan",
      device: "laptop",
      chevron: "arrow-right-01",
      search: "search-01",
      arrow: "arrow-up-right-01",
      sun: "sun-03",
      moon: "moon-01"
    };
    const classes = ["ic", size, "hero-icon"].filter(Boolean).join(" ");
    const iconName = petalNames[name] || name || "package";
    return `<svg class="${classes}" viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/petal-icons.svg#i-${iconName}"></use></svg>`;
  }

  // src/frontend/petal/components/toasts.ts
  function toast(message, type = "info") {
    const host = document.getElementById("toasts") || createToastHost();
    const item = document.createElement("div");
    item.className = `toast ${type}`;
    item.setAttribute("role", type === "bad" ? "alert" : "status");
    const iconName = type === "bad" || type === "warn" ? "warning" : "check";
    item.innerHTML = `${hero(iconName, "s")}<span>${esc(message)}</span>`;
    host.appendChild(item);
    window.setTimeout(() => {
      item.style.opacity = "0";
      item.style.transform = "translateY(6px)";
      window.setTimeout(() => item.remove(), 220);
    }, 4200);
  }
  function createToastHost() {
    let host = document.getElementById("toasts");
    if (!host) {
      host = document.createElement("div");
      host.id = "toasts";
      host.className = "toasts";
      document.body.appendChild(host);
    }
    return host;
  }

  // src/frontend/petal/components/modals.ts
  var BASE_MODAL_Z = 900;
  var PRIORITY_MODAL_Z = 1200;
  var openModalStack = [];
  function isPriorityModal(el) {
    return el.id === "modalStepUp" || el.classList.contains("stepup") || el.getAttribute("data-priority") === "high";
  }
  function updateModalStacking(modal, isOpen) {
    if (isOpen) {
      if (!openModalStack.includes(modal)) {
        openModalStack.push(modal);
      }
    } else {
      const idx = openModalStack.indexOf(modal);
      if (idx !== -1) {
        openModalStack.splice(idx, 1);
      }
      modal.style.removeProperty("z-index");
      const ov = modal.querySelector(".ov");
      const bx = modal.querySelector(".bx");
      if (ov) ov.style.removeProperty("z-index");
      if (bx) bx.style.removeProperty("z-index");
      return;
    }
    let standardCount = 0;
    let priorityCount = 0;
    openModalStack.forEach((el) => {
      const isPri = isPriorityModal(el);
      const z = isPri ? PRIORITY_MODAL_Z + priorityCount * 20 : BASE_MODAL_Z + standardCount * 20;
      if (isPri) priorityCount++;
      else standardCount++;
      el.style.zIndex = String(z);
      const ov = el.querySelector(".ov");
      const bx = el.querySelector(".bx");
      if (ov) ov.style.zIndex = String(z);
      if (bx) bx.style.zIndex = String(z + 1);
    });
  }
  var stackerInitialized = false;
  function initModalStacker() {
    if (stackerInitialized || typeof window === "undefined") return;
    stackerInitialized = true;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (target.classList?.contains("mdl")) {
            const isVisible = !target.hidden && target.style.display !== "none";
            updateModalStacking(target, isVisible);
          }
        }
      }
    });
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["hidden", "style", "class"]
    });
    document.querySelectorAll(".mdl").forEach((el) => {
      const isVisible = !el.hidden && el.style.display !== "none";
      if (isVisible) updateModalStacking(el, true);
    });
  }

  // src/frontend/petal/components/cmd.ts
  function spaNavigate(path) {
    if (window.location.pathname === path) return;
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  var CommandPaletteController = class {
    cmdList = [];
    activeIndex = 0;
    debounceTimer = null;
    modalId;
    inputId;
    resultsId;
    constructor(modalId = "cmd", inputId = "cmd-in", resultsId = "cmd-res") {
      this.modalId = modalId;
      this.inputId = inputId;
      this.resultsId = resultsId;
    }
    open() {
      const modal = document.getElementById(this.modalId);
      if (!modal) return;
      modal.hidden = false;
      const inp = document.getElementById(this.inputId);
      if (inp) {
        inp.value = "";
        inp.focus();
      }
      this.renderDefaultNavigation();
    }
    close() {
      const modal = document.getElementById(this.modalId);
      if (modal) modal.hidden = true;
    }
    isOpen() {
      const modal = document.getElementById(this.modalId);
      return Boolean(modal && !modal.hidden);
    }
    getDefaultNavItems() {
      const isAdmin = window.location.pathname.startsWith("/admin");
      if (isAdmin) {
        return [
          { category: "Navigate", title: "Operations Overview", icon: "dashboard-square-01", kbd: "G O", action: () => spaNavigate("/admin") },
          { category: "Navigate", title: "Customer Accounts", icon: "shield-user", kbd: "G A", action: () => spaNavigate("/admin/accounts") },
          { category: "Navigate", title: "Managed Instances", icon: "server", kbd: "G S", action: () => spaNavigate("/admin/services") },
          { category: "Navigate", title: "Support Helpdesk", icon: "message-01", kbd: "G T", action: () => spaNavigate("/admin/tickets") },
          { category: "Navigate", title: "Security Audit Trail", icon: "history", action: () => spaNavigate("/admin/audit") },
          { category: "Navigate", title: "Operational Jobs", icon: "refresh", action: () => spaNavigate("/admin/jobs") },
          { category: "Navigate", title: "Staff Directory", icon: "user-group", action: () => spaNavigate("/admin/staff") },
          { category: "Switch", title: "Back to Client App", icon: "arrow-right-01", action: () => spaNavigate("/app") }
        ];
      }
      return [
        { category: "Navigate", title: "Dashboard", icon: "dashboard-square-01", kbd: "G D", action: () => spaNavigate("/app") },
        { category: "Navigate", title: "Servers & Instances", icon: "server", kbd: "G S", action: () => spaNavigate("/app/services") },
        { category: "Navigate", title: "Deploy Instance", icon: "rocket-01", kbd: "G R", action: () => spaNavigate("/app/deploy") },
        { category: "Navigate", title: "Domains & DNS", icon: "globe-02", action: () => spaNavigate("/app/domains") },
        { category: "Navigate", title: "Invoices & Billing", icon: "invoice-01", action: () => spaNavigate("/app/billing") },
        { category: "Navigate", title: "Support Tickets", icon: "message-01", action: () => spaNavigate("/app/support") },
        { category: "Navigate", title: "Security & Team", icon: "shield-user", action: () => spaNavigate("/app/settings") },
        { category: "Navigate", title: "Audit Trail", icon: "history", action: () => spaNavigate("/app/activity") }
      ];
    }
    renderDefaultNavigation() {
      const resBox = document.getElementById(this.resultsId);
      if (!resBox) return;
      this.cmdList = this.getDefaultNavItems();
      this.activeIndex = 0;
      this.renderItems(resBox);
    }
    async search(query) {
      const resBox = document.getElementById(this.resultsId);
      if (!resBox) return;
      const q = (query || "").trim();
      if (!q) {
        this.renderDefaultNavigation();
        return;
      }
      try {
        const res = await api(`/api/v1/search?q=${encodeURIComponent(q)}`);
        this.cmdList = [];
        const data = res.results || res;
        if (data.pages) {
          data.pages.forEach(
            (p) => this.cmdList.push({
              category: "Navigation",
              title: p.title,
              icon: "server",
              action: () => spaNavigate(p.path)
            })
          );
        }
        if (data.adminPages) {
          data.adminPages.forEach(
            (p) => this.cmdList.push({
              category: "Admin Control",
              title: p.title,
              icon: "shield-user",
              action: () => spaNavigate(p.path)
            })
          );
        }
        if (data.services) {
          data.services.forEach(
            (s) => this.cmdList.push({
              category: "Services",
              title: s.title,
              subtitle: s.subtitle,
              icon: "server",
              action: () => spaNavigate(`/app/services/${encodeURIComponent(s.id)}`)
            })
          );
        }
        if (data.tickets) {
          data.tickets.forEach(
            (t) => this.cmdList.push({
              category: "Tickets",
              title: t.title,
              subtitle: t.subtitle,
              icon: "message-01",
              action: () => {
                const url = window.location.pathname.startsWith("/admin") ? `/admin/tickets` : `/app/support`;
                spaNavigate(url);
              }
            })
          );
        }
        if (data.invoices) {
          data.invoices.forEach(
            (inv) => this.cmdList.push({
              category: "Billing",
              title: inv.title,
              subtitle: inv.subtitle,
              icon: "invoice-01",
              action: () => spaNavigate("/app/billing")
            })
          );
        }
        if (!this.cmdList.length) {
          resBox.innerHTML = `
          <div class="es" data-c="Empty state" style="padding:28px 16px">
            <span class="tile neu md"><svg class="ic" aria-hidden="true"><use href="/assets/petal-icons.svg#i-search-01"/></svg></span>
            <p style="margin:8px 0 0;color:var(--ink2);font-weight:600">No results found for "${esc(q)}"</p>
          </div>
        `;
          return;
        }
        this.activeIndex = 0;
        this.renderItems(resBox);
      } catch {
        resBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--bad);font-weight:600">Search request failed.</div>';
      }
    }
    renderItems(container) {
      let html = "";
      let lastCat = "";
      this.cmdList.slice(0, 20).forEach((item, i) => {
        if (item.category !== lastCat) {
          html += `<div class="dh">${esc(item.category)}</div>`;
          lastCat = item.category;
        }
        const icon = item.icon || "server";
        html += `
        <button type="button" class="li ${i === this.activeIndex ? "on" : ""}" data-cmd-idx="${i}" style="padding:11px 12px;cursor:pointer">
          <span class="tile neu sm"><svg class="ic" aria-hidden="true"><use href="/assets/petal-icons.svg#i-${icon}"/></svg></span>
          <span class="tx">
            <b>${esc(item.title)}</b>
            ${item.subtitle ? `<small>${esc(item.subtitle)}</small>` : ""}
          </span>
          ${item.kbd ? `<span class="kbd">${esc(item.kbd)}</span>` : ""}
        </button>
      `;
      });
      container.innerHTML = html;
    }
    moveSelection(dir) {
      const items = document.querySelectorAll(`#${this.resultsId} .li`);
      if (!items.length) return;
      this.activeIndex = (this.activeIndex + dir + items.length) % items.length;
      items.forEach((btn, i) => {
        btn.classList.toggle("on", i === this.activeIndex);
        if (i === this.activeIndex) btn.scrollIntoView({ block: "nearest" });
      });
    }
    execute(idx = this.activeIndex) {
      const item = this.cmdList[idx];
      if (item && item.action) {
        this.close();
        item.action();
      }
    }
    bindKeyboard() {
      const handleKeydown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          if (this.isOpen()) this.close();
          else this.open();
          return;
        }
        if (e.key === "Escape" && this.isOpen()) {
          this.close();
          return;
        }
        if (this.isOpen()) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            this.moveSelection(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            this.moveSelection(-1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            this.execute();
          }
        }
      };
      const handleInput = (e) => {
        const target = e.target;
        if (target.id === this.inputId) {
          if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
          this.debounceTimer = window.setTimeout(() => {
            this.search(target.value);
          }, 180);
        }
      };
      const handleClick = (e) => {
        const target = e.target;
        const cmdItem = target.closest("[data-cmd-idx]");
        if (cmdItem) {
          this.execute(Number(cmdItem.dataset.cmdIdx));
          return;
        }
        if (target.id === this.modalId || target.matches(`#${this.modalId} .ov`)) {
          this.close();
        }
      };
      document.addEventListener("keydown", handleKeydown);
      document.addEventListener("input", handleInput);
      document.addEventListener("click", handleClick);
      return () => {
        document.removeEventListener("keydown", handleKeydown);
        document.removeEventListener("input", handleInput);
        document.removeEventListener("click", handleClick);
      };
    }
  };

  // src/frontend/petal/components/pagination.ts
  function renderPager(page, pages) {
    if (pages <= 1) return "";
    const nums = /* @__PURE__ */ new Set([1, pages, page - 1, page, page + 1]);
    const seq = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
    const btn = (label, p, extra = "") => `<button type="button" data-pg="${p}" ${extra}>${label}</button>`;
    let html = btn(hero("arrow-left-01", "s"), page - 1, page === 1 ? 'disabled aria-label="Previous page"' : 'aria-label="Previous page"');
    let prev = 0;
    for (const n of seq) {
      if (n - prev > 1) html += '<button type="button" disabled aria-hidden="true">\u2026</button>';
      html += btn(String(n), n, n === page ? 'aria-current="true" aria-label="Page ' + n + '"' : 'aria-label="Page ' + n + '"');
      prev = n;
    }
    html += btn(hero("arrow-right-01", "s"), page + 1, page === pages ? 'disabled aria-label="Next page"' : 'aria-label="Next page"');
    return html;
  }

  // src/frontend/admin/shell/admin-shell.ts
  var AdminShell = class {
    permissions = /* @__PURE__ */ new Set();
    role = "";
    cmd;
    pendingStepUpAction = null;
    constructor() {
      this.cmd = new CommandPaletteController("cmd", "cmd-in", "cmd-res");
    }
    init() {
      initModalStacker();
      this.initTheme();
      this.installIcons();
      this.cmd.bindKeyboard();
      this.bindStepUp();
    }
    initTheme() {
      const theme = localStorage.getItem("fortless_theme") || localStorage.getItem("theme");
      if (theme) document.documentElement.dataset.theme = theme;
      window.addEventListener("storage", (e) => {
        if ((e.key === "fortless_theme" || e.key === "theme") && e.newValue) {
          document.documentElement.dataset.theme = e.newValue;
        }
      });
    }
    toggleTheme() {
      const isDark = document.documentElement.dataset.theme === "dark" || !document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches;
      const next = isDark ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("fortless_theme", next);
      localStorage.setItem("theme", next);
    }
    installIcons() {
      document.querySelectorAll("[data-icon]").forEach((x) => {
        x.outerHTML = hero(x.dataset.icon || "home");
      });
    }
    async loadIdentity() {
      try {
        const [identity, access] = await Promise.all([
          api("/api/v1/auth/me"),
          api("/api/v1/admin/me")
        ]);
        const userName = document.querySelector("#userName");
        const userAvatar = document.querySelector("#userAvatar");
        const topAvatar = document.querySelector("#topAvatar");
        const staffRole = document.querySelector("#staffRole");
        if (userName) userName.textContent = identity.user.name;
        if (userAvatar) userAvatar.textContent = identity.user.name.slice(0, 2).toUpperCase();
        if (topAvatar) topAvatar.textContent = identity.user.name.slice(0, 2).toUpperCase();
        if (staffRole) staffRole.textContent = `${access.staff.role.replaceAll("_", " ")} \xB7 MFA`;
        this.permissions = new Set(access.staff.permissions);
        this.role = access.staff.role;
        const required = {
          accounts: "accounts:read",
          services: "services:read",
          orders: "accounts:read",
          billing: "accounts:read",
          infrastructure: "services:read",
          catalog: "catalog:read",
          tickets: "tickets:read",
          audit: "audit:read",
          jobs: "audit:read",
          staff: "staff:read",
          status: "services:read"
        };
        document.querySelectorAll("[data-route]").forEach((link) => {
          const route = link.dataset.route || "";
          const permission = required[route];
          if (permission && !this.permissions.has(permission)) {
            link.remove();
          }
        });
        this.enforcePermissions();
        const main = document.getElementById("mn");
        if (main) {
          new MutationObserver(() => this.enforcePermissions(main)).observe(main, { childList: true, subtree: true });
        }
      } catch {
      }
    }
    hasPermission(permission) {
      return this.role === "OWNER" || this.permissions.has(permission);
    }
    enforcePermissions(root = document) {
      root.querySelectorAll("[data-permission]").forEach((element) => {
        const allowed = this.hasPermission(element.dataset.permission || "");
        element.hidden = !allowed;
        element.setAttribute("aria-hidden", String(!allowed));
      });
    }
    promptStepUp(onSuccess, onError) {
      this.pendingStepUpAction = { onSuccess, onError };
      const modal = document.getElementById("modalStepUp");
      if (!modal) {
        if (onError) onError(new Error("Step-up verification modal not found."));
        return;
      }
      const passInput = document.getElementById("stepUpPassword");
      const totpInput = document.getElementById("stepUpTotpCode");
      const errEl = document.getElementById("stepUpError");
      if (passInput) passInput.value = "";
      if (totpInput) totpInput.value = "";
      if (errEl) {
        errEl.textContent = "";
        errEl.style.display = "none";
      }
      modal.hidden = false;
      updateModalStacking(modal, true);
      setTimeout(() => passInput?.focus(), 50);
    }
    bindStepUp() {
      setStepUpInterceptor((onSuccess, onError) => {
        this.promptStepUp(onSuccess, onError);
      });
      const form = document.getElementById("adminStepUpForm");
      form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const password = document.getElementById("stepUpPassword").value;
        const code = document.getElementById("stepUpTotpCode").value.trim();
        const btn = document.getElementById("stepUpSubmitBtn");
        const errEl = document.getElementById("stepUpError");
        btn.disabled = true;
        if (errEl) errEl.style.display = "none";
        try {
          await api("/api/v1/auth/step-up", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password, code })
          });
          const modal = document.getElementById("modalStepUp");
          if (modal) {
            modal.hidden = true;
            updateModalStacking(modal, false);
          }
          if (this.pendingStepUpAction) {
            this.pendingStepUpAction.onSuccess();
            this.pendingStepUpAction = null;
          }
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || "Verification failed.";
            errEl.style.display = "block";
          }
        } finally {
          btn.disabled = false;
        }
      });
    }
  };
  function badge(v) {
    const x = String(v || "UNKNOWN");
    const c = /ACTIVE|RUNNING|RESOLVED|CLOSED|COMPLETED/.test(x) ? "good" : /URGENT|ERROR|DEAD|OVERDUE|SUSPENDED|LOCKED/.test(x) ? "bad" : /PENDING|WAITING|HIGH|MOCK|NOT_CONFIGURED|NOT_STARTED|FLAGGED/.test(x) ? "warn" : "info";
    return `<span class="pill ${c}" style="height:22px;padding:0 8px;font-size:11px">${esc(x.replaceAll("_", " "))}</span>`;
  }
  function row({
    symbol = "home",
    title,
    sub = "",
    status = "",
    meta = "",
    dataAttr = ""
  }) {
    return `
    <article class="li h" ${dataAttr} style="cursor:pointer">
      <span class="tile neu sm">${hero(symbol)}</span>
      <span class="tx">
        <b>${esc(title)}</b>
        <small>${esc(sub)}</small>
      </span>
      ${status ? badge(status) : ""}
      ${meta ? `<span class="faint hide-n" style="font-weight:650;font-size:12.5px">${esc(meta)}</span>` : ""}
    </article>
  `;
  }

  // src/frontend/core/utils/dates.ts
  function formatDate(value) {
    if (!value) return "\u2014";
    let str = String(value);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
      str = `${str.replace(" ", "T")}Z`;
    }
    const dateObj = new Date(str);
    if (isNaN(dateObj.getTime())) return String(value);
    return new Intl.DateTimeFormat(void 0, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(dateObj);
  }

  // src/frontend/core/utils/formatting.ts
  function money(minorUnits, currency = "EUR") {
    const val = Number(minorUnits) || 0;
    return new Intl.NumberFormat(void 0, {
      style: "currency",
      currency
    }).format(val / 100);
  }

  // src/frontend/admin/pages/overview/index.ts
  function linkRow(path, route, icon, title, sub, state = "", meta = "") {
    return `<a class="li" href="${path}" data-route="${route}"><span class="tile neu sm">${hero(icon)}</span><span class="tx"><b>${esc(title)}</b><small>${esc(sub)}</small></span>${state ? badge(state) : ""}${meta ? `<span class="faint hide-n">${esc(meta)}</span>` : ""}</a>`;
  }
  function empty(message) {
    return `<div class="es" style="padding:24px 12px"><span class="tile good sm">${hero("check")}</span><h4>${esc(message)}</h4></div>`;
  }
  async function renderOverview() {
    const d = await api("/api/v1/admin/overview");
    const metrics = [
      ["Active services", d.activeServices, "server", "good"],
      ["Suspended", d.suspendedServices, "warning", d.suspendedServices ? "bad" : "good"],
      ["Provisioning", d.provisioningServices, "refresh", d.provisioningServices ? "warn" : "good"],
      ["Failed jobs", d.failedProvisioningJobs, "warning", d.failedProvisioningJobs ? "bad" : "good"],
      ["Pending orders", d.pendingOrders, "cube", d.pendingOrders ? "warn" : "good"],
      ["Overdue invoices", d.overdueInvoices, "document", d.overdueInvoices ? "bad" : "good"],
      ["Waiting for staff", d.waitingStaffTickets, "support", d.waitingStaffTickets ? "warn" : "good"],
      ["Capacity alerts", d.capacityAlerts, "servers", d.capacityAlerts ? "bad" : "good"]
    ];
    const metricsBox = document.querySelector("#overviewMetrics");
    if (metricsBox) metricsBox.innerHTML = metrics.map(([label, value, icon, tone]) => `<article class="card mt"><div><span class="l">${esc(label)}</span><b class="v">${Number(value || 0)}</b></div><span class="tile ${tone}">${hero(icon)}</span></article>`).join("");
    const capabilityList = document.querySelector("#capabilityList");
    if (capabilityList) capabilityList.innerHTML = Object.entries(d.capabilities || {}).map(([key, value]) => row({ symbol: "shield", title: key.replace(/([A-Z])/g, " $1"), sub: "Server environment and verification state", status: String(value) })).join("");
    const collections = document.querySelector("#collectionsSummary");
    if (collections) collections.innerHTML = d.collections?.length ? d.collections.map((item) => row({ symbol: "credit", title: item.currency, sub: "Settled invoice collections", meta: money(item.amount_minor_units, item.currency), status: "COLLECTED" })).join("") : empty("No settled collections in this period");
    const attention = [
      ...(d.attention?.invoices || []).map((item) => linkRow(`/admin/billing/${encodeURIComponent(item.id)}`, "invoice-detail", "document", item.invoice_number || item.id, `Overdue since ${formatDate(item.due_date)}`, item.status, money(item.balance_minor_units, item.currency))),
      ...(d.attention?.provisioning || []).map((item) => linkRow(`/admin/services/${encodeURIComponent(item.service_id)}`, "admin-service-detail", "server", item.identifier || item.service_id, item.last_error || `${item.account_name} requires review`, item.status)),
      ...(d.attention?.tickets || []).map((item) => linkRow(`/admin/tickets/${encodeURIComponent(item.id)}`, "admin-ticket-detail", "support", item.subject, `${item.account_name} \xB7 waiting since ${formatDate(item.updated_at)}`, item.priority))
    ];
    const attentionList = document.querySelector("#attentionList");
    if (attentionList) attentionList.innerHTML = attention.join("") || empty("No records currently need attention");
    const outboxHealth = document.querySelector("#outboxHealth");
    if (outboxHealth) outboxHealth.innerHTML = [
      row({ symbol: "refresh", title: "Pending worker events", sub: "Awaiting background dispatch", status: d.pendingOutboxEvents ? "PENDING" : "CLEAR", meta: String(d.pendingOutboxEvents) }),
      row({ symbol: "warning", title: "Dead-letter events", sub: "Manual engineering review required", status: d.deadLetterEvents ? "ATTENTION" : "CLEAR", meta: String(d.deadLetterEvents) }),
      row({ symbol: "support", title: "Failed email deliveries", sub: "Failed or dead-letter transactional messages", status: d.failedEmails ? "ATTENTION" : "CLEAR", meta: String(d.failedEmails) }),
      row({ symbol: "credit", title: "Webhook failures or anomalies", sub: "Persisted PSP inbox records", status: d.webhookFailures ? "ATTENTION" : "CLEAR", meta: String(d.webhookFailures) })
    ].join("");
    const commercial = document.querySelector("#recentCommercial");
    if (commercial) {
      const records = [
        ...(d.recent?.accounts || []).map((item) => ({ at: item.created_at, html: linkRow(`/admin/accounts/${encodeURIComponent(item.id)}`, "account-detail", "users", item.name, `Customer created ${formatDate(item.created_at)}`, item.status) })),
        ...(d.recent?.orders || []).map((item) => ({ at: item.created_at, html: linkRow(`/admin/orders/${encodeURIComponent(item.id)}`, "order-detail", "cube", item.account_name, `Order ${item.id} \xB7 ${formatDate(item.created_at)}`, item.status, money(item.total_minor_units, item.currency)) }))
      ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
      commercial.innerHTML = records.map((record) => record.html).join("") || empty("No customer or order records");
    }
    const operations = document.querySelector("#recentOperations");
    if (operations) operations.innerHTML = (d.recent?.operations || []).map((event) => {
      const target = event.resource_type === "service" ? `/admin/services/${encodeURIComponent(event.resource_id)}` : event.resource_type === "ticket" ? `/admin/tickets/${encodeURIComponent(event.resource_id)}` : event.resource_type === "account" ? `/admin/accounts/${encodeURIComponent(event.resource_id)}` : "/admin/audit";
      const route = event.resource_type === "service" ? "admin-service-detail" : event.resource_type === "ticket" ? "admin-ticket-detail" : event.resource_type === "account" ? "account-detail" : "audit";
      return linkRow(target, route, "shield", event.action, `${event.actor_type} \xB7 ${formatDate(event.created_at)}`, "", event.correlation_id);
    }).join("") || empty("No administrative operations recorded");
  }

  // src/frontend/admin/pages/accounts/index.ts
  var activeAccountId = null;
  var cachedAccounts = [];
  var adminAccountsTotal = 0;
  var adminAccountsQuery = "";
  var adminAccountsPage = 1;
  var adminAccountsPageSize = 10;
  var adminAccountsListenersBound = false;
  function getActiveAccountId() {
    return activeAccountId;
  }
  function paintAccountsList() {
    const host = document.querySelector("#accountsList");
    const paginationRow = document.getElementById("adminAccountsPaginationRow");
    const infoEl = document.getElementById("adminAccountsPageInfo");
    const pagerEl = document.getElementById("adminAccountsPager");
    if (!host) return;
    if (!cachedAccounts.length) {
      if (paginationRow) paginationRow.style.display = "none";
      host.innerHTML = `<div class="empty"><span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="/assets/petal-icons.svg#i-search-01"></use></svg></span><b>No matching accounts.</b></div>`;
      return;
    }
    const pages = Math.max(1, Math.ceil(adminAccountsTotal / adminAccountsPageSize));
    const start = (adminAccountsPage - 1) * adminAccountsPageSize;
    if (paginationRow) paginationRow.style.display = adminAccountsTotal > adminAccountsPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = `Showing ${start + 1}\u2013${start + cachedAccounts.length} of ${adminAccountsTotal}`;
    if (pagerEl) pagerEl.innerHTML = renderPager(adminAccountsPage, pages);
    host.innerHTML = cachedAccounts.map((x) => `<button class="li" data-account-id="${esc(x.id)}">
    <span class="tile sm ${x.status === "LOCKED" ? "bad" : x.status === "FLAGGED_FRAUD" ? "warn" : ""}">${hero("users")}</span>
    <span class="tx"><b>${esc(x.name)}</b><small>${esc(x.owner_name)} \xB7 ${esc(x.owner_email)}</small></span>
    <span class="faint hide-n">${Number(x.member_count)} members \xB7 ${Number(x.service_count)} services \xB7 ${Number(x.open_ticket_count)} tickets</span>${badge(x.status)}
  </button>`).join("");
  }
  function bindAdminAccountsListeners() {
    if (adminAccountsListenersBound) return;
    adminAccountsListenersBound = true;
    const pagerEl = document.getElementById("adminAccountsPager");
    pagerEl?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-pg]");
      if (btn && !btn.disabled) {
        const p = Number(btn.dataset.pg);
        if (p && p !== adminAccountsPage) {
          adminAccountsPage = p;
          renderAccounts(adminAccountsQuery, p);
        }
      }
    });
  }
  async function renderAccounts(q = "", page = 1) {
    const host = document.querySelector("#accountsList");
    if (!host) return;
    try {
      adminAccountsQuery = q;
      adminAccountsPage = Math.max(1, page);
      const offset = (adminAccountsPage - 1) * adminAccountsPageSize;
      const d = await api(`/api/v1/admin/accounts?q=${encodeURIComponent(q)}&limit=${adminAccountsPageSize}&offset=${offset}`);
      cachedAccounts = d.accounts || [];
      adminAccountsTotal = Number(d.total || 0);
      paintAccountsList();
      bindAdminAccountsListeners();
    } catch (e) {
      host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
    }
  }
  function openAccountDetail(accountId) {
    const path = `/admin/accounts/${encodeURIComponent(accountId)}`;
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  async function renderAccountDetail(accountId) {
    activeAccountId = accountId;
    const content = document.getElementById("adminAccountContent");
    if (!content) return;
    content.innerHTML = '<div style="padding:24px;text-align:center;color:var(--ink2)"><div class="sk"><i></i><i></i><i></i></div></div>';
    try {
      const d = await api(`/api/v1/admin/accounts/${encodeURIComponent(accountId)}`);
      const titleEl = document.getElementById("adminAccountTitle");
      const metaEl = document.getElementById("adminAccountMeta");
      const statusSelect = document.getElementById("adminAccountStatusSelect");
      if (titleEl) titleEl.textContent = d.account.name;
      if (metaEl) {
        metaEl.textContent = `Owner: ${d.account.owner_name} (${d.account.owner_email}) \xB7 Created ${formatDate(
          d.account.created_at
        )} \xB7 Billing: ${d.account.billing_email}`;
      }
      if (statusSelect) statusSelect.value = d.account.status;
      content.innerHTML = `
      <div class="g g4" style="margin-bottom:6px">
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">MEMBERS</small>
          <div style="font-size:18px;font-weight:700">${d.members.length}</div>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">ACTIVE SERVICES</small>
          <div style="font-size:18px;font-weight:700">${Number(d.summary.services)}</div>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">TOTAL INVOICES</small>
          <div style="font-size:18px;font-weight:700">${Number(d.summary.invoices)}</div>
          <small class="faint">${Number(d.summary.unpaid_invoices)} unpaid</small>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">TICKETS</small>
          <div style="font-size:18px;font-weight:700">${Number(d.summary.tickets)}</div>
        </div>
      </div>

      <!-- Account Members -->
      <div>
        <div class="dh" style="margin-bottom:6px">ORGANIZATION MEMBERS (${d.members.length})</div>
        <div class="table-scroll">
          <table class="tbl rsp">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th class="r">Joined</th>
              </tr>
            </thead>
            <tbody>
              ${d.members.length ? d.members.map((m) => `<tr>
                <td><b>${esc(m.name)}</b><small class="faint">${esc(m.email)}</small></td>
                <td><span class="pill ${m.role === "OWNER" ? "pri" : m.role === "ADMIN" ? "info" : ""}">${esc(m.role)}</span></td>
                <td>${badge(m.status)}</td>
                <td class="r faint" style="font-size:12px">${formatDate(m.created_at)}</td>
              </tr>`).join("") : '<tr><td colspan="4"><div class="empty"><b>No members found.</b></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Account Services -->
      <div>
        <div class="dh" style="margin-bottom:6px">HOSTED SERVICES & INSTANCES (${d.services.length})</div>
        <div class="table-scroll">
          <table class="tbl rsp">
            <thead>
              <tr>
                <th>Service / Plan</th>
                <th>Node</th>
                <th>Contract</th>
                <th>Runtime</th>
                <th class="r">Action</th>
              </tr>
            </thead>
            <tbody>
              ${d.services.length ? d.services.map((s) => `<tr>
                <td><b>${esc(s.plan_name || s.product_name)}</b><small class="mono faint">${esc(s.identifier || s.id)}</small></td>
                <td><span class="mono" style="font-size:12px">${esc(s.node_name || "Assigned node")}</span></td>
                <td>${badge(s.contract_status)}</td>
                <td>${badge(s.runtime_state || "UNKNOWN")}</td>
                <td class="r"><button type="button" class="btn xs" data-service-id="${esc(s.id)}">Manage</button></td>
              </tr>`).join("") : '<tr><td colspan="5"><div class="empty"><b>No active services in this account.</b></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Account Invoices -->
      <div>
        <div class="dh" style="margin-bottom:6px">RECENT INVOICES (${d.invoices.length})</div>
        <div class="table-scroll">
          <table class="tbl rsp">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Total</th>
                <th class="r">Status</th>
              </tr>
            </thead>
            <tbody>
              ${d.invoices.length ? d.invoices.map((i) => `<tr>
                <td><a class="btn xs" href="/admin/billing/${encodeURIComponent(i.id)}" data-route="invoice-detail">${esc(i.invoice_number || i.id)}</a></td>
                <td class="faint" style="font-size:12px">${formatDate(i.created_at)}</td>
                <td><b>${money(i.total_minor_units, i.currency)}</b></td>
                <td class="r">${badge(i.status)}</td>
              </tr>`).join("") : '<tr><td colspan="4"><div class="empty"><b>No invoices recorded.</b></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="g g2">
        <article class="card"><div class="ch"><div class="tx"><h3>Recent orders</h3><p>Commercial state remains separate from provisioning.</p></div></div><div class="col">${d.orders.map((order) => `<a class="li" href="/admin/orders/${encodeURIComponent(order.id)}" data-route="order-detail"><span class="tx"><b>${esc(order.id)}</b><small>${formatDate(order.created_at)}</small></span><b>${money(order.total_minor_units, order.currency)}</b>${badge(order.status)}</a>`).join("") || '<div class="empty"><b>No orders recorded.</b></div>'}</div></article>
        <article class="card"><div class="ch"><div class="tx"><h3>Subscriptions & renewals</h3><p>Persisted renewal state and next billing date.</p></div></div><div class="col">${d.subscriptions.map((sub) => `<a class="li" href="/admin/services/${encodeURIComponent(sub.service_id)}" data-route="admin-service-detail"><span class="tx"><b>${esc(sub.plan_name || sub.product_name)}</b><small>${esc(sub.billing_interval)} \xB7 renews ${formatDate(sub.next_renewal_date)}</small></span><b>${money(sub.renewal_price_minor_units, sub.currency)}</b>${badge(sub.status)}</a>`).join("") || '<div class="empty"><b>No subscriptions recorded.</b></div>'}</div></article>
      </div>

      <div class="g g2">
        <article class="card">
          <div class="ch"><div class="tx"><h3>Administrative notes</h3><p>Private staff context with immutable author and timestamp.</p></div></div>
          <div class="col" style="gap:8px">${d.notes.map((note) => `<div class="li h"><span class="tx"><b>${esc(note.author_name)}</b><small>${formatDate(note.created_at)} \xB7 ${esc(note.author_email)}</small><span style="margin-top:6px;white-space:pre-wrap">${esc(note.body)}</span></span></div>`).join("") || '<div class="empty"><b>No administrative notes.</b></div>'}</div>
          <form id="adminAccountNoteForm" class="col" style="gap:8px;margin-top:12px" data-permission="accounts:manage">
            <label class="field"><span>Add private note</span><div class="inp ta"><textarea name="body" required minlength="2" maxlength="4000" placeholder="Operational context visible only to authorized staff"></textarea></div></label>
            <div class="row" style="justify-content:flex-end"><button class="btn s pri" type="submit">Save note</button></div>
          </form>
        </article>
        <article class="card">
          <div class="ch"><div class="tx"><h3>Billing profile & tax identity</h3><p>Updates are validated, MFA-gated and audited.</p></div></div>
          <form id="adminBillingProfileForm" class="col" style="gap:10px" data-permission="accounts:manage">
            <div class="g g2">
              <label class="field"><span>Company name</span><div class="inp"><input name="companyName" maxlength="120" value="${esc(d.billingProfile?.company_name || "")}"></div></label>
              <label class="field"><span>Country code</span><div class="inp"><input name="country" required minlength="2" maxlength="2" value="${esc(d.billingProfile?.country || "")}" placeholder="RO"></div></label>
              <label class="field"><span>Tax ID</span><div class="inp"><input name="taxId" maxlength="30" value="${esc(d.billingProfile?.tax_id || "")}"></div></label>
              <label class="field"><span>Tax ID type</span><div class="inp"><input name="taxIdType" maxlength="30" value="${esc(d.billingProfile?.tax_id_type || "")}" placeholder="VAT, EIN\u2026"></div></label>
            </div>
            <label class="field"><span>Address</span><div class="inp"><input name="addressLine1" required maxlength="150" value="${esc(d.billingProfile?.address_line1 || "")}"></div></label>
            <label class="field"><span>Address line 2</span><div class="inp"><input name="addressLine2" maxlength="150" value="${esc(d.billingProfile?.address_line2 || "")}"></div></label>
            <div class="g g2"><label class="field"><span>City</span><div class="inp"><input name="city" required maxlength="80" value="${esc(d.billingProfile?.city || "")}"></div></label><label class="field"><span>Postal code</span><div class="inp"><input name="postalCode" required maxlength="20" value="${esc(d.billingProfile?.postal_code || "")}"></div></label></div>
            <div class="row" style="justify-content:flex-end"><button class="btn s pri" type="submit">Save billing profile</button></div>
          </form>
        </article>
      </div>

      <div>
        <div class="dh" style="margin-bottom:6px">SUPPORT CONTEXT (${d.tickets.length})</div>
        <div class="col" style="gap:8px">
          ${d.tickets.length ? d.tickets.map((t) => `<a class="li" href="/admin/tickets/${encodeURIComponent(t.id)}" data-route="admin-ticket-detail"><span class="tx"><b>${esc(t.subject)}</b><small>${esc(t.id)} \xB7 updated ${formatDate(t.updated_at)}</small></span>${badge(t.priority)}${badge(t.status)}</a>`).join("") : '<div class="empty"><b>No support conversations recorded.</b></div>'}
        </div>
      </div>

      <article class="card"><div class="ch"><div class="tx"><h3>Security & lifecycle history</h3><p>Latest account-scoped audit events with correlation identifiers.</p></div></div><div class="table-scroll"><table class="tbl rsp"><thead><tr><th>Action</th><th>Actor</th><th>Resource</th><th>Correlation</th><th>Time</th></tr></thead><tbody>${d.audit.map((event) => `<tr><td><b>${esc(event.action)}</b></td><td>${badge(event.actor_type)}</td><td><span class="mono">${esc(event.resource_type)} \xB7 ${esc(event.resource_id)}</span></td><td><span class="mono">${esc(event.correlation_id)}</span></td><td>${formatDate(event.created_at)}</td></tr>`).join("") || '<tr><td colspan="5">No audit events recorded.</td></tr>'}</tbody></table></div></article>
    `;
    } catch (err) {
      content.innerHTML = `<div class="alert bad"><div><b>Error loading account</b><span>${esc(err.message)}</span></div></div>`;
    }
  }

  // src/frontend/admin/pages/services/index.ts
  var activeServiceId = null;
  var cachedAdminServices = [];
  var adminServicesTotal = 0;
  var adminServicesQuery = "";
  var adminServicesPage = 1;
  var adminServicesPageSize = 10;
  var adminServicesListenersBound = false;
  function paintAdminServicesList() {
    const host = document.querySelector("#servicesList");
    const paginationRow = document.getElementById("adminServicesPaginationRow");
    const infoEl = document.getElementById("adminServicesPageInfo");
    const pagerEl = document.getElementById("adminServicesPager");
    if (!host) return;
    if (!cachedAdminServices.length) {
      if (paginationRow) paginationRow.style.display = "none";
      host.innerHTML = `<tr><td colspan="6"><div class="empty"><b>No matching services.</b></div></td></tr>`;
      return;
    }
    const pages = Math.max(1, Math.ceil(adminServicesTotal / adminServicesPageSize));
    const start = (adminServicesPage - 1) * adminServicesPageSize;
    if (paginationRow) paginationRow.style.display = adminServicesTotal > adminServicesPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = `Showing ${start + 1}\u2013${start + cachedAdminServices.length} of ${adminServicesTotal}`;
    if (pagerEl) pagerEl.innerHTML = renderPager(adminServicesPage, pages);
    host.innerHTML = cachedAdminServices.map((x) => `<tr class="h" data-filter-state="${x.runtime_state === "RUNNING" ? "RUNNING" : "OTHER"}" data-service-id="${esc(x.id)}" style="cursor:pointer">
    <td data-l="Service"><b>${esc(x.plan_name || x.product_name)}</b><small class="mono">${esc(x.identifier || x.id)}</small></td>
    <td data-l="Account">${esc(x.account_name)}</td>
    <td data-l="Node"><span class="mono">${esc(x.node_name)}</span><small>${esc(x.region_name)}</small></td>
    <td data-l="Contract">${badge(x.contract_status)}</td>
    <td data-l="Runtime">${badge(x.runtime_state || "UNKNOWN")}</td>
    <td class="r" data-l="Manage"><button type="button" class="btn xs pri" data-service-id="${esc(x.id)}">Manage</button></td>
  </tr>`).join("");
  }
  function bindAdminServicesListeners() {
    if (adminServicesListenersBound) return;
    adminServicesListenersBound = true;
    const pagerEl = document.getElementById("adminServicesPager");
    pagerEl?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-pg]");
      if (btn && !btn.disabled) {
        const p = Number(btn.dataset.pg);
        if (p && p !== adminServicesPage) {
          adminServicesPage = p;
          renderServices(adminServicesQuery, p);
        }
      }
    });
  }
  async function renderServices(q = "", page = 1) {
    const host = document.querySelector("#servicesList");
    if (!host) return;
    try {
      adminServicesQuery = q;
      adminServicesPage = Math.max(1, page);
      const offset = (adminServicesPage - 1) * adminServicesPageSize;
      const d = await api(`/api/v1/admin/services?q=${encodeURIComponent(q)}&limit=${adminServicesPageSize}&offset=${offset}`);
      cachedAdminServices = d.services || [];
      adminServicesTotal = Number(d.total || 0);
      paintAdminServicesList();
      bindAdminServicesListeners();
    } catch (e) {
      host.innerHTML = `<tr><td colspan="6"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
    }
  }
  function openServiceDetail(serviceId) {
    const path = `/admin/services/${encodeURIComponent(serviceId)}`;
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  async function renderServiceDetail(serviceId) {
    activeServiceId = serviceId;
    const body = document.getElementById("adminServiceBody");
    if (!body) return;
    body.innerHTML = '<div style="padding:28px;text-align:center;color:var(--ink2)"><div class="sk"><i></i><i></i><i></i></div></div>';
    try {
      const data = await api(`/api/v1/admin/services/${encodeURIComponent(serviceId)}`);
      const s = data.service;
      const titleEl = document.getElementById("adminServiceTitle");
      const eyebrowEl = document.getElementById("adminServiceEyebrow");
      if (titleEl) titleEl.textContent = `${s.plan_name || s.product_name} (${s.identifier || s.id.slice(0, 8)})`;
      if (eyebrowEl) eyebrowEl.textContent = `${s.provider_type} Instance \xB7 ${s.account_name}`;
      body.innerHTML = `
      <!-- Status & Identity Bar -->
      <div class="row nw" style="justify-content:space-between;align-items:center;background:var(--s2);padding:12px 14px;border-radius:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="tile ${s.runtime_state === "RUNNING" ? "good" : "neu"}">${hero("server")}</span>
          <div>
            <b>${esc(s.account_name)}</b>
            <div class="faint" style="font-size:12px">Owner: ${esc(s.owner_name)} (${esc(s.owner_email)})</div>
          </div>
        </div>
        <div class="row nw" style="gap:8px">
          ${badge(s.contract_status)}
          ${badge(s.runtime_state || "UNKNOWN")}
        </div>
      </div>

      <!-- Quick Specs & Node Grid -->
      <div class="g g4">
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">NODE & REGION</small>
          <div style="font-size:14px;font-weight:700" class="mono">${esc(s.node_name)}</div>
          <small class="faint">${esc(s.region_name)}</small>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">ALLOCATED RAM</small>
          <div style="font-size:14px;font-weight:700">${s.memory_limit_mb ? s.memory_limit_mb >= 1024 ? `${s.memory_limit_mb / 1024} GB` : `${s.memory_limit_mb} MB` : "Unspecified"}</div>
          <small class="faint">${s.cpu_limit_pct || 100}% CPU Limit</small>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">NVMe STORAGE</small>
          <div style="font-size:14px;font-weight:700">${s.disk_limit_mb ? `${Math.round(s.disk_limit_mb / 1024)} GB` : "Unspecified"}</div>
          <small class="faint">High IOPS SSD</small>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">EXTERNAL ID</small>
          <div style="font-size:13px;font-weight:700" class="mono">${esc(s.external_id || "Pending")}</div>
          <small class="faint">${esc(s.provider_instance_id || "local")}</small>
        </div>
      </div>

      <!-- Live Provider Controls -->
      <div class="card flat" style="padding:14px" data-permission="services:manage">
        <div class="row nw" style="justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <div class="dh">HYPERVISOR POWER ACTIONS</div>
            <small class="muted">Send audited power instructions to the hypervisor instance.</small>
          </div>
          <button type="button" class="btn xs" id="btnAdminSyncService" data-service-id="${esc(s.id)}">
            ${hero("refresh-cw", "xs")} Sync State
          </button>
        </div>
        <div class="row nw" style="gap:8px">
          <button type="button" class="btn xs" id="btnPowerRestart" data-action="restart" data-service-id="${esc(s.id)}">
            ${hero("refresh-cw", "xs")} Restart
          </button>
          <button type="button" class="btn xs good" id="btnPowerStart" data-action="start" data-service-id="${esc(s.id)}">
            ${hero("play", "xs")} Start
          </button>
          <button type="button" class="btn xs bad" id="btnPowerStop" data-action="stop" data-service-id="${esc(s.id)}">
            ${hero("square", "xs")} Stop
          </button>
        </div>
        <div id="servicePowerFeedback" style="margin-top:8px" hidden></div>
      </div>

      <div class="card flat" style="padding:14px" data-permission="services:manage">
        <div class="dh" style="margin-bottom:4px">RELINK TO PANEL SERVER</div>
        <small class="muted">Use when the server was recreated on the panel under another id. Current link: <code>${esc(String(s.external_id || "none"))}</code></small>
        <div class="row nw" style="gap:8px;margin-top:10px">
          <div class="inp s pill" style="flex:1"><input id="relinkId" inputmode="numeric" placeholder="Panel server id (number)" aria-label="Panel server id"></div>
          <button type="button" class="btn xs" id="btnRelink" data-service-id="${esc(s.id)}">Relink</button>
        </div>
      </div>

      <!-- Lifecycle Management Form -->
      <div class="card flat" style="padding:14px" data-permission="services:manage">
        <div class="dh" style="margin-bottom:4px">LIFECYCLE SUSPENSION & TERMINATION</div>
        <small class="muted" style="display:block;margin-bottom:10px">Administrative actions require audit rationale and recording.</small>

        <div class="field" style="margin-bottom:10px">
          <label for="adminServiceAuditReason">Audit reason (min 5 characters)</label>
          <div class="inp"><input type="text" id="adminServiceAuditReason" placeholder="e.g. Chargeback investigation or Terms of Service violation"></div>
        </div>

        <div class="row nw" style="gap:8px;justify-content:flex-end">
          ${s.contract_status === "ACTIVE" ? `
            <button type="button" class="btn xs bad" id="btnAdminSuspend" data-service-id="${esc(s.id)}">Suspend Service</button>
          ` : s.contract_status === "SUSPENDED" ? `
            <button type="button" class="btn xs good" id="btnAdminUnsuspend" data-service-id="${esc(s.id)}">Unsuspend Service</button>
          ` : ""}
          ${s.contract_status !== "TERMINATED" ? `
            <button type="button" class="btn xs bad" id="btnAdminTerminate" data-service-id="${esc(s.id)}">Terminate Service</button>
          ` : ""}
        </div>
      </div>

      <!-- Recent Audit Events -->
      <div>
        <div class="dh" style="margin-bottom:6px">AUDIT & LIFECYCLE HISTORY</div>
        <div class="table-scroll" style="max-height:160px">
          <table class="tbl rsp">
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor Type</th>
                <th class="r">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              ${(data.audit || []).length ? data.audit.map((a) => `<tr>
                <td><b>${esc(a.action)}</b></td>
                <td><span class="pill sm ${a.actor_type === "STAFF" ? "pri" : ""}">${esc(a.actor_type)}</span></td>
                <td class="r faint" style="font-size:12px">${formatDate(a.created_at)}</td>
              </tr>`).join("") : '<tr><td colspan="3"><div class="empty"><b>No audit events recorded for this service.</b></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
      wireServiceDetailEvents(s.id);
    } catch (err) {
      body.innerHTML = `<div class="alert bad"><div><b>Error loading service details</b><span>${esc(err.message)}</span></div></div>`;
    }
  }
  function wireServiceDetailEvents(serviceId) {
    const syncBtn = document.getElementById("btnAdminSyncService");
    const powerRestart = document.getElementById("btnPowerRestart");
    const powerStart = document.getElementById("btnPowerStart");
    const powerStop = document.getElementById("btnPowerStop");
    const suspendBtn = document.getElementById("btnAdminSuspend");
    const unsuspendBtn = document.getElementById("btnAdminUnsuspend");
    const terminateBtn = document.getElementById("btnAdminTerminate");
    const feedback = document.getElementById("servicePowerFeedback");
    document.getElementById("btnRelink")?.addEventListener("click", async () => {
      const value = document.getElementById("relinkId")?.value.trim() || "";
      if (!value || !window.confirm(`Link this service to panel server ${value}?`)) return;
      try {
        await api(`/api/v1/admin/services/${encodeURIComponent(serviceId)}/relink`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ panelServerId: value }) });
        toast("Service relinked", "good");
      } catch (e) {
        toast(e?.message || "Relink failed", "bad");
      }
    });
    const executePower = async (action) => {
      if (!feedback) return;
      feedback.hidden = false;
      feedback.className = "alert info";
      feedback.innerHTML = `<span>Sending <b>${action}</b> signal to hypervisor\u2026</span>`;
      try {
        const res = await api(
          `/api/v1/admin/services/${encodeURIComponent(serviceId)}/power`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action })
          }
        );
        feedback.className = "alert good";
        feedback.innerHTML = `<span>Power action <b>${res.action}</b> acknowledged. State: <b>${res.runtimeState}</b>.</span>`;
        setTimeout(() => renderServiceDetail(serviceId), 1200);
      } catch (err) {
        feedback.className = "alert bad";
        feedback.innerHTML = `<span>Power command failed: ${esc(err.message)}</span>`;
      }
    };
    if (powerRestart) powerRestart.addEventListener("click", () => executePower("restart"));
    if (powerStart) powerStart.addEventListener("click", () => executePower("start"));
    if (powerStop) powerStop.addEventListener("click", () => executePower("stop"));
    if (syncBtn) {
      syncBtn.addEventListener("click", async () => {
        if (!feedback) return;
        feedback.hidden = false;
        feedback.className = "alert info";
        feedback.innerHTML = `<span>Synchronizing state with Pterodactyl adapter\u2026</span>`;
        try {
          const res = await api(
            `/api/v1/admin/services/${encodeURIComponent(serviceId)}/sync`,
            { method: "POST" }
          );
          feedback.className = "alert good";
          feedback.innerHTML = `<span>Synchronized. Current runtime state: <b>${res.runtimeState}</b>.</span>`;
          setTimeout(() => renderServiceDetail(serviceId), 1e3);
        } catch (err) {
          feedback.className = "alert bad";
          feedback.innerHTML = `<span>Sync failed: ${esc(err.message)}</span>`;
        }
      });
    }
    const handleLifecycle = async (action) => {
      const reasonInput = document.getElementById("adminServiceAuditReason");
      const reason = reasonInput?.value.trim() || "";
      if (reason.length < 5) {
        alert("Please enter an audit reason of at least 5 characters.");
        return;
      }
      if (!confirm(`Are you sure you want to ${action.toUpperCase()} this service?`)) return;
      try {
        await api(`/api/v1/admin/services/${encodeURIComponent(serviceId)}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason })
        });
        alert(`Service ${action} completed successfully.`);
        await renderServiceDetail(serviceId);
        await renderServices();
      } catch (err) {
        alert(`Operation failed: ${err.message}`);
      }
    };
    if (suspendBtn) suspendBtn.addEventListener("click", () => handleLifecycle("suspend"));
    if (unsuspendBtn) unsuspendBtn.addEventListener("click", () => handleLifecycle("unsuspend"));
    if (terminateBtn) terminateBtn.addEventListener("click", () => handleLifecycle("terminate"));
  }

  // src/frontend/admin/pages/catalog/index.ts
  var products = [];
  var inventory = null;
  var cachedCategories = [];
  var currentSearch = "";
  var currentTab = "all";
  var statusTone = (status) => status === "ACTIVE" ? "good" : status === "RETIRED" ? "bad" : "warn";
  function planRow(plan, _product) {
    const price = plan.prices[0];
    const egg = inventory?.eggs.find((item) => item.id === plan.resources.eggId);
    const mapping = plan.resources.eggId ? egg ? `<span class="pill good d">Egg #${egg.id}: ${esc(egg.name)}</span>` : `<span class="pill bad d">Egg #${plan.resources.eggId} missing</span>` : '<span class="pill warn d">No provider mapping</span>';
    const memoryStr = plan.resources.memoryMb >= 1024 ? `${plan.resources.memoryMb / 1024} GB` : `${plan.resources.memoryMb} MB`;
    const diskStr = Math.round(plan.resources.diskMb / 1024) >= 1 ? `${Math.round(plan.resources.diskMb / 1024)} GB` : `${plan.resources.diskMb} MB`;
    return `<tr class="h" data-plan-id="${esc(plan.id)}">
    <td data-l="Plan version">
      <b>${esc(plan.name)}</b>
      <div class="faint mono" style="font-size:12px">v${plan.version} \xB7 ${esc(plan.id)}</div>
    </td>
    <td data-l="Resources">
      <b>${memoryStr} RAM</b> \xB7 <span class="muted">${plan.resources.cpuPct}% CPU</span> \xB7 <span class="muted">${diskStr} NVMe</span>
      <div class="faint" style="font-size:12px">${plan.resources.databases} DB \xB7 ${plan.resources.backups} backups</div>
    </td>
    <td data-l="Monthly price">
      <b class="mono" style="font-size:14px">${price ? money(price.priceMinorUnits, price.currency) : "\u2014"}</b>
      <div class="faint" style="font-size:12px">${price?.interval || "No price set"}</div>
    </td>
    <td data-l="Provider egg mapping">
      ${mapping}
    </td>
    <td data-l="Status">
      <span class="pill ${statusTone(plan.status)}">${esc(plan.status)}</span>
    </td>
    <td class="r" data-l="Actions">
      <div class="row nw" style="justify-content:flex-end;gap:6px">
        ${plan.status !== "ACTIVE" ? `<button class="btn xs good" data-plan-status="ACTIVE" data-plan-id="${esc(plan.id)}" data-permission="catalog:manage">Activate</button>` : ""}
        ${plan.status !== "RETIRED" ? `<button class="btn xs bad" data-plan-status="RETIRED" data-plan-id="${esc(plan.id)}" data-permission="catalog:manage">Retire</button>` : ""}
      </div>
    </td>
  </tr>`;
  }
  function renderProducts(query = "") {
    const host = document.getElementById("catalogProducts");
    if (!host) return;
    const q = query.trim().toLowerCase();
    const visible = products.filter((p) => {
      if (!q) return true;
      const matchProduct = p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.category.name.toLowerCase().includes(q);
      const matchPlan = p.plans.some((pl) => pl.name.toLowerCase().includes(q) || pl.id.toLowerCase().includes(q));
      return matchProduct || matchPlan;
    });
    if (!visible.length) {
      host.innerHTML = products.length ? `<div class="card"><div class="empty">${hero("search")}<b style="margin-top:6px">No products or plans match "${esc(query)}"</b><p>Check spelling or search by product slug or category.</p></div></div>` : `<div class="card"><div class="empty">${hero("cube")}<b style="margin-top:6px">No catalog products configured</b><p>Create a product first, then configure verified plan versions before publishing.</p><button class="btn s pri" type="button" data-new-product style="margin-top:10px">${hero("plus", "xs")}Create product</button></div></div>`;
      return;
    }
    host.innerHTML = visible.map((product) => {
      const plansToShow = q ? product.plans.filter((pl) => pl.name.toLowerCase().includes(q) || pl.id.toLowerCase().includes(q) || product.name.toLowerCase().includes(q)) : product.plans;
      return `<article class="card catalog-product-card" id="product-${esc(product.id)}">
      <div class="card-head" style="margin-bottom:14px">
        <span class="tile ${product.providerType === "PTERODACTYL" ? "acc" : "neu"}">${hero("server")}</span>
        <div>
          <h2>${esc(product.name)}</h2>
          <p>${esc(product.category.name)} \xB7 ${esc(product.providerType)} \xB7 <code class="mono">${esc(product.slug)}</code></p>
        </div>
        <span class="pill ${product.isPublished ? "good" : "warn"} d">${product.isPublished ? "Published" : "Draft (Private)"}</span>
        <div class="row nw" style="gap:6px">
          <button class="btn xs ${product.isPublished ? "bad" : "pri"}" data-product-publish="${product.isPublished ? "false" : "true"}" data-product-id="${esc(product.id)}" data-permission="catalog:manage">
            ${product.isPublished ? "Unpublish" : "Publish"}
          </button>
          <button class="btn xs" data-new-plan-product="${esc(product.id)}" data-permission="catalog:manage">
            ${hero("plus", "xs")}New plan
          </button>
        </div>
      </div>
      ${plansToShow.length ? `
        <div class="table-scroll">
          <table class="tbl rsp" data-c="Catalog plans">
            <thead>
              <tr>
                <th>Plan version</th>
                <th>Resources</th>
                <th>Monthly price</th>
                <th>Provider egg mapping</th>
                <th>Status</th>
                <th class="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${plansToShow.map((plan) => planRow(plan, product)).join("")}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="es" style="padding:22px 14px">
          <span class="tile neu">${hero("server")}</span>
          <h4>No plan versions</h4>
          <p>Add at least one plan with RAM, CPU and disk specs to make this product orderable.</p>
          <button class="btn s" data-new-plan-product="${esc(product.id)}" data-permission="catalog:manage" style="margin-top:6px">
            ${hero("plus", "xs")}Create first plan
          </button>
        </div>
      `}
    </article>`;
    }).join("");
  }
  function renderInventory(query = "") {
    const host = document.getElementById("providerInventory");
    const summary = document.getElementById("providerSummary");
    if (!host || !summary) return;
    if (!inventory) {
      summary.innerHTML = '<span class="pill bad d">Disconnected</span>';
      host.innerHTML = `<div class="alert bad">
      <span class="ic">${hero("shield")}</span>
      <div>
        <b>Provider inventory unavailable</b>
        <span>The catalog operates fail-closed. Real provider mappings cannot be validated without Application API connection.</span>
      </div>
    </div>`;
      return;
    }
    summary.innerHTML = `
    <span class="pill good d">Connected</span>
    <span class="pill info">${inventory.nodes.length} nodes</span>
    <span class="pill">${inventory.eggs.length} eggs</span>
  `;
    const q = query.trim().toLowerCase();
    const visibleNodes = q ? inventory.nodes.filter((n) => n.name.toLowerCase().includes(q) || n.fqdn.toLowerCase().includes(q)) : inventory.nodes;
    const nodeCards = visibleNodes.map((node) => {
      const memoryPct = node.memoryMb ? Math.min(100, Math.round(node.allocatedMemoryMb / node.memoryMb * 100)) : 0;
      const diskPct = node.diskMb ? Math.min(100, Math.round(node.allocatedDiskMb / node.diskMb * 100)) : 0;
      return `<div class="card flat">
      <div class="ch" style="margin-bottom:12px">
        <span class="tile ${node.maintenanceMode ? "warn" : "good"} sm">${hero("server")}</span>
        <div class="tx">
          <h3 style="font-size:15px">${esc(node.name)}</h3>
          <p class="mono" style="font-size:12px">${esc(node.fqdn)} \xB7 Loc #${node.locationId}</p>
        </div>
        <span class="pill ${node.maintenanceMode ? "warn" : "good"} d">${node.maintenanceMode ? "Maintenance" : "Online"}</span>
      </div>
      <div class="col" style="gap:10px">
        <div>
          <div class="row nw" style="justify-content:space-between;font-weight:650;font-size:12px;margin-bottom:4px">
            <span class="muted">Allocated RAM</span>
            <span class="mono">${node.allocatedMemoryMb} / ${node.memoryMb} MB (${memoryPct}%)</span>
          </div>
          <div class="mtr ${memoryPct > 85 ? "bad" : memoryPct > 65 ? "warn" : "good"}"><b style="width:${memoryPct}%"></b></div>
        </div>
        <div>
          <div class="row nw" style="justify-content:space-between;font-weight:650;font-size:12px;margin-bottom:4px">
            <span class="muted">Allocated Disk</span>
            <span class="mono">${node.allocatedDiskMb} / ${node.diskMb} MB (${diskPct}%)</span>
          </div>
          <div class="mtr ${diskPct > 85 ? "bad" : diskPct > 65 ? "warn" : "good"}"><b style="width:${diskPct}%"></b></div>
        </div>
      </div>
    </div>`;
    }).join("");
    const visibleEggs = q ? inventory.eggs.filter((e) => e.name.toLowerCase().includes(q) || String(e.id).includes(q) || e.dockerImage && e.dockerImage.toLowerCase().includes(q)) : inventory.eggs;
    const eggRows = visibleEggs.map((egg) => {
      const nest = inventory?.nests.find((item) => item.id === egg.nestId);
      const used = products.some((product) => product.plans.some((plan) => plan.resources.eggId === egg.id));
      return `<tr class="h">
      <td data-l="Egg & Nest">
        <b>${esc(egg.name)}</b>
        <div class="faint" style="font-size:12px">${esc(nest?.name || `Nest #${egg.nestId}`)}</div>
      </td>
      <td data-l="Egg ID" class="mono"><code>#${egg.id}</code></td>
      <td data-l="Docker image" class="mono faint" style="font-size:12px;max-width:320px;overflow:hidden;text-overflow:ellipsis">${esc(egg.dockerImage || "Provider default")}</td>
      <td class="r" data-l="Catalog mapping">
        <div class="row nw" style="justify-content:flex-end;gap:6px">
          <span class="pill ${used ? "good d" : ""}">${used ? "Mapped" : "Unmapped"}</span>
          <button class="btn xs pri" data-create-from-egg="${egg.id}">Create product from egg</button>
        </div>
      </td>
    </tr>`;
    }).join("");
    host.innerHTML = `
    <div style="margin-bottom:18px">
      <div class="dh" style="margin-bottom:10px">PROVISIONING HYPERVISOR NODES</div>
      <div class="g g2">${nodeCards || '<div class="empty"><b>No nodes match filter.</b></div>'}</div>
    </div>
    <div>
      <div class="dh" style="margin-bottom:10px">DISCOVERED SERVICE EGGS & DOCKER ENVIRONMENTS</div>
      <div class="table-scroll">
        <table class="tbl rsp">
          <thead>
            <tr>
              <th>Egg & Nest</th>
              <th>Egg ID</th>
              <th>Docker default image</th>
              <th class="r">Catalog mapping</th>
            </tr>
          </thead>
          <tbody>
            ${eggRows.length ? eggRows : '<tr><td colspan="4"><div class="empty"><b>No provider eggs match filter.</b></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
  }
  function hydrateForms(categories) {
    cachedCategories = categories;
    const categorySelect = document.getElementById("catalogProductCategory");
    if (categorySelect) {
      categorySelect.innerHTML = categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    }
    const eggCategorySelect = document.getElementById("eggProductCategory");
    if (eggCategorySelect) {
      eggCategorySelect.innerHTML = categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    }
    const existingProductSelect = document.getElementById("eggExistingProductSelect");
    if (existingProductSelect) {
      existingProductSelect.innerHTML = products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.slug)})</option>`).join("");
    }
    const productSelect = document.getElementById("catalogPlanProduct");
    if (productSelect) {
      productSelect.innerHTML = products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    }
    const eggSelect = document.getElementById("catalogPlanEgg");
    if (eggSelect) {
      eggSelect.innerHTML = '<option value="">Select a verified provider egg</option>' + (inventory?.eggs || []).map((egg) => {
        const nest = inventory?.nests.find((item) => item.id === egg.nestId);
        return `<option value="${egg.id}" data-image="${esc(egg.dockerImage || "")}">${esc(nest?.name || "Nest")} \xB7 ${esc(egg.name)} (#${egg.id})</option>`;
      }).join("");
    }
  }
  function filterCatalog(q = "") {
    currentSearch = q;
    renderProducts(currentSearch);
    renderInventory(currentSearch);
  }
  function setCatalogTab(tab) {
    currentTab = tab;
    const prodSec = document.getElementById("catalogProductsSection");
    const invSec = document.getElementById("catalogInventorySection");
    if (prodSec) prodSec.hidden = tab === "inventory";
    if (invSec) invSec.hidden = tab === "products";
  }
  function initCatalogEvents() {
    const seg = document.getElementById("catalogViewSeg");
    if (seg && !seg.dataset.bound) {
      seg.dataset.bound = "true";
      seg.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-tab]");
        if (!btn) return;
        seg.querySelectorAll("button").forEach((b) => {
          b.classList.remove("on");
          b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("on");
        btn.setAttribute("aria-selected", "true");
        setCatalogTab(btn.dataset.tab || "all");
      });
    }
    const searchInput = document.getElementById("catalogSearchInput");
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = "true";
      let timer;
      searchInput.addEventListener("input", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => filterCatalog(searchInput.value), 180);
      });
    }
  }
  async function renderCatalog() {
    initCatalogEvents();
    const productHost = document.getElementById("catalogProducts");
    const inventoryHost = document.getElementById("providerInventory");
    if (productHost && !products.length) productHost.innerHTML = '<div class="sk"><i></i><i></i><i></i></div>';
    if (inventoryHost && !inventory) inventoryHost.innerHTML = '<div class="sk"><i></i><i></i></div>';
    const [catalogResult, categoriesResult, inventoryResult] = await Promise.allSettled([
      api("/api/v1/admin/catalog/products"),
      api("/api/v1/catalog/categories"),
      api("/api/v1/admin/providers/pterodactyl/inventory")
    ]);
    if (catalogResult.status === "fulfilled") {
      products = catalogResult.value.products;
    } else if (productHost) {
      productHost.innerHTML = `<div class="alert bad"><div><b>Catalog unavailable</b><span>${esc(catalogResult.reason?.message || "Request failed")}</span></div></div>`;
    }
    inventory = inventoryResult.status === "fulfilled" ? inventoryResult.value.inventory : null;
    renderProducts(currentSearch);
    renderInventory(currentSearch);
    setCatalogTab(currentTab);
    hydrateForms(categoriesResult.status === "fulfilled" ? categoriesResult.value.categories : []);
  }
  function openProductCreator() {
    const modal = document.getElementById("modalCatalogProduct");
    if (modal) modal.hidden = false;
  }
  function openPlanCreator(productId) {
    const modal = document.getElementById("modalCatalogPlan");
    const select = document.getElementById("catalogPlanProduct");
    if (select && productId) select.value = productId;
    if (modal) modal.hidden = false;
  }
  async function setProductPublished(productId, isPublished) {
    await api(`/api/v1/admin/catalog/products/${encodeURIComponent(productId)}/publish`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished })
    });
    await renderCatalog();
  }
  async function setPlanStatus(planId, status) {
    await api(`/api/v1/admin/catalog/plans/${encodeURIComponent(planId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    await renderCatalog();
  }
  async function submitProduct(form) {
    const data = new FormData(form);
    await api("/api/v1/admin/catalog/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: data.get("categoryId"),
        slug: data.get("slug"),
        name: data.get("name"),
        providerType: data.get("providerType"),
        isPublished: false
      })
    });
    form.reset();
    const modal = document.getElementById("modalCatalogProduct");
    if (modal) modal.hidden = true;
    await renderCatalog();
  }
  async function submitPlan(form) {
    const data = new FormData(form);
    const eggSelect = document.getElementById("catalogPlanEgg");
    const selectedEgg = eggSelect.selectedOptions[0];
    const price = Math.round(Number(data.get("monthlyPrice")) * 100);
    await api("/api/v1/admin/catalog/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: data.get("productId"),
        name: data.get("name"),
        resourceSpecs: {
          memoryMb: Number(data.get("memoryMb")),
          cpuPct: Number(data.get("cpuPct")),
          diskMb: Number(data.get("diskMb")),
          databases: Number(data.get("databases")),
          backups: Number(data.get("backups")),
          eggId: Number(data.get("eggId")),
          dockerImage: selectedEgg?.dataset.image || void 0
        },
        prices: [{ currency: "EUR", interval: "MONTHLY", priceMinorUnits: price, setupFeeMinorUnits: 0 }]
      })
    });
    form.reset();
    const modal = document.getElementById("modalCatalogPlan");
    if (modal) modal.hidden = true;
    await renderCatalog();
  }
  function openCreateProductFromEgg(eggId) {
    const egg = inventory?.eggs.find((e) => e.id === eggId);
    if (!egg) {
      alert(`Egg #${eggId} not found in inventory.`);
      return;
    }
    const nest = inventory?.nests.find((n) => n.id === egg.nestId);
    const modal = document.getElementById("modalCreateProductFromEgg");
    if (!modal) return;
    const idInput = document.getElementById("eggModalId");
    const imageInput = document.getElementById("eggModalDockerImage");
    const nameEl = document.getElementById("eggModalName");
    const metaEl = document.getElementById("eggModalMeta");
    const prodNameInput = document.getElementById("eggProductName");
    const prodSlugInput = document.getElementById("eggProductSlug");
    const planNameInput = document.getElementById("eggPlanName");
    const categorySelect = document.getElementById("eggProductCategory");
    const existingSelect = document.getElementById("eggExistingProductSelect");
    const modeSelect = document.getElementById("eggTargetProductMode");
    const newFields = document.getElementById("eggNewProductFields");
    const existingFields = document.getElementById("eggExistingProductFields");
    if (idInput) idInput.value = String(egg.id);
    if (imageInput) imageInput.value = egg.dockerImage || "";
    if (nameEl) nameEl.textContent = egg.name;
    if (metaEl) metaEl.textContent = `Nest: ${nest?.name || "Default"} \xB7 Egg #${egg.id}`;
    const cleanName = egg.name.replace(/[^\w\s-]/g, "").trim();
    const slugified = cleanName.toLowerCase().replace(/\s+/g, "-");
    if (prodNameInput) prodNameInput.value = `${cleanName} Hosting`;
    if (prodSlugInput) prodSlugInput.value = slugified;
    if (planNameInput) planNameInput.value = `${cleanName} 4GB Performance`;
    if (categorySelect && cachedCategories.length) {
      categorySelect.innerHTML = cachedCategories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    }
    if (existingSelect) {
      existingSelect.innerHTML = products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.slug)})</option>`).join("");
    }
    if (modeSelect) {
      modeSelect.value = "NEW";
      modeSelect.onchange = () => {
        const isNew = modeSelect.value === "NEW";
        if (newFields) newFields.hidden = !isNew;
        if (existingFields) existingFields.hidden = isNew;
        if (prodNameInput) prodNameInput.required = isNew;
        if (prodSlugInput) prodSlugInput.required = isNew;
      };
    }
    if (newFields) newFields.hidden = false;
    if (existingFields) existingFields.hidden = true;
    modal.hidden = false;
  }
  async function submitProductFromEgg(form) {
    const data = new FormData(form);
    const mode = data.get("productMode");
    const eggId = Number(data.get("eggId"));
    const dockerImage = data.get("dockerImage") || void 0;
    const planName = data.get("planName");
    const memoryMb = Number(data.get("memoryMb"));
    const cpuPct = Number(data.get("cpuPct"));
    const diskMb = Number(data.get("diskMb"));
    const databases = Number(data.get("databases"));
    const backups = Number(data.get("backups"));
    const publishImmediate = data.get("publishImmediate") === "on";
    let productId = data.get("existingProductId");
    if (mode === "NEW") {
      const createdProduct = await api("/api/v1/admin/catalog/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: data.get("categoryId"),
          slug: data.get("productSlug"),
          name: data.get("productName"),
          providerType: "PTERODACTYL",
          isPublished: false
        })
      });
      productId = createdProduct.id;
    }
    const prices = [];
    const monthlyPrice = Number(data.get("priceMonthly"));
    if (monthlyPrice >= 0) {
      prices.push({
        currency: "EUR",
        interval: "MONTHLY",
        priceMinorUnits: Math.round(monthlyPrice * 100),
        setupFeeMinorUnits: 0
      });
    }
    const quarterlyPrice = Number(data.get("priceQuarterly"));
    if (quarterlyPrice > 0) {
      prices.push({
        currency: "EUR",
        interval: "QUARTERLY",
        priceMinorUnits: Math.round(quarterlyPrice * 100),
        setupFeeMinorUnits: 0
      });
    }
    const annualPrice = Number(data.get("priceAnnual"));
    if (annualPrice > 0) {
      prices.push({
        currency: "EUR",
        interval: "ANNUAL",
        priceMinorUnits: Math.round(annualPrice * 100),
        setupFeeMinorUnits: 0
      });
    }
    await api("/api/v1/admin/catalog/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        name: planName,
        resourceSpecs: {
          memoryMb,
          cpuPct,
          diskMb,
          databases,
          backups,
          eggId,
          dockerImage
        },
        prices
      })
    });
    if (publishImmediate) {
      try {
        await api(`/api/v1/admin/catalog/products/${encodeURIComponent(productId)}/publish`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublished: true })
        });
      } catch (err) {
        console.warn("Auto-publish failed, product left as draft:", err);
      }
    }
    form.reset();
    const modal = document.getElementById("modalCreateProductFromEgg");
    if (modal) modal.hidden = true;
    await renderCatalog();
  }

  // src/frontend/core/utils/markdown.ts
  function renderMarkdown(text) {
    if (!text) return "";
    let s = esc(text);
    s = s.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, _lang, code) => `<pre><code class="code">${code.trim()}</code></pre>`);
    s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    s = s.replace(/^(?:>|&gt;)\s*(.+)$/gm, "<blockquote>$1</blockquote>");
    s = s.replace(/^[*-]\s+(.+)$/gm, "<li>$1</li>");
    s = s.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    const paragraphs = s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    return `<div class="prose">${paragraphs.map((p) => p.startsWith("<pre") || p.startsWith("<ul") || p.startsWith("<blockquote") ? p : `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
  }

  // src/frontend/admin/pages/tickets/index.ts
  var activeTicketId = null;
  var cachedTickets = [];
  var adminTicketsTotal = 0;
  var adminTicketsQuery = "";
  var adminTicketsPage = 1;
  var adminTicketsPageSize = 10;
  var adminTicketsListenersBound = false;
  var supportMeta = { departments: [], macros: [], staff: [] };
  function ticketFilters() {
    return {
      status: document.getElementById("ticketsStatusFilter")?.value || "",
      departmentId: document.getElementById("ticketsDepartmentFilter")?.value || "",
      assignedTo: document.getElementById("ticketsAssignmentFilter")?.value || ""
    };
  }
  function hydrateSupportMeta() {
    const departments = supportMeta.departments.filter((item) => item.is_active);
    for (const id of ["ticketsDepartmentFilter", "supportMacroDepartment"]) {
      const select = document.getElementById(id);
      if (!select) continue;
      const selected = select.value;
      const first = id === "ticketsDepartmentFilter" ? '<option value="">All departments</option>' : '<option value="">Any</option>';
      select.innerHTML = first + departments.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
      select.value = selected;
    }
    const assignment = document.getElementById("ticketsAssignmentFilter");
    if (assignment) {
      const selected = assignment.value;
      assignment.innerHTML = '<option value="">All assignees</option><option value="UNASSIGNED">Unassigned</option>' + supportMeta.staff.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
      assignment.value = selected;
    }
    const workload = document.getElementById("supportWorkload");
    if (workload) workload.innerHTML = supportMeta.staff.slice(0, 4).map((item) => `<article class="card flat"><small class="muted">${esc(item.role)}</small><b>${esc(item.name)}</b><span>${Number(item.active_count || 0)} active \xB7 ${Number(item.waiting_count || 0)} waiting</span></article>`).join("") || '<div class="empty"><b>No active support staff.</b></div>';
  }
  function getActiveTicketId() {
    return activeTicketId;
  }
  function paintTicketsList() {
    const host = document.querySelector("#ticketsList");
    const paginationRow = document.getElementById("adminTicketsPaginationRow");
    const infoEl = document.getElementById("adminTicketsPageInfo");
    const pagerEl = document.getElementById("adminTicketsPager");
    if (!host) return;
    if (!cachedTickets.length) {
      if (paginationRow) paginationRow.style.display = "none";
      host.innerHTML = `<tr><td colspan="6"><div class="empty"><b>No matching support tickets.</b></div></td></tr>`;
      return;
    }
    const pages = Math.max(1, Math.ceil(adminTicketsTotal / adminTicketsPageSize));
    const start = (adminTicketsPage - 1) * adminTicketsPageSize;
    if (paginationRow) paginationRow.style.display = adminTicketsTotal > adminTicketsPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = `Showing ${start + 1}\u2013${start + cachedTickets.length} of ${adminTicketsTotal}`;
    if (pagerEl) pagerEl.innerHTML = renderPager(adminTicketsPage, pages);
    host.innerHTML = cachedTickets.map((x) => `<tr class="h" data-ticket-id="${esc(x.id)}" style="cursor:pointer"><td data-l="Priority">${badge(x.priority)}</td><td data-l="Subject"><b>${esc(x.subject)}</b><small>${Number(x.message_count)} messages \xB7 ${esc(x.customer_name)} \xB7 ${esc(x.account_name)}</small></td><td data-l="Department">${esc(x.department_name || "Unrouted")}</td><td data-l="Assigned">${esc(x.assigned_staff_name || "Unassigned")}</td><td data-l="Status">${badge(x.status)}</td><td data-l="Updated" class="muted">${formatDate(x.updated_at)}</td></tr>`).join("");
  }
  function bindAdminTicketsListeners() {
    if (adminTicketsListenersBound) return;
    adminTicketsListenersBound = true;
    const pagerEl = document.getElementById("adminTicketsPager");
    pagerEl?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-pg]");
      if (btn && !btn.disabled) {
        const p = Number(btn.dataset.pg);
        if (p && p !== adminTicketsPage) {
          adminTicketsPage = p;
          renderTickets(adminTicketsQuery, p);
        }
      }
    });
    for (const id of ["ticketsStatusFilter", "ticketsDepartmentFilter", "ticketsAssignmentFilter"]) {
      document.getElementById(id)?.addEventListener("change", () => void renderTickets(adminTicketsQuery, 1));
    }
    document.getElementById("adminTicketMacro")?.addEventListener("change", (event) => {
      const macro = supportMeta.macros.find((item) => item.id === event.target.value);
      if (!macro) return;
      const body = document.getElementById("adminReplyBody");
      const status = document.getElementById("adminTicketStatusSelect");
      if (body) body.value = macro.body;
      if (status && macro.status) status.value = macro.status;
    });
  }
  async function renderTickets(q = "", page = 1) {
    const host = document.querySelector("#ticketsList");
    if (!host) return;
    try {
      adminTicketsQuery = q;
      adminTicketsPage = Math.max(1, page);
      const offset = (adminTicketsPage - 1) * adminTicketsPageSize;
      const filter = ticketFilters();
      const params = new URLSearchParams({ q, limit: String(adminTicketsPageSize), offset: String(offset) });
      if (filter.status) params.set("status", filter.status);
      if (filter.departmentId) params.set("departmentId", filter.departmentId);
      if (filter.assignedTo) params.set("assignedTo", filter.assignedTo);
      const [d, meta] = await Promise.all([
        api(`/api/v1/admin/tickets?${params}`),
        api("/api/v1/admin/support/meta")
      ]);
      supportMeta = meta;
      hydrateSupportMeta();
      cachedTickets = d.tickets || [];
      adminTicketsTotal = Number(d.total || 0);
      paintTicketsList();
      bindAdminTicketsListeners();
    } catch (e) {
      host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
    }
  }
  function openTicketDetail(ticketId) {
    const path = `/admin/tickets/${encodeURIComponent(ticketId)}`;
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  async function renderTicketDetail(ticketId) {
    activeTicketId = ticketId;
    const msgBox = document.getElementById("adminTicketMessages");
    if (!msgBox) return;
    msgBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink2)">Loading ticket thread\u2026</div>';
    try {
      const [d, meta] = await Promise.all([api(`/api/v1/admin/tickets/${encodeURIComponent(ticketId)}`), api("/api/v1/admin/support/meta")]);
      supportMeta = meta;
      const subEl = document.getElementById("adminTicketSubject");
      const metaEl = document.getElementById("adminTicketMeta");
      const statusSelect = document.getElementById("adminTicketStatusSelect");
      if (subEl) subEl.textContent = d.ticket.subject;
      if (metaEl)
        metaEl.textContent = `${d.ticket.account_name} \xB7 Customer: ${d.ticket.creator_name} (${d.ticket.creator_email}) \xB7 Created ${formatDate(d.ticket.created_at)}`;
      if (statusSelect) statusSelect.value = d.ticket.status;
      const department = document.getElementById("adminTicketDepartment");
      const assignee = document.getElementById("adminTicketAssignee");
      const priority = document.getElementById("adminTicketPriority");
      const macro = document.getElementById("adminTicketMacro");
      if (department) {
        department.innerHTML = '<option value="">Unrouted</option>' + supportMeta.departments.filter((item) => item.is_active).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
        department.value = d.ticket.department_id || "";
      }
      if (assignee) {
        assignee.innerHTML = '<option value="">Unassigned</option>' + supportMeta.staff.map((item) => `<option value="${esc(item.id)}">${esc(item.name)} \xB7 ${Number(item.active_count || 0)} active</option>`).join("");
        assignee.value = d.ticket.assigned_staff_id || "";
      }
      if (priority) priority.value = d.ticket.priority;
      if (macro) macro.innerHTML = '<option value="">Write custom response</option>' + supportMeta.macros.filter((item) => !item.department_id || item.department_id === d.ticket.department_id).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
      const context = document.getElementById("adminTicketContext");
      if (context) {
        context.innerHTML = `<a class="btn s" href="/admin/accounts/${encodeURIComponent(d.ticket.account_id)}" data-route="account-detail">View customer account</a>${d.ticket.service_id ? `<a class="btn s" href="/admin/services/${encodeURIComponent(d.ticket.service_id)}" data-route="admin-service-detail">View related service</a>` : '<span class="pill">No related service</span>'}${badge(d.ticket.priority)}${badge(d.ticket.status)}`;
      }
      msgBox.innerHTML = d.messages.map(
        (m) => `
        <div style="padding:10px 14px;border-radius:12px;background:${m.is_staff_internal_note ? "var(--warn-bg)" : m.is_staff_author ? "var(--accent-bg)" : "var(--s2)"};border:1px solid ${m.is_staff_internal_note ? "var(--warn)" : "transparent"}">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px">
            <b>${esc(m.author_name)} ${m.is_staff_internal_note ? '<span class="pill warn" style="height:22px;padding:0 8px;font-size:11px">INTERNAL NOTE</span>' : m.is_staff_author ? '<span class="pill acc" style="height:22px;padding:0 8px;font-size:11px">STAFF</span>' : ""}</b>
            <span class="muted">${formatDate(m.created_at)}</span>
          </div>
          ${renderMarkdown(m.body)}
        </div>
      `
      ).join("");
      const attBox = document.getElementById("adminTicketAttachments");
      if (attBox) {
        const atts = d.attachments || [];
        if (atts.length) {
          attBox.innerHTML = "<b>Attachments:</b> " + atts.map(
            (a) => `
            <a class="att-chip" href="/api/v1/tickets/${encodeURIComponent(
              ticketId
            )}/attachments/${encodeURIComponent(a.id)}" target="_blank" download>
              <span>${esc(a.filename)}</span>
              <small class="muted">(${(a.byte_size / 1024).toFixed(1)} KB)</small>
            </a>
          `
          ).join("");
        } else {
          attBox.innerHTML = "";
        }
      }
    } catch (err) {
      msgBox.innerHTML = `<div style="color:var(--bad);padding:20px">Error loading thread: ${esc(err.message)}</div>`;
    }
  }

  // src/frontend/admin/pages/audit/index.ts
  var cachedLogs = [];
  var adminAuditPage = 1;
  var adminAuditQuery = "";
  var adminAuditTotal = 0;
  var adminAuditPageSize = 20;
  var adminAuditListenersBound = false;
  function metadata(value) {
    if (!value) return "\u2014";
    try {
      return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value, null, 2);
    } catch {
      return String(value);
    }
  }
  function targetLink(resourceType, resourceId) {
    const type = String(resourceType || "resource");
    const id = String(resourceId || "\u2014");
    const routes = {
      account: "accounts",
      service: "services",
      ticket: "tickets",
      order: "orders",
      invoice: "billing"
    };
    const section = routes[type];
    return section ? `<a class="btn xs mono" href="/admin/${section}/${encodeURIComponent(id)}">${esc(type)} ${esc(id)}</a>` : `<span class="mono">${esc(type)} ${esc(id)}</span>`;
  }
  function paintAuditList() {
    const host = document.querySelector("#auditList");
    const paginationRow = document.getElementById("adminAuditPaginationRow");
    const infoEl = document.getElementById("adminAuditPageInfo");
    const pagerEl = document.getElementById("adminAuditPager");
    if (!host) return;
    if (!cachedLogs.length) {
      if (paginationRow) paginationRow.style.display = "none";
      host.innerHTML = `<tr><td colspan="7"><div class="empty"><b>No matching audit events.</b></div></td></tr>`;
      return;
    }
    const pages = Math.max(1, Math.ceil(adminAuditTotal / adminAuditPageSize));
    const start = (adminAuditPage - 1) * adminAuditPageSize;
    if (paginationRow) paginationRow.style.display = adminAuditTotal > adminAuditPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = `Showing ${start + 1}\u2013${start + cachedLogs.length} of ${adminAuditTotal}`;
    if (pagerEl) pagerEl.innerHTML = renderPager(adminAuditPage, pages);
    host.innerHTML = cachedLogs.map((x) => `<tr class="h"><td data-l="Time" class="muted mono">${formatDate(x.created_at)}</td><td data-l="Actor"><b>${esc(x.actor_name || x.actor_type)}</b><small>${esc(x.actor_email || x.account_name || "Platform")}</small></td><td data-l="Action">${badge(x.action)}</td><td data-l="Target">${targetLink(x.resource_type, x.resource_id)}</td><td data-l="IP" class="mono muted">${esc(x.ip_address || "\u2014")}</td><td data-l="Correlation" class="mono muted">${esc(x.correlation_id || "\u2014")}</td><td data-l="Context"><details><summary class="btn xs">View</summary><pre class="mono" style="white-space:pre-wrap;max-width:420px;margin-top:8px">${esc(metadata(x.metadata))}</pre></details></td></tr>`).join("");
  }
  function bindAdminAuditListeners() {
    if (adminAuditListenersBound) return;
    adminAuditListenersBound = true;
    const pagerEl = document.getElementById("adminAuditPager");
    pagerEl?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-pg]");
      if (btn && !btn.disabled) {
        const p = Number(btn.dataset.pg);
        if (p && p !== adminAuditPage) {
          void renderAudit(adminAuditQuery, p);
        }
      }
    });
  }
  async function renderAudit(q = "", page = 1) {
    const host = document.querySelector("#auditList");
    if (!host) return;
    try {
      adminAuditQuery = q;
      adminAuditPage = Math.max(1, page);
      const params = new URLSearchParams({ q, limit: String(adminAuditPageSize), offset: String((adminAuditPage - 1) * adminAuditPageSize) });
      const d = await api(`/api/v1/admin/audit?${params}`);
      cachedLogs = d.logs || [];
      adminAuditTotal = Number(d.total || 0);
      paintAuditList();
      bindAdminAuditListeners();
    } catch (e) {
      host.innerHTML = `<tr><td colspan="7"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
    }
  }

  // src/frontend/admin/pages/jobs/index.ts
  var currentQuery = "";
  var currentPage = 1;
  var total = 0;
  var pageSize = 20;
  var listenersBound = false;
  function filters() {
    return {
      type: document.getElementById("jobsTypeFilter")?.value || "",
      status: document.getElementById("jobsStatusFilter")?.value || ""
    };
  }
  function bindListeners() {
    if (listenersBound) return;
    listenersBound = true;
    document.getElementById("adminJobsPager")?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-pg]");
      if (button && !button.disabled) renderJobs(currentQuery, Number(button.dataset.pg) || 1);
    });
    for (const id of ["jobsTypeFilter", "jobsStatusFilter"]) {
      document.getElementById(id)?.addEventListener("change", () => renderJobs(currentQuery, 1));
    }
  }
  async function renderJobs(query = "", page = 1) {
    const host = document.getElementById("jobsList");
    if (!host) return;
    currentQuery = query;
    currentPage = Math.max(1, page);
    const { type, status } = filters();
    const params = new URLSearchParams({ q: query, limit: String(pageSize), offset: String((currentPage - 1) * pageSize) });
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    host.innerHTML = '<tr><td colspan="7"><div class="sk"><i></i><i></i></div></td></tr>';
    try {
      const data = await api(`/api/v1/admin/jobs?${params}`);
      total = Number(data.total || 0);
      host.innerHTML = data.jobs.length ? data.jobs.map((job) => `<tr>
      <td data-l="Type">${badge(job.job_type)}</td>
      <td data-l="Job"><b class="mono">${esc(job.id)}</b><small>${esc(job.subject)}</small></td>
      <td data-l="Resource">${job.job_type === "PROVISIONING" && job.resource_id ? `<a class="btn xs" href="/admin/services/${encodeURIComponent(job.resource_id)}" data-route="admin-service-detail">${esc(job.resource_id)}</a>` : `<span class="mono">${esc(job.resource_id || "\u2014")}</span>`}</td>
      <td data-l="Status">${badge(job.status)}</td>
      <td data-l="Attempts">${Number(job.attempt_count || 0)}</td>
      <td data-l="Last error"><span class="muted">${esc(job.last_error || "\u2014")}</span></td>
      <td data-l="Updated">${formatDate(job.updated_at)}</td>
    </tr>`).join("") : '<tr><td colspan="7"><div class="es"><h4>No matching workflow records</h4><p>Nothing persisted for the selected filters.</p></div></td></tr>';
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const start = (currentPage - 1) * pageSize;
      const info = document.getElementById("adminJobsPageInfo");
      const pager = document.getElementById("adminJobsPager");
      const row2 = document.getElementById("adminJobsPaginationRow");
      if (info) info.textContent = total ? `Showing ${start + 1}\u2013${start + data.jobs.length} of ${total}` : "0 jobs";
      if (pager) pager.innerHTML = renderPager(currentPage, pages);
      if (row2) row2.style.display = total > pageSize ? "flex" : "none";
      bindListeners();
    } catch (error) {
      host.innerHTML = `<tr><td colspan="7"><div class="alert bad"><div><b>Jobs unavailable</b><span>${esc(error.message)}</span></div></div></td></tr>`;
    }
  }

  // src/frontend/admin/pages/staff/index.ts
  var currentQuery2 = "";
  var currentPage2 = 1;
  var total2 = 0;
  var pageSize2 = 20;
  var listenersBound2 = false;
  function bindListeners2() {
    if (listenersBound2) return;
    listenersBound2 = true;
    document.getElementById("adminStaffPager")?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-pg]");
      if (button && !button.disabled) void renderStaff(currentQuery2, Number(button.dataset.pg) || 1);
    });
  }
  async function renderStaff(q = "", page = 1) {
    const host = document.querySelector("#staffList");
    if (!host) return;
    try {
      currentQuery2 = q;
      currentPage2 = Math.max(1, page);
      const params = new URLSearchParams({ q, limit: String(pageSize2), offset: String((currentPage2 - 1) * pageSize2) });
      const d = await api(`/api/v1/admin/staff?${params}`);
      total2 = Number(d.total || 0);
      if (!d.staff.length) {
        host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>No matching staff identities.</b></div></td></tr>`;
        const row3 = document.getElementById("adminStaffPaginationRow");
        if (row3) row3.style.display = "none";
        return;
      }
      host.innerHTML = d.staff.map((x) => `<tr class="h"><td data-l="Member"><div class="row nw"><span class="av v">${esc(x.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase())}</span><div><b>${esc(x.name)}</b><small>${esc(x.email)}</small></div></div></td><td data-l="Role">${badge(x.role)}</td><td data-l="MFA">${badge(x.mfa_enabled ? "READY" : "NOT SET UP")}</td><td data-l="Access">${badge(x.status)}</td><td data-l="Action"><button class="btn xs" data-staff-user-id="${esc(x.id)}" data-staff-name="${esc(x.name)}" data-staff-role="${esc(x.role)}" data-staff-status="${esc(x.status)}" data-permission="staff:manage">Edit</button></td></tr>`).join("");
      const pages = Math.max(1, Math.ceil(total2 / pageSize2));
      const start = (currentPage2 - 1) * pageSize2;
      const info = document.getElementById("adminStaffPageInfo");
      const pager = document.getElementById("adminStaffPager");
      const row2 = document.getElementById("adminStaffPaginationRow");
      if (info) info.textContent = `Showing ${start + 1}\u2013${start + d.staff.length} of ${total2}`;
      if (pager) pager.innerHTML = renderPager(currentPage2, pages);
      if (row2) row2.style.display = total2 > pageSize2 ? "flex" : "none";
      bindListeners2();
    } catch (e) {
      host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
    }
  }
  function openStaffEditor(userId, name, currentRole, currentStatus) {
    const idInput = document.getElementById("adminStaffUserId");
    const titleEl = document.getElementById("adminStaffTitle");
    const metaEl = document.getElementById("adminStaffMeta");
    const roleSelect = document.getElementById("adminStaffRoleSelect");
    const statusSelect = document.getElementById("adminStaffStatusSelect");
    const reasonInput = document.getElementById("adminStaffReason");
    const modal = document.getElementById("modalStaffEditor");
    if (idInput) idInput.value = userId;
    if (titleEl) titleEl.textContent = `Edit Staff: ${name}`;
    if (metaEl) metaEl.textContent = `User ID: ${userId}`;
    if (roleSelect) roleSelect.value = currentRole;
    if (statusSelect) statusSelect.value = currentStatus;
    if (reasonInput) reasonInput.value = "";
    if (modal) modal.hidden = false;
  }

  // src/frontend/admin/pages/operations/index.ts
  function money2(value, currency = "EUR") {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(value || 0) / 100);
  }
  function moneySummary(rows, field) {
    return rows.length ? rows.map((row2) => money2(Number(row2[field] || 0), row2.currency)).join(" \xB7 ") : "\u2014";
  }
  function empty2(message) {
    return `<div class="es"><h4>${esc(message)}</h4><p>No persisted records match the current filter.</p></div>`;
  }
  function metric(label, value, icon, tone = "", detail = "") {
    return `<article class="card mt"><div><span class="l">${esc(label)}</span><b class="v">${esc(String(value))}</b>${detail ? `<small>${esc(detail)}</small>` : ""}</div><span class="tile ${tone}">${hero(icon)}</span></article>`;
  }
  var cachedOrders = [];
  var ordersTotal = 0;
  var ordersQuery = "";
  var ordersPage = 1;
  var ordersPageSize = 10;
  var ordersListenersBound = false;
  function paintOrdersList() {
    const host = document.querySelector("#ordersList");
    const paginationRow = document.getElementById("adminOrdersPaginationRow");
    const infoEl = document.getElementById("adminOrdersPageInfo");
    const pagerEl = document.getElementById("adminOrdersPager");
    if (!host) return;
    if (!cachedOrders.length) {
      if (paginationRow) paginationRow.style.display = "none";
      host.innerHTML = `<tr><td colspan="5">${empty2("No orders")}</td></tr>`;
      return;
    }
    const pages = Math.max(1, Math.ceil(ordersTotal / ordersPageSize));
    const start = (ordersPage - 1) * ordersPageSize;
    if (paginationRow) paginationRow.style.display = ordersTotal > ordersPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = `Showing ${start + 1}\u2013${start + cachedOrders.length} of ${ordersTotal}`;
    if (pagerEl) pagerEl.innerHTML = renderPager(ordersPage, pages);
    host.innerHTML = cachedOrders.map((x) => `<tr class="h" data-order-id="${esc(x.id)}" style="cursor:pointer">
    <td data-l="Order"><b>${esc(x.id)}</b><small>${formatDate(x.created_at)}</small></td>
    <td data-l="Account">${esc(x.account_name)}<small>${esc(x.customer_email)}</small></td>
    <td data-l="Items">${Number(x.item_count)}</td><td data-l="Total"><b>${money2(x.total_minor_units, x.currency)}</b></td>
    <td data-l="Status">${badge(x.status)}</td></tr>`).join("");
  }
  function bindOrdersListeners() {
    if (ordersListenersBound) return;
    ordersListenersBound = true;
    const pagerEl = document.getElementById("adminOrdersPager");
    pagerEl?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-pg]");
      if (btn && !btn.disabled) {
        const p = Number(btn.dataset.pg);
        if (p && p !== ordersPage) {
          ordersPage = p;
          renderOrders(ordersQuery, p);
        }
      }
    });
  }
  async function renderOrders(q = "", page = 1) {
    const host = document.querySelector("#ordersList");
    if (!host) return;
    try {
      ordersQuery = q;
      ordersPage = Math.max(1, page);
      const offset = (ordersPage - 1) * ordersPageSize;
      const data = await api(`/api/v1/admin/orders?q=${encodeURIComponent(q)}&limit=${ordersPageSize}&offset=${offset}`);
      const orders = data.orders || [];
      const metrics = document.querySelector("#orderMetrics");
      if (metrics) {
        const count = (pattern) => (data.summary || []).filter((item) => pattern.test(item.status)).reduce((sum, item) => sum + Number(item.count), 0);
        const pending = count(/DRAFT|AWAITING_PAYMENT|FULFILLING/);
        const settled = count(/PAID|COMPLETED/);
        const attention = count(/FAILED|CANCELED|PARTIALLY_FULFILLED/);
        metrics.innerHTML = metric("Orders", data.total, "cube") + metric("Settled", settled, "check", "good") + metric("In progress", pending, "refresh", pending ? "warn" : "good") + metric("Needs attention", attention, "warning", attention ? "bad" : "good");
      }
      cachedOrders = orders || [];
      ordersTotal = Number(data.total || 0);
      paintOrdersList();
      bindOrdersListeners();
    } catch (error) {
      host.innerHTML = `<tr><td colspan="5">${empty2(error.message)}</td></tr>`;
    }
  }
  var cachedInvoices = [];
  var cachedCreditNotes = [];
  var invoicesTotal = 0;
  var creditsTotal = 0;
  var billingQuery = "";
  var invoicesPage = 1;
  var creditsPage = 1;
  var adminBillingPageSize = 10;
  var billingOpsListenersBound = false;
  function paintAdminInvoicesList() {
    const invoiceHost = document.querySelector("#invoicesList");
    const paginationRow = document.getElementById("adminInvoicesPaginationRow");
    const infoEl = document.getElementById("adminInvoicesPageInfo");
    const pagerEl = document.getElementById("adminInvoicesPager");
    if (!invoiceHost) return;
    if (!cachedInvoices.length) {
      if (paginationRow) paginationRow.style.display = "none";
      invoiceHost.innerHTML = `<tr><td colspan="6">${empty2("No invoices")}</td></tr>`;
      return;
    }
    const pages = Math.max(1, Math.ceil(invoicesTotal / adminBillingPageSize));
    const start = (invoicesPage - 1) * adminBillingPageSize;
    if (paginationRow) paginationRow.style.display = invoicesTotal > adminBillingPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = `Showing ${start + 1}\u2013${start + cachedInvoices.length} of ${invoicesTotal}`;
    if (pagerEl) pagerEl.innerHTML = renderPager(invoicesPage, pages);
    invoiceHost.innerHTML = cachedInvoices.map((x) => `<tr class="h" data-invoice-id="${esc(x.id)}" style="cursor:pointer">
    <td data-l="Invoice"><b>${esc(x.invoice_number || x.id)}</b><small>${esc(x.id)}</small></td>
    <td data-l="Account">${esc(x.account_name)}<small>${esc(x.customer_email)}</small></td>
    <td data-l="Due">${x.due_date ? formatDate(x.due_date) : "\u2014"}</td>
    <td data-l="Paid">${money2(x.amount_paid_minor_units, x.currency)} / <b>${money2(x.total_minor_units, x.currency)}</b></td>
    <td data-l="Status">${badge(x.status)}</td>
    <td data-l="Action">${x.status === "PAID" ? `<button class="btn xs" data-refund-invoice="${esc(x.id)}" data-refund-max="${Number(x.amount_paid_minor_units)}" data-refund-currency="${esc(x.currency)}" data-permission="accounts:manage">Refund</button>` : ""}</td></tr>`).join("");
  }
  function paintAdminCreditsList() {
    const creditHost = document.querySelector("#creditNotesList");
    const paginationRow = document.getElementById("adminCreditsPaginationRow");
    const infoEl = document.getElementById("adminCreditsPageInfo");
    const pagerEl = document.getElementById("adminCreditsPager");
    if (!creditHost) return;
    if (!cachedCreditNotes.length) {
      if (paginationRow) paginationRow.style.display = "none";
      creditHost.innerHTML = `<tr><td colspan="6">${empty2("No credit notes")}</td></tr>`;
      return;
    }
    const pages = Math.max(1, Math.ceil(creditsTotal / adminBillingPageSize));
    const start = (creditsPage - 1) * adminBillingPageSize;
    if (paginationRow) paginationRow.style.display = creditsTotal > adminBillingPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = `Showing ${start + 1}\u2013${start + cachedCreditNotes.length} of ${creditsTotal}`;
    if (pagerEl) pagerEl.innerHTML = renderPager(creditsPage, pages);
    creditHost.innerHTML = cachedCreditNotes.map((x) => `<tr>
    <td data-l="Credit note"><b>${esc(x.credit_note_number)}</b><small>${esc(x.id)}</small></td>
    <td data-l="Invoice">${esc(x.invoice_number)}</td><td data-l="Account">${esc(x.account_name)}</td>
    <td data-l="Amount"><b>${money2(x.amount_minor_units, x.currency)}</b></td><td data-l="Reason">${esc(x.reason)}</td>
    <td data-l="Created">${formatDate(x.created_at)}</td></tr>`).join("");
  }
  function bindBillingOpsListeners() {
    if (billingOpsListenersBound) return;
    billingOpsListenersBound = true;
    document.getElementById("adminInvoicesPager")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-pg]");
      if (btn && !btn.disabled) {
        const p = Number(btn.dataset.pg);
        if (p && p !== invoicesPage) {
          invoicesPage = p;
          renderBilling(billingQuery, p, creditsPage);
        }
      }
    });
    document.getElementById("adminCreditsPager")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-pg]");
      if (btn && !btn.disabled) {
        const p = Number(btn.dataset.pg);
        if (p && p !== creditsPage) {
          creditsPage = p;
          renderBilling(billingQuery, invoicesPage, p);
        }
      }
    });
  }
  async function renderBilling(q = "", invoicePage = 1, creditPage = 1) {
    const invoiceHost = document.querySelector("#invoicesList");
    const creditHost = document.querySelector("#creditNotesList");
    if (!invoiceHost || !creditHost) return;
    try {
      billingQuery = q;
      invoicesPage = Math.max(1, invoicePage);
      creditsPage = Math.max(1, creditPage);
      const [invoiceData, creditData] = await Promise.all([
        api(`/api/v1/admin/invoices?q=${encodeURIComponent(q)}&limit=${adminBillingPageSize}&offset=${(invoicesPage - 1) * adminBillingPageSize}`),
        api(`/api/v1/admin/credit-notes?q=${encodeURIComponent(q)}&limit=${adminBillingPageSize}&offset=${(creditsPage - 1) * adminBillingPageSize}`)
      ]);
      const metrics = document.querySelector("#billingMetrics");
      if (metrics) {
        const overdue = invoiceData.summary.reduce((sum, row2) => sum + Number(row2.overdue_count || 0), 0);
        metrics.innerHTML = metric("Invoices", invoiceData.total, "document") + metric("Collected", moneySummary(invoiceData.summary, "paid_minor_units"), "check", "good") + metric("Outstanding", moneySummary(invoiceData.summary, "outstanding_minor_units"), "warning", overdue ? "warn" : "good", `${overdue} overdue`) + metric("Credits issued", moneySummary(creditData.summary, "credited_minor_units"), "credit", creditData.total ? "info" : "");
      }
      cachedInvoices = invoiceData.invoices || [];
      cachedCreditNotes = creditData.creditNotes || [];
      invoicesTotal = Number(invoiceData.total || 0);
      creditsTotal = Number(creditData.total || 0);
      paintAdminInvoicesList();
      paintAdminCreditsList();
      bindBillingOpsListeners();
    } catch (error) {
      invoiceHost.innerHTML = `<tr><td colspan="6">${empty2(error.message)}</td></tr>`;
    }
  }
  async function renderOrderDetail(orderId) {
    const host = document.getElementById("adminOrderDetailBody");
    if (!host) return;
    host.innerHTML = '<div class="sk" role="status" aria-label="Loading order"><i></i><i></i><i></i></div>';
    try {
      const data = await api(`/api/v1/admin/orders/${encodeURIComponent(orderId)}`);
      const order = data.order;
      const title = document.getElementById("adminOrderTitle");
      const meta = document.getElementById("adminOrderMeta");
      if (title) title.textContent = `Order ${order.id}`;
      if (meta) meta.textContent = `${order.account_name} \xB7 ${order.customer_email} \xB7 created ${formatDate(order.created_at)}`;
      host.innerHTML = `
      <div class="g g4 k2">
        ${metric("Order state", order.status, "cube")}
        ${metric("Total", money2(order.total_minor_units, order.currency), "credit")}
        ${metric("Items", data.items.length, "server")}
        ${metric("Invoices", data.invoices.length, "document")}
      </div>
      <div class="row wrap"><a class="btn s" href="/admin/accounts/${encodeURIComponent(order.account_id)}" data-route="account-detail">Customer account</a>${badge(order.status)}<span class="pill mono">${esc(order.currency)}</span></div>
      <article class="card table-card"><div class="ch"><div class="tx"><h3>Fulfillment</h3><p>Payment, item fulfillment and provisioning are shown as separate states.</p></div></div><div class="table-scroll"><table class="tbl rsp"><thead><tr><th>Product</th><th>Region</th><th>Price</th><th>Fulfillment</th><th>Provisioning</th><th>Service</th></tr></thead><tbody>
        ${data.items.map((item) => `<tr><td><b>${esc(item.product_name)}</b><small>${esc(item.plan_name)}</small></td><td>${esc(item.region_name)}</td><td>${item.unit_price_minor_units == null ? "\u2014" : money2(item.unit_price_minor_units, order.currency)}</td><td>${badge(item.fulfillment_status)}</td><td>${item.provision_status ? badge(item.provision_status) : '<span class="muted">Not queued</span>'}${item.last_error ? `<small class="bad">${esc(item.last_error)}</small>` : ""}</td><td>${item.service_id ? `<a class="btn xs" href="/admin/services/${encodeURIComponent(item.service_id)}" data-route="admin-service-detail">Manage</a>` : "\u2014"}</td></tr>`).join("") || '<tr><td colspan="6">No order items.</td></tr>'}
      </tbody></table></div></article>
      <div class="g g2">
        <article class="card"><div class="ch"><div class="tx"><h3>Related invoices</h3><p>Authoritative accounting state.</p></div></div><div class="col">${data.invoices.map((invoice) => `<a class="li" href="/admin/billing/${encodeURIComponent(invoice.id)}" data-route="invoice-detail"><span class="tx"><b>${esc(invoice.invoice_number || invoice.id)}</b><small>Due ${formatDate(invoice.due_date)}</small></span><b>${money2(invoice.total_minor_units, invoice.currency)}</b>${badge(invoice.status)}</a>`).join("") || empty2("No invoice linked")}</div></article>
        <article class="card"><div class="ch"><div class="tx"><h3>Order audit</h3><p>Correlation-aware lifecycle evidence.</p></div></div><div class="col">${data.audit.map((event) => `<div class="li h"><span class="tx"><b>${esc(event.action)}</b><small>${esc(event.correlation_id || "No correlation id")} \xB7 ${formatDate(event.created_at)}</small></span></div>`).join("") || empty2("No order audit events")}</div></article>
      </div>`;
    } catch (error) {
      host.innerHTML = `<div class="alert bad"><div><b>Order unavailable</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
  async function renderInvoiceDetail(invoiceId) {
    const host = document.getElementById("adminInvoiceDetailBody");
    if (!host) return;
    host.innerHTML = '<div class="sk" role="status" aria-label="Loading invoice"><i></i><i></i><i></i></div>';
    try {
      const data = await api(`/api/v1/admin/invoices/${encodeURIComponent(invoiceId)}`);
      const invoice = data.invoice;
      const balance = Math.max(0, Number(invoice.total_minor_units) - Number(invoice.amount_paid_minor_units));
      const title = document.getElementById("adminInvoiceTitle");
      const meta = document.getElementById("adminInvoiceMeta");
      if (title) title.textContent = invoice.invoice_number || invoice.id;
      if (meta) meta.textContent = `${invoice.account_name} \xB7 ${invoice.customer_email} \xB7 issued ${formatDate(invoice.created_at)}`;
      host.innerHTML = `
      <div class="g g4 k2">
        ${metric("Invoice state", invoice.status, "document")}
        ${metric("Total", money2(invoice.total_minor_units, invoice.currency), "credit")}
        ${metric("Paid", money2(invoice.amount_paid_minor_units, invoice.currency), "check", invoice.amount_paid_minor_units ? "good" : "")}
        ${metric("Balance", money2(balance, invoice.currency), "warning", balance ? "warn" : "good")}
      </div>
      <div class="row wrap"><a class="btn s" href="/admin/accounts/${encodeURIComponent(invoice.account_id)}" data-route="account-detail">Customer account</a>${invoice.order_id ? `<a class="btn s" href="/admin/orders/${encodeURIComponent(invoice.order_id)}" data-route="order-detail">Related order</a>` : ""}${badge(invoice.status)}${invoice.status === "PAID" && Number(invoice.amount_paid_minor_units) > 0 ? `<button class="btn s" data-refund-invoice="${esc(invoice.id)}" data-refund-max="${Number(invoice.amount_paid_minor_units)}" data-refund-currency="${esc(invoice.currency)}" data-permission="accounts:manage">Refund</button>` : ""}</div>
      <article class="card table-card"><div class="ch"><div class="tx"><h3>Invoice lines</h3><p>Persisted fiscal line items and tax basis points.</p></div></div><div class="table-scroll"><table class="tbl rsp"><thead><tr><th>Description</th><th>Quantity</th><th>Unit price</th><th>Tax</th><th>Total</th></tr></thead><tbody>${data.lines.map((line) => `<tr><td><b>${esc(line.description)}</b></td><td>${Number(line.quantity)}</td><td>${money2(line.unit_price_minor_units, invoice.currency)}</td><td>${(Number(line.tax_rate_basis_points) / 100).toFixed(2)}%</td><td><b>${money2(line.total_minor_units, invoice.currency)}</b></td></tr>`).join("") || '<tr><td colspan="5">No invoice lines.</td></tr>'}</tbody></table></div></article>
      <div class="g g2">
        <article class="card"><div class="ch"><div class="tx"><h3>Payments</h3><p>PSP attempts remain distinct from invoice settlement.</p></div></div><div class="col">${data.payments.map((payment) => `<div class="li h"><span class="tx"><b>${money2(payment.amount_minor_units, payment.currency)} via ${esc(payment.psp_name)}</b><small>${esc(payment.psp_payment_intent_id || payment.id)} \xB7 ${formatDate(payment.created_at)}</small></span>${badge(payment.status)}</div>`).join("") || empty2("No payment attempts")}</div></article>
        <article class="card"><div class="ch"><div class="tx"><h3>Credits & refunds</h3><p>PSP refund state and fiscal credit notes.</p></div></div><div class="col">${data.refunds.map((refund) => `<div class="li h"><span class="tx"><b>${money2(refund.amount_minor_units, invoice.currency)}</b><small>${esc(refund.reason)} \xB7 ${esc(refund.psp_refund_id || "PSP reference pending")}</small></span>${badge(refund.status)}</div>`).join("")}${data.creditNotes.map((note) => `<div class="li h"><span class="tx"><b>${esc(note.credit_note_number)}</b><small>${esc(note.reason)}</small></span><b>${money2(note.amount_minor_units, invoice.currency)}</b></div>`).join("") || (!data.refunds.length ? empty2("No credits or refunds") : "")}</div></article>
        <article class="card"><div class="ch"><div class="tx"><h3>Related services</h3><p>Services fulfilled by the linked order.</p></div></div><div class="col">${data.services.map((service) => `<a class="li" href="/admin/services/${encodeURIComponent(service.id)}" data-route="admin-service-detail"><span class="tx"><b>${esc(service.plan_name || service.product_name)}</b><small>${esc(service.identifier || service.id)}</small></span>${badge(service.contract_status)}</a>`).join("") || empty2("No related services")}</div></article>
        <article class="card"><div class="ch"><div class="tx"><h3>Invoice audit</h3><p>Security and accounting mutations.</p></div></div><div class="col">${data.audit.map((event) => `<div class="li h"><span class="tx"><b>${esc(event.action)}</b><small>${esc(event.correlation_id || "No correlation id")} \xB7 ${formatDate(event.created_at)}</small></span></div>`).join("") || empty2("No invoice audit events")}</div></article>
      </div>`;
    } catch (error) {
      host.innerHTML = `<div class="alert bad"><div><b>Invoice unavailable</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
  async function renderInfrastructure() {
    const regionsHost = document.querySelector("#capacityRegions");
    const nodesHost = document.querySelector("#capacityNodes");
    if (!regionsHost || !nodesHost) return;
    try {
      const data = await api("/api/v1/admin/capacity");
      const metrics = document.querySelector("#infrastructureMetrics");
      if (metrics) {
        const services = data.nodes.reduce((sum, x) => sum + Number(x.active_service_count || 0), 0);
        const allocatedMemory = data.nodes.reduce((sum, x) => sum + Number(x.allocated_memory_mb || 0), 0);
        const maintenance = data.nodes.filter((x) => Boolean(x.maintenance_mode)).length;
        metrics.innerHTML = metric("Regions", data.regions.length, "servers") + metric("Nodes", data.nodes.length, "server") + metric("Active services", services, "cube", "good", `${Math.round(allocatedMemory / 1024)} GB allocated`) + metric("Maintenance", maintenance, "warning", maintenance ? "warn" : "good");
      }
      regionsHost.innerHTML = data.regions.length ? data.regions.map((x) => {
        const used = x.total_memory_mb ? Math.round(x.allocated_memory_mb / x.total_memory_mb * 100) : 0;
        return `<article class="cap"><div><b>${esc(x.name)}</b><small>${esc(x.code)} \xB7 ${esc(x.country)} \xB7 ${x.node_count} nodes</small></div>${badge(x.is_active ? "ACTIVE" : "INACTIVE")}<div class="meter"><i style="width:${Math.min(used, 100)}%"></i></div><small>${used}% memory allocated</small></article>`;
      }).join("") : empty2("No configured capacity regions");
      nodesHost.innerHTML = data.nodes.length ? data.nodes.map((x) => `<tr><td data-l="Node"><b>${esc(x.name)}</b><small>${esc(x.fqdn)}</small></td><td data-l="Region">${esc(x.region_name)}</td><td data-l="Services">${Number(x.active_service_count)}</td><td data-l="Memory">${Math.round(x.allocated_memory_mb / 1024)} / ${Math.round(x.max_memory_mb / 1024)} GB</td><td data-l="Disk">${Math.round(x.allocated_disk_mb / 1024)} / ${Math.round(x.max_disk_mb / 1024)} GB</td><td data-l="Mode">${badge(x.maintenance_mode ? "MAINTENANCE" : "AVAILABLE")}</td></tr>`).join("") : `<tr><td colspan="6">${empty2("No configured nodes")}</td></tr>`;
    } catch (error) {
      regionsHost.innerHTML = empty2(error.message);
    }
  }
  async function renderStatus() {
    const componentsHost = document.querySelector("#statusComponents");
    const incidentsHost = document.querySelector("#statusIncidents");
    if (!componentsHost || !incidentsHost) return;
    try {
      const data = await api("/api/v1/status");
      const metrics = document.querySelector("#statusMetrics");
      if (metrics) {
        const operational = data.components.filter((x) => x.status === "OPERATIONAL").length;
        const degraded = data.components.length - operational;
        metrics.innerHTML = metric("Components", data.components.length, "servers") + metric("Operational", operational, "check", "good") + metric("Degraded", degraded, "warning", degraded ? "warn" : "good") + metric("Active incidents", data.activeIncidents.length, "support", data.activeIncidents.length ? "bad" : "good");
      }
      const headline = document.querySelector("#statusHeadline");
      if (headline) headline.innerHTML = `<b>${esc(data.headline)}</b>${badge(data.indicator)}`;
      componentsHost.innerHTML = data.components.map((x) => `<article class="li"><span class="tx"><b>${esc(x.name)}</b><small>${esc(x.groupName)} \xB7 updated ${formatDate(x.updatedAt)}</small></span>${badge(x.status)}<button class="btn xs" data-component-id="${esc(x.id)}" data-component-status="${esc(x.status)}" data-permission="services:manage">Change</button></article>`).join("") || empty2("No status components");
      const incidents = [...data.activeIncidents, ...data.pastIncidents];
      incidentsHost.innerHTML = incidents.map((x) => `<article class="li"><span class="tx"><b>${esc(x.title)}</b><small>${x.updates.length} updates \xB7 ${formatDate(x.updatedAt)}</small></span>${badge(x.impact)}${badge(x.status)}${x.status !== "RESOLVED" ? `<button class="btn xs" data-incident-id="${esc(x.id)}" data-permission="services:manage">Update</button>` : ""}</article>`).join("") || empty2("No incidents recorded");
    } catch (error) {
      componentsHost.innerHTML = empty2(error.message);
    }
  }

  // src/frontend/admin/pages/settings/index.ts
  async function renderSettings() {
    try {
      const data = await api("/api/v1/admin/settings");
      const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      };
      const setPill = (id, active, yes, no) => {
        const element = document.getElementById(id);
        if (!element) return;
        element.className = `pill ${active ? "good d" : "warn d"}`;
        element.textContent = active ? yes : no;
      };
      setPill("settingsProviderPill", data.provider.configured, "Configured", "Not configured");
      setText("settingsProviderMode", data.provider.mode.toUpperCase());
      setText("settingsProviderUrl", data.provider.panelUrl || "Not configured");
      setText("settingsProviderTier", data.provider.verificationTier || "Not configured");
      setText("settingsProviderCreds", data.provider.configured ? "Present (masked)" : "Missing");
      setPill("settingsPaymentsPill", data.payments.configured, "Configured", "Not configured");
      setText("settingsPaymentsMode", data.payments.mode.toUpperCase());
      setText("settingsPaymentsCurrency", `${data.payments.currency} (minor units: cents)`);
      setText("settingsWebhookStatus", data.payments.webhookSecretConfigured ? "Configured (masked)" : "Missing");
      setPill("settingsEmailPill", data.email.configured, "Configured", "Not configured");
      setText("settingsEmailMode", data.email.mode.toUpperCase());
      setText("settingsEmailHost", data.email.host ? `${data.email.host}${data.email.port ? `:${data.email.port}` : ""}` : "Not configured");
      setText("settingsEmailFrom", data.email.from || "Not configured");
      setPill("settingsSecurityPill", data.security.staffMfaMandatory, "Enforced", "Not enforced");
      setText("settingsStaffMfa", data.security.staffMfaMandatory ? "Required for staff operations" : "Not required");
      setText("settingsSessionTtl", `${data.security.sessionTtlHours} hours`);
      setText("settingsStepUpTtl", `${data.security.stepUpTtlMinutes} minutes`);
      setText("settingsSsrf", data.security.antiSsrBlacklistActive ? "Private and metadata networks blocked" : "Not active");
    } catch (err) {
      const testResult = document.getElementById("providerTestResult");
      if (testResult) {
        testResult.hidden = false;
        testResult.className = "alert bad";
        testResult.innerHTML = `<div><b>Error loading settings</b><span>${esc(err.message)}</span></div>`;
      }
    }
  }
  async function testProviderConnection() {
    const btn = document.getElementById("testProviderBtn");
    const resultDiv = document.getElementById("providerTestResult");
    if (!btn || !resultDiv) return;
    btn.disabled = true;
    btn.innerHTML = "Testing live connectivity\u2026";
    resultDiv.hidden = true;
    try {
      const res = await api("/api/v1/admin/settings/test-provider", { method: "POST" });
      resultDiv.hidden = false;
      resultDiv.className = "alert good";
      resultDiv.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span class="tile sm good">${hero("shield")}</span>
        <div>
          <b>Pterodactyl Application API Connected (${res.latencyMs}ms)</b>
          <p style="margin:2px 0 0 0;font-size:12px">
            Discovered <b>${res.nodesCount}</b> nodes, <b>${res.nestsCount}</b> nests, and <b>${res.eggsCount}</b> eggs available for catalog assignment.
          </p>
        </div>
      </div>
    `;
    } catch (err) {
      resultDiv.hidden = false;
      resultDiv.className = "alert bad";
      resultDiv.innerHTML = `
      <div>
        <b>Provider Ping Failed</b>
        <p style="margin:2px 0 0 0;font-size:12px">${esc(err.message)}</p>
      </div>
    `;
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${hero("activity", "xs")} Test API connection`;
    }
  }

  // src/frontend/admin/index.ts
  var adminShell = new AdminShell();
  var router = new Router(ADMIN_ROUTES);
  function updateAdminChrome(routeName) {
    const titles = {
      overview: ["Operations overview", "Real platform records, without simulated operational controls."],
      accounts: ["Customer accounts", "Ownership, membership and workload counts. Click an account to inspect or lock."],
      "account-detail": ["Customer account", "Identity, access, services, billing and support context."],
      services: ["Service inventory", "Contract and provider-observed state."],
      "admin-service-detail": ["Service operations", "Provider state, allocation, lifecycle controls and audit history."],
      orders: ["Orders", "Commercial order lifecycle and fulfillment state."],
      "order-detail": ["Order detail", "Payment, fulfillment, provisioning and related service records."],
      billing: ["Billing operations", "Invoices, credit notes and payment state."],
      "invoice-detail": ["Invoice detail", "Authoritative lines, payments, refunds and related services."],
      infrastructure: ["Infrastructure", "Capacity pools and provider readiness."],
      catalog: ["Catalog & providers", "Products stay private until plans are mapped to real provider inventory."],
      tickets: ["Support queue", "Real customer threads. Click a ticket to view and reply."],
      "admin-ticket-detail": ["Support ticket", "Customer and service context, complete thread and staff actions."],
      audit: ["Global audit trail", "Security-relevant events across accounts."],
      jobs: ["Operational jobs", "Provisioning, outbox, email and webhook workflow state."],
      staff: ["Staff access", "Persisted roles, access status and MFA readiness. Click to edit role."],
      status: ["System status", "Components and customer-visible incidents."],
      settings: ["Platform settings & integrations", "Environment configuration, payment modes, transactional mail, and hypervisor API diagnostics."]
    };
    const titleEntry = titles[routeName] ?? titles.overview;
    const pageTitle = document.querySelector("#pageTitle");
    const pageSubtitle = document.querySelector("#pageSubtitle");
    if (pageTitle) pageTitle.textContent = titleEntry[0];
    if (pageSubtitle) pageSubtitle.textContent = titleEntry[1];
    document.querySelectorAll(".page").forEach((x) => {
      x.classList.toggle("on", x.id === `page-${routeName}`);
    });
  }
  router.register("overview", async () => {
    updateAdminChrome("overview");
    await renderOverview();
  });
  router.register("accounts", async () => {
    updateAdminChrome("accounts");
    await renderAccounts();
  });
  router.register("account-detail", async (match) => {
    updateAdminChrome("account-detail");
    await renderAccountDetail(match.params.id);
  });
  router.register("services", async () => {
    updateAdminChrome("services");
    await renderServices();
  });
  router.register("admin-service-detail", async (match) => {
    updateAdminChrome("admin-service-detail");
    await renderServiceDetail(match.params.id);
  });
  router.register("orders", async () => {
    updateAdminChrome("orders");
    await renderOrders();
  });
  router.register("order-detail", async (match) => {
    updateAdminChrome("order-detail");
    await renderOrderDetail(match.params.id);
  });
  router.register("billing", async () => {
    updateAdminChrome("billing");
    await renderBilling();
  });
  router.register("invoice-detail", async (match) => {
    updateAdminChrome("invoice-detail");
    await renderInvoiceDetail(match.params.id);
  });
  router.register("infrastructure", async () => {
    updateAdminChrome("infrastructure");
    await renderInfrastructure();
  });
  router.register("catalog", async () => {
    updateAdminChrome("catalog");
    await renderCatalog();
  });
  router.register("tickets", async () => {
    updateAdminChrome("tickets");
    await renderTickets();
  });
  router.register("admin-ticket-detail", async (match) => {
    updateAdminChrome("admin-ticket-detail");
    await renderTicketDetail(match.params.id);
  });
  router.register("audit", async () => {
    updateAdminChrome("audit");
    await renderAudit();
  });
  router.register("jobs", async () => {
    updateAdminChrome("jobs");
    await renderJobs();
  });
  router.register("staff", async () => {
    updateAdminChrome("staff");
    await renderStaff();
  });
  router.register("status", async () => {
    updateAdminChrome("status");
    await renderStatus();
  });
  router.register("settings", async () => {
    updateAdminChrome("settings");
    await renderSettings();
  });
  function openOperation(kind, id, maxAmount = 0, currency = "EUR") {
    const titles = { suspend: "Suspend service", unsuspend: "Unsuspend service", terminate: "Terminate service", refund: "Refund invoice" };
    document.getElementById("operationKind").value = kind;
    document.getElementById("operationId").value = id;
    document.getElementById("operationTitle").textContent = titles[kind] || "Confirm operation";
    document.getElementById("operationReason").value = "";
    const amountField = document.getElementById("operationAmountField");
    amountField.hidden = kind !== "refund";
    const amount = document.getElementById("operationAmount");
    amount.required = kind === "refund";
    amount.max = String(maxAmount);
    amount.value = kind === "refund" ? String(maxAmount) : "";
    const help = document.getElementById("operationAmountHelp");
    if (help) help.textContent = `Maximum refundable: ${new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(maxAmount / 100)}`;
    const modal = document.getElementById("modalOperation");
    if (modal) modal.hidden = false;
  }
  function openIncident(id) {
    document.getElementById("incidentId").value = id || "";
    document.getElementById("incidentModalTitle").textContent = id ? "Publish incident update" : "Declare incident";
    document.getElementById("incidentTitleField").hidden = Boolean(id);
    document.getElementById("incidentTitle").required = !id;
    const modal = document.getElementById("modalIncident");
    if (modal) modal.hidden = false;
  }
  function bindAdminEvents() {
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (target.closest('#themeToggleBtn, [data-act="theme"]')) {
        adminShell.toggleTheme();
        return;
      }
      const link = target.closest("a[data-route]");
      if (link && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        router.navigate(link.href);
        return;
      }
      const ticketRow = target.closest("[data-ticket-id]");
      if (ticketRow) {
        openTicketDetail(ticketRow.dataset.ticketId);
        return;
      }
      const accountRow = target.closest("[data-account-id]");
      if (accountRow) {
        openAccountDetail(accountRow.dataset.accountId);
        return;
      }
      const staffRow = target.closest("[data-staff-user-id]");
      if (staffRow) {
        openStaffEditor(
          staffRow.dataset.staffUserId,
          staffRow.dataset.staffName,
          staffRow.dataset.staffRole,
          staffRow.dataset.staffStatus
        );
        return;
      }
      if (target.closest("[data-new-product]")) {
        openProductCreator();
        return;
      }
      const createFromEgg = target.closest("[data-create-from-egg]");
      if (createFromEgg) {
        openCreateProductFromEgg(Number(createFromEgg.dataset.createFromEgg));
        return;
      }
      const newPlan = target.closest("[data-new-plan-product]");
      if (newPlan) {
        openPlanCreator(newPlan.dataset.newPlanProduct);
        return;
      }
      const publish = target.closest("[data-product-publish]");
      if (publish) {
        setProductPublished(publish.dataset.productId, publish.dataset.productPublish === "true").catch((error) => toast(error.message, "bad"));
        return;
      }
      const planStatus = target.closest("[data-plan-status]");
      if (planStatus) {
        setPlanStatus(planStatus.dataset.planId, planStatus.dataset.planStatus).catch((error) => toast(error.message, "bad"));
        return;
      }
      const serviceAction = target.closest("[data-service-action]");
      if (serviceAction) {
        openOperation(serviceAction.dataset.serviceAction, serviceAction.dataset.serviceId);
        return;
      }
      const serviceRow = target.closest("[data-service-id]");
      if (serviceRow) {
        openServiceDetail(serviceRow.dataset.serviceId);
        return;
      }
      const refund = target.closest("[data-refund-invoice]");
      if (refund) {
        openOperation("refund", refund.dataset.refundInvoice, Number(refund.dataset.refundMax || 0), refund.dataset.refundCurrency || "EUR");
        return;
      }
      const orderRow = target.closest("[data-order-id]");
      if (orderRow) {
        router.navigate("order-detail", { id: orderRow.dataset.orderId });
        return;
      }
      const invoiceRow = target.closest("[data-invoice-id]");
      if (invoiceRow) {
        router.navigate("invoice-detail", { id: invoiceRow.dataset.invoiceId });
        return;
      }
      if (target.closest("[data-add-staff]")) {
        const m = document.getElementById("modalAddStaff");
        if (m) m.hidden = false;
        return;
      }
      if (target.closest("[data-new-incident]")) {
        openIncident();
        return;
      }
      const incident = target.closest("[data-incident-id]");
      if (incident) {
        openIncident(incident.dataset.incidentId);
        return;
      }
      const component = target.closest("[data-component-id]");
      if (component) {
        document.getElementById("componentId").value = component.dataset.componentId;
        document.getElementById("componentStatus").value = component.dataset.componentStatus;
        const m = document.getElementById("modalComponent");
        if (m) m.hidden = false;
        return;
      }
      if (target.closest("[data-close-staff-modal]")) {
        const m = document.getElementById("modalStaffEditor");
        if (m) m.hidden = true;
      }
      if (target.closest("[data-close-stepup-modal]")) {
        const m = document.getElementById("modalStepUp");
        if (m) m.hidden = true;
      }
      if (target.closest("[data-close-catalog-product]")) {
        const m = document.getElementById("modalCatalogProduct");
        if (m) m.hidden = true;
      }
      if (target.closest("[data-close-catalog-plan]")) {
        const m = document.getElementById("modalCatalogPlan");
        if (m) m.hidden = true;
      }
      if (target.closest("[data-close-egg-modal]")) {
        const m = document.getElementById("modalCreateProductFromEgg");
        if (m) m.hidden = true;
      }
      if (target.closest("#testProviderBtn")) {
        testProviderConnection().catch((err) => toast(err.message, "bad"));
        return;
      }
      if (target.closest("#refreshSettingsBtn")) {
        renderSettings().then(() => toast("Settings reloaded", "good")).catch((err) => toast(err.message, "bad"));
        return;
      }
      for (const [selector, id] of [["[data-close-operation]", "modalOperation"], ["[data-close-add-staff]", "modalAddStaff"], ["[data-close-incident]", "modalIncident"], ["[data-close-component]", "modalComponent"]]) {
        if (target.closest(selector)) {
          const m = document.getElementById(id);
          if (m) m.hidden = true;
        }
      }
      if (target.closest("[data-cmd]")) {
        adminShell.cmd.open();
        return;
      }
      const filterButton = target.closest("[data-filter-value]");
      if (filterButton) {
        const group = filterButton.closest("[data-filter-target]");
        if (!group) return;
        group.querySelectorAll("[data-filter-value]").forEach((button) => button.setAttribute("aria-selected", String(button === filterButton)));
        const value = filterButton.dataset.filterValue || "ALL";
        const list = document.getElementById(group.dataset.filterTarget || "");
        list?.querySelectorAll("[data-filter-state]").forEach((item) => {
          item.hidden = value !== "ALL" && item.dataset.filterState !== value;
        });
        return;
      }
    });
    document.addEventListener("submit", async (event) => {
      const form = event.target;
      const handled = ["adminAccountNoteForm", "adminBillingProfileForm", "adminTicketRoutingForm", "supportDepartmentForm", "supportMacroForm"];
      if (!handled.includes(form.id)) return;
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const values = new FormData(form);
        if (form.id === "adminAccountNoteForm") {
          const accountId = getActiveAccountId();
          if (!accountId) return;
          await api(`/api/v1/admin/accounts/${encodeURIComponent(accountId)}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: values.get("body") })
          });
          toast("Administrative note saved.", "good");
          await renderAccountDetail(accountId);
        } else if (form.id === "adminBillingProfileForm") {
          const accountId = getActiveAccountId();
          if (!accountId) return;
          await api(`/api/v1/admin/accounts/${encodeURIComponent(accountId)}/billing-profile`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(values.entries()))
          });
          toast("Billing profile updated and audited.", "good");
          await renderAccountDetail(accountId);
        } else if (form.id === "adminTicketRoutingForm") {
          const ticketId = getActiveTicketId();
          if (!ticketId) return;
          await api(`/api/v1/admin/tickets/${encodeURIComponent(ticketId)}/routing`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            departmentId: document.getElementById("adminTicketDepartment").value || null,
            assignedStaffId: document.getElementById("adminTicketAssignee").value || null,
            priority: document.getElementById("adminTicketPriority").value
          }) });
          toast("Ticket routing updated.", "good");
          await renderTicketDetail(ticketId);
        } else if (form.id === "supportDepartmentForm") {
          await api("/api/v1/admin/support/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(values.entries())) });
          form.reset();
          toast("Support department created.", "good");
          await renderTickets();
        } else if (form.id === "supportMacroForm") {
          const payload = Object.fromEntries(values.entries());
          payload.status = payload.status || null;
          payload.departmentId = payload.departmentId || null;
          await api("/api/v1/admin/support/macros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          form.reset();
          toast("Reply macro created.", "good");
          await renderTickets();
        }
      } catch (error) {
        toast(error.message, "bad");
      } finally {
        if (button) button.disabled = false;
      }
    });
    document.querySelectorAll("[data-search]").forEach((input) => {
      let timer;
      input.addEventListener("input", () => {
        window.clearTimeout(timer);
        const searchTarget = input.dataset.search;
        timer = window.setTimeout(() => {
          if (searchTarget === "accounts") renderAccounts(input.value);
          if (searchTarget === "services") renderServices(input.value);
          if (searchTarget === "orders") renderOrders(input.value);
          if (searchTarget === "billing") renderBilling(input.value);
          if (searchTarget === "tickets") renderTickets(input.value);
          if (searchTarget === "audit") renderAudit(input.value);
          if (searchTarget === "jobs") renderJobs(input.value);
          if (searchTarget === "staff") renderStaff(input.value);
          if (searchTarget === "catalog") filterCatalog(input.value);
        }, 220);
      });
    });
    document.getElementById("adminTicketFileInput")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      const lbl = document.getElementById("adminTicketFileLabel");
      if (lbl) lbl.textContent = file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : "";
    });
    document.getElementById("adminTicketReplyForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const activeTicketId2 = getActiveTicketId();
      if (!activeTicketId2) return;
      const body = document.getElementById("adminReplyBody").value.trim();
      const isInternalNote = document.getElementById("adminTicketInternalNote").checked;
      const newStatus = document.getElementById("adminTicketStatusSelect").value;
      const fileInput = document.getElementById("adminTicketFileInput");
      const btn = document.getElementById("adminSendReplyBtn");
      btn.disabled = true;
      try {
        await api(`/api/v1/admin/tickets/${encodeURIComponent(activeTicketId2)}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, isInternalNote })
        });
        if (fileInput && fileInput.files?.[0]) {
          const file = fileInput.files[0];
          const reader = new FileReader();
          await new Promise((resolve, reject) => {
            reader.onload = async () => {
              try {
                const base64 = String(reader.result || "").split(",")[1];
                await api(`/api/v1/admin/tickets/${encodeURIComponent(activeTicketId2)}/attachments`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    filename: file.name,
                    contentType: file.type || "application/octet-stream",
                    dataBase64: base64
                  })
                });
                resolve();
              } catch (err) {
                reject(err);
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          fileInput.value = "";
          const lbl = document.getElementById("adminTicketFileLabel");
          if (lbl) lbl.textContent = "";
        }
        await api(`/api/v1/admin/tickets/${encodeURIComponent(activeTicketId2)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus })
        });
        document.getElementById("adminReplyBody").value = "";
        await renderTicketDetail(activeTicketId2);
        renderTickets();
      } catch (err) {
        toast(`Error submitting reply: ${err.message}`, "bad");
      } finally {
        btn.disabled = false;
      }
    });
    document.getElementById("adminAccountStatusForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const activeAccountId2 = getActiveAccountId();
      if (!activeAccountId2) return;
      const status = document.getElementById("adminAccountStatusSelect").value;
      const reason = document.getElementById("adminAccountReason").value.trim();
      const btn = document.getElementById("adminUpdateAccountBtn");
      btn.disabled = true;
      try {
        await api(`/api/v1/admin/accounts/${encodeURIComponent(activeAccountId2)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, reason })
        });
        toast("Account status updated successfully.", "good");
        await renderAccountDetail(activeAccountId2);
      } catch (err) {
        toast(`Error updating account status: ${err.message}`, "bad");
      } finally {
        btn.disabled = false;
      }
    });
    document.getElementById("adminStaffForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userId = document.getElementById("adminStaffUserId").value;
      const role = document.getElementById("adminStaffRoleSelect").value;
      const status = document.getElementById("adminStaffStatusSelect").value;
      const reason = document.getElementById("adminStaffReason").value.trim();
      const btn = document.getElementById("adminSaveStaffBtn");
      btn.disabled = true;
      try {
        await api(`/api/v1/admin/staff/${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, status, reason })
        });
        toast("Staff permissions updated.", "good");
        const m = document.getElementById("modalStaffEditor");
        if (m) m.hidden = true;
        renderStaff();
      } catch (err) {
        toast(`Error modifying staff: ${err.message}`, "bad");
      } finally {
        btn.disabled = false;
      }
    });
    document.getElementById("catalogProductForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        await submitProduct(form);
      } catch (error) {
        toast(`Unable to create product: ${error.message}`, "bad");
      } finally {
        if (button) button.disabled = false;
      }
    });
    document.getElementById("catalogPlanForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        await submitPlan(form);
      } catch (error) {
        toast(`Unable to create plan: ${error.message}`, "bad");
      } finally {
        if (button) button.disabled = false;
      }
    });
    document.getElementById("createProductFromEggForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        await submitProductFromEgg(form);
        toast("Product and plan configured successfully from egg", "good");
      } catch (error) {
        toast(`Error creating product from egg: ${error.message}`, "bad");
      } finally {
        if (button) button.disabled = false;
      }
    });
    document.getElementById("operationForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const kind = document.getElementById("operationKind").value;
      const id = document.getElementById("operationId").value;
      const reason = document.getElementById("operationReason").value.trim();
      const amountMinorUnits = Number(document.getElementById("operationAmount").value || 0);
      const endpoint = kind === "refund" ? `/api/v1/admin/invoices/${encodeURIComponent(id)}/refund` : `/api/v1/admin/services/${encodeURIComponent(id)}/${kind}`;
      try {
        await api(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "refund" ? { amountMinorUnits, reason } : { reason }) });
        const modal = document.getElementById("modalOperation");
        if (modal) modal.hidden = true;
        toast(`${kind === "refund" ? "Refund" : "Service operation"} accepted and audited.`, "good");
        if (kind === "refund") await renderBilling();
        else await renderServices();
      } catch (error) {
        toast(error.message, "bad");
      }
    });
    document.getElementById("addStaffForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const values = new FormData(form);
      try {
        await api("/api/v1/admin/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: values.get("email"), role: values.get("role"), status: "ACTIVE", reason: values.get("reason") }) });
        const modal = document.getElementById("modalAddStaff");
        if (modal) modal.hidden = true;
        form.reset();
        toast("Staff access granted.", "good");
        await renderStaff();
      } catch (error) {
        toast(error.message, "bad");
      }
    });
    document.getElementById("incidentForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("incidentId").value;
      const payload = { impact: document.getElementById("incidentImpact").value, status: document.getElementById("incidentStatus").value, message: document.getElementById("incidentMessage").value.trim() };
      if (!id) payload.title = document.getElementById("incidentTitle").value.trim();
      try {
        await api(id ? `/api/v1/admin/incidents/${encodeURIComponent(id)}/updates` : "/api/v1/admin/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const modal = document.getElementById("modalIncident");
        if (modal) modal.hidden = true;
        toast("Status incident published.", "good");
        await renderStatus();
      } catch (error) {
        toast(error.message, "bad");
      }
    });
    document.getElementById("componentForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("componentId").value;
      const status = document.getElementById("componentStatus").value;
      try {
        await api(`/api/v1/admin/components/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
        const modal = document.getElementById("modalComponent");
        if (modal) modal.hidden = true;
        toast("Component status updated.", "good");
        await renderStatus();
      } catch (error) {
        toast(error.message, "bad");
      }
    });
  }
  async function init() {
    adminShell.init();
    bindAdminEvents();
    await adminShell.loadIdentity();
    router.init();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
