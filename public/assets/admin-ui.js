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
      const navId = activeId === "service-detail" ? "services" : activeId === "ticket-detail" || activeId === "ticket-new" ? "tickets" : activeId;
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
    services: {
      id: "services",
      path: "/admin/services",
      title: "Service Inventory \xB7 FORTLESS",
      subtitle: "Contract and provider-observed state."
    },
    orders: {
      id: "orders",
      path: "/admin/orders",
      title: "Orders \xB7 FORTLESS",
      subtitle: "Commercial order lifecycle and fulfillment state."
    },
    billing: {
      id: "billing",
      path: "/admin/billing",
      title: "Billing Operations \xB7 FORTLESS",
      subtitle: "Invoices, credit notes and payment state."
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
    audit: {
      id: "audit",
      path: "/admin/audit",
      title: "Global Audit Trail \xB7 FORTLESS",
      subtitle: "Security-relevant events across accounts."
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
  function paginateItems(items, page, pageSize) {
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.max(1, Math.min(page, pages));
    const start = (currentPage - 1) * pageSize;
    const sliced = items.slice(start, start + pageSize);
    const info = total === 0 ? "0 items" : `Showing ${start + 1}\u2013${start + sliced.length} of ${total}`;
    return {
      items: sliced,
      total,
      page: currentPage,
      pages,
      pageSize,
      info
    };
  }
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
        const required = {
          accounts: "accounts:read",
          services: "services:read",
          orders: "accounts:read",
          billing: "accounts:read",
          infrastructure: "services:read",
          catalog: "catalog:read",
          tickets: "tickets:read",
          audit: "audit:read",
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
      } catch {
      }
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

  // src/frontend/admin/pages/overview/index.ts
  async function renderOverview() {
    const d = await api("/api/v1/admin/overview");
    const metrics = [
      ["Users", d.users, "users", ""],
      ["Accounts", d.accounts, "users", ""],
      ["Active services", d.activeServices, "server", "good"],
      ["Open tickets", d.openTickets, "support", d.openTickets ? "warn" : "good"],
      ["Orders", d.orders, "cube", ""],
      ["Overdue invoices", d.overdueInvoices, "document", d.overdueInvoices ? "warn" : "good"],
      ["Pending events", d.pendingOutboxEvents, "refresh", d.pendingOutboxEvents ? "warn" : "good"],
      ["Dead letters", d.deadLetterEvents, "warning", d.deadLetterEvents ? "bad" : "good"]
    ];
    const metricsBox = document.querySelector("#overviewMetrics");
    if (metricsBox) {
      metricsBox.innerHTML = metrics.map(([label, value, icon, tone]) => `<article class="card mt"><div><span class="l">${esc(label)}</span><b class="v">${Number(value || 0)}</b></div><span class="tile ${tone}">${hero(icon)}</span></article>`).join("");
    }
    const capabilityList = document.querySelector("#capabilityList");
    if (capabilityList) {
      capabilityList.innerHTML = Object.entries(d.capabilities).map(
        ([k, v]) => row({
          symbol: "shield",
          title: k.replace(/([A-Z])/g, " $1"),
          sub: "Release gate from server configuration",
          status: v
        })
      ).join("");
    }
    const attentionList = document.querySelector("#attentionList");
    if (attentionList) {
      attentionList.innerHTML = [
        row({
          symbol: "support",
          title: "Open support tickets",
          sub: "Unresolved customer conversations",
          meta: `${d.openTickets} open`
        }),
        row({
          symbol: "server",
          title: "Pending outbox events",
          sub: "Async work awaiting worker dispatch",
          meta: `${d.pendingOutboxEvents} pending`
        }),
        row({
          symbol: "warning",
          title: "Dead-letter events",
          sub: "Events requiring engineering review",
          status: d.deadLetterEvents ? "ATTENTION" : "CLEAR",
          meta: `${d.deadLetterEvents} dead`
        })
      ].join("");
    }
    const outboxHealth = document.querySelector("#outboxHealth");
    if (outboxHealth) {
      outboxHealth.innerHTML = [
        row({ symbol: "refresh", title: "Retries pending", sub: "Events awaiting worker dispatch", status: d.pendingOutboxEvents ? "PENDING" : "CLEAR", meta: String(d.pendingOutboxEvents) }),
        row({ symbol: "warning", title: "Dead-letter events", sub: "Manual review required", status: d.deadLetterEvents ? "ATTENTION" : "CLEAR", meta: String(d.deadLetterEvents) })
      ].join("");
    }
    const supportSummary = document.querySelector("#supportSummary");
    if (supportSummary) {
      supportSummary.innerHTML = row({ symbol: "support", title: "Open support tickets", sub: "Inspect priority and recent activity in the support queue", status: d.openTickets ? "OPEN" : "CLEAR", meta: String(d.openTickets) });
    }
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

  // src/frontend/admin/pages/accounts/index.ts
  var activeAccountId = null;
  var cachedAccounts = [];
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
    const pagination = paginateItems(cachedAccounts, adminAccountsPage, adminAccountsPageSize);
    adminAccountsPage = pagination.page;
    if (paginationRow) paginationRow.style.display = cachedAccounts.length > adminAccountsPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    host.innerHTML = pagination.items.map((x) => `<button class="li" data-account-id="${esc(x.id)}">
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
          paintAccountsList();
        }
      }
    });
  }
  async function renderAccounts(q = "") {
    const host = document.querySelector("#accountsList");
    if (!host) return;
    try {
      const d = await api(`/api/v1/admin/accounts?q=${encodeURIComponent(q)}`);
      cachedAccounts = d.accounts || [];
      adminAccountsPage = 1;
      paintAccountsList();
      bindAdminAccountsListeners();
    } catch (e) {
      host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
    }
  }
  async function openAccountDetail(accountId) {
    activeAccountId = accountId;
    const modal = document.getElementById("modalAccountDetail");
    const content = document.getElementById("adminAccountContent");
    if (!modal || !content) return;
    content.innerHTML = '<div style="padding:24px;text-align:center;color:var(--ink2)"><div class="sk"><i></i><i></i><i></i></div></div>';
    modal.hidden = false;
    try {
      const d = await api(`/api/v1/admin/accounts/${encodeURIComponent(accountId)}`);
      const titleEl = document.getElementById("adminAccountTitle");
      const metaEl = document.getElementById("adminAccountMeta");
      const statusSelect = document.getElementById("adminAccountStatusSelect");
      if (titleEl) titleEl.textContent = d.account.name;
      if (metaEl) {
        metaEl.textContent = `Owner: ${d.account.owner_name} (${d.account.owner_email}) \xB7 Created ${formatDate(
          d.account.created_at
        )}`;
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
          <div style="font-size:18px;font-weight:700">${d.services.length}</div>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">TOTAL INVOICES</small>
          <div style="font-size:18px;font-weight:700">${d.invoices.length}</div>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">TICKETS</small>
          <div style="font-size:18px;font-weight:700">${(d.tickets || []).length}</div>
        </div>
      </div>

      <!-- Account Members -->
      <div>
        <div class="dh" style="margin-bottom:6px">ORGANIZATION MEMBERS (${d.members.length})</div>
        <div class="table-scroll" style="max-height:160px">
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
        <div class="table-scroll" style="max-height:180px">
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
        <div class="table-scroll" style="max-height:160px">
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
                <td><b class="mono">${esc(i.invoice_number)}</b></td>
                <td class="faint" style="font-size:12px">${formatDate(i.created_at)}</td>
                <td><b>${money(i.total_minor_units, i.currency)}</b></td>
                <td class="r">${badge(i.status)}</td>
              </tr>`).join("") : '<tr><td colspan="4"><div class="empty"><b>No invoices recorded.</b></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
    } catch (err) {
      content.innerHTML = `<div class="alert bad"><div><b>Error loading account</b><span>${esc(err.message)}</span></div></div>`;
    }
  }

  // src/frontend/admin/pages/services/index.ts
  var activeServiceId = null;
  var cachedAdminServices = [];
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
    const pagination = paginateItems(cachedAdminServices, adminServicesPage, adminServicesPageSize);
    adminServicesPage = pagination.page;
    if (paginationRow) paginationRow.style.display = cachedAdminServices.length > adminServicesPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    host.innerHTML = pagination.items.map((x) => `<tr class="h" data-filter-state="${x.runtime_state === "RUNNING" ? "RUNNING" : "OTHER"}" data-service-id="${esc(x.id)}" style="cursor:pointer">
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
          paintAdminServicesList();
        }
      }
    });
  }
  async function renderServices(q = "") {
    const host = document.querySelector("#servicesList");
    if (!host) return;
    try {
      const d = await api(`/api/v1/admin/services?q=${encodeURIComponent(q)}`);
      cachedAdminServices = d.services || [];
      adminServicesPage = 1;
      paintAdminServicesList();
      bindAdminServicesListeners();
    } catch (e) {
      host.innerHTML = `<tr><td colspan="6"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
    }
  }
  async function openServiceDetail(serviceId) {
    activeServiceId = serviceId;
    const modal = document.getElementById("modalAdminServiceDetail");
    const body = document.getElementById("adminServiceBody");
    if (!modal || !body) return;
    body.innerHTML = '<div style="padding:28px;text-align:center;color:var(--ink2)"><div class="sk"><i></i><i></i><i></i></div></div>';
    modal.hidden = false;
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
      <div class="card flat" style="padding:14px">
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

      <div class="card flat" style="padding:14px">
        <div class="dh" style="margin-bottom:4px">RELINK TO PANEL SERVER</div>
        <small class="muted">Use when the server was recreated on the panel under another id. Current link: <code>${esc(String(s.external_id || "none"))}</code></small>
        <div class="row nw" style="gap:8px;margin-top:10px">
          <div class="inp s pill" style="flex:1"><input id="relinkId" inputmode="numeric" placeholder="Panel server id (number)" aria-label="Panel server id"></div>
          <button type="button" class="btn xs" id="btnRelink" data-service-id="${esc(s.id)}">Relink</button>
        </div>
      </div>

      <!-- Lifecycle Management Form -->
      <div class="card flat" style="padding:14px">
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
        setTimeout(() => openServiceDetail(serviceId), 1200);
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
          setTimeout(() => openServiceDetail(serviceId), 1e3);
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
        await openServiceDetail(serviceId);
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
        ${plan.status !== "ACTIVE" ? `<button class="btn xs good" data-plan-status="ACTIVE" data-plan-id="${esc(plan.id)}">Activate</button>` : ""}
        ${plan.status !== "RETIRED" ? `<button class="btn xs bad" data-plan-status="RETIRED" data-plan-id="${esc(plan.id)}">Retire</button>` : ""}
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
          <button class="btn xs ${product.isPublished ? "bad" : "pri"}" data-product-publish="${product.isPublished ? "false" : "true"}" data-product-id="${esc(product.id)}">
            ${product.isPublished ? "Unpublish" : "Publish"}
          </button>
          <button class="btn xs" data-new-plan-product="${esc(product.id)}">
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
          <button class="btn s" data-new-plan-product="${esc(product.id)}" style="margin-top:6px">
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
  var adminTicketsPage = 1;
  var adminTicketsPageSize = 10;
  var adminTicketsListenersBound = false;
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
      host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>No matching support tickets.</b></div></td></tr>`;
      return;
    }
    const pagination = paginateItems(cachedTickets, adminTicketsPage, adminTicketsPageSize);
    adminTicketsPage = pagination.page;
    if (paginationRow) paginationRow.style.display = cachedTickets.length > adminTicketsPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    host.innerHTML = pagination.items.map((x) => `<tr class="h" data-filter-state="${esc(x.status === "WAITING_STAFF" ? "WAITING_STAFF" : "OPEN")}" data-ticket-id="${esc(x.id)}" style="cursor:pointer"><td data-l="Priority">${badge(x.priority)}</td><td data-l="Subject"><b>${esc(x.subject)}</b><small>${Number(x.message_count)} messages \xB7 ${esc(x.customer_name)}</small></td><td data-l="Account">${esc(x.account_name)}</td><td data-l="Status">${badge(x.status)}</td><td data-l="Updated" class="muted">${formatDate(x.updated_at)}</td></tr>`).join("");
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
          paintTicketsList();
        }
      }
    });
  }
  async function renderTickets(q = "") {
    const host = document.querySelector("#ticketsList");
    if (!host) return;
    try {
      const d = await api(`/api/v1/admin/tickets?q=${encodeURIComponent(q)}`);
      cachedTickets = d.tickets || [];
      adminTicketsPage = 1;
      paintTicketsList();
      bindAdminTicketsListeners();
    } catch (e) {
      host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
    }
  }
  async function openTicketDetail(ticketId) {
    activeTicketId = ticketId;
    const modal = document.getElementById("modalTicketDetail");
    const msgBox = document.getElementById("adminTicketMessages");
    if (!modal || !msgBox) return;
    msgBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink2)">Loading ticket thread\u2026</div>';
    modal.hidden = false;
    try {
      const d = await api(`/api/v1/admin/tickets/${encodeURIComponent(ticketId)}`);
      const subEl = document.getElementById("adminTicketSubject");
      const metaEl = document.getElementById("adminTicketMeta");
      const statusSelect = document.getElementById("adminTicketStatusSelect");
      if (subEl) subEl.textContent = d.ticket.subject;
      if (metaEl)
        metaEl.textContent = `${d.ticket.account_name} \xB7 Customer: ${d.ticket.creator_name} (${d.ticket.creator_email}) \xB7 Created ${formatDate(d.ticket.created_at)}`;
      if (statusSelect) statusSelect.value = d.ticket.status;
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
  var adminAuditPageSize = 10;
  var adminAuditListenersBound = false;
  function paintAuditList() {
    const host = document.querySelector("#auditList");
    const paginationRow = document.getElementById("adminAuditPaginationRow");
    const infoEl = document.getElementById("adminAuditPageInfo");
    const pagerEl = document.getElementById("adminAuditPager");
    if (!host) return;
    if (!cachedLogs.length) {
      if (paginationRow) paginationRow.style.display = "none";
      host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>No matching audit events.</b></div></td></tr>`;
      return;
    }
    const pagination = paginateItems(cachedLogs, adminAuditPage, adminAuditPageSize);
    adminAuditPage = pagination.page;
    if (paginationRow) paginationRow.style.display = cachedLogs.length > adminAuditPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    host.innerHTML = pagination.items.map((x) => `<tr class="h"><td data-l="Time" class="muted mono">${formatDate(x.created_at)}</td><td data-l="Actor"><b>${esc(x.actor_name || x.actor_type)}</b><small>${esc(x.actor_email || x.account_name || "Platform")}</small></td><td data-l="Action">${badge(x.action)}</td><td data-l="Target" class="mono">${esc(x.resource_type)} ${esc(x.resource_id)}</td><td data-l="IP" class="mono muted">${esc(x.ip_address || "\u2014")}</td></tr>`).join("");
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
          adminAuditPage = p;
          paintAuditList();
        }
      }
    });
  }
  async function renderAudit(q = "") {
    const host = document.querySelector("#auditList");
    if (!host) return;
    try {
      const d = await api(`/api/v1/admin/audit?q=${encodeURIComponent(q)}`);
      cachedLogs = d.logs || [];
      adminAuditPage = 1;
      paintAuditList();
      bindAdminAuditListeners();
    } catch (e) {
      host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
    }
  }

  // src/frontend/admin/pages/staff/index.ts
  async function renderStaff(q = "") {
    const host = document.querySelector("#staffList");
    if (!host) return;
    try {
      const d = await api(`/api/v1/admin/staff?q=${encodeURIComponent(q)}`);
      if (!d.staff.length) {
        host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>No matching staff identities.</b></div></td></tr>`;
        return;
      }
      host.innerHTML = d.staff.map((x) => `<tr class="h"><td data-l="Member"><div class="row nw"><span class="av v">${esc(x.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase())}</span><div><b>${esc(x.name)}</b><small>${esc(x.email)}</small></div></div></td><td data-l="Role">${badge(x.role)}</td><td data-l="MFA">${badge(x.mfa_enabled ? "READY" : "NOT SET UP")}</td><td data-l="Access">${badge(x.status)}</td><td data-l="Action"><button class="btn xs" data-staff-user-id="${esc(x.id)}" data-staff-name="${esc(x.name)}" data-staff-role="${esc(x.role)}" data-staff-status="${esc(x.status)}">Edit</button></td></tr>`).join("");
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
  function empty(message) {
    return `<div class="es"><h4>${esc(message)}</h4><p>No persisted records match the current filter.</p></div>`;
  }
  function metric(label, value, icon, tone = "", detail = "") {
    return `<article class="card mt"><div><span class="l">${esc(label)}</span><b class="v">${esc(String(value))}</b>${detail ? `<small>${esc(detail)}</small>` : ""}</div><span class="tile ${tone}">${hero(icon)}</span></article>`;
  }
  var cachedOrders = [];
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
      host.innerHTML = `<tr><td colspan="5">${empty("No orders")}</td></tr>`;
      return;
    }
    const pagination = paginateItems(cachedOrders, ordersPage, ordersPageSize);
    ordersPage = pagination.page;
    if (paginationRow) paginationRow.style.display = cachedOrders.length > ordersPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    host.innerHTML = pagination.items.map((x) => `<tr>
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
          paintOrdersList();
        }
      }
    });
  }
  async function renderOrders(q = "") {
    const host = document.querySelector("#ordersList");
    if (!host) return;
    try {
      const { orders } = await api(`/api/v1/admin/orders?q=${encodeURIComponent(q)}`);
      const metrics = document.querySelector("#orderMetrics");
      if (metrics) {
        const pending = orders.filter((x) => /PENDING|CREATED|AWAITING|PROCESSING/.test(String(x.status))).length;
        const settled = orders.filter((x) => /PAID|FULFILLED|COMPLETED/.test(String(x.status))).length;
        const attention = orders.filter((x) => /FAILED|ANOMALY|CANCELLED/.test(String(x.status))).length;
        metrics.innerHTML = metric("Loaded orders", orders.length, "cube") + metric("Settled", settled, "check", "good") + metric("In progress", pending, "refresh", pending ? "warn" : "good") + metric("Needs attention", attention, "warning", attention ? "bad" : "good");
      }
      cachedOrders = orders || [];
      ordersPage = 1;
      paintOrdersList();
      bindOrdersListeners();
    } catch (error) {
      host.innerHTML = `<tr><td colspan="5">${empty(error.message)}</td></tr>`;
    }
  }
  var cachedInvoices = [];
  var cachedCreditNotes = [];
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
      invoiceHost.innerHTML = `<tr><td colspan="6">${empty("No invoices")}</td></tr>`;
      return;
    }
    const pagination = paginateItems(cachedInvoices, invoicesPage, adminBillingPageSize);
    invoicesPage = pagination.page;
    if (paginationRow) paginationRow.style.display = cachedInvoices.length > adminBillingPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    invoiceHost.innerHTML = pagination.items.map((x) => `<tr>
    <td data-l="Invoice"><b>${esc(x.invoice_number || x.id)}</b><small>${esc(x.id)}</small></td>
    <td data-l="Account">${esc(x.account_name)}<small>${esc(x.customer_email)}</small></td>
    <td data-l="Due">${x.due_date ? formatDate(x.due_date) : "\u2014"}</td>
    <td data-l="Paid">${money2(x.amount_paid_minor_units, x.currency)} / <b>${money2(x.total_minor_units, x.currency)}</b></td>
    <td data-l="Status">${badge(x.status)}</td>
    <td data-l="Action">${x.status === "PAID" ? `<button class="btn xs" data-refund-invoice="${esc(x.id)}" data-refund-max="${Number(x.amount_paid_minor_units)}" data-refund-currency="${esc(x.currency)}">Refund</button>` : ""}</td></tr>`).join("");
  }
  function paintAdminCreditsList() {
    const creditHost = document.querySelector("#creditNotesList");
    const paginationRow = document.getElementById("adminCreditsPaginationRow");
    const infoEl = document.getElementById("adminCreditsPageInfo");
    const pagerEl = document.getElementById("adminCreditsPager");
    if (!creditHost) return;
    if (!cachedCreditNotes.length) {
      if (paginationRow) paginationRow.style.display = "none";
      creditHost.innerHTML = `<tr><td colspan="6">${empty("No credit notes")}</td></tr>`;
      return;
    }
    const pagination = paginateItems(cachedCreditNotes, creditsPage, adminBillingPageSize);
    creditsPage = pagination.page;
    if (paginationRow) paginationRow.style.display = cachedCreditNotes.length > adminBillingPageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    creditHost.innerHTML = pagination.items.map((x) => `<tr>
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
          paintAdminInvoicesList();
        }
      }
    });
    document.getElementById("adminCreditsPager")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-pg]");
      if (btn && !btn.disabled) {
        const p = Number(btn.dataset.pg);
        if (p && p !== creditsPage) {
          creditsPage = p;
          paintAdminCreditsList();
        }
      }
    });
  }
  async function renderBilling(q = "") {
    const invoiceHost = document.querySelector("#invoicesList");
    const creditHost = document.querySelector("#creditNotesList");
    if (!invoiceHost || !creditHost) return;
    try {
      const [invoiceData, creditData] = await Promise.all([
        api(`/api/v1/admin/invoices?q=${encodeURIComponent(q)}`),
        api(`/api/v1/admin/credit-notes?q=${encodeURIComponent(q)}`)
      ]);
      const metrics = document.querySelector("#billingMetrics");
      if (metrics) {
        const paid = invoiceData.invoices.reduce((sum, x) => sum + Number(x.amount_paid_minor_units || 0), 0);
        const outstanding = invoiceData.invoices.reduce((sum, x) => sum + Math.max(0, Number(x.total_minor_units || 0) - Number(x.amount_paid_minor_units || 0)), 0);
        const credited = creditData.creditNotes.reduce((sum, x) => sum + Number(x.amount_minor_units || 0), 0);
        const currency = invoiceData.invoices[0]?.currency || creditData.creditNotes[0]?.currency || "EUR";
        metrics.innerHTML = metric("Loaded invoices", invoiceData.invoices.length, "document") + metric("Paid", money2(paid, currency), "check", "good") + metric("Outstanding", money2(outstanding, currency), "warning", outstanding ? "warn" : "good") + metric("Credits issued", money2(credited, currency), "credit", credited ? "info" : "");
      }
      cachedInvoices = invoiceData.invoices || [];
      cachedCreditNotes = creditData.creditNotes || [];
      invoicesPage = 1;
      creditsPage = 1;
      paintAdminInvoicesList();
      paintAdminCreditsList();
      bindBillingOpsListeners();
    } catch (error) {
      invoiceHost.innerHTML = `<tr><td colspan="6">${empty(error.message)}</td></tr>`;
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
      }).join("") : empty("No configured capacity regions");
      nodesHost.innerHTML = data.nodes.length ? data.nodes.map((x) => `<tr><td data-l="Node"><b>${esc(x.name)}</b><small>${esc(x.fqdn)}</small></td><td data-l="Region">${esc(x.region_name)}</td><td data-l="Services">${Number(x.active_service_count)}</td><td data-l="Memory">${Math.round(x.allocated_memory_mb / 1024)} / ${Math.round(x.max_memory_mb / 1024)} GB</td><td data-l="Disk">${Math.round(x.allocated_disk_mb / 1024)} / ${Math.round(x.max_disk_mb / 1024)} GB</td><td data-l="Mode">${badge(x.maintenance_mode ? "MAINTENANCE" : "AVAILABLE")}</td></tr>`).join("") : `<tr><td colspan="6">${empty("No configured nodes")}</td></tr>`;
    } catch (error) {
      regionsHost.innerHTML = empty(error.message);
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
      componentsHost.innerHTML = data.components.map((x) => `<article class="li"><span class="tx"><b>${esc(x.name)}</b><small>${esc(x.groupName)} \xB7 updated ${formatDate(x.updatedAt)}</small></span>${badge(x.status)}<button class="btn xs" data-component-id="${esc(x.id)}" data-component-status="${esc(x.status)}">Change</button></article>`).join("") || empty("No status components");
      const incidents = [...data.activeIncidents, ...data.pastIncidents];
      incidentsHost.innerHTML = incidents.map((x) => `<article class="li"><span class="tx"><b>${esc(x.title)}</b><small>${x.updates.length} updates \xB7 ${formatDate(x.updatedAt)}</small></span>${badge(x.impact)}${badge(x.status)}${x.status !== "RESOLVED" ? `<button class="btn xs" data-incident-id="${esc(x.id)}">Update</button>` : ""}</article>`).join("") || empty("No incidents recorded");
    } catch (error) {
      componentsHost.innerHTML = empty(error.message);
    }
  }

  // src/frontend/admin/pages/settings/index.ts
  async function renderSettings() {
    const panelStatus = document.getElementById("settingsPanelStatus");
    const panelUrl = document.getElementById("settingsPanelUrl");
    const stripeStatus = document.getElementById("settingsStripeStatus");
    const stripeMode = document.getElementById("settingsStripeMode");
    const mailStatus = document.getElementById("settingsMailStatus");
    const mailSender = document.getElementById("settingsMailSender");
    const mfaPolicy = document.getElementById("settingsMfaPolicy");
    const sessionTtl = document.getElementById("settingsSessionTtl");
    try {
      const data = await api("/api/v1/admin/settings");
      if (panelStatus) {
        panelStatus.className = `pill ${data.provider.configured ? "good d" : "bad d"}`;
        panelStatus.textContent = data.provider.configured ? "Configured & Active" : "Not Configured";
      }
      if (panelUrl) panelUrl.textContent = data.provider.panelUrl || "No panel URL configured";
      if (stripeStatus) {
        stripeStatus.className = `pill ${data.payments.stripeConfigured ? "good d" : "warn d"}`;
        stripeStatus.textContent = data.payments.stripeConfigured ? "Connected (Live)" : "Mock / Inactive";
      }
      if (stripeMode) stripeMode.textContent = data.payments.mode.toUpperCase();
      if (mailStatus) {
        mailStatus.className = `pill ${data.email.configured ? "good d" : "neu d"}`;
        mailStatus.textContent = data.email.configured ? `${data.email.transport.toUpperCase()} Active` : "Disabled";
      }
      if (mailSender) mailSender.textContent = data.email.fromAddress || "system-mailer@fortless.net";
      if (mfaPolicy) {
        mfaPolicy.className = `pill ${data.security.stepUpRequired ? "good d" : "warn d"}`;
        mfaPolicy.textContent = data.security.stepUpRequired ? "Enforced (Fresh MFA)" : "Standard";
      }
      if (sessionTtl) {
        const hours = Math.round(data.security.sessionTtlSeconds / 3600);
        sessionTtl.textContent = `${hours} hours`;
      }
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
      btn.innerHTML = `${hero("activity", "xs")} Test Live Connection`;
    }
  }

  // src/frontend/admin/index.ts
  var adminShell = new AdminShell();
  var router = new Router(ADMIN_ROUTES);
  function updateAdminChrome(routeName) {
    const titles = {
      overview: ["Operations overview", "Real platform records, without simulated operational controls."],
      accounts: ["Customer accounts", "Ownership, membership and workload counts. Click an account to inspect or lock."],
      services: ["Service inventory", "Contract and provider-observed state."],
      orders: ["Orders", "Commercial order lifecycle and fulfillment state."],
      billing: ["Billing operations", "Invoices, credit notes and payment state."],
      infrastructure: ["Infrastructure", "Capacity pools and provider readiness."],
      catalog: ["Catalog & providers", "Products stay private until plans are mapped to real provider inventory."],
      tickets: ["Support queue", "Real customer threads. Click a ticket to view and reply."],
      audit: ["Global audit trail", "Security-relevant events across accounts."],
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
  router.register("services", async () => {
    updateAdminChrome("services");
    await renderServices();
  });
  router.register("orders", async () => {
    updateAdminChrome("orders");
    await renderOrders();
  });
  router.register("billing", async () => {
    updateAdminChrome("billing");
    await renderBilling();
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
  router.register("audit", async () => {
    updateAdminChrome("audit");
    await renderAudit();
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
      if (target.closest("[data-close-ticket-modal]")) {
        const m = document.getElementById("modalTicketDetail");
        if (m) m.hidden = true;
      }
      if (target.closest("[data-close-account-modal]")) {
        const m = document.getElementById("modalAccountDetail");
        if (m) m.hidden = true;
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
      if (target.closest("[data-close-service-modal]")) {
        const m = document.getElementById("modalAdminServiceDetail");
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
        await openTicketDetail(activeTicketId2);
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
        const m = document.getElementById("modalAccountDetail");
        if (m) m.hidden = true;
        renderAccounts();
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
