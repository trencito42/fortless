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
      this.navigationSeq++;
      const currentSeq = this.navigationSeq;
      if (this.activeAbortController) {
        try {
          this.activeAbortController.abort();
        } catch {
        }
      }
      this.activeAbortController = typeof AbortController !== "undefined" ? new AbortController() : null;
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
      document.querySelectorAll("[data-app-route], [data-route]").forEach((el2) => {
        const rId = el2.dataset.appRoute || el2.dataset.route;
        if (rId === navId) {
          el2.setAttribute("aria-current", "page");
          el2.classList.add("act");
        } else {
          el2.removeAttribute("aria-current");
          el2.classList.remove("act");
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
  var CLIENT_ROUTES = {
    dashboard: {
      id: "dashboard",
      path: "/app",
      title: "Dashboard \xB7 FORTLESS",
      subtitle: "Workspace overview and current account activity."
    },
    services: {
      id: "services",
      path: "/app/services",
      title: "Servers & Instances \xB7 FORTLESS",
      subtitle: "Provider-observed runtime records for this account."
    },
    deploy: {
      id: "deploy",
      path: "/app/deploy",
      title: "Deploy Service \xB7 FORTLESS",
      subtitle: "Select configuration, location, and billing cycle."
    },
    domains: {
      id: "domains",
      path: "/app/domains",
      title: "Domains & DNS \xB7 FORTLESS",
      subtitle: "DNS zones for domains you already own. Domain registration is not offered."
    },
    billing: {
      id: "billing",
      path: "/app/billing",
      title: "Billing & Invoices \xB7 FORTLESS",
      subtitle: "Issued billing records and active subscriptions."
    },
    tickets: {
      id: "tickets",
      path: "/app/support",
      title: "Support Conversations \xB7 FORTLESS",
      subtitle: "Account-scoped support conversations. No response-time or staffing claim is implied."
    },
    "ticket-new": {
      id: "ticket-new",
      path: "/app/support/new",
      title: "Open Support Ticket \xB7 FORTLESS",
      subtitle: "Create an account-scoped support conversation."
    },
    "ticket-detail": {
      id: "ticket-detail",
      path: "/app/support/:id",
      title: "Support Conversation \xB7 FORTLESS",
      subtitle: "Account-scoped support conversation.",
      pattern: /^\/app\/support\/(?<id>[^/]+)$/
    },
    audit: {
      id: "audit",
      path: "/app/activity",
      title: "Security Audit \xB7 FORTLESS",
      subtitle: "Immutable record of authentication and account actions."
    },
    settings: {
      id: "settings",
      path: "/app/settings",
      title: "Settings \xB7 FORTLESS",
      subtitle: "Account access, active device sessions, and authentication security.",
      pattern: /^\/app\/settings\/(?<tab>[a-z-]+)$/,
      tabbed: true
    },
    "service-detail": {
      id: "service-detail",
      path: "/app/services/:id",
      title: "Service Detail \xB7 FORTLESS",
      subtitle: "Node and connection telemetry.",
      pattern: /^\/app\/services\/(?<id>[^/]+?)(?:\/(?<tab>[a-z-]+))?$/,
      tabbed: true
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
    navigationSignal = null;
    /**
     * FTL-UI-203: page data requests (GET) are tied to the current navigation. When the user moves on, the request is
     * aborted and its promise never settles, so a superseded page cannot paint over the new one or raise stale toasts.
     * Writes are never aborted.
     */
    setNavigationSignal(provider) {
      this.navigationSignal = provider;
    }
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
    async request(url, options = {}, csrfRetried = false) {
      const method = (options.method || "GET").toUpperCase();
      const headers = { ...options.headers || {} };
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        if (!headers["X-CSRF-Token"]) {
          headers["X-CSRF-Token"] = await this.getCsrfToken();
        }
      }
      const navSignal = method === "GET" && !options.signal ? this.navigationSignal?.() : void 0;
      let res;
      try {
        res = await fetch(url, {
          ...options,
          method,
          headers,
          credentials: "same-origin",
          ...navSignal ? { signal: navSignal } : {}
        });
      } catch (err) {
        if (navSignal?.aborted && err?.name === "AbortError") return new Promise(() => void 0);
        throw err;
      }
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
      if (res.status === 403 && data.code === "CSRF_INVALID" && !csrfRetried && !["GET", "HEAD", "OPTIONS"].includes(method)) {
        this.invalidateCsrfToken();
        const retryHeaders = { ...options.headers || {} };
        delete retryHeaders["X-CSRF-Token"];
        return this.request(url, { ...options, headers: retryHeaders }, true);
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

  // src/frontend/petal/components/sparklines.ts
  function smooth(points) {
    if (!points || points.length < 2) return "";
    const first = points[0];
    if (!first) return "";
    let d = `M${first[0]} ${first[1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i - 1] || points[i];
      const b = points[i];
      const c = points[i + 1];
      const e = points[i + 2] || c;
      d += `C${b[0] + (c[0] - a[0]) / 6} ${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6} ${c[1] - (e[1] - b[1]) / 6} ${c[0]} ${c[1]}`;
    }
    return d;
  }
  function spark(vals, color = "var(--accent)", fill = true) {
    if (!vals || vals.length < 2) return "";
    const W = 120;
    const H = 36;
    const mx = Math.max(...vals);
    const mn = Math.min(...vals);
    const n = vals.length;
    const points = vals.map((v, i) => [
      i / (n - 1) * W,
      H - 4 - (v - mn) / (mx - mn || 1) * (H - 10)
    ]);
    const d = smooth(points);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${fill === false ? "" : `<path d="${d}L${W} ${H}L0 ${H}Z" fill="${color}" opacity=".12"/>`}<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
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

  // src/frontend/petal/components/radiogroup.ts
  function initRadioGroups(root = document) {
    root.querySelectorAll('.seg[role="radiogroup"]').forEach((group) => {
      if (group.dataset["rg"] === "1") return;
      const items = () => [...group.querySelectorAll('[role="radio"]')];
      const inputOf = (item) => item.closest("label")?.querySelector('input[type="radio"]') ?? null;
      if (!items().length || !items().every((i) => inputOf(i))) return;
      group.dataset["rg"] = "1";
      const sync = () => {
        const all = items();
        const active = all.find((i) => inputOf(i)?.checked) ?? all[0];
        for (const item of all) {
          item.setAttribute("aria-checked", String(item === active));
          item.tabIndex = item === active ? 0 : -1;
        }
      };
      sync();
      group.addEventListener("change", sync);
      group.addEventListener("keydown", (event) => {
        const all = items();
        const current = all.indexOf(document.activeElement);
        if (current === -1) return;
        let next = current;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % all.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + all.length) % all.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = all.length - 1;
        else if (event.key === " " || event.key === "Enter") next = current;
        else return;
        event.preventDefault();
        const target = all[next];
        inputOf(target)?.click();
        sync();
        target.focus();
      });
    });
  }

  // src/frontend/petal/components/modals.ts
  var BASE_MODAL_Z = 900;
  var PRIORITY_MODAL_Z = 1200;
  var openModalStack = [];
  function isPriorityModal(el2) {
    return el2.id === "modalStepUp" || el2.classList.contains("stepup") || el2.getAttribute("data-priority") === "high";
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
    openModalStack.forEach((el2) => {
      const isPri = isPriorityModal(el2);
      const z = isPri ? PRIORITY_MODAL_Z + priorityCount * 20 : BASE_MODAL_Z + standardCount * 20;
      if (isPri) priorityCount++;
      else standardCount++;
      el2.style.zIndex = String(z);
      const ov = el2.querySelector(".ov");
      const bx = el2.querySelector(".bx");
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
    document.querySelectorAll(".mdl").forEach((el2) => {
      const isVisible = !el2.hidden && el2.style.display !== "none";
      if (isVisible) updateModalStacking(el2, true);
    });
  }

  // src/frontend/petal/components/empty-state.ts
  function renderEmptyState(options) {
    const iconHtml = hero(options.icon || "cube", "l");
    return `
    <div class="z-es">
      <div class="z-art">
        <i class="a"></i>
        <i class="b"></i>
        <i class="c"></i>
        ${iconHtml}
      </div>
      <h4>${esc(options.title)}</h4>
      <p>${esc(options.message)}</p>
      ${options.actionHtml || ""}
    </div>
  `;
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

  // src/frontend/petal/components/rich-text-editor.ts
  function petalRichTextEditor(id, label, placeholder) {
    const action = (command, icon, title) => `<button type="button" data-rcmd="${command}" aria-label="${title}" title="${title}">
        <svg class="ic s" aria-hidden="true" width="16" height="16"><use href="/assets/petal-icons.svg#i-${icon}"/></svg>
      </button>`;
    return `<div class="rte-shell" data-c="Markdown editor">
    <div class="edtb" data-c="Rich text toolbar" role="toolbar" aria-label="${esc(label)} formatting">
      ${action("heading", "heading", "Heading")}
      ${action("bold", "bold", "Bold")}
      ${action("italic", "italic", "Italic")}
      ${action("strike", "strikethrough", "Strikethrough")}
      <span class="rte-sep" aria-hidden="true"></span>
      ${action("link", "link-01", "Link")}
      ${action("quote", "quote", "Quote")}
      ${action("bullet", "left-to-right-list-bullet", "Bulleted list")}
      ${action("ordered", "check-list", "Numbered list")}
      ${action("code", "code", "Inline code")}
      ${action("codeblock", "code", "Code block")}
    </div>
    <div class="inp">
      <textarea id="${esc(id)}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}"></textarea>
    </div>
  </div>`;
  }
  function safeHref(value) {
    try {
      const url = new URL(value, window.location.origin);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return value.startsWith("/") ? `${url.pathname}${url.search}${url.hash}` : url.href;
    } catch {
      return null;
    }
  }
  function inlineMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").replace(/([\\`*_\[\]])/g, "\\$1");
    if (!(node instanceof HTMLElement)) return "";
    const body = Array.from(node.childNodes).map(inlineMarkdown).join("");
    switch (node.tagName) {
      case "B":
      case "STRONG":
        return `**${body}**`;
      case "I":
      case "EM":
        return `*${body}*`;
      case "CODE":
        return `\`${body.replace(/`/g, "\\`")}\``;
      case "A": {
        const href = safeHref(node.getAttribute("href") || "");
        return href ? `[${body}](${href})` : body;
      }
      case "BR":
        return "\n";
      default:
        return body;
    }
  }
  function blockMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return inlineMarkdown(node);
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "UL" || node.tagName === "OL") {
      return Array.from(node.children).map((li, index) => `${node.tagName === "OL" ? `${index + 1}.` : "-"} ${inlineMarkdown(li).trim()}`).join("\n");
    }
    if (node.tagName === "BLOCKQUOTE") return inlineMarkdown(node).split("\n").map((line) => `> ${line}`).join("\n");
    if (node.tagName === "PRE") return `\`\`\`
${node.textContent || ""}
\`\`\``;
    return inlineMarkdown(node).trim();
  }
  function editorMarkdown(id) {
    const el2 = document.getElementById(id);
    if (!el2) return "";
    if (el2 instanceof HTMLTextAreaElement || el2 instanceof HTMLInputElement) {
      return el2.value.trim();
    }
    return Array.from(el2.childNodes).map(blockMarkdown).filter(Boolean).join("\n\n").trim();
  }
  function resetEditor(id) {
    const el2 = document.getElementById(id);
    if (!el2) return;
    if (el2 instanceof HTMLTextAreaElement || el2 instanceof HTMLInputElement) {
      el2.value = "";
      return;
    }
    el2.innerHTML = "<p><br></p>";
  }
  function installRichTextEditors(root = document) {
    const onMouseDown = (event) => {
      const button = event.target.closest("[data-rcmd]");
      if (button && root.contains(button)) event.preventDefault();
    };
    const onClick = (event) => {
      const button = event.target.closest("[data-rcmd]");
      if (!button || !root.contains(button)) return;
      const container = button.closest(".rte-shell");
      const textarea = container?.querySelector("textarea");
      if (!textarea) return;
      const cmd = button.dataset.rcmd;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const sel = text.slice(start, end);
      const selectedOr = (fallback) => sel || fallback;
      const prefixLines = (prefix, fallback) => selectedOr(fallback).split("\n").map((line, index) => `${prefix(index)}${line}`).join("\n");
      let replacement = sel;
      if (cmd === "bold") {
        replacement = `**${selectedOr("bold text")}**`;
      } else if (cmd === "italic") {
        replacement = `*${selectedOr("italic text")}*`;
      } else if (cmd === "strike") {
        replacement = `~~${selectedOr("strikethrough text")}~~`;
      } else if (cmd === "code") {
        replacement = `\`${selectedOr("code")}\``;
      } else if (cmd === "codeblock") {
        replacement = `\`\`\`
${selectedOr("code")}
\`\`\``;
      } else if (cmd === "heading") {
        replacement = prefixLines(() => "## ", "Heading");
      } else if (cmd === "quote") {
        replacement = prefixLines(() => "> ", "Quote");
      } else if (cmd === "bullet") {
        replacement = prefixLines(() => "- ", "List item");
      } else if (cmd === "ordered") {
        replacement = prefixLines((index) => `${index + 1}. `, "List item");
      } else if (cmd === "link") {
        const url = window.prompt("Enter link URL (https://...):", "https://");
        const safe = url ? safeHref(url.trim()) : null;
        if (safe) replacement = `[${selectedOr("link text")}](${safe})`;
        else return;
      }
      textarea.value = text.slice(0, start) + replacement + text.slice(end);
      textarea.focus();
      const newPos = start + replacement.length;
      textarea.setSelectionRange(newPos, newPos);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    };
    root.addEventListener("mousedown", onMouseDown);
    root.addEventListener("click", onClick);
    return () => {
      root.removeEventListener("mousedown", onMouseDown);
      root.removeEventListener("click", onClick);
    };
  }

  // src/frontend/petal/components/custom-select.ts
  function closeSelects(except) {
    document.querySelectorAll(".inp.sel .dd").forEach((drop) => {
      if (drop !== except) drop.hidden = true;
    });
    document.querySelectorAll(".inp.sel .selbtn").forEach((button) => {
      if (!except || button.parentElement?.querySelector(".dd") !== except) button.setAttribute("aria-expanded", "false");
    });
  }
  function enhance(select) {
    if (select.__petalEnhanced) return;
    select.__petalEnhanced = true;
    const wrapper = select.parentElement;
    if (!wrapper) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "selbtn";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    const drop = document.createElement("div");
    drop.className = "dd";
    drop.hidden = true;
    wrapper.append(button, drop);
    const draw = () => {
      button.textContent = select.options[select.selectedIndex]?.text || "";
      button.disabled = select.disabled;
      drop.innerHTML = `<div class="menu" role="listbox">${Array.from(select.options).map((option, index) => `<button type="button" role="option" data-petal-option="${index}" aria-selected="${option.selected}">${esc(option.text)}<svg class="ic s ck" aria-hidden="true"><use href="/assets/petal-icons.svg#i-tick-02"/></svg></button>`).join("")}</div>`;
    };
    draw();
    select.__petalObserver = new MutationObserver(draw);
    select.__petalObserver.observe(select, { childList: true, subtree: true, attributes: true });
    button.addEventListener("click", () => {
      const opening = drop.hidden;
      closeSelects(drop);
      drop.hidden = !opening;
      button.setAttribute("aria-expanded", String(opening));
      if (opening) drop.querySelector('[aria-selected="true"]')?.focus();
    });
    drop.addEventListener("click", (event) => {
      const option = event.target.closest("[data-petal-option]");
      if (!option) return;
      select.selectedIndex = Number(option.dataset.petalOption);
      draw();
      closeSelects();
      select.dispatchEvent(new Event("change", { bubbles: true }));
      button.focus();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        select.selectedIndex = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + delta));
        draw();
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }
  function installCustomSelects(root = document) {
    const scan = () => root.querySelectorAll(".inp.sel select").forEach(enhance);
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    const outside = (event) => {
      if (!event.target.closest(".inp.sel")) closeSelects();
    };
    const keydown = (event) => {
      if (event.key === "Escape") closeSelects();
    };
    document.addEventListener("click", outside);
    document.addEventListener("keydown", keydown);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", outside);
      document.removeEventListener("keydown", keydown);
    };
  }

  // src/frontend/petal/components/skeleton.ts
  function block(width, height, radius = "10px") {
    return `<div class="skel" style="width:${width};height:${height}px;border-radius:${radius}"></div>`;
  }
  function renderSkeleton(kind, label = "Loading content") {
    const row = () => `<div class="r">${block("40px", 40, "50%")}<div class="c">${block("60%", 12)}${block("85%", 10)}</div></div>`;
    const views = {
      dashboard: `<div class="g z-skeleton-metrics">${[0, 1, 2, 3].map(() => `<div class="c z-skeleton-card">${block("50%", 10)}${block("70%", 22)}</div>`).join("")}</div>${block("100%", 154, "20px")}${block("100%", 180, "20px")}`,
      list: [0, 1, 2, 3].map(row).join(""),
      table: `${block("100%", 32, "10px")}${[0, 1, 2, 3].map(() => `<div class="r">${block("25%", 12)}${block("30%", 12)}${block("15%", 12)}${block("15%", 12)}</div>`).join("")}`,
      profile: `${block("100%", 60, "16px")}<div class="r">${block("64px", 64, "50%")}<div class="c">${block("45%", 14)}${block("30%", 10)}</div></div>${block("90%", 10)}${block("70%", 10)}`,
      article: `${block("70%", 22)}<div class="r">${block("28px", 28, "50%")}${block("30%", 10)}</div>${block("100%", 130, "16px")}${block("100%", 10)}${block("88%", 10)}`
    };
    return `<div class="z-skb" role="status" aria-live="polite"><span class="sr">${label}</span>${views[kind]}</div>`;
  }

  // src/frontend/petal/components/tabs.ts
  function initTabs(container) {
    const el2 = typeof container === "string" ? document.querySelector(container) : container;
    if (!el2) return () => {
    };
    const buttons = () => Array.from(el2.querySelectorAll('[role="tab"]')).filter((button) => !button.hidden);
    function activate(btn, focus = false) {
      buttons().forEach((b) => {
        const panel2 = document.getElementById(b.getAttribute("aria-controls") || "");
        const isActive = b === btn;
        b.setAttribute("aria-selected", String(isActive));
        b.tabIndex = isActive ? 0 : -1;
        if (panel2) {
          panel2.hidden = !isActive;
          panel2.classList.toggle("on", isActive);
        }
      });
      if (focus) btn.focus();
    }
    const handleClick = (e) => {
      const btn = e.target.closest('[role="tab"]');
      if (btn && el2.contains(btn)) activate(btn);
    };
    const handleKeydown = (e) => {
      const ke = e;
      const current = ke.target.closest('[role="tab"]');
      if (!current || !el2.contains(current)) return;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(ke.key)) return;
      const tabs = buttons();
      const idx = tabs.indexOf(current);
      const next = ke.key === "Home" ? 0 : ke.key === "End" ? tabs.length - 1 : (idx + (ke.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      ke.preventDefault();
      const nextBtn = tabs[next];
      if (nextBtn) activate(nextBtn, true);
    };
    el2.addEventListener("click", handleClick);
    el2.addEventListener("keydown", handleKeydown);
    return () => {
      el2.removeEventListener("click", handleClick);
      el2.removeEventListener("keydown", handleKeydown);
    };
  }

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
  function renderPaginationFooter(page, pages, total, pageSize, ids = {}) {
    const start = (page - 1) * pageSize;
    const countThisPage = Math.min(pageSize, Math.max(0, total - start));
    const infoText = total === 0 ? "0 items" : `Showing ${start + 1}\u2013${start + countThisPage} of ${total}`;
    return `<div class="row wrap" style="justify-content:space-between;align-items:center;padding:12px 14px 14px">
    <span class="muted" ${ids.infoId ? `id="${ids.infoId}"` : ""} style="font-size:12.5px">${infoText}</span>
    <div class="pager" ${ids.pagerId ? `id="${ids.pagerId}"` : ""} data-c="Pagination">${renderPager(page, pages)}</div>
  </div>`;
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

  // src/frontend/core/state/session.ts
  var SessionStore = class {
    state = {
      user: null,
      account: null,
      membership: null,
      staff: null
    };
    listeners = [];
    getState() {
      return this.state;
    }
    set(state) {
      this.state = { ...this.state, ...state };
      this.notify();
    }
    subscribe(listener) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      };
    }
    notify() {
      for (const listener of this.listeners) {
        listener(this.state);
      }
    }
    async loadSession() {
      const data = await api.get("/api/v1/auth/me");
      this.state.user = data.user;
      this.state.account = data.account;
      this.state.membership = data.membership;
      try {
        const staffRes = await api.get("/api/v1/admin/me");
        this.state.staff = staffRes.staff;
      } catch {
        this.state.staff = null;
      }
      this.notify();
      return this.state;
    }
    hasPermission(permission) {
      if (!this.state.staff) return false;
      if (this.state.staff.role === "OWNER") return true;
      return this.state.staff.permissions.includes(permission);
    }
  };
  var sessionStore = new SessionStore();

  // src/frontend/core/state/capabilities.ts
  var CapabilitiesStore = class {
    capabilities = null;
    async load() {
      try {
        this.capabilities = await api.get("/api/v1/platform/capabilities");
      } catch {
        this.capabilities = {
          payments: { enabled: false, mode: "disabled" },
          provisioning: { enabled: false, mode: "disabled" }
        };
      }
      return this.capabilities;
    }
    set(caps) {
      this.capabilities = caps;
    }
    get() {
      return this.capabilities;
    }
    isCommerceReady() {
      return Boolean(this.capabilities?.payments?.enabled && this.capabilities?.provisioning?.enabled);
    }
  };
  var capabilitiesStore = new CapabilitiesStore();

  // src/frontend/client/shell/app-shell.ts
  var AppShell = class {
    cmd;
    constructor() {
      this.cmd = new CommandPaletteController("cmd", "cmd-in", "cmd-res");
    }
    init() {
      initModalStacker();
      this.initTheme();
      this.installHeroicons();
      this.installResponsiveComposition();
      this.rewriteTruthfulCopy();
      this.cmd.bindKeyboard();
    }
    syncDkAttribute() {
      const isDark = document.documentElement.dataset.theme === "dark" || !document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-dk", isDark ? "1" : "0");
    }
    initTheme() {
      const theme = localStorage.getItem("fortless_theme") || localStorage.getItem("theme");
      if (theme) document.documentElement.dataset.theme = theme;
      this.syncDkAttribute();
      window.addEventListener("storage", (e) => {
        if ((e.key === "fortless_theme" || e.key === "theme") && e.newValue) {
          document.documentElement.dataset.theme = e.newValue;
          this.syncDkAttribute();
        }
      });
    }
    toggleTheme() {
      const isDark = document.documentElement.dataset.theme === "dark" || !document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches;
      const next = isDark ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      document.documentElement.setAttribute("data-dk", next === "dark" ? "1" : "0");
      localStorage.setItem("fortless_theme", next);
      localStorage.setItem("theme", next);
    }
    installHeroicons() {
      const targets = [
        ["#nav-dashboard .ic:not(:has(use)), #tab-dashboard .ic:not(:has(use))", "home"],
        ["#nav-servers .ic:not(:has(use)), #tab-servers .ic:not(:has(use))", "servers"],
        ["#nav-deploy .ic:not(:has(use)), #tab-deploy .ic:not(:has(use))", "plus"],
        ["#nav-billing .ic:not(:has(use)), #tab-billing .ic:not(:has(use))", "credit"],
        ["#nav-tickets .ic:not(:has(use)), #tab-tickets .ic:not(:has(use))", "support"],
        ["#nav-audit .ic:not(:has(use))", "shield"],
        ["#nav-settings .ic:not(:has(use)), #tab-settings .ic:not(:has(use))", "settings"]
      ];
      targets.forEach(([selector, icon]) => {
        document.querySelectorAll(selector).forEach((node) => {
          if (!node.querySelector("use")) {
            node.outerHTML = hero(icon, node.classList.contains("s") ? "s" : "");
          }
        });
      });
    }
    installResponsiveComposition() {
      const deploy = document.querySelector("#section-deploy > div");
      if (deploy) {
        deploy.classList.add("deploy-layout");
        deploy.style.gridTemplateColumns = "";
        deploy.style.gap = "";
      }
      const regions = document.getElementById("regionSelector");
      if (regions) {
        regions.classList.add("region-grid");
        regions.style.gridTemplateColumns = "";
        regions.style.gap = "";
      }
      const summary = document.querySelector("#section-deploy .col:last-child .card");
      if (summary) {
        summary.classList.add("summary-card");
        summary.style.position = "";
        summary.style.top = "";
      }
    }
    rewriteTruthfulCopy() {
      const sH2 = document.querySelector("#section-services .card.flat h2");
      if (sH2) sH2.textContent = "Services";
      const tH2 = document.querySelector("#section-tickets h2");
      if (tH2) tH2.textContent = "Support conversations";
      const tP = document.querySelector("#section-tickets h2 + p");
      if (tP) tP.textContent = "Account-scoped ticket threads. No response-time or staffing claim is implied.";
      const bH2 = document.querySelector("#section-billing h2");
      if (bH2) bH2.textContent = "Billing records";
      const bP = document.querySelector("#section-billing h2 + p");
      if (bP) bP.textContent = "Draft and issued records returned by the current API.";
      const aH2 = document.querySelector("#section-audit h2");
      if (aH2) aH2.textContent = "Account activity";
      const aP = document.querySelector("#section-audit h2 + p");
      if (aP) aP.textContent = "Recorded audit events; this UI does not claim independent tamper-proof certification.";
      const newTicketBtn = document.getElementById("newTicketBtn");
      if (newTicketBtn) newTicketBtn.innerHTML = `${hero("plus", "s")}Open ticket`;
    }
    async loadSession() {
      const data = await api("/api/v1/auth/me");
      sessionStore.set({
        user: data.user,
        account: data.account,
        membership: data.membership
      });
      const label = data.user.name || data.user.email;
      const userName = document.getElementById("userName");
      const userRole = document.getElementById("userRole");
      const userAvatar = document.getElementById("userAvatar");
      const profName = document.getElementById("profName");
      const profWorkspace = document.getElementById("profWorkspace");
      const profEmail = document.getElementById("profEmail");
      const profRole = document.getElementById("profRole");
      const initials = label.slice(0, 2).toUpperCase();
      if (userName) userName.textContent = label;
      if (userRole) userRole.textContent = data.membership.role;
      if (userAvatar) userAvatar.textContent = initials;
      const topUserAvatar = document.getElementById("topUserAvatar");
      if (topUserAvatar) topUserAvatar.textContent = initials;
      if (profName) profName.textContent = data.user.name || "\u2014";
      if (profWorkspace) profWorkspace.textContent = data.account.name;
      if (profEmail) profEmail.textContent = data.user.email;
      if (profRole) profRole.innerHTML = `<span class="pill acc">${esc(data.membership.role)}</span>`;
    }
    async loadCapabilities() {
      const data = await api("/api/v1/platform/capabilities");
      capabilitiesStore.set(data);
      const ready = data.payments.enabled && data.provisioning.enabled;
      const status = document.getElementById("platformStatus");
      if (status) {
        status.innerHTML = `<span class="live" style="margin-right:4px;background:${ready ? "var(--good)" : "var(--warn)"}"></span><span>${ready ? "Commerce available" : "Commerce configuration required"}</span>`;
      }
      const button = document.getElementById("doDeployBtn");
      if (button) {
        button.disabled = !ready || button.dataset.checkoutReady !== "true";
        const span = button.querySelector("span");
        if (span && !ready) span.textContent = "Ordering unavailable";
      }
      const notice = document.getElementById("deployCheckoutHint");
      if (notice) {
        if (!ready) notice.textContent = "Payment and infrastructure integrations are disabled until sandbox verification is complete.";
      }
      window.dispatchEvent(new Event("fortless:capabilities"));
    }
    async loadNotifications() {
      try {
        const data = await api("/api/v1/notifications");
        const badge = document.getElementById("notifBadge");
        if (badge) {
          if (data.unreadCount > 0) {
            badge.textContent = String(data.unreadCount);
            badge.style.display = "block";
          } else {
            badge.style.display = "none";
          }
        }
        const list = document.getElementById("notifList");
        if (list) {
          if (!data.notifications.length) {
            list.innerHTML = `
            <div class="es" data-c="Empty state" style="padding:28px 16px">
              <span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="#i-notification-01"/></svg></span>
              <h4>No notifications</h4>
              <p>You are all caught up.</p>
            </div>
          `;
          } else {
            list.innerHTML = data.notifications.map(
              (n) => `
            <div class="li h" style="padding:12px 14px;opacity:${n.readAt ? "0.65" : "1"}">
              <span class="tile ${n.tone || "neu"} sm"><svg class="ic" aria-hidden="true"><use href="#i-${n.icon || "notification-01"}"/></svg></span>
              <span class="tx"><b>${esc(n.title)}</b><small>${esc(n.message)} \xB7 ${formatDate(n.createdAt)}</small></span>
              ${n.linkUrl ? `<a href="${esc(n.linkUrl)}" data-close-notif class="ib s" aria-label="Open"><svg class="ic s" aria-hidden="true"><use href="#i-arrow-right-01"/></svg></a>` : ""}
            </div>
          `
            ).join("");
          }
        }
      } catch {
      }
    }
  };

  // src/frontend/client/pages/services/status.ts
  var RUNTIME = {
    RUNNING: { label: "RUNNING", tone: "good" },
    STOPPED: { label: "OFFLINE", tone: "info" },
    OFFLINE: { label: "OFFLINE", tone: "info" },
    INSTALLING: { label: "INSTALLING", tone: "warn" },
    ERROR: { label: "ERROR", tone: "bad" }
  };
  var CONTRACT = { TERMINATED: "bad", SUSPENDED: "warn", PENDING: "warn", PROVISIONING: "warn", FAILED: "bad" };
  function serviceState(s) {
    const contract = String(s.contract_status ?? s.contractStatus ?? "ACTIVE").toUpperCase();
    if (contract !== "ACTIVE") return { label: contract, tone: CONTRACT[contract] ?? "warn", running: false, controllable: false };
    const runtime = String(s.runtime_state ?? s.runtimeState ?? "UNKNOWN").toUpperCase();
    const r = RUNTIME[runtime] ?? { label: runtime, tone: "info" };
    const controllable = runtime === "RUNNING" || runtime === "STOPPED" || runtime === "OFFLINE";
    return { label: r.label, tone: r.tone, running: runtime === "RUNNING", controllable };
  }
  function liveState(state) {
    const s = state.toLowerCase();
    if (s === "running") return RUNTIME["RUNNING"];
    if (s === "offline") return RUNTIME["OFFLINE"];
    return { label: state.toUpperCase(), tone: "warn" };
  }

  // src/frontend/client/pages/services/filters.ts
  var KEY = "fortless.services.filters";
  var DEFAULTS = { state: "ALL", type: "ALL", q: "", showTerminated: false };
  function loadFilters() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        state: ["ALL", "RUNNING", "OTHER"].includes(String(raw.state)) ? String(raw.state) : DEFAULTS.state,
        type: typeof raw.type === "string" ? raw.type.slice(0, 200) : DEFAULTS.type,
        q: typeof raw.q === "string" ? raw.q.slice(0, 100) : DEFAULTS.q,
        showTerminated: raw.showTerminated === true
      };
    } catch {
      return { ...DEFAULTS };
    }
  }
  function saveFilters(patch) {
    const next = { ...loadFilters(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
    }
    return next;
  }
  var isTerminated = (svc) => String(svc.contract_status ?? svc.contractStatus ?? "").toUpperCase() === "TERMINATED";
  var visibleServices = (services) => loadFilters().showTerminated ? services : services.filter((s) => !isTerminated(s));

  // src/frontend/core/utils/formatting.ts
  function money(minorUnits, currency = "EUR") {
    const val = Number(minorUnits) || 0;
    return new Intl.NumberFormat(void 0, {
      style: "currency",
      currency
    }).format(val / 100);
  }
  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] || "B"}`;
  }

  // src/frontend/client/pages/home/index.ts
  function tile(iconName, tone, size = "sm") {
    const cls = ["tile", tone, size].filter(Boolean).join(" ");
    return `<span class="${cls}"><svg class="ic" aria-hidden="true"><use href="#i-${iconName}"/></svg></span>`;
  }
  function pill(text, tone, dot = false) {
    return `<span class="pill ${tone}${dot ? " d" : ""}">${esc(text)}</span>`;
  }
  function metricCard(label, value, iconName, tone) {
    return `<div class="card mt" data-c="Metric tile"><div><span class="l">${esc(label)}</span><b class="v">${esc(String(value))}</b></div><span class="tile ${tone}"><svg class="ic" aria-hidden="true"><use href="#i-${iconName}"/></svg></span></div>`;
  }
  function emptyState(iconName, title, message, action = "") {
    return `<div class="es" data-c="Empty state">${tile(iconName, "neu", "lg")}<h4>${esc(title)}</h4><p>${esc(message)}</p>${action}</div>`;
  }
  function skeleton(n = 5) {
    return `<div class="sk" role="status" aria-label="Loading">${Array(n).fill("<i></i>").join("")}</div>`;
  }
  function panel(title, sub, body, actionHref, actionLabel) {
    const action = `<a class="btn xs" href="${actionHref}" data-app-route>${esc(actionLabel)}</a>`;
    return `<section class="card"><div class="ch"><div class="tx"><h3>${esc(title)}</h3><p>${esc(sub)}</p></div>${action}</div><div class="col">${body}</div></section>`;
  }
  var TIX_TONE = {
    OPEN: "info",
    WAITING_STAFF: "warn",
    WAITING_CUSTOMER: "violet",
    RESOLVED: "good",
    CLOSED: ""
  };
  function niceName(s) {
    return s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
  function dashboardGreeting(name, now = /* @__PURE__ */ new Date()) {
    const firstName = name?.trim().split(/\s+/)[0] || "";
    const addressed = firstName ? `, ${firstName}` : "";
    const hour = now.getHours();
    if (hour >= 6 && hour < 12) return `Good morning${addressed} \u2600\uFE0F`;
    if (hour >= 12 && hour < 18) return `Hello${addressed} \u{1F4AA}`;
    if (hour >= 18 && hour < 23) return `Good evening${addressed} \u{1F319}`;
    return firstName ? `Still up, ${firstName}? \u{1F971}\u{1F4A4}` : "Still up? \u{1F971}\u{1F4A4}";
  }
  async function renderHome() {
    const host = document.getElementById("dashboardOverview");
    if (!host) return;
    host.innerHTML = skeleton();
    const [serviceResult, ticketResult, invoiceResult, auditResult] = await Promise.allSettled([
      api("/api/v1/services"),
      api("/api/v1/tickets"),
      api("/api/v1/invoices"),
      api("/api/v1/audit")
    ]);
    const services = visibleServices(serviceResult.status === "fulfilled" ? serviceResult.value.services : []);
    const tickets = ticketResult.status === "fulfilled" ? ticketResult.value.tickets : [];
    const invoices = invoiceResult.status === "fulfilled" ? invoiceResult.value.invoices : [];
    const logs = auditResult.status === "fulfilled" ? auditResult.value.logs : [];
    const openTickets = tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status));
    const outstanding = invoices.filter((i) => ["DRAFT", "OPEN", "PENDING", "OVERDUE"].includes(i.status));
    const currency = invoices[0]?.currency || "EUR";
    const outstandingTotal = outstanding.reduce((sum, i) => sum + Number(i.total_minor_units || 0), 0);
    const caps = capabilitiesStore.get();
    const providerOk = Boolean(caps?.provisioning.enabled && caps?.payments.enabled);
    const greeting = dashboardGreeting(sessionStore.getState().user?.name);
    const failCount = [serviceResult, ticketResult, invoiceResult, auditResult].filter(
      (r) => r.status === "rejected"
    ).length;
    const running = services.filter((s) => serviceState(s).running).length;
    const installing = services.filter((s) => serviceState(s).label === "INSTALLING").length;
    const stopped = services.filter((s) => !serviceState(s).running && serviceState(s).label !== "INSTALLING").length;
    const totalSvcs = services.length;
    const fleetBar = totalSvcs > 0 ? `<div style="display:flex;height:12px;border-radius:12px;overflow:hidden;gap:3px;margin:4px 0 12px">
        ${running > 0 ? `<b style="flex:${running};background:var(--good);border-radius:12px"></b>` : ""}
        ${installing > 0 ? `<b style="flex:${installing};background:var(--warn);border-radius:12px"></b>` : ""}
        ${stopped > 0 ? `<b style="flex:${stopped};background:var(--info);border-radius:12px"></b>` : ""}
       </div>
       <div class="row" style="gap:14px;flex-wrap:nowrap">
         ${running > 0 ? pill(`${running} running`, "good", true) : ""}
         ${installing > 0 ? pill(`${installing} installing`, "warn", true) : ""}
         ${stopped > 0 ? pill(`${stopped} stopped`, "info", true) : ""}
       </div>` : emptyState(
      "server",
      "No services yet",
      "Browse the catalog to start.",
      '<a class="btn s tint" href="/app/deploy" data-app-route="deploy">View catalog</a>'
    );
    const servicesBody = services.slice(0, 3).map((s) => {
      const st = serviceState(s);
      const rt = st.label;
      const tone = st.tone;
      const tag = isTerminated(s) ? "div" : "a";
      const attrs = isTerminated(s) ? 'class="li h"' : `class="li" href="/app/services/${esc(s.id)}" data-app-route="service-detail"`;
      return `<${tag} ${attrs}>${tile("server", tone)}<span class="tx"><b>${esc(s.plan_name || "Hosting service")}</b><small>${esc(s.node_name || s.node_id || "No node assigned")}</small></span>${pill(rt, tone)}</${tag}>`;
    }).join("") || emptyState("server", "No services yet", "Ordering stays unavailable until providers are verified.");
    const supportBody = tickets.slice(0, 3).map((t) => {
      const tone = TIX_TONE[t.status] || "";
      return `<button class="li" data-app-route-btn="support">${tile("support", tone)}<span class="tx"><b>${esc(t.subject)}</b><small>${esc(t.id)} \xB7 ${esc(formatDate(t.updated_at || t.created_at))}</small></span>${pill(niceName(t.status), tone)}</button>`;
    }).join("") || emptyState("support", "No support conversations", "Open a ticket when you need help.");
    const billingBody = invoices.slice(0, 3).map((r) => {
      const tone = r.status === "PAID" ? "good" : r.status === "OPEN" ? "info" : "";
      return `<div class="li h">${tile("document", "")}<span class="tx"><b>${esc(r.invoice_number || "Draft invoice")}</b><small>${esc(formatDate(r.created_at))}</small></span><b class="num">${money(r.total_minor_units, r.currency)}</b>${pill(r.status, tone)}</div>`;
    }).join("") || emptyState("document", "No billing records", "Issued invoices appear here.");
    const activityBody = logs.slice(0, 4).map(
      (l) => `<div class="li h">${tile("shield", "")}<span class="tx"><b>${esc(String(l.action || "").replace(/\./g, " \xB7 "))}</b><small>${esc(formatDate(l.created_at))}</small></span></div>`
    ).join("") || emptyState("shield", "No recent activity", "Events appear as you use the account.");
    host.innerHTML = `
    ${failCount ? `<div style="margin-bottom:12px"><div class="alert warn">${hero("warning", "s")}<div><b>${failCount} dashboard source${failCount === 1 ? "" : "s"} unavailable</b><span>Available records are shown below.</span></div></div></div>` : ""}
    ${!providerOk ? `<div style="margin-bottom:12px"><div class="alert warn">${hero("warning", "s")}<div><b>Commerce configuration required</b><span>Ordering stays unavailable until payment and infrastructure providers pass verification.</span></div></div></div>` : ""}

    <div class="hd">
      <div class="tx">
        <h2>${esc(greeting)}</h2>
        <p>Services, billing, support and security activity from your account.</p>
      </div>
      <div class="row act" style="gap:8px">
        <a class="btn" href="/app/support/new" data-app-route="ticket-new"><svg class="ic s" aria-hidden="true"><use href="#i-message-01"/></svg>Open ticket</a>
        <a class="btn pri" href="/app/deploy" data-app-route="deploy"><svg class="ic s" aria-hidden="true"><use href="#i-add-01"/></svg>Deploy service</a>
      </div>
    </div>

    <div class="g g4 k2" style="margin-bottom:12px">
      ${metricCard("Active services", services.filter((s) => s.contract_status === "ACTIVE").length, "server", "good")}
      ${metricCard("Total services", services.length, "package", "")}
      ${metricCard("Open tickets", openTickets.length, "message-01", openTickets.length ? "warn" : "")}
      ${metricCard("Outstanding", money(outstandingTotal, currency), "credit-card", outstandingTotal ? "warn" : "")}
    </div>

    <div style="margin-bottom:12px">
      <section class="card" data-c="Fleet bar">
        <div class="ch"><div class="tx"><h3>Fleet</h3><p>Runtime state across your services</p></div></div>
        ${fleetBar}
      </section>
    </div>

    <div class="g g2">
      ${panel("My services", "Provider-observed contract and runtime state.", servicesBody, "/app/services", "View all")}
      ${panel("Support", "Recent account conversations.", supportBody, "/app/support", "View support")}
      ${panel("Billing", "Latest issued account records.", billingBody, "/app/billing", "View billing")}
      ${panel("Recent activity", "Security-relevant account events.", activityBody, "/app/activity", "View activity")}
    </div>`;
    host.querySelectorAll("[data-app-route-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.appRouteBtn;
        if (target) window.history.pushState({}, "", `/app/${target}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
    });
  }

  // src/frontend/client/pages/dashboard/index.ts
  var serviceInventory = [];
  var servicePage = 1;
  var servicePageSize = 8;
  function metricCard2(label, value, icon, tone = "", sub = "") {
    return `<div class="card mt" data-c="Metric tile"><div><span class="l">${esc(label)}</span><b class="v">${esc(String(value))}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div><span class="tile ${tone}"><svg class="ic" aria-hidden="true"><use href="#i-${icon}"/></svg></span></div>`;
  }
  function renderServiceInventory() {
    const host = document.getElementById("serversContainer");
    if (!host) return;
    const query = document.getElementById("serviceSearch")?.value.trim().toLowerCase() || "";
    const type = document.getElementById("serviceTypeFilter")?.value || "ALL";
    const state = document.querySelector('#serviceStateSeg button[aria-selected="true"]')?.getAttribute("data-v") || "ALL";
    const showTerminated = document.getElementById("serviceShowTerminated")?.getAttribute("aria-checked") === "true";
    saveFilters({ state, type, q: document.getElementById("serviceSearch")?.value.trim() ?? "", showTerminated });
    const filtered = serviceInventory.filter((svc) => {
      if (isTerminated(svc) && !showTerminated) return false;
      const st = serviceState(svc);
      const matchQ = !query || [svc.plan_name, svc.identifier, svc.id, svc.node_name].some((v) => String(v || "").toLowerCase().includes(query));
      const matchT = type === "ALL" || svc.plan_name === type;
      const matchS = state === "ALL" || (state === "RUNNING" ? st.running : !st.running);
      return matchQ && matchT && matchS;
    });
    const count = document.getElementById("serviceResultCount");
    if (count) count.textContent = `${filtered.length} of ${serviceInventory.length} services`;
    const infoEl = document.getElementById("servicePageInfo");
    const pagerEl = document.getElementById("servicePager");
    const paginationRow = document.getElementById("servicePaginationRow");
    if (!filtered.length) {
      if (paginationRow) paginationRow.style.display = "none";
      if (infoEl) infoEl.textContent = "0 services";
      if (pagerEl) pagerEl.innerHTML = "";
      host.innerHTML = serviceInventory.length ? `<div class="es" data-c="Empty state"><span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="#i-search-01"/></svg></span><h4>No matching services</h4><p>Try a different name, product or runtime filter.</p></div>` : `<div class="es" data-c="Empty state"><span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="#i-server"/></svg></span><h4>No services yet</h4><p>Ordering stays unavailable until payment and infrastructure providers are configured and verified.</p><a class="btn s tint" href="/app/deploy" data-app-route="deploy"><svg class="ic s" aria-hidden="true"><use href="#i-add-01"/></svg>View catalog</a></div>`;
      return;
    }
    const pagination = paginateItems(filtered, servicePage, servicePageSize);
    servicePage = pagination.page;
    if (paginationRow) paginationRow.style.display = filtered.length > servicePageSize ? "flex" : "none";
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    const providerReady = Boolean(capabilitiesStore.get()?.provisioning.enabled);
    host.innerHTML = pagination.items.map((svc) => {
      const st = serviceState(svc);
      const rt = st.label;
      const tone = st.tone;
      const running = st.running;
      const memMb = Number(svc.memory_limit_mb || 0);
      const mem = `${(memMb / 1024).toFixed(memMb % 1024 === 0 ? 0 : 1)} GB`;
      const diskMb = Number(svc.disk_limit_mb || 0);
      const disk = diskMb >= 1024 ? `${(diskMb / 1024).toFixed(diskMb % 1024 === 0 ? 0 : 1)} GB disk` : `${diskMb} MB disk`;
      const canControl = st.controllable && (!svc.shared_by || svc.shared_preset !== "viewer") && svc.user_can_control !== false;
      const powers = !canControl ? "" : providerReady ? `<button class="btn xs" data-power="RESTART" data-service="${esc(svc.id)}" ${running ? "" : "disabled"}><svg class="ic xs" aria-hidden="true"><use href="#i-refresh"/></svg>Restart</button><button class="btn xs bad" data-power="STOP" data-service="${esc(svc.id)}" ${running ? "" : "disabled"}><svg class="ic xs" aria-hidden="true"><use href="#i-stop"/></svg>Stop</button><button class="btn xs good" data-power="START" data-service="${esc(svc.id)}" ${running ? "disabled" : ""}><svg class="ic xs" aria-hidden="true"><use href="#i-play"/></svg>Start</button>` : `<span class="pill warn">Provider controls unavailable</span>`;
      const searchTokens = `${esc(svc.plan_name || "")} ${esc(svc.identifier || "")} ${esc(svc.id || "")} ${esc(svc.node_name || "")}`.toLowerCase();
      return `<article class="li h" data-c="Service row" data-s="${running ? "RUNNING" : "OTHER"}" data-t="${searchTokens}" data-p="${esc(svc.plan_name || "")}" style="flex-wrap:wrap;padding:14px 16px"><span class="tile ${tone} sm"><svg class="ic" aria-hidden="true"><use href="#i-server"/></svg></span><div class="tx" style="min-width:160px"><div class="row" style="gap:8px"><b style="white-space:normal">${esc(svc.plan_name || "Hosting service")}</b><span class="pill ${tone} d">${esc(rt)}</span>${svc.shared_by ? `<span class="pill info">Shared by ${esc(svc.shared_by)}</span>` : ""}</div><small style="white-space:normal">${esc(svc.node_name || svc.node_id || "\u2014")} \xB7 ${esc(mem)} RAM \xB7 ${esc(String(svc.cpu_limit_pct || 0))}% CPU \xB7 ${esc(disk)}</small></div>${svc.identifier ? `<code class="hide-n">${esc(svc.identifier)}</code>` : ""}<div class="row" style="gap:6px">${powers}${isTerminated(svc) ? "" : `<a href="/app/services/${esc(svc.id)}" class="btn xs tint" data-app-route="service-detail"><svg class="ic xs" aria-hidden="true"><use href="#i-arrow-right-01"/></svg>Manage</a>`}</div></article>`;
    }).join("");
  }
  function filterServices() {
    renderServiceInventory();
  }
  var servicesRenderOk = false;
  async function renderServices() {
    const host = document.getElementById("servicesView");
    if (!host) return;
    host.innerHTML = `<div class="sk" role="status" aria-label="Loading services"><i></i><i></i><i></i></div>`;
    try {
      const { services } = await api("/api/v1/services");
      serviceInventory = services;
      const saved = loadFilters();
      const counted = services.filter((s) => !isTerminated(s));
      const running = counted.filter((s) => serviceState(s).running).length;
      const memory = counted.reduce((sum, s) => sum + Number(s.memory_limit_mb || 0), 0);
      const cpu = counted.reduce((sum, s) => sum + Number(s.cpu_limit_pct || 0), 0);
      const typeOpts = Array.from(new Set(services.map((s) => String(s.plan_name || "Hosting service")))).sort().map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
      host.innerHTML = `
      <div class="hd" data-c="Header">
        <div class="tx">
          <h2>Servers &amp; Instances</h2>
          <p>Provider-observed runtime records for this account.</p>
        </div>
        <div class="row" style="gap:8px"><button class="btn" id="refreshServicesBtn"><svg class="ic s" aria-hidden="true"><use href="#i-refresh"/></svg>Refresh</button></div>
      </div>

      <div class="g g4 k2" style="margin-bottom:12px">
        ${metricCard2("Running", running, "play", "good")}
        ${metricCard2("Total", counted.length, "server", "")}
        ${metricCard2("Allocated RAM", `${(memory / 1024).toFixed(memory ? 1 : 0)} GB`, "database", "info")}
        ${metricCard2("Allocated CPU", `${cpu}%`, "cpu", "violet")}
      </div>

      <div class="row" style="margin-bottom:12px">
        <label class="sch" data-c="Search field">
          <svg class="ic s" aria-hidden="true"><use href="#i-search-01"/></svg>
          <input id="serviceSearch" placeholder="Search services" aria-label="Search services" value="${esc(saved.q)}">
        </label>
        <div class="inp hide-n" style="min-height:44px;background:var(--s1);border-radius:999px;padding:0 14px">
          <select id="serviceTypeFilter" aria-label="Product"><option value="ALL">All products</option>${typeOpts}</select>
          <svg class="ic s" aria-hidden="true"><use href="#i-arrow-down-01"/></svg>
        </div>
        <div class="seg" role="tablist" id="serviceStateSeg">
          ${["ALL", "RUNNING", "OTHER"].map((v) => `<button role="tab" aria-selected="${saved.state === v}" data-v="${v}" type="button">${v === "ALL" ? "All" : v === "RUNNING" ? "Running" : "Other"}</button>`).join("")}
        </div>
        <label class="row nw" style="gap:8px;font-weight:650;font-size:13px;cursor:pointer"><button type="button" class="sw s" role="switch" id="serviceShowTerminated" aria-checked="${saved.showTerminated}" aria-label="Show closed services"></button>Show closed</label>
        <span class="faint" style="font-weight:650;font-size:13px" id="serviceResultCount"></span>
      </div>

      <div id="serversContainer" class="col" style="gap:8px" data-flt></div>
      <div class="row wrap" id="servicePaginationRow" style="justify-content:space-between;align-items:center;padding:12px 4px 4px;margin-top:8px;display:none">
        <span class="muted" id="servicePageInfo" style="font-size:12.5px"></span>
        <div class="pager" id="servicePager" data-c="Pagination"></div>
      </div>`;
      const typeSelect = document.getElementById("serviceTypeFilter");
      if (typeSelect && [...typeSelect.options].some((o) => o.value === saved.type)) typeSelect.value = saved.type;
      servicePage = 1;
      renderServiceInventory();
      document.getElementById("serviceShowTerminated")?.addEventListener("click", (e) => {
        const sw = e.currentTarget;
        sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true"));
        servicePage = 1;
        renderServiceInventory();
      });
      document.getElementById("serviceSearch")?.addEventListener("input", () => {
        servicePage = 1;
        renderServiceInventory();
      });
      document.getElementById("serviceTypeFilter")?.addEventListener("change", () => {
        servicePage = 1;
        renderServiceInventory();
      });
      document.getElementById("serviceStateSeg")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-v]");
        if (!btn) return;
        document.querySelectorAll("#serviceStateSeg button").forEach((b) => b.setAttribute("aria-selected", "false"));
        btn.setAttribute("aria-selected", "true");
        servicePage = 1;
        renderServiceInventory();
      });
      document.getElementById("servicePager")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-pg]");
        if (btn && !btn.disabled) {
          const p = Number(btn.dataset.pg);
          if (p && p !== servicePage) {
            servicePage = p;
            renderServiceInventory();
          }
        }
      });
      document.getElementById("refreshServicesBtn")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        if (btn) btn.disabled = true;
        try {
          servicesRenderOk = false;
          await renderServices();
          if (servicesRenderOk) toast("Refreshed services list", "info");
        } catch (err) {
          toast("Failed to refresh services: " + (err.message || "Network error"), "bad");
        } finally {
          if (btn) btn.disabled = false;
        }
      });
      servicesRenderOk = true;
    } catch (error) {
      servicesRenderOk = false;
      host.innerHTML = `<div class="alert bad">${hero("warning", "s")}<div><b>Failed to load services</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
  async function powerService(id, action, button) {
    button.disabled = true;
    try {
      await api(`/api/v1/services/${encodeURIComponent(id)}/power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      toast(`${action.charAt(0)}${action.slice(1).toLowerCase()} sent`, "good");
      await renderServices();
    } catch (error) {
      toast(error.message, "bad");
      button.disabled = false;
    }
  }

  // src/frontend/client/pages/services/console.ts
  var MAX_LINES = 1e3;
  var MAX_HISTORY = 50;
  var MAX_RETRIES = 8;
  var SGR = /\u001b\[([0-9;]*)m/g;
  var OTHER_ESC = /\u001b\[[0-9;?]*[ -/]*[@-ln-~]/g;
  var COLORS = {
    30: "var(--ink3)",
    31: "var(--bad)",
    32: "var(--good)",
    33: "var(--warn)",
    34: "var(--info)",
    35: "var(--violet)",
    36: "var(--info)",
    37: "var(--ink)"
  };
  function renderLine(line) {
    const frag = document.createElement("div");
    frag.style.minHeight = "1.55em";
    const clean = line.replace(OTHER_ESC, "");
    let color = "";
    let bold = false;
    let last = 0;
    const push = (text) => {
      if (!text) return;
      if (!color && !bold) {
        frag.appendChild(document.createTextNode(text));
        return;
      }
      const span = document.createElement("span");
      if (color) span.style.color = color;
      if (bold) span.style.fontWeight = "700";
      span.textContent = text;
      frag.appendChild(span);
    };
    for (const m of clean.matchAll(SGR)) {
      push(clean.slice(last, m.index));
      last = (m.index ?? 0) + m[0].length;
      const codes = (m[1] || "0").split(";").map((c) => parseInt(c || "0", 10));
      for (const code of codes) {
        if (code === 0) {
          color = "";
          bold = false;
        } else if (code === 1) bold = true;
        else if (code === 22) bold = false;
        else if (code === 39) color = "";
        else if (COLORS[code]) color = COLORS[code];
        else if (code >= 90 && code <= 97) color = COLORS[code - 60];
      }
    }
    push(clean.slice(last));
    return frag;
  }
  function initServiceConsole(serviceId, hooks = {}) {
    const out = document.getElementById("dtlConsoleOut");
    const host = document.getElementById("dtlPaneConsole") ?? document.body;
    const input = document.getElementById("dtlConsoleInput");
    const state = document.getElementById("dtlConsoleState");
    let ws = null;
    let active = false;
    let retries = 0;
    let retryTimer;
    const storageKey = `fortless_cmd_history_${serviceId}`;
    let history2 = [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) history2 = parsed.filter((x) => typeof x === "string").slice(-MAX_HISTORY);
      }
    } catch {
    }
    let historyPos = history2.length;
    if (history2.length === 0) {
      void api.get(`/api/v1/services/${encodeURIComponent(serviceId)}/console/history`).then((res) => {
        if (res?.history && Array.isArray(res.history) && history2.length === 0) {
          history2 = res.history.map((h) => h.command).reverse().slice(-MAX_HISTORY);
          historyPos = history2.length;
          try {
            localStorage.setItem(storageKey, JSON.stringify(history2));
          } catch {
          }
        }
      }).catch(() => {
      });
    }
    const setState = (text) => {
      if (state) state.textContent = text;
    };
    const append = (line) => {
      if (!out) return;
      const atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 24;
      out.appendChild(renderLine(line));
      while (out.childElementCount > MAX_LINES && out.firstChild) out.removeChild(out.firstChild);
      if (atBottom) out.scrollTop = out.scrollHeight;
    };
    const fetchCreds = () => api.get(`/api/v1/services/${encodeURIComponent(serviceId)}/console`);
    function scheduleRetry() {
      if (!active || !document.body.contains(host)) return;
      if (retries >= MAX_RETRIES) {
        setState("Connection lost");
        return;
      }
      const delay = Math.min(3e4, 1e3 * 2 ** retries);
      retries += 1;
      setState(`Reconnecting in ${Math.round(delay / 1e3)}s\u2026`);
      retryTimer = window.setTimeout(() => {
        void connect();
      }, delay);
    }
    async function connect() {
      if (!active || ws && ws.readyState <= WebSocket.OPEN) return;
      setState("Connecting\u2026");
      let creds;
      try {
        creds = await fetchCreds();
      } catch (e) {
        const code = e?.code;
        if (code && code !== "PROVIDER_ERROR") {
          setState(e?.message || "Unavailable");
          return;
        }
        scheduleRetry();
        return;
      }
      if (!active) return;
      const socket = new WebSocket(creds.socket);
      ws = socket;
      const send = (event, args) => socket.send(JSON.stringify({ event, args }));
      let authFailed = false;
      socket.onopen = () => send("auth", [creds.token]);
      socket.onmessage = async (msg) => {
        if (!document.body.contains(host)) {
          active = false;
          socket.close();
          return;
        }
        let data;
        try {
          data = JSON.parse(String(msg.data));
        } catch {
          return;
        }
        const a = data.args ?? [];
        switch (data.event) {
          case "auth success":
            retries = 0;
            setState("Connected");
            send("send logs", [null]);
            break;
          case "console output":
          case "install output":
          case "daemon message":
            append(String(a[0] ?? ""));
            break;
          case "status":
            setState(`Connected \xB7 ${String(a[0] ?? "")}`);
            hooks.onStatus?.(String(a[0] ?? ""));
            break;
          case "stats":
            try {
              hooks.onStats?.(JSON.parse(String(a[0] ?? "{}")));
            } catch {
            }
            break;
          case "token expiring":
          case "token expired":
            try {
              send("auth", [(await fetchCreds()).token]);
            } catch {
              setState("Session expired");
            }
            break;
          case "jwt error":
            authFailed = true;
            setState("Authentication failed");
            socket.close();
            break;
        }
      };
      socket.onclose = () => {
        if (ws === socket) ws = null;
        if (active && !authFailed) scheduleRetry();
        else if (!active) setState("Disconnected");
      };
    }
    input?.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!history2.length) return;
        e.preventDefault();
        historyPos = Math.max(0, Math.min(history2.length, historyPos + (e.key === "ArrowUp" ? -1 : 1)));
        input.value = history2[historyPos] ?? "";
        return;
      }
      if (e.key !== "Enter" || !input.value.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
      const cmd = input.value;
      ws.send(JSON.stringify({ event: "send command", args: [cmd] }));
      void api.post(`/api/v1/services/${encodeURIComponent(serviceId)}/console/history`, { command: cmd, delivered: true }).catch(() => {
      });
      if (history2[history2.length - 1] !== cmd) history2.push(cmd);
      if (history2.length > MAX_HISTORY) history2.shift();
      try {
        localStorage.setItem(storageKey, JSON.stringify(history2));
      } catch {
      }
      historyPos = history2.length;
      input.value = "";
    });
    return {
      connect: () => {
        active = true;
        retries = 0;
        void connect();
      },
      disconnect: () => {
        active = false;
        window.clearTimeout(retryTimer);
        ws?.close();
      }
    };
  }

  // src/frontend/client/pages/services/dialog.ts
  function open(build) {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "mdl";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.innerHTML = '<div class="ov"></div><div class="bx" style="max-width:440px"></div>';
      const box = modal.querySelector(".bx");
      const previous = document.activeElement;
      let finished = false;
      const done = (v) => {
        if (finished) return;
        finished = true;
        document.removeEventListener("keydown", onKey, true);
        modal.remove();
        previous?.focus?.();
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          done(null);
        }
      };
      document.addEventListener("keydown", onKey, true);
      modal.querySelector(".ov").addEventListener("click", () => done(null));
      build(box, done);
      document.body.appendChild(modal);
      modal.hidden = false;
      (box.querySelector("input, button.pri, button.bad") ?? box).focus();
    });
  }
  var header = (o) => `<h3 style="margin:0">${esc(o.title)}</h3>${o.message ? `<p class="muted" style="font-weight:560;margin:0">${esc(o.message)}</p>` : ""}`;
  var footer = (o) => `<div class="row" style="justify-content:flex-end;gap:8px"><button class="btn s" type="button" data-cancel>Cancel</button><button class="btn s ${o.danger ? "bad" : "pri"}" type="submit">${esc(o.confirmLabel ?? "Confirm")}</button></div>`;
  async function confirmDialog(o) {
    const res = await open((box, done) => {
      box.innerHTML = `<form class="col" style="gap:14px">${header(o)}${footer(o)}</form>`;
      box.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        done(true);
      });
      box.querySelector("[data-cancel]").addEventListener("click", () => done(null));
    });
    return res === true;
  }
  async function promptDialog(o) {
    return open((box, done) => {
      box.innerHTML = `<form class="col" style="gap:14px">${header(o)}
      <div class="fld">${o.label ? `<label for="dlgInput">${esc(o.label)}</label>` : ""}<div class="inp"><input id="dlgInput" autocomplete="off" spellcheck="false" ${o.inputMode ? `inputmode="${esc(o.inputMode)}"` : ""} maxlength="${o.maxLength ?? 1024}" placeholder="${esc(o.placeholder ?? "")}"></div></div>
      ${footer(o)}</form>`;
      const input = box.querySelector("#dlgInput");
      input.value = o.value ?? "";
      box.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        const v = input.value.trim();
        done(v || null);
      });
      box.querySelector("[data-cancel]").addEventListener("click", () => done(null));
      window.setTimeout(() => input.select(), 0);
    });
  }
  async function formDialog(o) {
    return open((box, done) => {
      const field = (f) => {
        const id = `dlg_${f.key}`;
        if (f.type === "checkbox") return `<label class="row nw" style="gap:8px"><input type="checkbox" id="${id}" ${f.value === "true" ? "checked" : ""}> ${esc(f.label)}</label>`;
        const control2 = f.type === "select" ? `<div class="inp sel"><select id="${id}">${(f.options ?? []).map(([v, l]) => `<option value="${esc(v)}" ${v === f.value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>` : `<div class="inp"><input id="${id}" autocomplete="off" ${f.type === "number" ? `type="number" min="${f.min ?? 0}" max="${f.max ?? 99999}"` : ""} value="${esc(f.value ?? "")}" placeholder="${esc(f.placeholder ?? "")}"></div>`;
        return `<div class="fld"><label for="${id}">${esc(f.label)}</label>${control2}</div>`;
      };
      box.innerHTML = `<form class="col" style="gap:14px">${header(o)}${o.fields.map(field).join("")}${footer(o)}</form>`;
      box.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        const out = {};
        for (const f of o.fields) {
          const el2 = box.querySelector(`#dlg_${f.key}`);
          out[f.key] = f.type === "checkbox" ? el2.checked : el2.value;
        }
        done(out);
      });
      box.querySelector("[data-cancel]").addEventListener("click", () => done(null));
    });
  }

  // src/frontend/client/pages/services/files.ts
  var TEXT_EXT = /\.(txt|log|json|ya?ml|properties|conf|cfg|ini|toml|xml|md|js|mjs|cjs|ts|py|sh|bash|java|lua|cs|csv|env|html?|css|mcmeta|secret|sk|skript|lang|nbt\.txt)$/i;
  var ARCHIVE_EXT = /\.(zip|tar|tar\.gz|tgz)$/i;
  var MAX_EDIT = 1024 * 1024;
  var EDITOR_SRC = "/assets/editor-ui.js?v=2";
  var editorScript = null;
  function loadEditor() {
    editorScript ??= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = EDITOR_SRC;
      s.onload = () => resolve(window.FortlessEditor);
      s.onerror = () => {
        editorScript = null;
        reject(new Error("Could not load the editor."));
      };
      document.head.appendChild(s);
    });
    return editorScript;
  }
  var el = (tag, cls = "", html = "") => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  };
  var parentOf = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
  var join = (d, n) => (d === "/" ? "" : d) + "/" + n;
  function initServiceFiles(serviceId) {
    const host = document.getElementById("dtlFilesBody");
    if (!host) return { open() {
    } };
    const base = `/api/v1/services/${encodeURIComponent(serviceId)}/files`;
    const fail3 = (e) => toast(e?.message || "Request failed", "bad");
    const pendingNote = (r) => {
      if (r?.pending) toast("The server is still working on this. Do not repeat the action; the folder refreshes shortly.", "info");
      return r;
    };
    host.innerHTML = `<div class="fm" id="fm">
    <div class="fm-side" id="fmSide">
      <div class="row" style="justify-content:space-between;gap:8px">
        <div class="btngroup">
          <button class="btn s sq sec" type="button" data-fm="newfile" data-tip="New file" data-pos="bottom" aria-label="New file">${hero("plus", "s")}</button>
          <button class="btn s sq sec" type="button" data-fm="newdir" data-tip="New folder" data-pos="bottom" aria-label="New folder">${hero("folder-01", "s")}</button>
          <label class="btn s sq sec" style="cursor:pointer" data-tip="Upload" data-pos="bottom" aria-label="Upload">${hero("arrow", "s")}<input type="file" id="fmUpload" multiple hidden></label>
 <button class="btn s sq sec" type="button" data-fm="pull" data-tip="Download from URL" data-pos="bottom" aria-label="Download from URL">${hero("link-square-02", "s")}</button>
          <button class="btn s sq sec" type="button" data-fm="refresh" data-tip="Refresh" data-pos="bottom" aria-label="Refresh">${hero("refresh", "s")}</button>
        </div>
      </div>
      <div class="bbar" id="fmBulk" hidden><b id="fmBulkN">0 selected</b><span style="flex:1"></span><button class="btn s sec" type="button" data-fm="bulk-archive">Archive</button><button class="btn s sec" type="button" data-fm="bulk-delete">Delete</button></div>
      <div class="fm-tree"><div class="tree" id="fmTree" role="tree" aria-label="Server files" aria-multiselectable="true"></div></div>
    </div>
    <div class="rh" id="fmHandle" role="separator" aria-orientation="vertical" aria-label="Resize file tree"><i></i></div>
    <div class="fm-main">
      <div class="fm-tabs" id="fmTabs" role="tablist"></div>
      <div class="fm-bar" id="fmBar" hidden><div class="crumbs" id="fmPath"></div><button class="btn s pri" type="button" data-fm="save">Save</button></div>
      <div class="es fm-empty" id="fmEmpty"><span class="tile neu lg">${hero("document")}</span><h4>No file open</h4></div>
      <div class="fm-ed" id="fmEd" hidden></div>
    </div>
  </div>`;
    const tree = document.getElementById("fmTree");
    const tabsEl = document.getElementById("fmTabs");
    const bar = document.getElementById("fmBar");
    const pathEl = document.getElementById("fmPath");
    const bulkBar = document.getElementById("fmBulk");
    const side = document.getElementById("fmSide");
    const empty2 = document.getElementById("fmEmpty");
    const edEl = document.getElementById("fmEd");
    let loaded = false;
    let selectedDir = "/";
    let active = null;
    const tabs = [];
    const dirty = /* @__PURE__ */ new Set();
    const isNew = /* @__PURE__ */ new Set();
    let editor = null;
    let menu = null;
    const kidsOf = (dir) => dir === "/" ? tree : tree.querySelector(`.tn[data-path="${CSS.escape(dir)}"] > .kids`);
    function nodeFor(dir, e) {
      const path = join(dir, e.name);
      const more = `<button class="ib xs more" type="button" data-more aria-label="Actions for ${"item"}" tabindex="-1">${hero("settings", "xs")}</button>`;
      let node;
      if (e.isFile) {
        node = el("div", "leaf", `${hero("document", "s")}<span class="nm"></span>${more}`);
        node.setAttribute("role", "treeitem");
        node.tabIndex = -1;
      } else {
        node = el("div", "tn");
        node.setAttribute("role", "treeitem");
        node.setAttribute("aria-expanded", "false");
        node.tabIndex = -1;
        node.appendChild(el("div", "tr0", `${hero("arrow-right-01", "xs chv")}${hero("folder-01", "s")}<span class="nm"></span>${more}`));
        node.appendChild(el("div", "kids")).setAttribute("role", "group");
      }
      node.dataset["path"] = path;
      node.dataset["name"] = e.name;
      node.dataset["file"] = e.isFile ? "1" : "";
      node.dataset["size"] = String(e.size);
      node.dataset["mime"] = e.mime;
      node.querySelector(".nm").textContent = e.name;
      node.querySelector(".nm").title = e.isFile ? `${e.name} \xB7 ${formatBytes(e.size)}` : e.name;
      node.querySelector("[data-more]").setAttribute("aria-label", `Actions for ${e.name}`);
      return node;
    }
    async function loadDir(dir) {
      const kids = kidsOf(dir);
      if (!kids) return;
      const res = await api.get(`${base}?dir=${encodeURIComponent(dir)}`);
      kids.replaceChildren(...res.entries.map((e) => nodeFor(dir, e)));
      if (!res.entries.length && dir !== "/") kids.appendChild(el("div", "leaf")).textContent = "Empty";
      if (active) markActive();
    }
    const markActive = () => {
      tree.querySelectorAll(".leaf.on").forEach((n) => n.classList.remove("on"));
      if (active) tree.querySelector(`.leaf[data-path="${CSS.escape(active)}"]`)?.classList.add("on");
    };
    async function toggle(node, force) {
      const open2 = force ?? !node.classList.contains("open");
      node.classList.toggle("open", open2);
      node.setAttribute("aria-expanded", String(open2));
      if (open2 && !node.dataset["loaded"]) {
        node.dataset["loaded"] = "1";
        try {
          await loadDir(node.dataset["path"]);
        } catch (e) {
          node.dataset["loaded"] = "";
          fail3(e);
        }
      }
    }
    async function refreshDir(dir) {
      const node = dir === "/" ? null : tree.querySelector(`.tn[data-path="${CSS.escape(dir)}"]`);
      if (node && !node.dataset["loaded"]) return;
      try {
        await loadDir(dir);
      } catch (e) {
        fail3(e);
      }
    }
    function askName(dir, initial, icon) {
      return new Promise((resolve) => {
        const kids = kidsOf(dir);
        if (!kids) return resolve(null);
        if (dir !== "/") {
          const n = tree.querySelector(`.tn[data-path="${CSS.escape(dir)}"]`);
          if (n && !n.classList.contains("open")) void toggle(n, true);
        }
        const row = el("div", "leaf", hero(icon, "s"));
        const input = document.createElement("input");
        input.className = "mono";
        input.style.cssText = "flex:1;min-width:0;background:var(--s1);border:1px solid var(--accent);border-radius:8px;height:26px;padding:0 8px;font-size:13px;outline:0";
        input.value = initial;
        row.appendChild(input);
        kids.insertBefore(row, kids.firstChild);
        let done = false;
        const finish = (v) => {
          if (done) return;
          done = true;
          row.remove();
          resolve(v);
        };
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") finish(input.value.trim() || null);
          else if (ev.key === "Escape") finish(null);
        });
        input.addEventListener("blur", () => finish(null));
        input.focus();
        input.select();
      });
    }
    const nameTaken = (dir, name) => Array.from(kidsOf(dir)?.children ?? []).some((c) => c.dataset["name"] === name);
    function renderTabs() {
      tabsEl.replaceChildren(...tabs.map((p) => {
        const t = el("button", `fm-tab${p === active ? " on" : ""}`);
        t.setAttribute("type", "button");
        t.setAttribute("role", "tab");
        t.dataset["tab"] = p;
        const name = el("span");
        name.textContent = p.split("/").pop() || p;
        name.title = p;
        t.appendChild(name);
        if (dirty.has(p)) t.appendChild(el("span", "dot"));
        const x = el("span", "x", hero("x", "xs"));
        x.dataset["close"] = p;
        t.appendChild(x);
        return t;
      }));
      const has = active !== null;
      bar.hidden = !has;
      edEl.hidden = !has;
      empty2.hidden = has;
      pathEl.replaceChildren(...(active ?? "").split("/").filter(Boolean).flatMap((seg, i, all) => {
        const part = el(i === all.length - 1 ? "span" : "a", i === all.length - 1 ? "cur" : "");
        part.textContent = seg;
        return i === 0 ? [part] : [el("span", "", hero("arrow-right-01", "xs")), part];
      }));
    }
    async function ensureEditor() {
      if (editor) return editor;
      const api2 = await loadEditor();
      edEl.hidden = false;
      editor = api2.mountEditor(edEl, {
        onDirty(p, d) {
          if (d) dirty.add(p);
          else dirty.delete(p);
          renderTabs();
        },
        onSave(p) {
          void save(p);
        }
      });
      return editor;
    }
    async function openFile(path, content) {
      try {
        if (!tabs.includes(path)) {
          if (content === void 0) content = (await api.get(`${base}/content?path=${encodeURIComponent(path)}`)).content;
          const ed = await ensureEditor();
          tabs.push(path);
          active = path;
          renderTabs();
          ed.open(path, content);
        } else {
          const ed = await ensureEditor();
          active = path;
          renderTabs();
          ed.show(path);
        }
        markActive();
        editor?.focus();
      } catch (e) {
        fail3(e);
      }
    }
    async function save(path) {
      const content = editor?.value(path);
      if (content === void 0) return;
      try {
        const saved = await api(`${base}/content`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, content }) });
        if (saved?.pending) {
          pendingNote(saved);
          return;
        }
        isNew.delete(path);
        editor?.markSaved(path);
        toast("Saved", "good");
        if (isNew.size === 0) await refreshDir(parentOf(path));
      } catch (e) {
        fail3(e);
      }
    }
    async function closeTab(path) {
      if (dirty.has(path) && !await confirmDialog({ title: `Close ${path.split("/").pop()}?`, message: "It has unsaved changes.", confirmLabel: "Close without saving", danger: true })) return;
      const i = tabs.indexOf(path);
      tabs.splice(i, 1);
      dirty.delete(path);
      isNew.delete(path);
      editor?.close(path);
      active = tabs[Math.min(i, tabs.length - 1)] ?? null;
      renderTabs();
      if (active) {
        editor?.show(active);
        markActive();
      }
    }
    async function newFile(dir) {
      const name = await askName(dir, "", "document");
      if (!name) return;
      if (/[\/\\]/.test(name) || nameTaken(dir, name)) return toast("Invalid or existing name", "bad");
      const path = join(dir, name);
      isNew.add(path);
      await openFile(path, "");
      dirty.add(path);
      renderTabs();
    }
    async function newDir(dir) {
      const name = await askName(dir, "", "folder-01");
      if (!name) return;
      if (/[\/\\]/.test(name) || nameTaken(dir, name)) return toast("Invalid or existing name", "bad");
      try {
        pendingNote(await api.post(`${base}/folder`, { dir, name }));
        await refreshDir(dir);
      } catch (e) {
        fail3(e);
      }
    }
    async function rename(node) {
      const dir = parentOf(node.dataset["path"]);
      const from = node.dataset["name"];
      const nm = node.querySelector(".nm");
      nm.style.visibility = "hidden";
      const input = document.createElement("input");
      input.className = "mono";
      input.value = from;
      input.style.cssText = "position:absolute;background:var(--s1);border:1px solid var(--accent);border-radius:8px;height:26px;padding:0 8px;font-size:13px;outline:0;width:180px";
      nm.parentElement.insertBefore(input, nm);
      const to = await new Promise((resolve) => {
        let done = false;
        const fin = (v) => {
          if (done) return;
          done = true;
          input.remove();
          nm.style.visibility = "";
          resolve(v);
        };
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") fin(input.value.trim() || null);
          else if (e.key === "Escape") fin(null);
        });
        input.addEventListener("blur", () => fin(null));
        input.focus();
        input.select();
      });
      if (!to || to === from) return;
      if (/[\/\\]/.test(to) || nameTaken(dir, to)) return toast("Invalid or existing name", "bad");
      try {
        pendingNote(await api.post(`${base}/rename`, { dir, from, to }));
        await refreshDir(dir);
      } catch (e) {
        fail3(e);
      }
    }
    async function remove(node) {
      const name = node.dataset["name"];
      if (!await confirmDialog({ title: `Delete ${name}?`, message: "This cannot be undone.", confirmLabel: "Delete", danger: true })) return;
      const dir = parentOf(node.dataset["path"]);
      try {
        pendingNote(await api.post(`${base}/delete`, { dir, names: [name] }));
        tabs.filter((p) => p === node.dataset["path"] || p.startsWith(node.dataset["path"] + "/")).forEach((p) => {
          dirty.delete(p);
          void closeTab(p);
        });
        await refreshDir(dir);
      } catch (e) {
        fail3(e);
      }
    }
    async function download(path) {
      try {
        window.location.assign((await api.get(`${base}/download-url?path=${encodeURIComponent(path)}`)).url);
      } catch (e) {
        fail3(e);
      }
    }
    async function upload(dir, files) {
      try {
        const { url } = await api.get(`${base}/upload-url?dir=${encodeURIComponent(dir)}`);
        const form = new FormData();
        for (const f of Array.from(files)) form.append("files", f, f.name);
        const res = await fetch(`${url}&directory=${encodeURIComponent(dir)}`, { method: "POST", body: form });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        toast(`${files.length} file(s) uploaded`, "good");
        await refreshDir(dir);
      } catch (e) {
        fail3(e);
      }
    }
    async function afterArchive(dir, pending, done) {
      if (!pending) {
        toast(done, "good");
        await refreshDir(dir);
        return;
      }
      toast("Still working on the server. The folder refreshes shortly.", "info");
      for (const wait of [8e3, 2e4, 45e3]) {
        await new Promise((r) => window.setTimeout(r, wait));
        await refreshDir(dir);
      }
    }
    async function move(node) {
      const from = parentOf(node.dataset["path"]);
      const dest = await promptDialog({ title: `Move ${node.dataset["name"]}`, label: "Destination folder", value: from, placeholder: "/plugins", confirmLabel: "Move" });
      if (!dest || dest === from) return;
      try {
        pendingNote(await api.post(`${base}/move`, { dir: from, name: node.dataset["name"], destDir: dest }));
        await refreshDir(from);
        await refreshDir(dest);
      } catch (e) {
        fail3(e);
      }
    }
    async function chmod(node) {
      const mode = await promptDialog({ title: `Permissions for ${node.dataset["name"]}`, label: "Mode (octal)", value: node.dataset["file"] === "1" ? "644" : "755", placeholder: "644", inputMode: "numeric", maxLength: 4, confirmLabel: "Apply" });
      if (!mode) return;
      try {
        pendingNote(await api.post(`${base}/chmod`, { dir: parentOf(node.dataset["path"]), names: [node.dataset["name"]], mode }));
        toast("Permissions updated", "good");
      } catch (e) {
        fail3(e);
      }
    }
    async function pull(dir) {
      const url = await promptDialog({ title: "Download a file to the server", label: "File address (https)", placeholder: "https://example.com/file.jar", confirmLabel: "Download" });
      if (!url) return;
      toast("Downloading\u2026", "info");
      try {
        const r = await api.post(`${base}/pull`, { dir, url });
        await afterArchive(dir, r.pending, "Downloaded");
      } catch (e) {
        fail3(e);
      }
    }
    async function archive(node) {
      const dir = parentOf(node.dataset["path"]);
      toast("Archiving\u2026", "info");
      try {
        const r = await api.post(`${base}/archive`, { dir, names: [node.dataset["name"]] });
        await afterArchive(dir, r.pending, r.archive ? `Created ${r.archive}` : "");
      } catch (e) {
        fail3(e);
      }
    }
    async function unarchive(node) {
      const dir = parentOf(node.dataset["path"]);
      toast("Extracting\u2026", "info");
      try {
        const r = await api.post(`${base}/unarchive`, { dir, file: node.dataset["name"] });
        await afterArchive(dir, r.pending, "Extracted");
      } catch (e) {
        fail3(e);
      }
    }
    async function copy2(node) {
      try {
        pendingNote(await api.post(`${base}/copy`, { path: node.dataset["path"] }));
        await refreshDir(parentOf(node.dataset["path"]));
      } catch (e) {
        fail3(e);
      }
    }
    const selected = /* @__PURE__ */ new Map();
    const selEl = (n) => n.classList.contains("tn") ? n.querySelector(".tr0") : n;
    function renderBulk() {
      bulkBar.hidden = selected.size === 0;
      document.getElementById("fmBulkN").textContent = `${selected.size} selected`;
    }
    function clearSelection() {
      selected.forEach((n) => selEl(n).classList.remove("sel"));
      selected.clear();
      renderBulk();
    }
    function toggleSelect(node) {
      const path = node.dataset["path"];
      const first = selected.keys().next().value;
      if (first !== void 0 && parentOf(first) !== parentOf(path)) clearSelection();
      if (selected.has(path)) {
        selected.delete(path);
        selEl(node).classList.remove("sel");
      } else {
        selected.set(path, node);
        selEl(node).classList.add("sel");
      }
      renderBulk();
    }
    async function bulkArchive() {
      const names = [...selected.values()].map((n) => n.dataset["name"]);
      const dir = parentOf([...selected.keys()][0]);
      toast("Archiving\u2026", "info");
      try {
        const r = await api.post(`${base}/archive`, { dir, names });
        clearSelection();
        await afterArchive(dir, r.pending, r.archive ? `Created ${r.archive}` : "");
      } catch (e) {
        fail3(e);
      }
    }
    async function bulkDelete() {
      const names = [...selected.values()].map((n) => n.dataset["name"]);
      const paths = [...selected.keys()];
      const dir = parentOf(paths[0]);
      if (!await confirmDialog({ title: `Delete ${names.length} item(s)?`, message: "This cannot be undone.", confirmLabel: "Delete", danger: true })) return;
      try {
        pendingNote(await api.post(`${base}/delete`, { dir, names }));
        tabs.filter((p) => paths.some((d) => p === d || p.startsWith(d + "/"))).forEach((p) => {
          dirty.delete(p);
          void closeTab(p);
        });
        clearSelection();
        await refreshDir(dir);
      } catch (e) {
        fail3(e);
      }
    }
    const handle = document.getElementById("fmHandle");
    const fm = document.getElementById("fm");
    try {
      const w = Number(localStorage.getItem("fmSideWidth"));
      if (w >= 200) side.style.width = `${w}px`;
    } catch {
    }
    handle.addEventListener("pointerdown", (ev) => {
      handle.setPointerCapture(ev.pointerId);
      const move2 = (e) => {
        const box = fm.getBoundingClientRect();
        side.style.width = `${Math.max(200, Math.min(box.width * 0.6, e.clientX - box.left))}px`;
      };
      const up = () => {
        handle.removeEventListener("pointermove", move2);
        handle.removeEventListener("pointerup", up);
        try {
          localStorage.setItem("fmSideWidth", String(Math.round(side.getBoundingClientRect().width)));
        } catch {
        }
      };
      handle.addEventListener("pointermove", move2);
      handle.addEventListener("pointerup", up);
    });
    function closeMenu() {
      menu?.remove();
      menu = null;
    }
    function openMenu(node, x, y) {
      closeMenu();
      const isFile = node.dataset["file"] === "1";
      const name = node.dataset["name"];
      const path = node.dataset["path"];
      const items = [];
      if (isFile) {
        items.push(["document", "Open", () => void openFile(path)]);
        items.push(["arrow", "Download", () => void download(path)]);
        if (ARCHIVE_EXT.test(name)) items.push(["archive-01", "Unarchive", () => void unarchive(node)]);
      } else {
        items.push(["plus", "New file", () => void newFile(path)]);
        items.push(["folder-01", "New folder", () => void newDir(path)]);
        items.push(["arrow", "Download file here", () => void pull(path)]);
      }
      items.push("-", ["settings", "Rename", () => void rename(node)], ["folder-01", "Move", () => void move(node)], ["copy", "Copy", () => void copy2(node)], ["shield", "Permissions", () => void chmod(node)]);
      items.push(["archive-01", "Archive", () => void archive(node)]);
      items.push("-", ["x", "Delete", () => void remove(node), true]);
      const m = el("div", "menu");
      for (const it of items) {
        if (it === "-") {
          m.appendChild(el("div", "sep"));
          continue;
        }
        const b = el("button", it[3] ? "bad" : "", hero(it[0], "s"));
        b.setAttribute("type", "button");
        b.appendChild(document.createTextNode(it[1]));
        b.addEventListener("click", () => {
          closeMenu();
          it[2]();
        });
        m.appendChild(b);
      }
      menu = el("div", "pop");
      menu.appendChild(m);
      document.body.appendChild(menu);
      const w = menu.offsetWidth, h = menu.offsetHeight;
      menu.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + "px";
      menu.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + "px";
    }
    document.addEventListener("click", (e) => {
      if (menu && !e.target.closest(".pop")) closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
    const targetDir = () => selectedDir;
    tree.addEventListener("click", (ev) => {
      const t = ev.target;
      const node = t.closest(".tn, .leaf");
      if (!node || !node.dataset["path"]) return;
      const rect = t.closest("[data-more]");
      if (rect) {
        const r = rect.getBoundingClientRect();
        openMenu(node, r.left, r.bottom + 4);
        ev.stopPropagation();
        return;
      }
      if (ev.ctrlKey || ev.metaKey) {
        toggleSelect(node);
        return;
      }
      if (selected.size) clearSelection();
      if (node.dataset["file"] === "1") {
        selectedDir = parentOf(node.dataset["path"]);
        const size = Number(node.dataset["size"]);
        const editable = size <= MAX_EDIT && (TEXT_EXT.test(node.dataset["name"]) || (node.dataset["mime"] || "").startsWith("text/"));
        if (editable) void openFile(node.dataset["path"]);
        else toast("Not editable here. Use the menu to download it.", "info");
      } else if (t.closest(".tr0")) {
        selectedDir = node.dataset["path"];
        void toggle(node);
      }
    });
    tree.addEventListener("contextmenu", (ev) => {
      const node = ev.target.closest(".tn, .leaf");
      if (!node?.dataset["path"]) return;
      ev.preventDefault();
      openMenu(node, ev.clientX, ev.clientY);
    });
    tabsEl.addEventListener("click", (ev) => {
      const t = ev.target;
      const close = t.closest("[data-close]");
      if (close) {
        void closeTab(close.dataset["close"]);
        return;
      }
      const tab = t.closest("[data-tab]");
      if (tab) {
        active = tab.dataset["tab"];
        renderTabs();
        editor?.show(active);
        markActive();
        editor?.focus();
      }
    });
    host.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-fm]");
      if (!b) return;
      switch (b.dataset["fm"]) {
        case "newfile":
          void newFile(targetDir());
          break;
        case "newdir":
          void newDir(targetDir());
          break;
        case "pull":
          void pull(targetDir());
          break;
        case "save":
          if (active) void save(active);
          break;
        case "bulk-archive":
          void bulkArchive();
          break;
        case "bulk-delete":
          void bulkDelete();
          break;
        case "refresh":
          void loadDir("/").then(() => {
            selectedDir = "/";
          }).catch(fail3);
          break;
      }
    });
    host.addEventListener("change", (ev) => {
      const input = ev.target;
      if (input.id === "fmUpload" && input.files?.length) void upload(targetDir(), input.files).finally(() => {
        input.value = "";
      });
    });
    tree.addEventListener("dragover", (e) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        tree.classList.add("drop-on");
      }
    });
    tree.addEventListener("dragleave", () => tree.classList.remove("drop-on"));
    tree.addEventListener("drop", (e) => {
      e.preventDefault();
      tree.classList.remove("drop-on");
      if (!e.dataTransfer?.files.length) return;
      const folder = e.target.closest(".tn");
      void upload(folder?.dataset["path"] ?? targetDir(), e.dataTransfer.files);
    });
    renderTabs();
    return {
      open() {
        if (loaded) return;
        loaded = true;
        void loadDir("/").catch((e) => {
          loaded = false;
          tree.replaceChildren(el("div", "alert bad", `<div><b>Could not load files</b></div>`));
          fail3(e);
        });
      }
    };
  }

  // src/frontend/client/pages/services/activity.ts
  var CATEGORIES = [["all", "All"], ["power", "Power"], ["files", "Files"], ["backups", "Backups"], ["network", "Network"], ["settings", "Settings"], ["game", "Game"], ["databases", "Databases"], ["schedules", "Schedules"], ["billing", "Billing"], ["lifecycle", "Lifecycle"], ["panel", "Panel"]];
  var RANGES = [["1", "24h"], ["7", "7d"], ["30", "30d"], ["all", "All time"]];
  var actor = (t) => t === "USER" ? "You" : t === "STAFF" ? "Fortless staff" : t === "PSP_WEBHOOK" ? "Payment provider" : "System";
  function describe(action, raw) {
    let m = {};
    try {
      m = JSON.parse(raw) || {};
    } catch {
    }
    const names = Array.isArray(m["names"]) ? m["names"].join(", ") : "";
    switch (action) {
      case "order.paid":
        return { label: "Payment verified", detail: "", icon: "credit-card", tone: "good" };
      case "service.created":
        return { label: "Service created", detail: "", icon: "settings-01", tone: "info" };
      case "service.provisioned":
        return { label: "Provisioning completed", detail: "", icon: "rocket-01", tone: "violet" };
      case "service.provision_failed":
        return { label: "Provisioning failed", detail: "", icon: "alert-02", tone: "bad" };
      case "service.suspend":
        return { label: "Suspended", detail: String(m["reason"] || ""), icon: "stop", tone: "warn" };
      case "service.unsuspend":
        return { label: "Unsuspended", detail: "", icon: "play", tone: "good" };
      case "service.terminate":
        return { label: "Terminated", detail: "", icon: "x", tone: "bad" };
      case "service.owner_assigned":
        return { label: "Linked to your panel account", detail: "", icon: "shield", tone: "info" };
      case "service.provider_missing":
        return { label: "Server missing on the panel", detail: "", icon: "alert-02", tone: "bad" };
      case "service.power": {
        const a = String(m["action"] || "").toLowerCase();
        const label = a === "start" ? "Started" : a === "stop" ? "Stopped" : a === "restart" ? "Restarted" : a === "kill" ? "Killed" : "Power action";
        const bad = a === "stop" || a === "kill";
        return { label, detail: "", icon: bad ? "stop" : a === "restart" ? "refresh" : "play", tone: bad ? "bad" : "good" };
      }
      case "service.file.write":
        return { label: "File saved", detail: String(m["path"] || ""), icon: "document", tone: "info" };
      case "service.file.mkdir":
        return { label: "Folder created", detail: String(m["path"] || ""), icon: "folder-01", tone: "info" };
      case "service.file.delete":
        return { label: "Deleted", detail: `${m["dir"] || ""}: ${names}`, icon: "x", tone: "bad" };
      case "service.file.rename":
        return { label: "Renamed", detail: `${m["from"] || ""} to ${m["to"] || ""}`, icon: "settings-01", tone: "info" };
      case "service.file.archive":
        return { label: "Archived", detail: String(m["archive"] || names), icon: "archive-01", tone: "info" };
      case "service.file.unarchive":
        return { label: "Extracted", detail: String(m["file"] || ""), icon: "archive-01", tone: "info" };
      case "service.file.move":
        return { label: "Moved", detail: `${m["name"] || ""} to ${m["to"] || ""}`, icon: "folder-01", tone: "info" };
      case "service.file.chmod":
        return { label: "Permissions changed", detail: `${names} \xB7 ${m["mode"] || ""}`, icon: "shield", tone: "info" };
      case "service.file.pull":
        return { label: "Downloaded to server", detail: String(m["host"] || ""), icon: "arrow", tone: "info" };
      case "service.file.copy":
        return { label: "Copied", detail: String(m["path"] || ""), icon: "copy", tone: "info" };
      case "service.backup.create":
        return { label: "Backup created", detail: String(m["name"] || ""), icon: "archive-01", tone: "good" };
      case "service.backup.delete":
        return { label: "Backup deleted", detail: "", icon: "x", tone: "bad" };
      case "service.backup.lock":
        return { label: "Backup lock changed", detail: "", icon: "shield", tone: "info" };
      case "service.backup.restore":
        return { label: "Backup restored", detail: m["truncate"] ? "Files were wiped first" : "", icon: "refresh", tone: "warn" };
      case "service.network.assign":
        return { label: "Port added", detail: "", icon: "plus", tone: "good" };
      case "service.network.notes":
        return { label: "Port notes changed", detail: "", icon: "settings-01", tone: "info" };
      case "service.network.primary":
        return { label: "Primary port changed", detail: "", icon: "settings-01", tone: "info" };
      case "service.network.remove":
        return { label: "Port removed", detail: "", icon: "x", tone: "bad" };
      case "service.startup.variable":
        return { label: "Startup variable changed", detail: String(m["key"] || ""), icon: "settings-01", tone: "info" };
      case "service.startup.image":
        return { label: "Docker image changed", detail: String(m["image"] || ""), icon: "settings-01", tone: "warn" };
      case "service.mod.install":
        return { label: "Mod or plugin installed", detail: String(m["file"] || ""), icon: "plus", tone: "good" };
      case "service.game.icon":
        return { label: "Server icon changed", detail: "", icon: "settings-01", tone: "info" };
      case "service.database.create":
        return { label: "Database created", detail: String(m["name"] || ""), icon: "database", tone: "good" };
      case "service.database.rotate":
        return { label: "Database password rotated", detail: "", icon: "shield", tone: "warn" };
      case "service.database.delete":
        return { label: "Database deleted", detail: "", icon: "x", tone: "bad" };
      case "service.schedule.create":
        return { label: "Schedule created", detail: String(m["name"] || ""), icon: "plus", tone: "good" };
      case "service.schedule.update":
        return { label: "Schedule updated", detail: String(m["name"] || ""), icon: "settings-01", tone: "info" };
      case "service.schedule.delete":
        return { label: "Schedule deleted", detail: "", icon: "x", tone: "bad" };
      case "service.schedule.execute":
        return { label: "Schedule run manually", detail: "", icon: "play", tone: "info" };
      case "service.schedule.task_add":
        return { label: "Schedule task added", detail: String(m["action"] || ""), icon: "plus", tone: "info" };
      case "service.schedule.task_update":
        return { label: "Schedule task changed", detail: String(m["action"] || ""), icon: "settings-01", tone: "info" };
      case "service.schedule.task_delete":
        return { label: "Schedule task removed", detail: "", icon: "x", tone: "warn" };
      case "service.settings.rename":
        return { label: "Server renamed", detail: "", icon: "settings-01", tone: "info" };
      case "service.settings.reinstall":
        return { label: "Reinstall started", detail: "", icon: "refresh", tone: "warn" };
      default:
        return { label: action.replace(/[._]/g, " "), detail: "", icon: "shield", tone: "neu" };
    }
  }
  function initServiceActivity(serviceId) {
    const host = document.getElementById("dtlActivityBody");
    if (!host) return { open() {
    } };
    const state = { category: "all", range: "30", q: "", page: 1 };
    let loaded = false;
    let timer;
    const seg = (name, items, value) => `<div class="seg" role="tablist" data-seg="${name}">${items.map(([v, l]) => `<button type="button" role="tab" aria-selected="${v === value}" data-v="${v}">${l}</button>`).join("")}</div>`;
    host.innerHTML = `<div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div class="inp s pill" style="flex:1;min-width:180px">${hero("search", "s")}<input id="actQ" placeholder="Search activity" aria-label="Search activity"></div>
      ${seg("range", RANGES, state.range)}
    </div>
    <div style="margin-bottom:14px;overflow-x:auto">${seg("category", CATEGORIES, state.category)}</div>
    <div id="actList"></div>
    <div class="row" style="justify-content:space-between;margin-top:14px"><span class="faint" id="actInfo" style="font-size:12.5px"></span><div class="pager" id="actPager"></div></div>`;
    const list = document.getElementById("actList");
    const info = document.getElementById("actInfo");
    const pager = document.getElementById("actPager");
    function renderPager2(page, pages) {
      const nums = /* @__PURE__ */ new Set([1, pages, page - 1, page, page + 1]);
      const seq = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
      const btn = (label, p, extra = "") => `<button type="button" data-pg="${p}" ${extra}>${label}</button>`;
      let html = btn(hero("arrow-left-01", "s"), page - 1, page === 1 ? 'disabled aria-label="Previous"' : 'aria-label="Previous"');
      let prev = 0;
      for (const n of seq) {
        if (n - prev > 1) html += '<button type="button" disabled>\u2026</button>';
        html += btn(String(n), n, n === page ? 'aria-current="true"' : "");
        prev = n;
      }
      html += btn(hero("arrow-right-01", "s"), page + 1, page === pages ? 'disabled aria-label="Next"' : 'aria-label="Next"');
      pager.innerHTML = pages > 1 ? html : "";
    }
    const humanize = (event) => event.replace(/^server:/, "").replace(/[.:_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    async function loadPanel() {
      try {
        const res = await api.get(`/api/v1/services/${encodeURIComponent(serviceId)}/panel-activity?page=${state.page}`);
        state.page = res.page;
        list.innerHTML = res.events.length ? `<div class="tl2">${res.events.map((e) => `<div class="ev"><span class="tile neu">${hero("shield")}</span><div style="min-width:0"><b>${esc(humanize(e.event))}</b><small style="display:block">${esc(e.actor ?? "System")}${e.api ? " \xB7 API" : ""}</small></div><small>${esc(formatDate(e.timestamp))}</small></div>`).join("")}</div>` : `<div class="es"><span class="tile neu lg">${hero("shield")}</span><h4>No panel activity</h4></div>`;
        info.textContent = res.total ? `${res.total} events` : "";
        renderPager2(res.page, res.pages);
      } catch (e) {
        list.innerHTML = `<div class="alert bad"><div><b>Could not load panel activity</b><span>${esc(e?.message || "")}</span></div></div>`;
      }
    }
    async function load() {
      if (state.category === "panel") return loadPanel();
      const qs = new URLSearchParams({ category: state.category, range: state.range, q: state.q, page: String(state.page) });
      try {
        const res = await api.get(`/api/v1/services/${encodeURIComponent(serviceId)}/activity?${qs}`);
        state.page = res.page;
        const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
        list.innerHTML = res.events.length ? `<div class="tl2">${res.events.map((ev) => {
          const d = describe(ev.action, ev.metadata);
          return `<div class="ev"><span class="tile ${d.tone}">${hero(d.icon)}</span><div style="min-width:0"><b>${esc(d.label)}</b><small style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(actor(ev.actorType))}${d.detail ? " \xB7 " + esc(d.detail) : ""}</small></div><small>${esc(formatDate(ev.createdAt))}</small></div>`;
        }).join("")}</div>` : `<div class="es"><span class="tile neu lg">${hero("shield")}</span><h4>No activity</h4></div>`;
        info.textContent = res.total ? `${(res.page - 1) * res.pageSize + 1}-${(res.page - 1) * res.pageSize + res.events.length} of ${res.total}` : "";
        renderPager2(res.page, pages);
      } catch (e) {
        list.innerHTML = `<div class="alert bad"><div><b>Could not load activity</b><span>${esc(e?.message || "")}</span></div></div>`;
      }
    }
    host.addEventListener("click", (ev) => {
      const t = ev.target;
      const segBtn = t.closest("[data-seg] [data-v]");
      if (segBtn) {
        const name = segBtn.closest("[data-seg]").dataset["seg"];
        state[name] = segBtn.dataset["v"];
        state.page = 1;
        segBtn.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === segBtn)));
        void load();
        return;
      }
      const pg = t.closest("[data-pg]");
      if (pg && !pg.disabled) {
        state.page = Number(pg.dataset["pg"]);
        void load();
      }
    });
    host.addEventListener("input", (ev) => {
      if (ev.target.id !== "actQ") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        state.q = ev.target.value.trim();
        state.page = 1;
        void load();
      }, 300);
    });
    return { open() {
      if (!loaded) {
        loaded = true;
        void load();
      }
    } };
  }

  // src/frontend/client/pages/services/game.ts
  var fail = (e) => toast(e?.message || "Request failed", "bad");
  var json = (url, method, body) => api(url, {
    method,
    headers: body === void 0 ? {} : { "Content-Type": "application/json" },
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  var javaLabel = (image) => image ? image.match(/java_(\d+)/)?.[1] ? `Java ${image.match(/java_(\d+)/)[1]}` : image : "unknown";
  function control(f, value) {
    const id = `gm_${f.key}`;
    if (f.type === "bool") return `<button type="button" class="sw" role="switch" id="${id}" data-key="${esc(f.key)}" aria-checked="${value === "true"}" aria-label="${esc(f.label)}"></button>`;
    if (f.type === "enum") return `<div class="inp sel"><select id="${id}" data-key="${esc(f.key)}">${f.options.map((o) => `<option value="${esc(o.value)}" ${o.value === value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>`;
    if (f.type === "int") return `<div class="inp"><input id="${id}" data-key="${esc(f.key)}" type="number" ${f.min !== void 0 ? `min="${f.min}"` : ""} ${f.max !== void 0 ? `max="${f.max}"` : ""} value="${esc(value)}"></div>`;
    return `<div class="inp"><input id="${id}" data-key="${esc(f.key)}" maxlength="${f.maxLength ?? 200}" value="${esc(value)}"></div>`;
  }
  function initGame(serviceId) {
    const host = document.getElementById("dtlGameBody");
    const base = `/api/v1/services/${encodeURIComponent(serviceId)}`;
    let loaded = false;
    let info = null;
    let source = 0;
    let eulaPrompted = false;
    const initial = /* @__PURE__ */ new Map();
    const valueOf = (f) => info?.values?.[f.key] ?? f.default ?? (f.type === "bool" ? "false" : "");
    async function render(h) {
      info = await api.get(`${base}/game`);
      if (!info.profile) {
        h.innerHTML = `<div class="es"><span class="tile neu lg">${hero("server")}</span><h4>No game tools for this server</h4></div>`;
        return;
      }
      const p = info.profile;
      const groups = /* @__PURE__ */ new Map();
      for (const f of p.schema) groups.set(f.group ?? "Settings", [...groups.get(f.group ?? "Settings") ?? [], f]);
      initial.clear();
      const j = info.java;
      const settingsHtml = [...groups].map(([group, fields]) => {
        const controls = fields.map((field) => {
          const value = valueOf(field);
          initial.set(field.key, value);
          return `<div class="fld"><div class="row" style="justify-content:space-between;gap:10px"><label for="gm_${esc(field.key)}">${esc(field.label)}</label>${field.type === "bool" ? control(field, value) : ""}</div>${field.type === "bool" ? "" : control(field, value)}${field.description ? `<small class="faint">${esc(field.description)}</small>` : ""}</div>`;
        }).join("");
        return `<div><div class="faint" style="font-weight:700;font-size:12.5px;margin-bottom:8px">${esc(group)}</div><div class="g g2" style="gap:12px">${controls}</div></div>`;
      }).join("");
      h.innerHTML = `<div class="col" style="gap:18px">
      ${info.eula === "required" ? `<div class="alert warn"><div><b>Minecraft needs your approval before it can start</b><span>Accept the Minecraft EULA and Fortless will restart this server automatically.</span></div><button class="btn s pri" type="button" data-gm="eula">Review and accept</button></div>` : ""}
      ${j && j.recommended && j.matches === false ? `<div class="alert warn"><div><b>${esc(javaLabel(j.recommended))} is recommended for ${esc(j.gameVersion ?? "this version")}</b><span>This server runs ${esc(javaLabel(j.current))}.</span></div>${j.available.includes(j.recommended) ? `<button class="btn s pri" type="button" data-gm="java" data-image="${esc(j.recommended)}">Switch</button>` : ""}</div>` : ""}
      <div class="ch"><div class="tx"><h3>Configuration</h3><p>Game settings and installation tools for this service.</p></div></div>
      ${p.configFile ? `<section class="card"><div class="ch"><div class="tx"><h3>Server settings</h3>${p.configExists ? "" : "<p>Start the server once to create the settings file. Saving now creates it.</p>"}</div><button class="btn s pri" type="button" data-gm="save">Save</button></div>
        <div class="col" style="gap:18px">${settingsHtml}</div></section>` : ""}
      ${p.icon ? `<section class="card"><div class="ch"><div class="tx"><h3>Server icon</h3><p>Any image works. It is resized to 64 by 64.</p></div></div>
        <label class="btn s sec" style="cursor:pointer;width:max-content">${hero("arrow", "xs")}Choose image<input type="file" id="gmIcon" accept="image/*" hidden></label></section>` : ""}
      ${p.sources.length ? `<section class="card"><div class="ch"><div class="tx"><h3>Install</h3><p>Search and manage server-side mods and plugins.</p></div></div>
        <div class="seg" role="tablist" id="gmSources">${p.sources.map((s) => `<button type="button" role="tab" aria-selected="${s.index === source}" data-src="${s.index}">${esc(s.label)}</button>`).join("")}</div>
        <div class="row" style="gap:10px;margin:14px 0"><div class="inp s pill" style="flex:1">${hero("search", "s")}<input id="gmQuery" placeholder="Search" aria-label="Search"></div></div>
        <div id="gmResults"></div>
        <div class="faint" style="font-weight:700;font-size:12.5px;margin:18px 0 8px">Installed</div><div id="gmInstalled"></div></section>` : ""}
    </div>`;
      if (p.sources.length) {
        void search();
        void installed();
      }
      if (info.eula === "required" && !eulaPrompted) {
        eulaPrompted = true;
        window.setTimeout(() => void acceptEula(), 0);
      }
    }
    async function acceptEula() {
      if (!host || !await confirmDialog({
        title: "Accept the Minecraft EULA?",
        message: "Minecraft cannot start until you accept Mojang\u2019s End User License Agreement. If you approve, Fortless will update eula.txt and restart the server now.",
        confirmLabel: "Accept and restart"
      })) return;
      try {
        await json(`${base}/game/eula/accept`, "POST");
        toast("EULA accepted. The server is restarting.", "good");
        await render(host);
      } catch (e) {
        fail(e);
      }
    }
    async function search() {
      const el2 = document.getElementById("gmResults");
      if (!el2) return;
      const q = document.getElementById("gmQuery")?.value.trim() ?? "";
      el2.innerHTML = '<div class="sk" role="status" aria-label="Searching"><i></i><i></i></div>';
      try {
        const res = await api.get(`${base}/game/mods/search?source=${source}&q=${encodeURIComponent(q)}&page=0`);
        el2.innerHTML = res.hits.length ? `<div class="col">${res.hits.map((h) => `<div class="li h" style="padding:10px 14px" data-project="${esc(h.projectId)}">
        ${h.iconUrl ? `<img src="${esc(h.iconUrl)}" alt="" width="40" height="40" style="border-radius:10px;flex:none" referrerpolicy="no-referrer">` : `<span class="tile neu sm">${hero("package")}</span>`}
        <span class="tx"><b>${esc(h.title)}</b><small style="white-space:normal">${esc(h.description)}</small></span>
        <button class="btn s sec" type="button" data-gm="install">${hero("plus", "xs")}Install</button></div>`).join("")}</div>${res.gameVersion ? `<small class="faint">Showing releases for ${esc(res.gameVersion)}</small>` : ""}` : `<div class="es"><span class="tile neu lg">${hero("search")}</span><h4>No results</h4></div>`;
      } catch (e) {
        el2.innerHTML = `<div class="alert bad"><div><b>${esc(e?.message || "Search failed")}</b></div></div>`;
      }
    }
    async function installed() {
      const el2 = document.getElementById("gmInstalled");
      if (!el2) return;
      try {
        const res = await api.get(`${base}/game/mods/installed?source=${source}`);
        el2.innerHTML = res.files.length ? `<div class="col" style="gap:4px">${res.files.map((f) => `<div class="li h" style="padding:8px 12px" data-file="${esc(f.name)}" data-dir="${esc(res.dir)}"><span class="tile neu sm">${hero("document")}</span><span class="tx"><b>${esc(f.name)}</b><small>${esc(formatBytes(f.size))}</small></span><button class="btn s sq ghost" type="button" data-gm="remove" aria-label="Remove ${esc(f.name)}">${hero("x", "s")}</button></div>`).join("")}</div>` : `<div class="faint">Nothing installed yet.</div>`;
      } catch {
        el2.textContent = "";
      }
    }
    function toPng64(file) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = 64;
          c.height = 64;
          const ctx = c.getContext("2d");
          const side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 64, 64);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL("image/png").split(",")[1]);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("That file is not an image."));
        };
        img.src = url;
      });
    }
    host?.addEventListener("click", async (ev) => {
      const t = ev.target;
      const sw = t.closest('.sw[role="switch"]');
      if (sw) {
        sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true"));
        return;
      }
      const src = t.closest("[data-src]");
      if (src && host) {
        source = Number(src.dataset["src"]);
        host.querySelectorAll("#gmSources button").forEach((b) => b.setAttribute("aria-selected", String(b === src)));
        void search();
        void installed();
        return;
      }
      const btn = t.closest("[data-gm]");
      if (!btn || !host) return;
      try {
        switch (btn.dataset["gm"]) {
          case "eula":
            await acceptEula();
            return;
          case "save": {
            const values = {};
            host.querySelectorAll("[data-key]").forEach((el2) => {
              const key = el2.dataset["key"];
              const v = el2.matches(".sw") ? el2.getAttribute("aria-checked") ?? "false" : el2.value;
              if (v !== initial.get(key)) values[key] = v;
            });
            if (!Object.keys(values).length) {
              toast("Nothing changed", "info");
              return;
            }
            await json(`${base}/game/config`, "PUT", { values });
            toast("Saved. Restart the server to apply.", "good");
            await render(host);
            return;
          }
          case "java":
            await json(`${base}/startup/image`, "PUT", { image: btn.dataset["image"] });
            toast("Java version changed. Restart the server to apply it.", "good");
            await render(host);
            return;
          case "install": {
            const id = btn.closest("[data-project]")?.dataset["project"];
            btn.setAttribute("disabled", "");
            try {
              const r = await api.post(`${base}/game/mods/install`, { source, projectId: id });
              toast(`Installed ${r.file}. Restart the server to load it.`, "good");
              await installed();
            } finally {
              btn.removeAttribute("disabled");
            }
            return;
          }
          case "remove": {
            const row = btn.closest("[data-file]");
            if (!await confirmDialog({ title: `Remove ${row.dataset["file"]}?`, confirmLabel: "Remove", danger: true })) return;
            await json(`${base}/files/delete`, "POST", { dir: row.dataset["dir"], names: [row.dataset["file"]] });
            await installed();
            return;
          }
        }
      } catch (e) {
        fail(e);
      }
    });
    let timer;
    host?.addEventListener("input", (ev) => {
      if (ev.target.id !== "gmQuery") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void search(), 350);
    });
    host?.addEventListener("change", async (ev) => {
      const input = ev.target;
      if (input.id !== "gmIcon" || !input.files?.[0]) return;
      try {
        await json(`${base}/game/icon`, "POST", { png: await toPng64(input.files[0]) });
        toast("Icon updated. Restart the server to see it.", "good");
      } catch (e) {
        fail(e);
      }
      input.value = "";
    });
    return {
      open() {
        if (host && !loaded) {
          loaded = true;
          void render(host).catch((e) => {
            loaded = false;
            fail(e);
          });
        }
      },
      async checkEula() {
        if (!host || eulaPrompted) return;
        try {
          const state = await api.get(`${base}/game`);
          if (state.eula !== "required" || eulaPrompted) return;
          eulaPrompted = true;
          await acceptEula();
        } catch {
        }
      }
    };
  }

  // src/frontend/client/pages/services/fastdl.ts
  function initFastDl(serviceId) {
    const base = `/api/v1/services/${encodeURIComponent(serviceId)}/fastdl`;
    let status = null;
    let manifestPage = 1;
    const pageSize = 15;
    let searchQuery = "";
    let pollTimer = null;
    function stopPolling() {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    }
    async function checkSupported() {
      try {
        const res = await api(base);
        status = res;
        return Boolean(res.supported);
      } catch {
        return true;
      }
    }
    function copyField2(value, label) {
      if (!value) return '<code class="mono muted">Pending</code>';
      return `<span class="cpf" style="max-width:100%"><span title="${esc(value)}">${esc(value)}</span><button class="ib xs" type="button" data-copy="${esc(value)}" data-copy-label="${esc(label)}" aria-label="Copy ${esc(label)}">${hero("copy-01", "xs")}</button></span>`;
    }
    async function renderManifestTable() {
      const listHost = document.getElementById("fdManifestBody");
      const footerHost = document.getElementById("fdPaginationFooter");
      if (!listHost) return;
      listHost.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px"><div class="sk"><i></i><i></i></div></td></tr>';
      try {
        const q = searchQuery.trim() ? `&search=${encodeURIComponent(searchQuery.trim())}` : "";
        const res = await api(`${base}/manifest?page=${manifestPage}&limit=${pageSize}${q}`);
        if (res.items.length === 0) {
          listHost.innerHTML = `<tr><td colspan="6" style="padding:32px 16px;text-align:center">
          <div class="col" style="align-items:center;gap:8px">
            <span class="tile neu sm">${hero("search-01", "s")}</span>
            <b>No FastDL assets found</b>
            <span class="faint" style="font-size:12.5px">${searchQuery ? "Try a different search query." : 'Click "Initial Sync" above to scan and mirror game assets.'}</span>
          </div>
        </td></tr>`;
          if (footerHost) footerHost.innerHTML = "";
          return;
        }
        const root = (status?.publicDownloadUrl || "").replace(/\/+$/, "");
        listHost.innerHTML = res.items.map((item) => {
          const savingsBytes = item.fileSize > item.compressedSize ? item.fileSize - item.compressedSize : 0;
          const savingsRatio = item.fileSize > 0 ? Math.round(savingsBytes / item.fileSize * 100) : 0;
          const stored = item.storageRelPath || item.filePath;
          const direct = root && item.status === "SYNCED" ? `${root}/${stored.split("/").map(encodeURIComponent).join("/")}` : "";
          return `<tr class="h">
          <td data-l="Direct link">
            ${direct ? `<span class="cpf" style="max-width:100%"><a class="mono" style="font-size:13px;word-break:break-all" href="${esc(direct)}" target="_blank" rel="noopener noreferrer">${esc(stored)}</a><button class="ib xs" type="button" data-copy="${esc(direct)}" data-copy-label="link" aria-label="Copy direct link">${hero("copy-01", "xs")}</button></span>` : `<b class="mono" style="font-size:13px;word-break:break-all">${esc(item.filePath)}</b>`}
          </td>
          <td data-l="Original" class="mono muted">${esc(formatBytes(item.fileSize))}</td>
          <td data-l="Stored" class="mono">${esc(formatBytes(item.compressedSize))}</td>
          <td data-l="Savings" class="mono muted">${savingsRatio > 0 ? `\u2212${savingsRatio}%` : "\u2014"}</td>
          <td data-l="Hash">
            <span class="cpf mono" style="font-size:11.5px">
              <code>${esc(item.fileHash.slice(0, 10))}\u2026${esc(item.fileHash.slice(-6))}</code>
              <button class="ib xs" type="button" data-copy="${esc(item.fileHash)}" aria-label="Copy SHA-256">${hero("copy-01", "xs")}</button>
            </span>
          </td>
          <td data-l="Status">
            ${item.status === "SYNCED" ? '<span class="pill good d">Synced</span>' : item.status === "FAILED" ? `<span class="pill bad" title="${esc(item.lastError || "")}">Failed</span>` : '<span class="pill">Pending</span>'}
          </td>
        </tr>`;
        }).join("");
        if (footerHost) {
          footerHost.innerHTML = renderPaginationFooter(res.page, res.totalPages, res.total, pageSize, {
            infoId: "fdPageInfo",
            pagerId: "fdPagerButtons"
          });
          footerHost.querySelectorAll("[data-pg]").forEach((b) => {
            b.addEventListener("click", () => {
              const next = Number(b.dataset["pg"]);
              if (next && next !== manifestPage) {
                manifestPage = next;
                void renderManifestTable();
              }
            });
          });
        }
      } catch (err) {
        listHost.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:20px;color:var(--bad)">Failed to load manifest: ${esc(err.message)}</td></tr>`;
      }
    }
    async function open2() {
      const host = document.getElementById("dtlFastdlBody");
      if (!host) return;
      stopPolling();
      host.innerHTML = `<div class="sk" role="status" aria-label="Loading FastDL"><i></i><i></i><i></i></div>`;
      try {
        status = await api(base);
        if (!status.supported || !status.profile) {
          host.innerHTML = `<div class="es"><span class="tile neu lg">${hero("server", "lg")}</span><h4>FastDL is not available</h4><p>${esc(status.reason || "This game does not support HTTP FastDL.")}</p></div>`;
          return;
        }
        const p = status.profile;
        const stats = status.stats || {
          totalFiles: 0,
          totalOriginalBytes: 0,
          totalStoredBytes: 0,
          quotaBytes: 5368709120,
          percentUsed: 0,
          cvarConfigured: false
        };
        const activeJob = status.activeJob;
        const isSyncing = activeJob && (activeJob.status === "QUEUED" || activeJob.status === "RUNNING");
        const autoSync = status.config?.autoSync !== false;
        const totalSavings = stats.totalOriginalBytes > stats.totalStoredBytes ? stats.totalOriginalBytes - stats.totalStoredBytes : 0;
        const savingsPct = stats.totalOriginalBytes > 0 ? Math.round(totalSavings / stats.totalOriginalBytes * 100) : 0;
        host.innerHTML = `
        <div class="col" style="gap:20px">
          <!-- TOP HEADER -->
          <div class="ch" style="margin-bottom:0">
            <div class="tx">
              <h3>Automated FastDL (HTTP Sync)</h3>
              <p>Mirrors maps, models, materials, and sounds to dedicated high-speed CDN storage so players connect and download instantly.</p>
            </div>
            <div class="row act" style="gap:8px;align-items:center">
              <button type="button" class="btn pri" id="fdSyncBtn" ${isSyncing ? "disabled" : ""}>
                <svg class="ic s" aria-hidden="true"><use href="#i-refresh"/></svg>
                ${stats.totalFiles === 0 ? "Initial Sync" : "Incremental Resync"}
              </button>
              <button type="button" class="btn" id="fdConfigureCvarBtn">
                <svg class="ic s" aria-hidden="true"><use href="#i-settings-01"/></svg>
                ${stats.cvarConfigured ? "Reconfigure server.cfg" : "Configure server.cfg"}
              </button>
            </div>
          </div>

          <!-- ACTIVE SYNC PROGRESS (VISIBLE WHEN SYNCING) -->
          <div id="fdSyncProgressCard" ${isSyncing ? "" : "hidden"}>
            <div class="card" style="border-left:3px solid var(--accent)">
              <div class="row nw" style="justify-content:space-between;align-items:center;margin-bottom:8px">
                <div class="row nw" style="gap:8px;align-items:center">
                  <span class="tile info sm"><svg class="ic s" aria-hidden="true"><use href="#i-refresh"/></svg></span>
                  <div>
                    <b id="fdSyncStatusTitle">Sync in progress\u2026</b>
                    <div class="faint" id="fdSyncCurrentFile" style="font-size:12px;font-family:var(--mono)">${esc(activeJob?.currentFile || "Scanning game directories\u2026")}</div>
                  </div>
                </div>
                <div class="row nw" style="gap:8px">
                  <span class="pill info" id="fdSyncCounts">${activeJob ? `${activeJob.processedFiles} / ${activeJob.totalFiles} files` : "Processing\u2026"}</span>
                  <button type="button" class="btn xs bad" id="fdCancelSyncBtn">Cancel</button>
                </div>
              </div>
              <div class="mtr info" style="margin:10px 0 4px">
                <b id="fdSyncProgressBar" style="width:${activeJob && activeJob.totalFiles > 0 ? Math.min(100, Math.round(activeJob.processedFiles / activeJob.totalFiles * 100)) : 10}%"></b>
              </div>
            </div>
          </div>

          <!-- METRICS GRID -->
          <div class="g g4 k2">
            <!-- TILE 1: DOWNLOAD URL -->
            <div class="card" data-c="FastDL URL" style="min-width:0;overflow:hidden">
              <div class="row nw" style="justify-content:space-between;margin-bottom:6px">
                <span class="tile acc sm"><svg class="ic" aria-hidden="true"><use href="#i-globe-02"/></svg></span>
                <span class="faint" style="font-weight:700;font-size:11.5px">DOWNLOAD URL</span>
              </div>
              <div style="margin-top:6px">
                ${copyField2(status.publicDownloadUrl, "Download URL")}
              </div>
              <small class="faint" style="font-weight:600;margin-top:6px;display:block">Engine cvar: <code>${p.engine === "cod" ? "sv_wwwBaseURL" : "sv_downloadurl"}</code></small>
            </div>

            <!-- TILE 2: STORAGE QUOTA -->
            <div class="card" data-c="Meter card">
              <div class="row nw" style="justify-content:space-between;margin-bottom:6px">
                <span class="tile good sm"><svg class="ic" aria-hidden="true"><use href="#i-archive-01"/></svg></span>
                <span class="faint" style="font-weight:700;font-size:11.5px">STORAGE QUOTA</span>
              </div>
              <b style="font:800 24px var(--font);letter-spacing:-.04em">${esc(formatBytes(stats.totalStoredBytes))}</b>
              <div class="mtr good" style="margin:8px 0 6px">
                <b style="width:${stats.percentUsed}%"></b>
              </div>
              <small class="faint" style="font-weight:600">${esc(formatBytes(stats.totalStoredBytes))} of ${esc(formatBytes(stats.quotaBytes))} (${stats.percentUsed}%)</small>
            </div>

            <!-- TILE 3: COMPRESSION SAVINGS -->
            <div class="card">
              <div class="row nw" style="justify-content:space-between;margin-bottom:6px">
                <span class="tile violet sm"><svg class="ic" aria-hidden="true"><use href="#i-database"/></svg></span>
                <span class="faint" style="font-weight:700;font-size:11.5px">COMPRESSION</span>
              </div>
              <b style="font:800 24px var(--font);letter-spacing:-.04em">${esc(formatBytes(totalSavings))}</b>
              <div class="row nw" style="gap:6px;margin-top:6px;align-items:center">
                <span class="pill good" style="font-size:11.5px">\u2212${savingsPct}% bandwidth</span>
                <span class="faint" style="font-size:12px">${stats.totalFiles} assets</span>
              </div>
              <small class="faint" style="font-weight:600;margin-top:4px;display:block">Original: ${esc(formatBytes(stats.totalOriginalBytes))}</small>
            </div>

            <!-- TILE 4: AUTO-SYNC STATUS -->
            <div class="card">
              <div class="row nw" style="justify-content:space-between;margin-bottom:6px">
                <span class="tile info sm"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg></span>
                <span class="faint" style="font-weight:700;font-size:11.5px">AUTO-SYNC</span>
              </div>
              <div class="row nw" style="justify-content:space-between;align-items:center;margin-top:4px">
                <b>Auto-sync</b>
                <button type="button" class="sw" role="switch" id="fdAutoSyncSw" aria-checked="${autoSync}" aria-label="Auto-sync on changes"></button>
              </div>
              <div class="faint" style="font-size:12px;margin-top:8px">Last synced: <b>${status.config?.lastSyncAt ? esc(formatDate(status.config.lastSyncAt)) : "Never"}</b></div>
            </div>
          </div>

          <!-- ASSET MANIFEST TABLE -->
          <section class="card" style="padding:0;overflow:hidden">
            <div class="ch" style="padding:16px 18px 12px;margin-bottom:0;border-bottom:1px solid var(--border)">
              <div class="tx">
                <h3>Asset Manifest</h3>
                <p>Tracked files on the FastDL mirror with original vs compressed sizes and SHA-256 verification hashes.</p>
              </div>
              <div class="row act" style="gap:10px">
                <label class="sch" style="width:260px">
                  <svg class="ic s" aria-hidden="true"><use href="#i-search-01"/></svg>
                  <input id="fdSearchInput" type="text" placeholder="Search assets (e.g. de_dust2, wav)" aria-label="Search FastDL assets" value="${esc(searchQuery)}">
                </label>
              </div>
            </div>

            <div style="overflow-x:auto">
              <table class="tbl rsp" data-c="Data table">
                <thead>
                  <tr>
                    <th>Direct link</th>
                    <th>Original</th>
                    <th>Stored</th>
                    <th>Savings</th>
                    <th>SHA-256 Verification</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="fdManifestBody">
                  <tr><td colspan="6" class="muted" style="text-align:center;padding:24px"><div class="sk"><i></i><i></i></div></td></tr>
                </tbody>
              </table>
            </div>

            <div id="fdPaginationFooter"></div>
          </section>
        </div>
      `;
        bindEvents();
        void renderManifestTable();
        if (isSyncing) {
          startPolling();
        }
      } catch (err) {
        host.innerHTML = `<div class="alert bad">${hero("alert-circle", "s")}<div><b>Failed to load FastDL status</b><span>${esc(err.message)}</span></div></div>`;
        toast(err.message, "bad");
      }
    }
    function startPolling() {
      stopPolling();
      pollTimer = window.setInterval(async () => {
        try {
          const s = await api(base);
          status = s;
          const job = s.activeJob;
          const isStillSyncing = job && (job.status === "QUEUED" || job.status === "RUNNING");
          const card = document.getElementById("fdSyncProgressCard");
          if (card) card.hidden = !isStillSyncing;
          if (isStillSyncing && job) {
            const title = document.getElementById("fdSyncStatusTitle");
            const fileEl = document.getElementById("fdSyncCurrentFile");
            const counts = document.getElementById("fdSyncCounts");
            const bar = document.getElementById("fdSyncProgressBar");
            if (title) title.textContent = job.status === "QUEUED" ? "Sync queued\u2026" : "Syncing assets\u2026";
            if (fileEl) fileEl.textContent = job.currentFile || "Scanning game directories\u2026";
            if (counts) counts.textContent = `${job.processedFiles} / ${job.totalFiles} files`;
            if (bar) {
              const pct = job.totalFiles > 0 ? Math.min(100, Math.round(job.processedFiles / job.totalFiles * 100)) : 10;
              bar.style.width = `${pct}%`;
            }
          } else {
            stopPolling();
            toast("FastDL sync completed.", "good");
            void open2();
          }
        } catch {
          stopPolling();
        }
      }, 2e3);
    }
    function bindEvents() {
      const syncBtn = document.getElementById("fdSyncBtn");
      syncBtn?.addEventListener("click", async () => {
        syncBtn.disabled = true;
        try {
          await api(`${base}/sync`, { method: "POST" });
          toast("FastDL sync started.", "info");
          const card = document.getElementById("fdSyncProgressCard");
          if (card) card.hidden = false;
          startPolling();
        } catch (err) {
          toast(err.message || "Failed to start sync", "bad");
          syncBtn.disabled = false;
        }
      });
      const cancelBtn = document.getElementById("fdCancelSyncBtn");
      cancelBtn?.addEventListener("click", async () => {
        try {
          await api(`${base}/sync/cancel`, { method: "POST" });
          toast("Sync cancellation requested.", "warn");
          stopPolling();
          window.setTimeout(() => void open2(), 1e3);
        } catch (err) {
          toast(err.message || "Failed to cancel sync", "bad");
        }
      });
      const cfgBtn = document.getElementById("fdConfigureCvarBtn");
      cfgBtn?.addEventListener("click", async () => {
        cfgBtn.setAttribute("disabled", "true");
        try {
          const res = await api(`${base}/configure-cvar`, { method: "POST" });
          toast(res.backupPath ? `Configured in server.cfg (backup: ${res.backupPath})` : "Configured in server.cfg", "good");
          void open2();
        } catch (err) {
          toast(err.message || "Failed to configure server.cfg", "bad");
          cfgBtn.removeAttribute("disabled");
        }
      });
      const sw = document.getElementById("fdAutoSyncSw");
      sw?.addEventListener("click", async () => {
        const current = sw.getAttribute("aria-checked") === "true";
        const next = !current;
        sw.setAttribute("aria-checked", String(next));
        try {
          await api(`${base}/settings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ autoSync: next })
          });
          toast(next ? "Auto-sync enabled." : "Auto-sync disabled.", "good");
        } catch (err) {
          sw.setAttribute("aria-checked", String(current));
          toast(err.message || "Failed to update auto-sync", "bad");
        }
      });
      let searchDebounce;
      const searchInp = document.getElementById("fdSearchInput");
      searchInp?.addEventListener("input", () => {
        window.clearTimeout(searchDebounce);
        searchDebounce = window.setTimeout(() => {
          searchQuery = searchInp.value;
          manifestPage = 1;
          void renderManifestTable();
        }, 350);
      });
    }
    return {
      open: open2,
      checkSupported,
      destroy() {
        stopPolling();
      }
    };
  }

  // src/frontend/client/pages/services/players.ts
  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }
  function formatTimeAgo(iso) {
    try {
      const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1e3);
      if (diffSec < 60) return "just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch {
      return iso;
    }
  }
  function initPlayers(serviceId) {
    const host = document.getElementById("dtlPlayersBody");
    const base = `/api/v1/services/${encodeURIComponent(serviceId)}`;
    let pollTimer;
    let filterText = "";
    let statusData = null;
    let historyData = null;
    let canModerate = false;
    async function checkPermissions() {
      try {
        const res = await api(base);
        const perms = new Set(res.service?.access?.permissions ?? []);
        canModerate = perms.has("player.moderate") || perms.has("ALL") || perms.has("control.console");
      } catch {
        canModerate = false;
      }
    }
    async function loadData() {
      try {
        const [status, history2] = await Promise.all([
          api.get(`${base}/players`),
          api.get(`${base}/players/history?limit=10`).catch(() => ({ total: 0, records: [] }))
        ]);
        statusData = status;
        historyData = history2;
      } catch (err) {
        if (!statusData) {
          statusData = {
            supported: true,
            state: "ERROR",
            gameType: "unknown",
            adapter: "none",
            players: [],
            error: err.message || "Failed to query server status"
          };
        }
      }
    }
    function render() {
      if (!host) return;
      if (!statusData) {
        host.innerHTML = `<div class="sk" role="status" aria-label="Loading players"><i></i><i></i><i></i></div>`;
        return;
      }
      if (!statusData.supported) {
        host.innerHTML = `
        <div class="col">${renderAdministrationSection()}<div class="es" data-c="Empty state">
          <span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="#i-server"/></svg></span>
          <h4>Player administration is unsupported</h4>
          <p>${esc(statusData.error || "This service does not support native player management.")}</p>
        </div></div>`;
        return;
      }
      if (statusData.state === "OFFLINE") {
        host.innerHTML = `
        <div class="col" style="gap:18px">
          ${renderAdministrationSection()}
          <div class="alert info">
            <svg class="ic s" aria-hidden="true"><use href="#i-refresh"/></svg>
            <div><b>Server is offline</b><span>Start the server to query connected players and perform moderation actions.</span></div>
          </div>
          ${renderHistorySection()}
        </div>`;
        bindHistoryEvents();
        return;
      }
      const info = statusData.info;
      const players = statusData.players;
      const actionableRoster = statusData.playerListReliability !== "SAMPLED";
      const filtered = players.filter((p) => {
        if (!filterText) return true;
        const q = filterText.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.steamId && p.steamId.toLowerCase().includes(q);
      });
      const infoBadges = info ? `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
          <span class="pill good d">Online</span>
          <span class="pill">${esc(info.game)}</span>
          <span class="pill">${esc(info.map)}</span>
          <span class="pill" title="Server latency">${info.pingMs} ms</span>
          <span class="pill info">${players.length} / ${info.maxPlayers} players</span>
        </div>` : `<span class="pill good d">Online (${players.length} online)</span>`;
      const playersTable = filtered.length ? `<div class="tbl-wrap" style="margin-top:12px">
          <table class="tbl" aria-label="Connected players">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Identifier</th>
                <th scope="col" style="text-align:right">Score</th>
                <th scope="col" style="text-align:right">Connected</th>
                ${canModerate && actionableRoster ? '<th scope="col" style="text-align:right">Actions</th>' : ""}
              </tr>
            </thead>
            <tbody>
              ${filtered.map(
        (p) => `
                <tr data-p-id="${esc(String(p.steamId || p.index))}" data-p-name="${esc(p.name)}">
                  <td>
                    <div class="row nw" style="gap:10px;align-items:center">
                      <span class="tile neu sm"><svg class="ic xs" aria-hidden="true"><use href="#i-user"/></svg></span>
                      <b style="font-weight:650">${esc(p.name)}</b>
                    </div>
                  </td>
                  <td><code class="mono faint" style="font-size:12px">${esc(p.steamId || `#${p.index}`)}</code></td>
                  <td style="text-align:right"><b class="faint">${p.score}</b></td>
                  <td style="text-align:right"><span class="faint">${formatDuration(p.duration)}</span></td>
                  ${canModerate && actionableRoster ? `<td style="text-align:right">
                      <div class="row" style="justify-content:flex-end;gap:6px">
                        <button class="btn xs sec" type="button" data-act="kick" title="Disconnect player">Kick</button>
                        <button class="btn xs badt" type="button" data-act="ban" title="Ban player">Ban</button>
                      </div>
                    </td>` : ""}
                </tr>`
      ).join("")}
            </tbody>
          </table>
        </div>` : `<div class="es" style="padding:28px 0" data-c="Empty state">
          <span class="tile neu"><svg class="ic" aria-hidden="true"><use href="#i-user"/></svg></span>
          <h4>${filterText ? "No matching players" : "No players currently online"}</h4>
          <p>${filterText ? "Try adjusting your search filter." : "When players connect to this server, they will appear here in real time."}</p>
        </div>`;
      host.innerHTML = `
      <div class="col" style="gap:18px">
        ${renderAdministrationSection()}
        <section class="card">
          <div class="ch">
            <div class="tx">
              <h3>Live Players</h3>
              <p>Real-time game server status and connected player administration.</p>
            </div>
            <div class="row" style="gap:8px">
              <button class="btn s sec" id="dtlPlayersRefreshBtn" type="button" title="Refresh player list">
                <svg class="ic xs" aria-hidden="true"><use href="#i-refresh"/></svg>Refresh
              </button>
            </div>
          </div>

          <div class="row" style="justify-content:space-between;align-items:center;gap:12px;margin:12px 0 16px;flex-wrap:wrap">
            ${infoBadges}
            <div class="inp s pill" style="min-width:200px;max-width:280px">
              <svg class="ic s" aria-hidden="true"><use href="#i-search"/></svg>
              <input id="dtlPlayersFilter" type="text" placeholder="Filter players\u2026" value="${esc(filterText)}" aria-label="Filter players">
            </div>
          </div>

          ${playersTable}
          ${statusData.playerListReliability === "SAMPLED" ? '<div class="alert info"><div><b>Sampled player list</b><span>Minecraft Server List Ping may return only part of the roster, so moderation is disabled here to avoid targeting the wrong player. Use Console for a verified name.</span></div></div>' : ""}
        </section>

        ${renderHistorySection()}
      </div>`;
      bindTableEvents();
      bindHistoryEvents();
      bindAdminEvents();
    }
    function renderAdministrationSection() {
      const a = statusData?.administration;
      if (!a) return "";
      const label = a.effectiveProtocol === "PTERODACTYL_CONSOLE" ? "Native Console" : a.effectiveProtocol.replaceAll("_", " ");
      const isReady = a.state === "CONNECTED" || a.state === "AVAILABLE";
      const isSetup = a.state === "SETUP_REQUIRED";
      const tone = isReady ? "good" : isSetup ? "warn" : a.state === "DISABLED" || a.state === "UNREACHABLE" ? "warn" : "bad";
      if (isSetup) {
        return `
        <section class="card flat server-tool-card" style="border-left:3px solid var(--c-warn, #f59e0b)">
          <div class="ch">
            <span class="tile warn"><svg class="ic" aria-hidden="true"><use href="#i-settings"/></svg></span>
            <div class="tx">
              <h3>Game administration needs setup</h3>
              <p>${esc(a.gameIdentity)} \xB7 ${esc(a.message)}</p>
            </div>
          </div>
          <div class="server-tool-actions">
            <button class="btn s pri" type="button" data-auto-configure>Configure automatically</button>
            <a class="btn s" href="/app/services/${encodeURIComponent(serviceId)}/settings" data-app-route>Manual setup</a>
          </div>
        </section>`;
      }
      return `
      <section class="card flat server-tool-card">
        <div class="ch">
          <span class="tile ${tone}"><svg class="ic" aria-hidden="true"><use href="#i-settings"/></svg></span>
          <div class="tx">
            <h3>Game administration</h3>
            <p>${esc(a.gameIdentity)} \xB7 ${esc(a.message)}</p>
          </div>
        </div>
        <div class="server-tool-actions">
          <span class="pill ${tone} d">${esc(label)} \xB7 ${esc(isReady ? "Ready" : a.state.toLowerCase().replaceAll("_", " "))}</span>
          <a class="btn s" href="/app/services/${encodeURIComponent(serviceId)}/settings" data-app-route>Configure</a>
        </div>
      </section>`;
    }
    function bindAdminEvents() {
      const btn = host?.querySelector("[data-auto-configure]");
      if (!btn) return;
      btn.addEventListener("click", async () => {
        const confirmed = await formDialog({
          title: "Configure game administration",
          message: "Fortless will automatically configure the appropriate administration settings, generate secure credentials, and prepare the server for Player Manager. Existing game settings will be preserved.",
          confirmLabel: "Configure automatically",
          fields: []
        });
        if (!confirmed) return;
        btn.disabled = true;
        try {
          const res = await api.post(
            `${base}/game-administration/auto-configure`,
            {}
          );
          toast(res.message || "Game administration configured successfully", "good");
          await loadData();
          render();
        } catch (err) {
          toast(err.message || "Failed to auto-configure administration", "bad");
        } finally {
          btn.disabled = false;
        }
      });
    }
    function renderHistorySection() {
      const records = historyData?.records ?? [];
      if (!records.length) {
        return `
        <section class="card">
          <div class="ch">
            <div class="tx">
              <h3>Moderation History</h3>
              <p>Recent kicks and bans executed through Fortless.</p>
            </div>
          </div>
          <div class="es" style="padding:20px 0">
            <span class="tile neu sm"><svg class="ic xs" aria-hidden="true"><use href="#i-shield"/></svg></span>
            <h4>No moderation records</h4>
            <p>Disciplinary actions taken against players will be recorded here.</p>
          </div>
        </section>`;
      }
      return `
      <section class="card">
        <div class="ch">
          <div class="tx">
            <h3>Moderation History</h3>
            <p>Recent kicks and bans executed through Fortless.</p>
          </div>
        </div>
        <div class="tbl-wrap" style="margin-top:12px">
          <table class="tbl" aria-label="Moderation history">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
                <th scope="col">Reason</th>
                <th scope="col" style="text-align:right">When</th>
                ${canModerate && statusData?.administration?.capabilities.unban ? '<th scope="col" style="text-align:right">Manage</th>' : ""}
              </tr>
            </thead>
            <tbody>
              ${records.map((r) => {
        const badgeClass = r.action === "BAN" ? "bad" : r.action === "KICK" ? "warn" : "good";
        const durationStr = r.durationMinutes ? ` (${r.durationMinutes}m)` : "";
        return `
                  <tr>
                    <td><span class="pill ${badgeClass} d">${esc(r.action)}${durationStr}</span></td>
                    <td>
                      <div>
                        <b>${esc(r.targetName)}</b>
                        <small class="faint mono" style="display:block">${esc(r.targetIdentifier)}</small>
                      </div>
                    </td>
                    <td><span class="faint">${esc(r.reason || "\u2014")}</span></td>
                    <td style="text-align:right"><span class="faint" title="${esc(r.createdAt)}">${formatTimeAgo(r.createdAt)}</span></td>
                    ${canModerate && statusData?.administration?.capabilities.unban ? `<td style="text-align:right">${r.action === "BAN" ? `<button class="btn xs" type="button" data-unban data-target-id="${esc(r.targetIdentifier)}" data-target-name="${esc(r.targetName)}">Unban</button>` : ""}</td>` : ""}
                  </tr>`;
      }).join("")}
            </tbody>
          </table>
        </div>
      </section>`;
    }
    function bindTableEvents() {
      const filterInput = document.getElementById("dtlPlayersFilter");
      filterInput?.addEventListener("input", () => {
        filterText = filterInput.value.trim();
        render();
        const nextInput = document.getElementById("dtlPlayersFilter");
        if (nextInput) {
          nextInput.focus();
          nextInput.selectionStart = nextInput.selectionEnd = nextInput.value.length;
        }
      });
      document.getElementById("dtlPlayersRefreshBtn")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await loadData();
          render();
          toast("Player list refreshed", "good");
        } finally {
          btn.disabled = false;
        }
      });
      host?.querySelectorAll("[data-act]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const tr = e.target.closest("tr");
          if (!tr) return;
          const targetId = tr.dataset["pId"] || "";
          const targetName = tr.dataset["pName"] || targetId;
          const act = btn.dataset["act"];
          if (act === "kick") {
            const res = await formDialog({
              title: "Kick Player",
              message: `Are you sure you want to disconnect "${targetName}" from this server?`,
              confirmLabel: "Kick player",
              danger: true,
              fields: [
                { key: "reason", label: "Reason (optional)", placeholder: "e.g. Inappropriate behavior" }
              ]
            });
            if (!res) return;
            btn.disabled = true;
            try {
              const result = await api.post(`${base}/players/kick`, {
                targetIdentifier: targetId,
                targetName,
                reason: res["reason"] ? String(res["reason"]) : void 0
              });
              toast(result.message || `Kick command submitted for \u201C${targetName}\u201D`, result.outcome === "UNKNOWN" ? "info" : "good");
              await loadData();
              render();
            } catch (err) {
              toast(err.message || "Kick failed", "bad");
            } finally {
              btn.disabled = false;
            }
          } else if (act === "ban") {
            const res = await formDialog({
              title: "Ban Player",
              message: `Ban "${targetName}" from this server? They will be immediately disconnected and prevented from reconnecting.`,
              confirmLabel: "Ban player",
              danger: true,
              fields: [
                {
                  key: "duration",
                  label: "Duration",
                  type: "select",
                  value: "0",
                  options: [
                    ["0", "Permanent"],
                    ["60", "1 hour"],
                    ["360", "6 hours"],
                    ["1440", "1 day (24 hours)"],
                    ["10080", "7 days"],
                    ["43200", "30 days"]
                  ]
                },
                { key: "reason", label: "Reason (optional)", placeholder: "e.g. Cheating or violating rules" }
              ]
            });
            if (!res) return;
            btn.disabled = true;
            try {
              const result = await api.post(`${base}/players/ban`, {
                targetIdentifier: targetId,
                targetName,
                durationMinutes: Number(res["duration"] || 0),
                reason: res["reason"] ? String(res["reason"]) : void 0
              });
              toast(result.message || `Ban command submitted for \u201C${targetName}\u201D`, result.outcome === "UNKNOWN" ? "info" : "good");
              await loadData();
              render();
            } catch (err) {
              toast(err.message || "Ban failed", "bad");
            } finally {
              btn.disabled = false;
            }
          }
        });
      });
    }
    function bindHistoryEvents() {
      host?.querySelectorAll("[data-unban]").forEach((btn) => btn.addEventListener("click", async () => {
        const targetIdentifier = btn.dataset["targetId"] || "";
        const targetName = btn.dataset["targetName"] || targetIdentifier;
        const confirmed = await formDialog({ title: "Unban player", message: `Allow \u201C${targetName}\u201D to join this server again?`, confirmLabel: "Unban player", fields: [] });
        if (!confirmed) return;
        btn.disabled = true;
        try {
          const result = await api.post(`${base}/players/unban`, { targetIdentifier, targetName });
          toast(result.message || `Unban command submitted for \u201C${targetName}\u201D`, result.outcome === "UNKNOWN" ? "info" : "good");
          await loadData();
          render();
        } catch (err) {
          toast(err.message || "Unban failed", "bad");
        } finally {
          btn.disabled = false;
        }
      }));
    }
    return {
      open: () => {
        void checkPermissions();
        void loadData().then(() => render());
        if (pollTimer) window.clearInterval(pollTimer);
        pollTimer = window.setInterval(() => {
          if (!document.getElementById("dtlPlayersBody")) {
            window.clearInterval(pollTimer);
            return;
          }
          void loadData().then(() => render());
        }, 6e3);
      },
      refresh: async () => {
        await loadData();
        render();
      }
    };
  }

  // src/frontend/client/pages/services/live-usage.ts
  var HISTORY = 40;
  var duration = (ms) => {
    const s = Math.floor(ms / 1e3);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
  };
  var rate = (bytesPerSecond) => `${formatBytes(Math.max(0, bytesPerSecond))}/s`;
  var TILES = [
    { id: "cpu", label: "CPU", icon: "cpu", tone: "info", chart: "var(--info)" },
    { id: "mem", label: "Memory", icon: "database", tone: "violet", chart: "var(--violet)" },
    { id: "net", label: "Network", icon: "link-square-02", tone: "good" },
    { id: "disk", label: "Disk", icon: "archive-01", tone: "warn" },
    { id: "up", label: "Uptime", icon: "play", tone: "neu" }
  ];
  function mountLiveTiles(host) {
    host.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">${TILES.map((t) => `<div class="mt" style="min-width:0;padding:12px;background:var(--s2);border-radius:var(--r1)"><div style="min-width:0"><span class="l">${t.label}</span><b class="v" data-v="${t.id}">\u2014</b><small data-s="${t.id}"></small>${t.chart ? `<div data-c="${t.id}" style="height:36px"></div>` : ""}</div><span class="tile ${t.tone}">${hero(t.icon)}</span></div>`).join("")}</div>`;
    const text = (sel, v) => {
      const el2 = host.querySelector(sel);
      if (el2 && el2.textContent !== v) el2.textContent = v;
    };
    const cpu = [];
    const mem = [];
    let last = null;
    return (st) => {
      if (!document.body.contains(host)) return;
      const now = Date.now();
      const rx = Number(st.network?.rx_bytes ?? 0);
      const tx = Number(st.network?.tx_bytes ?? 0);
      const dt = last ? (now - last.t) / 1e3 : 0;
      const down = last && dt > 0 ? (rx - last.rx) / dt : 0;
      const up = last && dt > 0 ? (tx - last.tx) / dt : 0;
      last = { t: now, rx, tx };
      cpu.push(Number(st.cpu_absolute ?? 0));
      if (cpu.length > HISTORY) cpu.shift();
      mem.push(Number(st.memory_bytes ?? 0));
      if (mem.length > HISTORY) mem.shift();
      const limit = Number(st.memory_limit_bytes ?? 0);
      text('[data-v="cpu"]', `${Number(st.cpu_absolute ?? 0).toFixed(1)}%`);
      text('[data-s="cpu"]', st.state ? String(st.state) : "");
      text('[data-v="mem"]', formatBytes(Number(st.memory_bytes ?? 0)));
      text('[data-s="mem"]', limit ? `of ${formatBytes(limit)}` : "");
      text('[data-v="net"]', `${rate(down)} down`);
      text('[data-s="net"]', `${rate(up)} up`);
      text('[data-v="disk"]', formatBytes(Number(st.disk_bytes ?? 0)));
      text('[data-v="up"]', st.uptime ? duration(Number(st.uptime)) : "\u2014");
      const c1 = host.querySelector('[data-c="cpu"]');
      if (c1) c1.innerHTML = spark(cpu, "var(--info)");
      const c2 = host.querySelector('[data-c="mem"]');
      if (c2) c2.innerHTML = spark(mem, "var(--violet)");
    };
  }

  // src/frontend/core/router/tab-url.ts
  function bindTabUrls(o) {
    const slugToKey = new Map(Object.entries(o.slugs).map(([k, s]) => [s, k]));
    let restoring = false;
    const choose = (key) => {
      restoring = true;
      try {
        o.select(key);
      } finally {
        restoring = false;
      }
    };
    const initialKey = o.initial ? slugToKey.get(o.initial) : void 0;
    if (initialKey) choose(initialKey);
    const activeKey = initialKey ?? o.fallbackKey;
    const slug = o.slugs[activeKey];
    if (slug && window.location.pathname !== `${o.base}/${slug}`) window.history.replaceState(null, "", `${o.base}/${slug}`);
    o.tabs.addEventListener("click", (e) => {
      if (restoring) return;
      const btn = e.target.closest('[role="tab"]');
      const key = btn ? o.keyOf(btn) : void 0;
      const s = key ? o.slugs[key] : void 0;
      if (s && window.location.pathname !== `${o.base}/${s}`) window.history.pushState(null, "", `${o.base}/${s}`);
    });
    const onTab = (e) => {
      if (!document.body.contains(o.tabs)) {
        window.removeEventListener("fortless:tab", onTab);
        return;
      }
      const wanted = String(e.detail?.tab ?? "");
      const key = slugToKey.get(wanted) ?? o.fallbackKey;
      choose(key);
      if (!slugToKey.has(wanted) && o.slugs[key]) window.history.replaceState(null, "", `${o.base}/${o.slugs[key]}`);
    };
    window.addEventListener("fortless:tab", onTab);
  }

  // src/frontend/client/pages/services/panel-tabs.ts
  var fail2 = (e) => toast(e?.message || "Request failed", "bad");
  var copy = (v, label) => `<span class="cpf"><code>${esc(v)}</code><button class="ib xs" type="button" data-copy="${esc(v)}" data-copy-label="${esc(label)}" aria-label="Copy ${esc(label)}">${hero("copy", "xs")}</button></span>`;
  var sendJson = async (url, method, body) => {
    const result = await api(url, { method, headers: { "Content-Type": "application/json" }, body: body === void 0 ? void 0 : JSON.stringify(body) });
    if (result?.pending) toast("The panel did not answer in time. The change may still be applied; check again shortly before repeating it.", "info");
    return result;
  };
  var empty = (title) => `<div class="es"><span class="tile neu lg">${hero("shield")}</span><h4>${esc(title)}</h4></div>`;
  var iconBtn = (attr, icon, tip) => `<button class="btn s sq ghost" type="button" ${attr} data-tip="${esc(tip)}" data-pos="bottom" aria-label="${esc(tip)}">${hero(icon, "s")}</button>`;
  function lazy(host, load) {
    let loaded = false;
    return { open() {
      if (host && !loaded) {
        loaded = true;
        void load(host).catch((e) => {
          loaded = false;
          fail2(e);
        });
      }
    } };
  }
  function initBackups(serviceId) {
    const base = `/api/v1/services/${encodeURIComponent(serviceId)}/backups`;
    const host = document.getElementById("dtlBackupsBody");
    async function render(h) {
      h.innerHTML = '<div class="sk" role="status" aria-label="Loading backups"><i></i><i></i></div>';
      const res = await api.get(base);
      h.innerHTML = `<section class="card server-tool-create">
        <div class="ch"><div class="tx"><h3>Create backup</h3><p>Capture the current server files before a risky change.</p></div><span class="pill ${res.limit !== null && res.backups.length >= res.limit ? "warn" : "info"}">${res.limit === null ? `${res.backups.length} stored` : `${res.backups.length} of ${res.limit}`}</span></div>
        <div class="server-tool-form">
          <div class="fld"><label for="bkName">Backup name</label><div class="inp"><input id="bkName" placeholder="Automatic name when left empty" maxlength="191"></div></div>
          <div class="fld"><label for="bkIgnore">Ignored files</label><div class="inp"><input id="bkIgnore" placeholder="Optional paths, one per line" maxlength="4096"></div></div>
          <button class="btn pri" type="button" data-bk="create">${hero("plus", "xs")}Create backup</button>
        </div>
      </section>
      ${res.backups.length ? `<div class="col server-tool-list">${res.backups.map((b) => {
        const pending = !b.completedAt;
        const tone = pending ? "warn" : b.successful ? "good" : "bad";
        const status = pending ? "In progress" : b.successful ? "Completed" : "Failed";
        return `<section class="card server-tool-card" data-uuid="${esc(b.uuid)}">
          <div class="ch"><span class="tile ${tone}">${hero("archive-01")}</span><div class="tx"><h3>${esc(b.name)}</h3><p>${esc(formatDate(b.createdAt))}</p></div><span class="pill ${tone} d">${status}</span>${b.locked ? '<span class="pill info">Locked</span>' : ""}</div>
          <div class="server-tool-facts"><div><small>Size</small><b>${esc(formatBytes(b.bytes))}</b></div><div><small>Backup ID</small><code>${esc(b.uuid.slice(0, 12))}</code></div><div><small>Protection</small><b>${b.locked ? "Deletion locked" : "Unlocked"}</b></div></div>
          <div class="server-tool-actions">
            ${b.successful && !pending ? `<button class="btn s" type="button" data-bk="download">${hero("arrow", "xs")}Download</button>` : ""}
            <button class="btn s" type="button" data-bk="lock">${hero("shield", "xs")}${b.locked ? "Unlock" : "Lock"}</button>
            ${b.successful && !pending ? `<button class="btn s" type="button" data-bk="restore">${hero("refresh", "xs")}Restore</button>` : ""}
            <button class="btn s bad" type="button" data-bk="delete">${hero("x", "xs")}Delete</button>
          </div>
        </section>`;
      }).join("")}</div>` : empty("No backups")}`;
    }
    const t = lazy(host, render);
    host?.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-bk]");
      if (!btn || !host) return;
      const uuid = btn.closest("[data-uuid]")?.dataset["uuid"];
      try {
        switch (btn.dataset["bk"]) {
          case "create":
            await sendJson(base, "POST", { name: document.getElementById("bkName").value.trim(), ignored: document.getElementById("bkIgnore").value.trim() });
            toast("Backup started", "good");
            break;
          case "download":
            window.location.assign((await api.get(`${base}/${uuid}/download-url`)).url);
            return;
          case "lock":
            await sendJson(`${base}/${uuid}/lock`, "POST");
            break;
          case "restore": {
            if (!await confirmDialog({ title: "Restore this backup? The server must be offline.", confirmLabel: "Confirm", danger: true })) return;
            const truncate = await confirmDialog({ title: "Delete current files first?", message: "Confirm to wipe the server files before restoring. Cancel keeps the existing files and restores over them.", confirmLabel: "Wipe first", danger: true });
            await sendJson(`${base}/${uuid}/restore`, "POST", { truncate, confirm: true });
            toast("Restore started", "good");
            return;
          }
          case "delete":
            if (!await confirmDialog({ title: "Delete this backup? This cannot be undone.", confirmLabel: "Confirm", danger: true })) return;
            await sendJson(`${base}/${uuid}`, "DELETE", { confirm: true });
            break;
        }
        await render(host);
      } catch (e) {
        fail2(e);
      }
    });
    return t;
  }
  function initNetwork(serviceId) {
    const base = `/api/v1/services/${encodeURIComponent(serviceId)}/network`;
    const host = document.getElementById("dtlNetworkBody");
    async function render(h) {
      const res = await api.get(base);
      h.innerHTML = `<div class="server-tool-heading"><div><h3>Network allocations</h3><p>Addresses and ports assigned by the infrastructure provider.</p></div><button class="btn s" type="button" data-net="assign">${hero("plus", "xs")}Add port</button></div>
      ${res.allocations.length ? `<div class="col server-tool-list">${res.allocations.map((a) => `<section class="card server-tool-card" data-id="${a.id}">
        <div class="ch"><span class="tile ${a.primary ? "good" : "neu"}">${hero("server")}</span><div class="tx"><h3>${esc(a.alias || a.ip)}:${a.port}</h3><p>Allocation #${a.id}</p></div>${a.primary ? '<span class="pill good d">Primary</span>' : '<span class="pill">Additional</span>'}</div>
        <div class="server-tool-form network-tool-form">
          <div class="fld"><span class="lbl">Connection address</span>${copy(`${a.alias || a.ip}:${a.port}`, "address")}</div>
          <div class="fld"><label for="netNotes_${a.id}">Notes</label><div class="inp"><input id="netNotes_${a.id}" data-notes value="${esc(a.notes)}" maxlength="191" placeholder="What uses this port?"></div></div>
        </div>
        ${a.primary ? "" : `<div class="server-tool-actions"><button class="btn s" type="button" data-net="primary">${hero("check", "xs")}Make primary</button><button class="btn s bad" type="button" data-net="remove">${hero("x", "xs")}Remove port</button></div>`}
      </section>`).join("")}</div>` : empty("No ports")}`;
    }
    const t = lazy(host, render);
    host?.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-net]");
      if (!btn || !host) return;
      const id = btn.closest("[data-id]")?.dataset["id"];
      try {
        switch (btn.dataset["net"]) {
          case "assign":
            await sendJson(base, "POST");
            break;
          case "primary":
            await sendJson(`${base}/${id}/primary`, "POST");
            break;
          case "remove":
            if (!await confirmDialog({ title: "Remove this port?", confirmLabel: "Confirm", danger: true })) return;
            await sendJson(`${base}/${id}`, "DELETE", { confirm: true });
            break;
        }
        await render(host);
      } catch (e) {
        fail2(e);
      }
    });
    host?.addEventListener("change", async (ev) => {
      const input = ev.target;
      if (!input.matches("[data-notes]")) return;
      const id = input.closest("[data-id]")?.dataset["id"];
      try {
        await sendJson(`${base}/${id}`, "PATCH", { notes: input.value });
        toast("Saved", "good");
      } catch (e) {
        fail2(e);
      }
    });
    return t;
  }
  function initStartup(serviceId) {
    const base = `/api/v1/services/${encodeURIComponent(serviceId)}`;
    const host = document.getElementById("dtlStartupBody");
    async function render(h) {
      const [st, se] = await Promise.all([
        api.get(`${base}/startup`),
        api.get(`${base}/settings`)
      ]);
      const images = Object.entries(st.images);
      h.innerHTML = `<div class="col" style="gap:18px">
      <div class="fld"><label>Startup command</label><pre class="mono" style="margin:0;padding:12px 14px;border-radius:14px;background:var(--s2);white-space:pre-wrap;word-break:break-all;font-size:12.5px">${esc(st.command)}</pre></div>
      ${images.length > 1 ? `<div class="fld"><label for="stImage">Docker image</label><div class="inp sel"><select id="stImage">${images.map(([label, img]) => `<option value="${esc(img)}" ${img === se.image ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></div></div>` : ""}
      ${st.variables.map((v) => `<div class="fld"><label for="v_${esc(v.key)}">${esc(v.name)} <small class="faint">${esc(v.key)}</small></label>
        <div class="inp"><input id="v_${esc(v.key)}" data-var="${esc(v.key)}" value="${esc(v.value)}" ${v.editable ? "" : "disabled"} maxlength="4096"></div>
        ${v.description ? `<small class="faint">${esc(v.description)}</small>` : ""}</div>`).join("")}
    </div>`;
    }
    const t = lazy(host, render);
    host?.addEventListener("change", async (ev) => {
      const el2 = ev.target;
      try {
        if (el2.id === "stImage") {
          await sendJson(`${base}/startup/image`, "PUT", { image: el2.value });
          toast("Docker image changed. Restart the server to apply it.", "good");
        } else if (el2.dataset["var"]) {
          await sendJson(`${base}/startup/variable`, "PUT", { key: el2.dataset["var"], value: el2.value });
          toast("Saved", "good");
        }
      } catch (e) {
        fail2(e);
        if (host) await render(host).catch(() => void 0);
      }
    });
    return t;
  }
  function initSettings(serviceId) {
    const base = `/api/v1/services/${encodeURIComponent(serviceId)}/settings`;
    const adminBase = `/api/v1/services/${encodeURIComponent(serviceId)}/game-administration`;
    const host = document.getElementById("dtlSettingsBody");
    async function render(h) {
      const [s, admin] = await Promise.all([
        api.get(base),
        api.get(adminBase)
      ]);
      const a = admin.status;
      const hasRcon = a.supportedMethods.includes("RCON");
      const automaticUsesRcon = a.effectiveProtocol.endsWith("_RCON");
      const showRcon = a.selectedMethod === "RCON" || a.selectedMethod === "AUTOMATIC" && automaticUsesRcon;
      const statusTone2 = a.state === "CONNECTED" || a.state === "AVAILABLE" ? "good" : a.state === "UNSUPPORTED" ? "bad" : "warn";
      h.innerHTML = `<div class="g g2" style="align-items:start">
      <section class="card"><div class="ch"><div class="tx"><h3>Details</h3></div></div>
        <div class="col" style="gap:12px">
          <div class="fld"><label for="setName">Server name</label><div class="inp"><input id="setName" maxlength="191" value="${esc(s.name)}"></div></div>
          <div class="fld"><label for="setDesc">Description</label><div class="inp"><input id="setDesc" maxlength="191" value="${esc(s.description)}"></div></div>
          <div><button class="btn s pri" type="button" data-set="rename">Save</button></div>
        </div></section>
      <section class="card"><div class="ch"><div class="tx"><h3>SFTP</h3></div></div>
        <dl class="kv"><dt>Host</dt><dd>${copy(s.sftp.host, "SFTP host")}</dd><dt>Port</dt><dd>${copy(String(s.sftp.port), "SFTP port")}</dd>${s.sftp.username ? `<dt>Username</dt><dd>${copy(s.sftp.username, "SFTP username")}</dd>` : ""}</dl></section>
      <section class="card" style="grid-column:1/-1"><div class="ch"><span class="tile ${statusTone2}">${hero("settings")}</span><div class="tx"><h3>Game Administration / RCON</h3><p>${esc(a.message)}</p></div><span class="pill ${statusTone2} d">${esc(a.state.toLowerCase().replaceAll("_", " "))}</span></div>
        <div class="g g2">
          <dl class="kv"><dt>Detected game</dt><dd>${esc(a.gameIdentity)}</dd><dt>Transport</dt><dd>${esc(a.effectiveProtocol.replaceAll("_", " "))}</dd><dt>Detection</dt><dd>${esc(a.detectionSource.replaceAll("_", " ").toLowerCase())}</dd><dt>Configuration source</dt><dd>${esc(a.configurationSource.replaceAll("_", " ").toLowerCase())}</dd>${a.administrationHost ? `<dt>Trusted host</dt><dd>${esc(a.administrationHost)}</dd>` : ""}<dt>Credentials</dt><dd>${a.credentialsConfigured ? '<span class="pill good xs">Configured &amp; Encrypted</span>' : '<span class="pill neu xs">Not configured</span>'}</dd><dt>Last connected</dt><dd>${a.lastSuccessfulTestAt ? esc(formatDate(a.lastSuccessfulTestAt)) : "Not tested"}</dd></dl>
          <div class="col" style="gap:12px">
            <div class="fld"><label for="gaMethod">Connection method</label><div class="inp sel"><select id="gaMethod" data-auto-rcon="${automaticUsesRcon}">${a.supportedMethods.map((m) => `<option value="${esc(m)}" ${m === a.selectedMethod ? "selected" : ""}>${esc(m === "AUTOMATIC" ? "Automatic" : m === "NATIVE_CONSOLE" ? "Native Console" : "RCON")}</option>`).join("")}</select></div></div>
            ${hasRcon ? `<div id="gaRconFields" class="col" style="gap:12px" ${showRcon ? "" : "hidden"}><div class="fld"><label for="gaPort">Administration port</label><div class="inp"><input id="gaPort" type="number" min="1" max="65535" value="${a.administrationPort ?? ""}" placeholder="Allocated RCON port"></div><small class="hint">Must be an allocation assigned in Network. The host cannot be changed.</small></div>
            <div class="fld"><label for="gaPassword">RCON password</label><div class="inp"><input id="gaPassword" type="password" maxlength="191" autocomplete="new-password" placeholder="${a.credentialsConfigured ? "Configured \u2014 leave blank to keep it" : "Set a strong password"}"></div><small class="hint">The existing password is never returned to the browser.</small></div>
            <label class="row nw"><input id="gaSync" type="checkbox"> Write supported changes to the game configuration</label></div><div id="gaNativeHint" class="alert info" ${showRcon ? "hidden" : ""}><div><b>RCON is not needed</b><span>Automatic mode uses the authorized native console when the game supports it.</span></div></div>` : '<div class="alert info"><div><b>RCON is not needed</b><span>Fortless uses the authorized Pterodactyl console for this server.</span></div></div>'}
            ${a.restartRequired ? '<div class="alert warn"><div><b>Restart required</b><span>Configuration was written, but Fortless will not restart the server without your explicit action.</span></div></div>' : ""}
          </div>
        </div>
        <div class="row" style="margin-top:16px"><button class="btn s pri" type="button" data-set="admin-auto">Configure automatically</button><button class="btn s" type="button" data-set="admin-save">Save configuration</button><button class="btn s" type="button" data-set="admin-test">Test connection</button><button class="btn s" type="button" data-set="admin-detect">Refresh detection</button><button class="btn s ghost" type="button" data-set="admin-reset">Reset to automatic</button></div>
      </section>
      <section class="card"><div class="ch"><div class="tx"><h3>Debug information</h3></div></div>
        <dl class="kv"><dt>Node</dt><dd>${esc(s.node || "\u2014")}</dd><dt>Server ID</dt><dd>${copy(s.identifier, "server ID")}</dd><dt>UUID</dt><dd>${copy(s.uuid, "UUID")}</dd></dl></section>
      <section class="card"><div class="ch"><div class="tx"><h3>Reinstall</h3><p>Runs the install script again. Files may be overwritten.</p></div></div>
        <button class="btn s badt" type="button" data-set="reinstall">${hero("refresh", "xs")}Reinstall server</button></section>
    </div>`;
    }
    const t = lazy(host, render);
    host?.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-set]");
      if (!btn) return;
      try {
        if (btn.dataset["set"] === "rename") {
          await sendJson(`${base}/rename`, "POST", { name: document.getElementById("setName").value, description: document.getElementById("setDesc").value });
          toast("Saved", "good");
        } else if (btn.dataset["set"] === "reinstall") {
          if (!await confirmDialog({ title: "Reinstall this server? The server will be stopped and the install script will run again.", confirmLabel: "Confirm", danger: true })) return;
          await sendJson(`${base}/reinstall`, "POST", { confirm: true });
          toast("Reinstall started", "good");
        } else if (btn.dataset["set"] === "admin-auto") {
          const confirmed = await confirmDialog({
            title: "Configure game administration automatically? Fortless will detect the game, generate secure credentials, update game configuration, and preserve existing settings.",
            confirmLabel: "Configure automatically"
          });
          if (!confirmed) return;
          const res = await sendJson(`${adminBase}/auto-configure`, "POST", {});
          toast(res?.message || "Game administration configured", "good");
          if (host) await render(host);
        } else if (btn.dataset["set"] === "admin-save") {
          const result = await sendJson(adminBase, "PUT", {
            method: document.getElementById("gaMethod").value,
            port: document.getElementById("gaPort")?.value || null,
            password: document.getElementById("gaPassword")?.value || "",
            syncToServer: document.getElementById("gaSync")?.checked === true
          });
          toast(result?.recoveryFile ? `Saved. Recovery copy: ${result.recoveryFile}. Restart when ready.` : "Game administration saved", "good");
          if (host) await render(host);
        } else if (btn.dataset["set"] === "admin-test") {
          await sendJson(`${adminBase}/test`, "POST");
          toast("Connection test passed", "good");
          if (host) await render(host);
        } else if (btn.dataset["set"] === "admin-detect") {
          await sendJson(`${adminBase}/detect`, "POST");
          toast("Detection refreshed", "good");
          if (host) await render(host);
        } else if (btn.dataset["set"] === "admin-reset") {
          await sendJson(adminBase, "DELETE");
          toast("Automatic detection restored", "good");
          if (host) await render(host);
        }
      } catch (e) {
        fail2(e);
      }
    });
    host?.addEventListener("change", (ev) => {
      const target = ev.target;
      if (target.id !== "gaMethod") return;
      const rcon = target.value === "RCON" || target.value === "AUTOMATIC" && target.dataset["autoRcon"] === "true";
      const fields = document.getElementById("gaRconFields");
      const hint = document.getElementById("gaNativeHint");
      if (fields) fields.hidden = !rcon;
      if (hint) hint.hidden = rcon;
    });
    return t;
  }
  var PRESETS = [["viewer", "View only"], ["operator", "Operator"], ["admin", "Full access"]];
  var presetSelect = (id, value, attr = "") => `<div class="inp sel s"><select ${id ? `id="${id}"` : ""} ${attr}>${PRESETS.map(([v, l]) => `<option value="${v}" ${v === value ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
  function initUsers(serviceId) {
    const base = `/api/v1/services/${encodeURIComponent(serviceId)}`;
    const host = document.getElementById("dtlUsersBody");
    async function render(h) {
      const res = await api.get(`${base}/members`);
      h.innerHTML = `<div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <div class="inp s pill" style="flex:1;min-width:200px">${hero("mail-01", "s")}<input id="usrEmail" type="email" placeholder="Email address" autocomplete="off" aria-label="Email address"></div>
        ${presetSelect("usrPreset", "operator")}
        <button class="btn s pri" type="button" data-usr="invite">${hero("plus", "xs")}Invite</button>
      </div>
      ${res.invitations.length ? `<div class="faint" style="font-weight:700;font-size:12.5px;margin:6px 0">Pending</div><div class="col" style="margin-bottom:14px">${res.invitations.map((i) => `<div class="li h" style="padding:10px 14px" data-iid="${esc(i.id)}">
        <span class="tile warn sm">${hero("mail-01")}</span><span class="tx"><b>${esc(i.email)}</b><small>${esc(PRESETS.find(([v]) => v === i.preset)?.[1] ?? i.preset)} \xB7 expires ${esc(formatDate(i.expiresAt))}</small></span>
        ${iconBtn('data-usr="revoke"', "x", "Revoke")}</div>`).join("")}</div>` : ""}
      ${res.members.length ? `<div class="col">${res.members.map((m) => `<div class="li h" style="padding:10px 14px" data-mid="${esc(m.id)}">
        <span class="tile info sm">${hero("users")}</span><span class="tx"><b>${esc(m.name)}</b><small>${esc(m.email)}</small></span>
        ${presetSelect("", m.preset, "data-usr-preset")}${iconBtn('data-usr="remove"', "x", "Remove access")}</div>`).join("")}</div>` : res.invitations.length ? "" : empty("Not shared with anyone")}`;
    }
    const t = lazy(host, render);
    host?.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-usr]");
      if (!btn || !host || btn.matches("select")) return;
      try {
        switch (btn.dataset["usr"]) {
          case "invite": {
            const email = document.getElementById("usrEmail").value.trim();
            if (!email) return;
            await sendJson(`${base}/members/invite`, "POST", { email, preset: document.getElementById("usrPreset").value });
            toast("Invitation sent", "good");
            break;
          }
          case "revoke":
            await sendJson(`${base}/invitations/${btn.closest("[data-iid]")?.dataset["iid"]}`, "DELETE");
            break;
          case "remove":
            if (!await confirmDialog({ title: "Remove this person's access?", confirmLabel: "Remove", danger: true })) return;
            await sendJson(`${base}/members/${btn.closest("[data-mid]")?.dataset["mid"]}`, "DELETE");
            break;
        }
        await render(host);
      } catch (e) {
        fail2(e);
      }
    });
    host?.addEventListener("change", async (ev) => {
      const sel = ev.target;
      if (!sel.matches("[data-usr-preset]")) return;
      try {
        await sendJson(`${base}/members/${sel.closest("[data-mid]")?.dataset["mid"]}`, "PATCH", { preset: sel.value });
        toast("Access updated", "good");
      } catch (e) {
        fail2(e);
        if (host) await render(host).catch(() => void 0);
      }
    });
    return t;
  }
  function initDatabases(serviceId) {
    const base = `/api/v1/services/${encodeURIComponent(serviceId)}/databases`;
    const host = document.getElementById("dtlDatabasesBody");
    async function render(h) {
      const res = await api.get(base);
      h.innerHTML = `<section class="card server-tool-create">
        <div class="ch"><div class="tx"><h3>Databases</h3><p>${res.databases.length} configured \xB7 credentials stay hidden until you need them.</p></div><button class="btn s pri" type="button" data-db="new" aria-expanded="false">${hero("plus", "xs")}New database</button></div>
        <div class="server-tool-form" data-db-create hidden>
          <div class="fld"><label for="dbName">Database name</label><div class="inp"><input id="dbName" placeholder="example_data" maxlength="48"></div></div>
          <div class="fld"><label for="dbRemote">Allowed connections</label><div class="inp"><input id="dbRemote" placeholder="% allows any host" maxlength="191"></div><small class="hint">Use a specific address whenever possible.</small></div>
          <button class="btn pri" type="button" data-db="create">${hero("plus", "xs")}Create database</button>
        </div>
      </section>
      ${res.databases.length ? `<div class="col server-tool-list">${res.databases.map((d) => `<section class="card server-tool-card" data-did="${esc(d.id)}">
        <div class="ch"><span class="tile violet">${hero("database")}</span><div class="tx"><h3>${esc(d.name)}</h3><p>${esc(d.username)} \xB7 connections from ${esc(d.connectionsFrom)}</p></div><button class="btn s sec" type="button" data-db="details" aria-expanded="false">${hero("database", "xs")}Show connection details</button></div>
        <div class="server-tool-details" data-db-details hidden>
          <div class="fld"><span class="lbl">Host</span>${copy(d.host, "host")}</div>
          <div class="fld"><span class="lbl">Username</span>${copy(d.username, "username")}</div>
          ${d.password ? `<div class="fld"><span class="lbl">Password</span>${copy(d.password, "password")}</div><div class="fld server-tool-wide"><span class="lbl">JDBC connection string</span>${copy(`jdbc:mysql://${d.host}/${d.name}?user=${d.username}&password=${d.password}`, "JDBC address")}</div>` : '<div class="alert warn server-tool-wide"><div><b>Password unavailable</b><span>Rotate the password to request a new credential from the panel.</span></div></div>'}
          <div class="server-tool-actions server-tool-wide"><button class="btn s" type="button" data-db="rotate">${hero("refresh", "xs")}Rotate password</button><button class="btn s bad" type="button" data-db="delete">${hero("x", "xs")}Delete database</button></div>
        </div>
      </section>`).join("")}</div>` : empty("No databases")}`;
    }
    const t = lazy(host, render);
    host?.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-db]");
      if (!btn || !host) return;
      if (btn.dataset["db"] === "new") {
        const form = host.querySelector("[data-db-create]");
        if (!form) return;
        const expanded = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!expanded));
        btn.innerHTML = `${hero(expanded ? "plus" : "x", "xs")}${expanded ? "New database" : "Cancel"}`;
        form.hidden = expanded;
        if (!expanded) window.setTimeout(() => document.getElementById("dbName")?.focus(), 0);
        return;
      }
      if (btn.dataset["db"] === "details") {
        const details = btn.closest("[data-did]")?.querySelector("[data-db-details]");
        if (!details) return;
        const expanded = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!expanded));
        btn.innerHTML = `${hero("database", "xs")}${expanded ? "Show" : "Hide"} connection details`;
        details.hidden = expanded;
        return;
      }
      const id = btn.closest("[data-did]")?.dataset["did"];
      try {
        switch (btn.dataset["db"]) {
          case "create":
            await sendJson(base, "POST", { name: document.getElementById("dbName").value.trim(), remote: document.getElementById("dbRemote").value.trim() });
            break;
          case "rotate":
            if (!await confirmDialog({ title: "Rotate the password? Anything using the old one will stop working.", confirmLabel: "Confirm", danger: true })) return;
            await sendJson(`${base}/${id}/rotate`, "POST");
            toast("Password rotated", "good");
            break;
          case "delete":
            if (!await confirmDialog({ title: "Delete this database and all its data?", confirmLabel: "Confirm", danger: true })) return;
            await sendJson(`${base}/${id}`, "DELETE");
            break;
        }
        await render(host);
      } catch (e) {
        fail2(e);
      }
    });
    return t;
  }
  function initSchedules(serviceId) {
    const base = `/api/v1/services/${encodeURIComponent(serviceId)}/schedules`;
    const host = document.getElementById("dtlSchedulesBody");
    const cronInput = (k, label, v) => `<div class="fld" style="min-width:90px;flex:1"><label for="sc_${k}">${label}</label><div class="inp s"><input id="sc_${k}" data-cron="${k}" value="${esc(v)}" maxlength="64" class="mono"></div></div>`;
    const form = (sc) => `<div class="card" data-form="${sc?.id ?? "new"}" style="margin-bottom:14px"><div class="col" style="gap:12px">
      <div class="fld"><label for="sc_name">Name</label><div class="inp s"><input id="sc_name" maxlength="191" value="${esc(sc?.name ?? "")}"></div></div>
      <div class="row" style="gap:10px;flex-wrap:wrap">${cronInput("minute", "Minute", sc?.cron.minute ?? "*/5")}${cronInput("hour", "Hour", sc?.cron.hour ?? "*")}${cronInput("dayOfMonth", "Day of month", sc?.cron.dayOfMonth ?? "*")}${cronInput("month", "Month", sc?.cron.month ?? "*")}${cronInput("dayOfWeek", "Day of week", sc?.cron.dayOfWeek ?? "*")}</div>
      <label class="row nw" style="gap:8px"><input type="checkbox" id="sc_active" ${sc?.active === false ? "" : "checked"}> Active</label>
      <label class="row nw" style="gap:8px"><input type="checkbox" id="sc_online" ${sc?.onlyWhenOnline ? "checked" : ""}> Only when the server is online</label>
      <div class="row" style="gap:8px"><button class="btn s pri" type="button" data-sc="save">${sc ? "Save" : "Create schedule"}</button><button class="btn s sec" type="button" data-sc="cancel">Cancel</button></div>
    </div></div>`;
    async function render(h, editing) {
      const res = await api.get(base);
      h.innerHTML = `<div class="row" style="justify-content:flex-end;margin-bottom:14px"><button class="btn s sec" type="button" data-sc="new">${hero("plus", "xs")}New schedule</button></div>
      ${editing === "new" ? form() : ""}
      ${res.schedules.length ? `<div class="col" style="gap:12px">${res.schedules.map((sc) => editing === sc.id ? form(sc) : `<section class="card" data-sid="${sc.id}">
        <div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div class="tx"><div class="row" style="gap:8px"><b>${esc(sc.name)}</b><span class="pill ${sc.active ? "good" : "neu"}">${sc.active ? "Active" : "Paused"}</span></div>
            <small class="mono">${esc(`${sc.cron.minute} ${sc.cron.hour} ${sc.cron.dayOfMonth} ${sc.cron.month} ${sc.cron.dayOfWeek}`)}</small>
            <small class="faint">${sc.nextRunAt ? `Next ${esc(formatDate(sc.nextRunAt))}` : ""}${sc.lastRunAt ? ` \xB7 Last ${esc(formatDate(sc.lastRunAt))}` : ""}</small></div>
          <div class="btngroup">${iconBtn('data-sc="run"', "play", "Run now")}${iconBtn('data-sc="edit"', "settings", "Edit")}${iconBtn('data-sc="delete"', "x", "Delete")}</div>
        </div>
        <div class="col" style="gap:6px;margin-top:12px">${sc.tasks.map((t2) => `<div class="li h" style="padding:8px 12px" data-tid="${t2.id}"><span class="tx"><b>${esc(t2.action)}</b><small class="mono">${esc(t2.payload || "(no payload)")} \xB7 +${t2.offset}s${t2.continueOnFailure ? " \xB7 continue on failure" : ""}</small></span><div class="btngroup">${iconBtn(`data-sc="edittask" data-task='` + esc(JSON.stringify(t2)) + "'", "settings", "Edit task")}${iconBtn('data-sc="deltask"', "x", "Remove task")}</div></div>`).join("")}
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <div class="inp sel s"><select data-task-action><option value="command">Send command</option><option value="power">Power action</option><option value="backup">Create backup</option></select></div>
            <div class="inp s pill" style="flex:1;min-width:140px"><input data-task-payload placeholder="Command, start/stop/restart/kill, or ignored files" maxlength="1000" aria-label="Task payload"></div>
            <div class="inp s pill" style="width:110px"><input data-task-offset type="number" min="0" max="900" value="0" aria-label="Delay in seconds"></div>
            <button class="btn s sec" type="button" data-sc="addtask">${hero("plus", "xs")}Add task</button>
          </div></div>
      </section>`).join("")}</div>` : editing ? "" : empty("No schedules")}`;
    }
    const t = lazy(host, (h) => render(h));
    host?.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-sc]");
      if (!btn || !host) return;
      const card = btn.closest("[data-sid]");
      const sid = card?.dataset["sid"];
      try {
        switch (btn.dataset["sc"]) {
          case "new":
            await render(host, "new");
            return;
          case "cancel":
            await render(host);
            return;
          case "edit":
            await render(host, Number(sid));
            return;
          case "save": {
            const f = btn.closest("[data-form]");
            const body = { name: document.getElementById("sc_name").value, active: document.getElementById("sc_active").checked, onlyWhenOnline: document.getElementById("sc_online").checked };
            f.querySelectorAll("[data-cron]").forEach((i) => {
              body[i.dataset["cron"]] = i.value.trim();
            });
            await sendJson(f.dataset["form"] === "new" ? base : `${base}/${f.dataset["form"]}`, "POST", body);
            toast("Saved", "good");
            break;
          }
          case "run":
            await sendJson(`${base}/${sid}/execute`, "POST");
            toast("Schedule started", "good");
            break;
          case "delete":
            if (!await confirmDialog({ title: "Delete this schedule and its tasks?", confirmLabel: "Confirm", danger: true })) return;
            await sendJson(`${base}/${sid}`, "DELETE");
            break;
          case "edittask": {
            const t2 = JSON.parse(btn.dataset["task"] || "{}");
            const v = await formDialog({
              title: "Edit task",
              confirmLabel: "Save",
              fields: [
                { key: "action", label: "Action", type: "select", value: t2.action, options: [["command", "Send command"], ["power", "Power action"], ["backup", "Create backup"]] },
                { key: "payload", label: "Payload", value: t2.payload },
                { key: "offset", label: "Delay (seconds)", type: "number", value: String(t2.offset), min: 0, max: 900 },
                { key: "continueOnFailure", label: "Continue if this task fails", type: "checkbox", value: String(t2.continueOnFailure) }
              ]
            });
            if (!v) return;
            await sendJson(`${base}/${sid}/tasks/${t2.id}`, "POST", { action: v["action"], payload: v["payload"], offset: Number(v["offset"] || 0), continueOnFailure: v["continueOnFailure"] === true });
            break;
          }
          case "deltask":
            await sendJson(`${base}/${sid}/tasks/${btn.closest("[data-tid]")?.dataset["tid"]}`, "DELETE");
            break;
          case "addtask": {
            const c = card;
            await sendJson(`${base}/${sid}/tasks`, "POST", { action: c.querySelector("[data-task-action]").value, payload: c.querySelector("[data-task-payload]").value, offset: Number(c.querySelector("[data-task-offset]").value || 0) });
            break;
          }
        }
        await render(host);
      } catch (e) {
        fail2(e);
      }
    });
    return t;
  }

  // src/frontend/client/pages/services/index.ts
  function copyField(value, label) {
    if (!value) return '<code class="mono muted">Pending</code>';
    return `<span class="cpf"><code>${esc(value)}</code><button class="ib xs" type="button" data-copy="${esc(value)}" data-copy-label="${esc(label)}" aria-label="Copy ${esc(label)}">${hero("copy", "xs")}</button></span>`;
  }
  function kv(pairs) {
    return `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
  }
  function meter(label, icon, tone, valueText, pct, note) {
    const w = Math.max(0, Math.min(100, pct));
    return `<div class="col" style="gap:6px"><div class="row nw" style="justify-content:space-between"><div class="row nw"><span class="tile ${tone} sm">${hero(icon)}</span><b>${esc(label)}</b></div><b>${esc(valueText)}</b></div><div class="mtr ${tone === "violet" ? "" : tone}"><b style="width:${w}%"></b></div><small class="faint" style="font-weight:600">${esc(note)}</small></div>`;
  }
  function syncPowerButtons(state) {
    const offline = state === "offline";
    const pill2 = document.getElementById("dtlRuntimePill");
    if (pill2?.dataset["locked"] === "1") return;
    if (pill2) {
      const live = liveState(state);
      pill2.textContent = live.label;
      pill2.className = `pill ${live.tone} d`;
    }
    document.querySelectorAll("[data-pwr]").forEach((el2) => {
      el2.disabled = el2.dataset["pwr"] === "start" ? !offline : offline;
    });
  }
  async function loadLiveUsage(serviceId, ramMb, cpuPct, diskMb) {
    const box = document.getElementById("dtlLiveUsage");
    if (!box) return;
    try {
      const res = await api(
        `/api/v1/services/${encodeURIComponent(serviceId)}/usage`
      );
      if (!res.available || !res.usage) return;
      const u = res.usage;
      syncPowerButtons(u.state);
      const memMb = u.memoryBytes / 1048576;
      const diskUsedMb = u.diskBytes / 1048576;
      box.innerHTML = `<div class="col" style="gap:18px">
      ${meter("CPU", "cpu", "info", `${u.cpuPct.toFixed(1)}%`, cpuPct ? u.cpuPct / cpuPct * 100 : 0, `of ${cpuPct}% limit`)}
      ${meter("Memory", "database", "violet", `${memMb.toFixed(0)} MB`, ramMb ? memMb / ramMb * 100 : 0, `of ${(ramMb / 1024).toFixed(1)} GB limit`)}
      ${meter("Storage", "archive-01", "good", `${(diskUsedMb / 1024).toFixed(2)} GB`, diskMb ? diskUsedMb / diskMb * 100 : 0, `of ${(diskMb / 1024).toFixed(0)} GB limit`)}
      <small class="faint" style="font-weight:600">${esc(u.state.charAt(0).toUpperCase() + u.state.slice(1))}</small>
    </div>`;
    } catch {
    }
  }
  async function renderServiceDetail(serviceId, tab) {
    const host = document.getElementById("serviceDetailView");
    if (!serviceId || !host) return;
    host.innerHTML = `<div class="sk" role="status" aria-label="Loading service"><i></i><i></i><i></i></div>`;
    try {
      const { service } = await api(`/api/v1/services/${encodeURIComponent(serviceId)}`);
      const st = serviceState({ contractStatus: service.contractStatus, runtimeState: service.observedState?.runtimeState });
      const runtime = st.label;
      const tone = st.tone;
      const runningNow = st.running;
      const providerReady = Boolean(capabilitiesStore.get()?.provisioning.enabled);
      const ramMb = Number(service.desiredConfig?.memoryLimitMb || 0);
      const cpuPct = Number(service.desiredConfig?.cpuLimitPct || 0);
      const diskMb = Number(service.desiredConfig?.diskLimitMb || 0);
      const caps = service.providerCapabilities || {
        console: service.providerType === "PTERODACTYL",
        files: service.providerType === "PTERODACTYL",
        game: service.providerType === "PTERODACTYL",
        databases: service.providerType === "PTERODACTYL",
        schedules: service.providerType === "PTERODACTYL",
        backups: service.providerType === "PTERODACTYL" || service.providerType === "PROXMOX",
        network: service.providerType === "PTERODACTYL" || service.providerType === "PROXMOX",
        startup: service.providerType === "PTERODACTYL",
        settings: true,
        users: true,
        power: service.providerType !== "CPANEL"
      };
      const perms = new Set(service.access?.permissions ?? []);
      const can = (perm) => providerReady && st.controllable && perms.has(perm);
      const fastDlCtl = can("file.read") ? initFastDl(service.id) : null;
      const fastDlSupported = fastDlCtl ? await fastDlCtl.checkSupported() : false;
      const show = {
        c: caps.console && can("websocket.connect"),
        p: caps.game && (can("player.read") || can("control.console")),
        f: caps.files && can("file.read"),
        m: caps.game && can("file.read-content"),
        l: fastDlSupported,
        d: caps.databases && can("database.read"),
        h: caps.schedules && can("schedule.read"),
        b: caps.backups && can("backup.read"),
        n: caps.network && can("allocation.read"),
        s: caps.startup && can("startup.read"),
        g: caps.settings && can("settings.rename"),
        u: caps.users && providerReady && st.controllable && service.access?.kind === "ACCOUNT" && perms.has("control.start")
      };
      const canPower = caps.power && (can("control.start") || can("control.stop") || can("control.restart"));
      const powerBtns = !providerReady ? `<span class="pill warn">Provider controls unavailable</span>` : !canPower ? "" : `<button class="btn s sec" id="dtlRestartBtn" data-pwr="restart" ${runningNow ? "" : "disabled"}>${hero("refresh", "xs")}Restart</button><button class="btn s badt" id="dtlStopBtn" data-pwr="stop" ${runningNow ? "" : "disabled"}>${hero("stop", "xs")}Stop</button><button class="btn s goodt" id="dtlStartBtn" data-pwr="start" ${runningNow ? "disabled" : ""}>${hero("play", "xs")}Start</button>`;
      const advancedKeys = /* @__PURE__ */ new Set(["d", "h", "n", "s", "g", "u", "a"]);
      const advancedSlugs = /* @__PURE__ */ new Set(["databases", "schedules", "network", "startup", "settings", "users", "allocation"]);
      let serviceMode = advancedSlugs.has(tab || "") || localStorage.getItem(`fortless_service_mode_${serviceId}`) === "advanced" ? "advanced" : "easy";
      const advancedTab = (key) => advancedKeys.has(key) ? ` data-service-level="advanced"${serviceMode === "easy" ? " hidden" : ""}` : "";
      host.innerHTML = `
      <div class="row faint" style="font-weight:650;padding:2px 0 8px">
        <a class="lk" href="/app/services" data-app-route="services" style="color:var(--ink3)">Services</a>
        <svg class="ic xs" aria-hidden="true"><use href="#i-arrow-right-01"/></svg>
        <span>${esc(service.planName || service.id)}</span>
      </div>

      <div class="hd" style="margin-bottom:0">
        <div class="tx">
          <div class="row" style="gap:8px;margin-bottom:8px">
            <span class="pill ${tone} d" id="dtlRuntimePill" data-locked="${st.controllable ? "" : "1"}">${esc(runtime)}</span>
          </div>
          <h2>${esc(service.planName || "Service Detail")}</h2>
          <p>${esc(service.nodeName || "\u2014")} (${esc(service.regionName || "\u2014")}) \xB7 ${service.identifier ? `Provider ID ${esc(service.identifier)}` : "Provisioning"}</p>
        </div>
        <div class="row act" style="gap:8px">
          <div class="seg" role="tablist" aria-label="Service view">
            <button type="button" role="tab" data-service-mode="easy" aria-selected="${serviceMode === "easy"}" aria-checked="${serviceMode === "easy"}">Easy</button>
            <button type="button" role="tab" data-service-mode="advanced" aria-selected="${serviceMode === "advanced"}" aria-checked="${serviceMode === "advanced"}">Advanced</button>
          </div>
          ${powerBtns}
        </div>
      </div>

      <div class="tabs under" id="serviceDetailTabs" role="tablist" aria-label="Service details" style="margin:24px 0 20px">
        <button class="tab" type="button" role="tab" aria-controls="dtlPaneOverview" aria-selected="true" data-t="o">Overview</button>
        ${[["c", "Console", "dtlPaneConsole"], ["p", "Players", "dtlPanePlayers"], ["f", "Files", "dtlPaneFiles"], ["m", "Game", "dtlPaneGame"], ["l", "FastDL", "dtlPaneFastdl"], ["d", "Databases", "dtlPaneDatabases"], ["h", "Schedules", "dtlPaneSchedules"], ["b", "Backups", "dtlPaneBackups"], ["n", "Network", "dtlPaneNetwork"], ["s", "Startup", "dtlPaneStartup"], ["g", "Settings", "dtlPaneSettings"], ["u", "Users", "dtlPaneUsers"]].filter(([k]) => show[k]).map(([k, l, c]) => `<button class="tab" type="button" role="tab" aria-controls="${c}" aria-selected="false" tabindex="-1" data-t="${k}"${advancedTab(k)}>${l}</button>`).join("")}
        ${show.n ? `<button class="tab" type="button" role="tab" aria-controls="dtlPaneAllocation" aria-selected="false" tabindex="-1" data-t="a"${advancedTab("a")}>Allocation</button>` : ""}
        <button class="tab" type="button" role="tab" aria-controls="dtlPaneActivity" aria-selected="false" tabindex="-1" data-t="e">Activity</button>
      </div>

      <div id="dtlPaneOverview" role="tabpanel" class="tp on">
        <div class="g g2" style="align-items:start">
          <section class="card">
            <div class="ch"><div class="tx"><h3>Connection &amp; Datacenter</h3><p>Where this service lives.</p></div></div>
            <div class="col" style="gap:12px">
              ${service.nodeFqdn ? copyField(service.nodeFqdn, "node hostname") : ""}
              ${kv([
        ["Service ID", copyField(service.id, "service ID")],
        ["Allocated RAM", esc(`${(ramMb / 1024).toFixed(1)} GB`)],
        ["CPU limit", esc(`${cpuPct}%`)],
        ["Allocated disk", esc(`${(diskMb / 1024).toFixed(0)} GB SSD`)],
        ["Provider type", `<span class="pill">${esc(service.providerType)}</span>`],
        ["Datacenter", esc(`${service.regionName || "\u2014"} (${service.regionCode || "\u2014"})`)],
        ["Provider ID", copyField(service.identifier, "provider ID")],
        ["Created", esc(formatDate(service.createdAt))]
      ])}
            </div>
          </section>
          <section class="card">
            <div class="ch"><div class="tx"><h3>Live usage</h3></div></div>
            <div id="dtlLiveUsage">
              <div class="es" data-c="Empty state">
                <span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="#i-analytics-01"/></svg></span>
                <h4>Telemetry is not connected</h4>
              </div>
            </div>
          </section>
        </div>
      </div>

      ${show.c ? `<div id="dtlPaneConsole" role="tabpanel" class="tp" hidden>
        <section class="card">
          <div class="ch"><div class="tx"><h3>Console</h3><p id="dtlConsoleState">Not connected</p></div></div>
          <pre id="dtlConsoleOut" class="mono" style="height:360px;overflow:auto;margin:0 0 12px;padding:14px 16px;background:var(--s1);border-radius:var(--r, 16px);font-size:12.5px;line-height:1.55;color:var(--ink2);white-space:pre-wrap;word-break:break-all" tabindex="0" aria-live="off"></pre>
          ${perms.has("control.console") ? `<div class="inp">
            <svg class="ic s" aria-hidden="true"><use href="#i-arrow-right-01"/></svg>
            <input id="dtlConsoleInput" type="text" autocomplete="off" spellcheck="false" placeholder="Type a command and press Enter" aria-label="Server command">
          </div>` : '<small class="faint">You can watch the console but not send commands with this access level.</small>'}
        </section>
      </div>` : ""}

      ${show.f ? `<div id="dtlPaneFiles" role="tabpanel" class="tp" hidden>
        <section class="card"><div id="dtlFilesBody"></div></section>
      </div>` : ""}

      ${[["p", "dtlPanePlayers", "dtlPlayersBody"], ["m", "dtlPaneGame", "dtlGameBody"], ["l", "dtlPaneFastdl", "dtlFastdlBody"], ["d", "dtlPaneDatabases", "dtlDatabasesBody"], ["h", "dtlPaneSchedules", "dtlSchedulesBody"], ["b", "dtlPaneBackups", "dtlBackupsBody"], ["n", "dtlPaneNetwork", "dtlNetworkBody"], ["s", "dtlPaneStartup", "dtlStartupBody"], ["g", "dtlPaneSettings", "dtlSettingsBody"], ["u", "dtlPaneUsers", "dtlUsersBody"]].filter(([k]) => show[k]).map(([, p, b]) => `<div id="${p}" role="tabpanel" class="tp" hidden><section class="card" style="${p === "dtlPaneFastdl" || p === "dtlPanePlayers" ? "background:transparent;border:none;padding:0" : ""}"><div id="${b}"></div></section></div>`).join("")}

      <div id="dtlPaneAllocation" role="tabpanel" class="tp" hidden>
        <div class="g g3 k2">
          <section class="card" data-c="Meter card">
            <div class="row nw"><span class="tile violet sm"><svg class="ic" aria-hidden="true"><use href="#i-database"/></svg></span><div><div class="faint" style="font-weight:700;font-size:12.5px">Memory</div><b style="font:800 24px var(--font);letter-spacing:-.04em">${esc(`${(ramMb / 1024).toFixed(1)} GB`)}</b></div></div>
            <div class="mtr" style="margin:14px 0 8px"><b style="width:100%;opacity:.35"></b></div>
          </section>
          <section class="card" data-c="Meter card">
            <div class="row nw"><span class="tile info sm"><svg class="ic" aria-hidden="true"><use href="#i-cpu"/></svg></span><div><div class="faint" style="font-weight:700;font-size:12.5px">CPU share</div><b style="font:800 24px var(--font);letter-spacing:-.04em">${esc(`${cpuPct}%`)}</b></div></div>
            <div class="mtr info" style="margin:14px 0 8px"><b style="width:100%;opacity:.35"></b></div>
          </section>
          <section class="card" data-c="Meter card">
            <div class="row nw"><span class="tile good sm"><svg class="ic" aria-hidden="true"><use href="#i-archive-01"/></svg></span><div><div class="faint" style="font-weight:700;font-size:12.5px">Storage</div><b style="font:800 24px var(--font);letter-spacing:-.04em">${esc(`${(diskMb / 1024).toFixed(0)} GB`)}</b></div></div>
            <div class="mtr good" style="margin:14px 0 8px"><b style="width:100%;opacity:.35"></b></div>
          </section>
        </div>
      </div>

      <div id="dtlPaneActivity" role="tabpanel" class="tp" hidden>
        <section class="card"><div id="dtlActivityBody"></div></section>
      </div>`;
      const liveViaSocket = show.c && st.controllable;
      if (!liveViaSocket && (service.externalId || service.identifier)) {
        void loadLiveUsage(service.id, ramMb, cpuPct, diskMb);
        const poll = window.setInterval(() => {
          if (!document.getElementById("dtlLiveUsage")) {
            window.clearInterval(poll);
            return;
          }
          void loadLiveUsage(service.id, ramMb, cpuPct, diskMb);
        }, 5e3);
      }
      const tabsEl = document.getElementById("serviceDetailTabs");
      if (tabsEl) initTabs(tabsEl);
      const applyServiceMode = (nextMode, persist = true) => {
        serviceMode = nextMode;
        if (persist) localStorage.setItem(`fortless_service_mode_${serviceId}`, serviceMode);
        document.querySelectorAll("[data-service-mode]").forEach((item) => {
          const isCur = item.dataset["serviceMode"] === serviceMode;
          item.setAttribute("aria-selected", String(isCur));
          item.setAttribute("aria-checked", String(isCur));
        });
        if (serviceMode === "easy" && tabsEl?.querySelector('[role="tab"][aria-selected="true"][data-service-level="advanced"]')) {
          tabsEl.querySelector('[data-t="o"]')?.click();
        }
        tabsEl?.querySelectorAll('[data-service-level="advanced"]').forEach((item) => {
          item.hidden = serviceMode === "easy";
        });
      };
      document.querySelectorAll("[data-service-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          applyServiceMode(button.dataset["serviceMode"] === "advanced" ? "advanced" : "easy");
        });
      });
      const activityCtl = initServiceActivity(service.id);
      tabsEl?.addEventListener("click", (e) => {
        if (e.target.closest('[data-t="e"]')) activityCtl.open();
      });
      if (providerReady) {
        if (liveViaSocket) {
          const liveHost = document.getElementById("dtlLiveUsage");
          initServiceConsole(service.id, { onStatus: syncPowerButtons, onStats: liveHost ? mountLiveTiles(liveHost) : void 0 }).connect();
        }
        const gameCtl = show.m ? initGame(service.id) : null;
        const playersCtl = show.p ? initPlayers(service.id) : null;
        const openers = {
          p: playersCtl?.open ?? (() => void 0),
          f: initServiceFiles(service.id).open,
          m: gameCtl?.open ?? (() => void 0),
          l: fastDlCtl?.open ?? (() => void 0),
          d: initDatabases(service.id).open,
          h: initSchedules(service.id).open,
          b: initBackups(service.id).open,
          n: initNetwork(service.id).open,
          s: initStartup(service.id).open,
          g: initSettings(service.id).open,
          u: initUsers(service.id).open
        };
        void gameCtl?.checkEula();
        document.getElementById("serviceDetailTabs")?.addEventListener("click", (e) => {
          const tab2 = e.target.closest("[data-t]");
          if (!tab2) return;
          openers[tab2.dataset["t"] ?? ""]?.();
        });
        const actions = { start: "START", stop: "STOP", restart: "RESTART" };
        document.querySelectorAll("[data-pwr]").forEach((btn) => {
          btn.addEventListener("click", (e) => powerService(service.id, actions[btn.dataset["pwr"]], e.currentTarget));
        });
      }
      if (tabsEl) {
        bindTabUrls({
          tabs: tabsEl,
          base: `/app/services/${encodeURIComponent(serviceId)}`,
          initial: tab,
          fallbackKey: "o",
          slugs: { o: "overview", c: "console", p: "players", f: "files", m: "game", l: "fastdl", d: "databases", h: "schedules", b: "backups", n: "network", s: "startup", g: "settings", u: "users", a: "allocation", e: "activity" },
          keyOf: (b) => b.dataset["t"],
          select: (key) => {
            if (advancedKeys.has(key) && serviceMode !== "advanced") applyServiceMode("advanced", false);
            tabsEl.querySelector(`[data-t="${key}"]`)?.click();
          }
        });
      }
    } catch (error) {
      host.innerHTML = `<div class="alert bad">${hero("warning", "s")}<div><b>Failed to load service</b><span>${esc(error.message)}</span></div></div>`;
      toast(error.message, "bad");
    }
  }

  // src/frontend/client/pages/deploy/index.ts
  var deployState = {
    workloads: [],
    plans: [],
    regions: [],
    selectedCategory: "all",
    searchFilter: "",
    selectedWorkloadId: null,
    setupMode: "QUICK",
    selectedSoftwareId: null,
    selectedSoftwareVersion: null,
    selectedPresetId: null,
    selectedAddons: /* @__PURE__ */ new Set(),
    configValues: {},
    selectedPlanId: null,
    selectedRegionId: null,
    activeCoupon: null
  };
  var deployStep = 0;
  var TOTAL_STEPS = 5;
  function getSelectedWorkload() {
    return deployState.workloads.find((w) => w.id === deployState.selectedWorkloadId);
  }
  function checkoutReadiness() {
    if (deployStep !== 4) {
      return { ready: false, reason: "Complete all steps to continue to secure checkout." };
    }
    const workload = getSelectedWorkload();
    if (!workload || !workload.supported) {
      return { ready: false, reason: "Select a supported workload first." };
    }
    if (!deployState.selectedPlanId) {
      return { ready: false, reason: "Select a resource plan." };
    }
    const region = deployState.regions.find((item) => item.id === deployState.selectedRegionId && !item.isSoldOut);
    if (!region) {
      return { ready: false, reason: "Select an available datacenter region." };
    }
    const name = document.getElementById("deployServerName")?.value.trim() ?? "";
    if (name.length < 3) {
      return { ready: false, reason: "Enter a service label with at least 3 characters." };
    }
    if (workload.id === "minecraft" && deployState.setupMode === "CUSTOM" && deployState.configValues["eulaAccepted"] !== true) {
      return { ready: false, reason: "You must accept the Mojang Minecraft EULA to proceed." };
    }
    const capabilities = capabilitiesStore.get();
    if (!capabilities?.payments?.enabled || !capabilities?.provisioning?.enabled) {
      return { ready: false, reason: "Ordering unavailable until payment and infrastructure providers are verified." };
    }
    return { ready: true, reason: "You will continue to the secure payment provider." };
  }
  function updateDeployActions() {
    const next = document.getElementById("deployNextBtn");
    const checkout = document.getElementById("doDeployBtn");
    const hint = document.getElementById("deployCheckoutHint");
    const state = checkoutReadiness();
    if (next) next.hidden = deployStep === 4;
    if (checkout) {
      checkout.hidden = deployStep !== 4;
      checkout.disabled = !state.ready;
      checkout.dataset["checkoutReady"] = String(state.ready);
      const label = checkout.querySelector("span");
      if (label) label.textContent = state.ready ? "Continue to secure checkout" : "Checkout unavailable";
    }
    if (hint) hint.textContent = state.reason;
  }
  function showDeployStep(nextStep) {
    deployStep = Math.max(0, Math.min(TOTAL_STEPS - 1, nextStep));
    document.querySelectorAll("[data-deploy-pane]").forEach((pane) => {
      pane.classList.toggle("on", Number(pane.dataset["deployPane"]) === deployStep);
    });
    document.querySelectorAll("[data-deploy-step-indicator]").forEach((indicator) => {
      const index = Number(indicator.dataset["deployStepIndicator"]);
      indicator.className = `step${index < deployStep ? " done" : index === deployStep ? " cur" : ""}`;
      const marker = indicator.querySelector("i");
      if (marker) {
        if (index < deployStep) {
          marker.innerHTML = hero("check", "xs");
        } else {
          marker.textContent = String(index + 1);
        }
      }
    });
    const back = document.getElementById("deployBackBtn");
    const next = document.getElementById("deployNextBtn");
    if (back) back.disabled = deployStep === 0;
    if (next) next.textContent = deployStep === 3 ? "Review details" : "Continue";
    if (deployStep === 1) renderSetupModes();
    else if (deployStep === 2) renderWorkloadConfiguration();
    else if (deployStep === 3) renderPlansAndRegions();
    else if (deployStep === 4) renderReviewStep();
    updateSummary();
    updateDeployActions();
  }
  function bindDeployWizard() {
    const wizard = document.getElementById("deployWizard");
    if (!wizard || wizard.dataset["bound"] === "true") {
      return;
    }
    wizard.dataset["bound"] = "true";
    document.getElementById("deployBackBtn")?.addEventListener("click", () => showDeployStep(deployStep - 1));
    document.getElementById("deployNextBtn")?.addEventListener("click", () => {
      if (deployStep === 0) {
        const workload = getSelectedWorkload();
        if (!workload) return toast("Select a workload to continue.", "warn");
        if (!workload.supported) return toast(workload.unsupportedReason || "This workload is unsupported.", "bad");
        showDeployStep(1);
      } else if (deployStep === 1) {
        showDeployStep(2);
      } else if (deployStep === 2) {
        const workload = getSelectedWorkload();
        if (workload?.id === "minecraft" && deployState.setupMode === "CUSTOM" && deployState.configValues["eulaAccepted"] !== true) {
          return toast("You must accept the Minecraft EULA to proceed.", "warn");
        }
        showDeployStep(3);
      } else if (deployStep === 3) {
        if (!deployState.selectedPlanId) return toast("Select a resource plan.", "warn");
        if (!deployState.selectedRegionId) return toast("Select an available datacenter region.", "warn");
        showDeployStep(4);
      }
    });
    document.getElementById("deployServerName")?.addEventListener("input", updateDeployActions);
    window.addEventListener("fortless:capabilities", updateDeployActions);
    document.getElementById("workloadSearchInput")?.addEventListener("input", (e) => {
      deployState.searchFilter = e.target.value.trim().toLowerCase();
      renderWorkloadSelector();
    });
    document.getElementById("applyCouponBtn")?.addEventListener("click", async () => {
      const input = document.getElementById("couponInput");
      const code = input?.value.trim().toUpperCase();
      if (!code) return toast("Enter a promotion code.", "warn");
      const plan = deployState.plans.find((p) => p.planVersionId === deployState.selectedPlanId);
      const subtotal = plan?.prices?.[0]?.priceMinorUnits || 1e3;
      try {
        const res = await api("/api/v1/catalog/validate-coupon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, subtotalMinorUnits: subtotal })
        });
        if (res.valid) {
          deployState.activeCoupon = { code, discountMinorUnits: res.discountMinorUnits };
          toast(`Coupon "${code}" applied!`, "good");
          updateSummary();
        }
      } catch (err) {
        toast(err.message || "Invalid coupon code", "bad");
      }
    });
  }
  async function renderDeploy() {
    bindDeployWizard();
    const workloadHost = document.getElementById("workloadSelector");
    if (workloadHost && !deployState.workloads.length) {
      workloadHost.innerHTML = `<div class="sk" role="status" aria-label="Loading catalog"><i></i><i></i><i></i><i></i></div>`;
    }
    try {
      const [workloadsRes, plansRes, regionsRes] = await Promise.all([
        api("/api/v1/deploy/workloads"),
        api("/api/v1/catalog/plans"),
        api("/api/v1/catalog/regions")
      ]);
      deployState.workloads = workloadsRes.workloads || [];
      deployState.plans = plansRes.plans || [];
      deployState.regions = regionsRes.regions || [];
      if (!deployState.selectedWorkloadId) {
        const firstSupported = deployState.workloads.find((w) => w.supported);
        if (firstSupported) selectWorkload(firstSupported.id);
      }
      renderCategoryFilters();
      renderWorkloadSelector();
      showDeployStep(deployStep);
    } catch (error) {
      if (workloadHost) {
        workloadHost.innerHTML = `<div class="alert bad">${hero("warning", "s")}<div><b>Failed to load catalog</b><span>${esc(error.message)}</span></div></div>`;
      }
    }
  }
  function selectWorkload(id) {
    deployState.selectedWorkloadId = id;
    const w = getSelectedWorkload();
    if (w) {
      deployState.selectedSoftwareId = w.softwareOptions[0]?.id || null;
      deployState.selectedSoftwareVersion = w.softwareOptions[0]?.defaultVersion || null;
      deployState.selectedPresetId = w.presets[0]?.id || null;
      deployState.selectedAddons.clear();
      if (w.id === "minecraft") {
        deployState.configValues = {
          difficulty: "normal",
          gamemode: "survival",
          pvp: true,
          maxPlayers: 20,
          motd: "A Fortless Minecraft Server",
          eulaAccepted: true
        };
      } else if (w.id === "cs16") {
        deployState.configValues = {
          maxPlayers: 24,
          startingMap: "de_dust2",
          environment: "rehlds"
        };
      } else if (w.id === "discord-bot") {
        deployState.configValues = {
          packageManager: "npm",
          runtimeVersion: "20"
        };
      }
      const compatiblePlans = getCompatiblePlans();
      if (!compatiblePlans.some((p) => p.planVersionId === deployState.selectedPlanId)) {
        deployState.selectedPlanId = compatiblePlans[0]?.planVersionId || null;
      }
    }
    updateSummary();
  }
  function renderCategoryFilters() {
    const host = document.getElementById("workloadCategoryFilters");
    if (!host) return;
    const categories = [
      { id: "all", label: "All Workloads" },
      { id: "game-servers", label: "Game Servers" },
      { id: "discord-bots", label: "Discord Bots" },
      { id: "apps", label: "Applications & APIs" },
      { id: "databases", label: "Databases & Caches" }
    ];
    host.innerHTML = categories.map((c) => {
      const active = deployState.selectedCategory === c.id;
      return `<button type="button" class="btn xs ${active ? "pri" : ""}" data-cat-filter="${esc(c.id)}">${esc(c.label)}</button>`;
    }).join("");
    host.querySelectorAll("[data-cat-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deployState.selectedCategory = btn.dataset["catFilter"] || "all";
        renderCategoryFilters();
        renderWorkloadSelector();
      });
    });
  }
  function renderWorkloadSelector() {
    const host = document.getElementById("workloadSelector");
    if (!host) return;
    let filtered = deployState.workloads;
    if (deployState.selectedCategory !== "all") {
      filtered = filtered.filter((w) => w.category === deployState.selectedCategory);
    }
    if (deployState.searchFilter) {
      const q = deployState.searchFilter;
      filtered = filtered.filter((w) => w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q) || w.tagline.toLowerCase().includes(q));
    }
    if (!filtered.length) {
      host.innerHTML = `<div class="alert warn"><svg class="ic" aria-hidden="true"><use href="#i-alert-circle"/></svg><div><b>No matching workloads found</b><span>Try a different filter or search query.</span></div></div>`;
      return;
    }
    host.innerHTML = `
    <div class="g g2">
      ${filtered.map((w) => {
      const selected = w.id === deployState.selectedWorkloadId;
      const tone = !w.supported ? "bad" : w.category === "game-servers" ? "acc" : w.category === "discord-bots" ? "violet" : "good";
      const badge = !w.supported ? `<span class="pill bad">Unsupported</span>` : `<span class="pill ${tone}">${esc(w.category.replace("-", " "))}</span>`;
      return `
            <button type="button" class="sel" data-workload-id="${esc(w.id)}" aria-pressed="${selected}" ${!w.supported ? 'style="opacity:0.65"' : ""}>
              <span class="row nw" style="justify-content:space-between;align-items:center">
                <span class="tile neu sm"><svg class="ic" aria-hidden="true"><use href="#i-${w.icon}"/></svg></span>
                ${badge}
              </span>
              <b style="font-size:15px;margin-top:4px">${esc(w.name)}</b>
              <small class="f" style="margin-top:2px">${esc(w.tagline)}</small>
              ${!w.supported && w.unsupportedReason ? `<p style="font-size:11px;color:var(--bad);margin-top:6px;line-height:1.4">${esc(w.unsupportedReason)}</p>` : ""}
            </button>
          `;
    }).join("")}
    </div>
  `;
    host.querySelectorAll("[data-workload-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset["workloadId"];
        const w = deployState.workloads.find((x) => x.id === id);
        if (!w?.supported) {
          toast(w?.unsupportedReason || "This workload is not supported for deployment.", "bad");
          return;
        }
        selectWorkload(id);
        renderWorkloadSelector();
      });
    });
  }
  function renderSetupModes() {
    const host = document.getElementById("setupModeSelector");
    if (!host) return;
    const isQuick = deployState.setupMode === "QUICK";
    const isCustom = deployState.setupMode === "CUSTOM";
    host.innerHTML = `
    <button type="button" class="sel" data-mode="QUICK" aria-pressed="${isQuick}">
      <span class="row nw" style="justify-content:space-between;align-items:center">
        <span class="tile good sm"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg></span>
        <span class="pill good">Recommended</span>
      </span>
      <b style="font-size:16px;margin-top:4px">Quick Setup</b>
      <span class="p">Clean &amp; Minimal</span>
      <small class="f">Deploys a clean, verified instance with standard recommended defaults. Zero optional packages, plugins, or addons selected.</small>
    </button>

    <button type="button" class="sel" data-mode="CUSTOM" aria-pressed="${isCustom}">
      <span class="row nw" style="justify-content:space-between;align-items:center">
        <span class="tile acc sm"><svg class="ic" aria-hidden="true"><use href="#i-settings"/></svg></span>
        <span class="pill acc">Full Control</span>
      </span>
      <b style="font-size:16px;margin-top:4px">Custom Setup</b>
      <span class="p">Guided Configuration</span>
      <small class="f">Customize software versions, select game modes, tune server properties, and configure optional verified packages and dependencies.</small>
    </button>
  `;
    host.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deployState.setupMode = btn.dataset["mode"];
        if (deployState.setupMode === "QUICK") {
          deployState.selectedAddons.clear();
        }
        renderSetupModes();
        updateSummary();
      });
    });
  }
  function renderWorkloadConfiguration() {
    const host = document.getElementById("workloadConfigHost");
    const title = document.getElementById("step3Title");
    const subtitle = document.getElementById("step3Subtitle");
    if (!host) return;
    const w = getSelectedWorkload();
    if (!w) {
      host.innerHTML = `<div class="alert warn"><svg class="ic" aria-hidden="true"><use href="#i-alert-circle"/></svg><div><b>Select a workload first.</b></div></div>`;
      return;
    }
    if (title) title.textContent = `Configure ${w.name}`;
    if (subtitle) {
      subtitle.textContent = deployState.setupMode === "QUICK" ? "Quick setup: Confirm software distribution and runtime version." : "Custom setup: Tune software version, presets, addons, and server settings.";
    }
    const softwareHtml = w.softwareOptions.length > 0 ? `
    <div class="col" style="gap:8px">
      <label style="font-weight:700;font-size:13px">Software Distribution</label>
      <div class="g g2">
        ${w.softwareOptions.map((sw) => {
      const selected = sw.id === deployState.selectedSoftwareId;
      return `
              <button type="button" class="sel" data-sw-id="${esc(sw.id)}" aria-pressed="${selected}">
                <span class="row nw" style="justify-content:space-between">
                  <b>${esc(sw.name)}</b>
                  ${sw.recommended ? '<span class="pill good">Recommended</span>' : ""}
                </span>
                <small class="f">${esc(sw.description)}</small>
              </button>
            `;
    }).join("")}
      </div>
    </div>
  ` : "";
    const selectedSoftware = w.softwareOptions.find((s) => s.id === deployState.selectedSoftwareId) || w.softwareOptions[0];
    const versionHtml = selectedSoftware && selectedSoftware.versions.length > 0 ? `
    <div class="fld">
      <label for="cfgSoftwareVersion">Version</label>
      <div class="inp">
        <select id="cfgSoftwareVersion">
          ${selectedSoftware.versions.map((v) => `<option value="${esc(v)}" ${v === deployState.selectedSoftwareVersion ? "selected" : ""}>${esc(v)}${v === selectedSoftware.defaultVersion ? " (Recommended Default)" : ""}</option>`).join("")}
        </select>
      </div>
    </div>
  ` : "";
    let customHtml = "";
    if (deployState.setupMode === "CUSTOM") {
      if (w.presets.length > 0) {
        customHtml += `
        <div class="col" style="gap:8px">
          <label style="font-weight:700;font-size:13px">${w.id === "cs16" ? "Curated Game Mode" : "Configuration Preset"}</label>
          <div class="g g2">
            ${w.presets.map((p) => {
          const selected = p.id === deployState.selectedPresetId;
          return `
                  <button type="button" class="sel" data-preset-id="${esc(p.id)}" aria-pressed="${selected}">
                    <b>${esc(p.name)}</b>
                    <small class="f">${esc(p.description)}</small>
                    ${p.requiredDependencies.length ? `<span class="pill neu xs" style="margin-top:4px">Requires: ${esc(p.requiredDependencies.join(", "))}</span>` : ""}
                  </button>
                `;
        }).join("")}
          </div>
        </div>
      `;
      }
      if (w.id === "minecraft") {
        const eulaChecked = deployState.configValues["eulaAccepted"] === true;
        customHtml += `
        <div class="card flat" style="background:var(--s1);padding:14px;border-radius:10px">
          <h4 style="margin-bottom:8px">Server Settings</h4>
          <div class="g g2">
            <div class="fld">
              <label for="mcDifficulty">Difficulty</label>
              <div class="inp">
                <select id="mcDifficulty">
                  <option value="peaceful" ${deployState.configValues["difficulty"] === "peaceful" ? "selected" : ""}>Peaceful</option>
                  <option value="easy" ${deployState.configValues["difficulty"] === "easy" ? "selected" : ""}>Easy</option>
                  <option value="normal" ${deployState.configValues["difficulty"] === "normal" ? "selected" : ""}>Normal</option>
                  <option value="hard" ${deployState.configValues["difficulty"] === "hard" ? "selected" : ""}>Hard</option>
                </select>
              </div>
            </div>
            <div class="fld">
              <label for="mcGamemode">Default Game Mode</label>
              <div class="inp">
                <select id="mcGamemode">
                  <option value="survival" ${deployState.configValues["gamemode"] === "survival" ? "selected" : ""}>Survival</option>
                  <option value="creative" ${deployState.configValues["gamemode"] === "creative" ? "selected" : ""}>Creative</option>
                  <option value="adventure" ${deployState.configValues["gamemode"] === "adventure" ? "selected" : ""}>Adventure</option>
                </select>
              </div>
            </div>
          </div>
          <div class="fld" style="margin-top:10px">
            <label for="mcMotd">Server Description (MOTD)</label>
            <div class="inp"><input type="text" id="mcMotd" value="${esc(deployState.configValues["motd"] || "A Fortless Minecraft Server")}"></div>
          </div>
          <div class="fld" style="margin-top:12px">
            <label class="row nw" style="align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="mcEula" ${eulaChecked ? "checked" : ""} style="width:18px;height:18px">
              <b>I accept the Mojang Minecraft End User License Agreement (EULA)</b>
            </label>
            <span class="hint">Acceptance writes eula=true to eula.txt upon provisioning.</span>
          </div>
        </div>
      `;
      } else if (w.id === "cs16") {
        customHtml += `
        <div class="card flat" style="background:var(--s1);padding:14px;border-radius:10px">
          <h4 style="margin-bottom:8px">CS 1.6 Environment &amp; Startup</h4>
          <div class="g g2">
            <div class="fld">
              <label for="cs16Slots">Server Slots</label>
              <div class="inp">
                <select id="cs16Slots">
                  <option value="16" ${deployState.configValues["maxPlayers"] === 16 ? "selected" : ""}>16 Players</option>
                  <option value="24" ${deployState.configValues["maxPlayers"] === 24 || !deployState.configValues["maxPlayers"] ? "selected" : ""}>24 Players (Recommended)</option>
                  <option value="32" ${deployState.configValues["maxPlayers"] === 32 ? "selected" : ""}>32 Players</option>
                </select>
              </div>
            </div>
            <div class="fld">
              <label for="cs16Map">Starting Map</label>
              <div class="inp">
                <select id="cs16Map">
                  <option value="de_dust2" ${deployState.configValues["startingMap"] === "de_dust2" ? "selected" : ""}>de_dust2</option>
                  <option value="de_inferno" ${deployState.configValues["startingMap"] === "de_inferno" ? "selected" : ""}>de_inferno</option>
                  <option value="de_nuke" ${deployState.configValues["startingMap"] === "de_nuke" ? "selected" : ""}>de_nuke</option>
                  <option value="cs_assault" ${deployState.configValues["startingMap"] === "cs_assault" ? "selected" : ""}>cs_assault</option>
                </select>
              </div>
            </div>
          </div>
          <div class="alert info" style="margin-top:10px">
            <svg class="ic s" aria-hidden="true"><use href="#i-information-circle"/></svg>
            <div><b>GoldSrc Startup Isolation</b><span>Uses pure GoldSrc binary arguments (-game cstrike -pingboost 2). No Source engine parameters are leaked.</span></div>
          </div>
        </div>
      `;
      } else if (w.id === "discord-bot") {
        customHtml += `
        <div class="card flat" style="background:var(--s1);padding:14px;border-radius:10px">
          <h4 style="margin-bottom:8px">Discord Bot Credentials &amp; Runtime</h4>
          <div class="fld">
            <label for="botTokenInput">Bot Secret Token (Encrypted at rest, masked in UI)</label>
            <div class="inp">
              <input type="password" id="botTokenInput" placeholder="OTk3..." value="${esc(deployState.configValues["botToken"] || "")}" autocomplete="new-password">
            </div>
            <span class="hint">Obtain token in Discord Developer Portal \u2192 Bot \u2192 Reset Token. Token is stored securely and never exposed in logs.</span>
          </div>
          <div class="alert info" style="margin-top:10px">
            <svg class="ic s" aria-hidden="true"><use href="#i-information-circle"/></svg>
            <div><b>Discord Developer Portal Intents</b><span>If your bot reads message content or monitors guild member joins, ensure Message Content Intent and Server Members Intent are enabled in the portal.</span></div>
          </div>
        </div>
      `;
      }
      if (w.addonOptions.length > 0) {
        customHtml += `
        <div class="col" style="gap:8px">
          <label style="font-weight:700;font-size:13px">Optional Verified Addons &amp; Packages</label>
          <div class="col" style="gap:6px">
            ${w.addonOptions.map((a) => {
          const checked = deployState.selectedAddons.has(a.id);
          const isBukkitOnForge = (selectedSoftware?.ecosystem === "fabric" || selectedSoftware?.ecosystem === "forge") && ["essentialsx", "vault", "viaversion"].includes(a.id);
          return `
                  <label class="card flat" style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;opacity:${isBukkitOnForge ? "0.5" : "1"}">
                    <input type="checkbox" data-addon-id="${esc(a.id)}" ${checked ? "checked" : ""} ${isBukkitOnForge ? "disabled" : ""} style="width:18px;height:18px">
                    <div class="col" style="flex:1">
                      <div class="row nw" style="justify-content:space-between">
                        <b>${esc(a.name)}</b>
                        <span class="pill neu xs">${esc(a.kind)}</span>
                      </div>
                      <small class="f">${esc(a.description)}</small>
                      ${isBukkitOnForge ? '<small style="color:var(--bad)">Incompatible with Forge/Fabric mod loaders.</small>' : ""}
                    </div>
                  </label>
                `;
        }).join("")}
          </div>
        </div>
      `;
      }
    }
    host.innerHTML = `
    ${softwareHtml}
    ${versionHtml}
    ${customHtml}
  `;
    host.querySelectorAll("[data-sw-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deployState.selectedSoftwareId = btn.dataset["swId"];
        const sw = w.softwareOptions.find((x) => x.id === deployState.selectedSoftwareId);
        deployState.selectedSoftwareVersion = sw?.defaultVersion || null;
        renderWorkloadConfiguration();
        updateSummary();
      });
    });
    document.getElementById("cfgSoftwareVersion")?.addEventListener("change", (e) => {
      deployState.selectedSoftwareVersion = e.target.value;
      updateSummary();
    });
    host.querySelectorAll("[data-preset-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pid = btn.dataset["presetId"];
        deployState.selectedPresetId = pid;
        const preset = w.presets.find((x) => x.id === pid);
        if (preset) {
          preset.requiredDependencies.forEach((d) => deployState.selectedAddons.add(d));
          preset.recommendedAddons.forEach((d) => deployState.selectedAddons.add(d));
        }
        renderWorkloadConfiguration();
        updateSummary();
      });
    });
    host.querySelectorAll("[data-addon-id]").forEach((chk) => {
      chk.addEventListener("change", () => {
        const aid = chk.dataset["addonId"];
        if (chk.checked) deployState.selectedAddons.add(aid);
        else deployState.selectedAddons.delete(aid);
        updateSummary();
      });
    });
    document.getElementById("mcDifficulty")?.addEventListener("change", (e) => {
      deployState.configValues["difficulty"] = e.target.value;
    });
    document.getElementById("mcGamemode")?.addEventListener("change", (e) => {
      deployState.configValues["gamemode"] = e.target.value;
    });
    document.getElementById("mcMotd")?.addEventListener("input", (e) => {
      deployState.configValues["motd"] = e.target.value;
    });
    document.getElementById("mcEula")?.addEventListener("change", (e) => {
      deployState.configValues["eulaAccepted"] = e.target.checked;
      updateDeployActions();
    });
    document.getElementById("cs16Slots")?.addEventListener("change", (e) => {
      deployState.configValues["maxPlayers"] = Number(e.target.value);
    });
    document.getElementById("cs16Map")?.addEventListener("change", (e) => {
      deployState.configValues["startingMap"] = e.target.value;
    });
    document.getElementById("botTokenInput")?.addEventListener("input", (e) => {
      deployState.configValues["botToken"] = e.target.value.trim();
    });
  }
  function getCompatiblePlans() {
    const w = getSelectedWorkload();
    if (!w) return deployState.plans;
    const minMem = w.minMemoryMb || 512;
    return deployState.plans.filter((p) => {
      const mem = p.resources?.memoryMb || 0;
      return mem >= minMem;
    });
  }
  function renderPlansAndRegions() {
    const planHost = document.getElementById("planSelector");
    if (planHost) {
      const compatible = getCompatiblePlans();
      if (!compatible.length) {
        planHost.innerHTML = `<div class="alert warn"><svg class="ic" aria-hidden="true"><use href="#i-alert-circle"/></svg><div><b>No compatible plans found</b><span>This workload requires higher resource allocations.</span></div></div>`;
      } else {
        planHost.innerHTML = `
        <div class="g g2">
          ${compatible.map((plan) => {
          const price = plan.prices[0];
          const selected = plan.planVersionId === deployState.selectedPlanId;
          const tone = plan.categorySlug === "game-servers" ? "acc" : "violet";
          return `
                <button type="button" class="sel" data-plan-id="${esc(plan.planVersionId)}" aria-pressed="${selected}">
                  <span class="pill ${tone}">${esc(plan.categoryName)}</span>
                  <b>${esc(plan.planName)}</b>
                  <span class="p">${price ? money(price.priceMinorUnits, price.currency) : "Unavailable"} <small>/${esc((price?.interval || "").toLowerCase())}</small></span>
                  <small class="f">${esc(plan.productName)} \xB7 ${plan.resources.memoryMb / 1024} GB RAM \xB7 ${plan.resources.cpuPct}% CPU \xB7 ${plan.resources.diskMb / 1024} GB disk</small>
                </button>
              `;
        }).join("")}
        </div>
      `;
        planHost.querySelectorAll("[data-plan-id]").forEach((btn) => {
          btn.addEventListener("click", () => {
            deployState.selectedPlanId = btn.dataset["planId"];
            renderPlansAndRegions();
            updateSummary();
          });
        });
      }
    }
    const regHost = document.getElementById("regionSelector");
    if (regHost && deployState.regions.length) {
      regHost.innerHTML = `
      <div class="g g2">
        ${deployState.regions.map((reg) => {
        const flag = reg.country === "DE" ? "\u{1F1E9}\u{1F1EA}" : reg.country === "GB" ? "\u{1F1EC}\u{1F1E7}" : "\u{1F310}";
        const selected = reg.id === deployState.selectedRegionId;
        const statusText = reg.isSoldOut ? "Sold out in this region" : `${Math.floor(reg.memoryAvailableMb / 1024)} GB RAM available`;
        const avail = reg.isSoldOut ? `<span class="pill bad" style="margin-left:auto">Sold out</span>` : `<span class="pill good" style="margin-left:auto">Available</span>`;
        return `
              <button type="button" class="sel" data-region-id="${esc(reg.id)}" aria-pressed="${selected}" ${reg.isSoldOut ? "disabled" : ""}>
                <span class="row nw"><b>${flag} ${esc(reg.name)} (${esc(reg.code)})</b>${avail}</span>
                <small class="f">${esc(statusText)}</small>
              </button>
            `;
      }).join("")}
      </div>
    `;
      regHost.querySelectorAll("[data-region-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          deployState.selectedRegionId = btn.dataset["regionId"];
          renderPlansAndRegions();
          updateSummary();
        });
      });
    }
  }
  function renderReviewStep() {
    const host = document.getElementById("deployReviewDetails");
    if (!host) return;
    const w = getSelectedWorkload();
    const plan = deployState.plans.find((p) => p.planVersionId === deployState.selectedPlanId);
    const reg = deployState.regions.find((r) => r.id === deployState.selectedRegionId);
    const sw = w?.softwareOptions.find((s) => s.id === deployState.selectedSoftwareId);
    const addons = Array.from(deployState.selectedAddons);
    host.innerHTML = `
    <div class="card flat" style="background:var(--s1);padding:14px;border-radius:10px">
      <h4 style="margin-bottom:8px">Deployment Specification Snapshot</h4>
      <dl class="kv">
        <dt>Workload</dt><dd><b>${esc(w?.name || "\u2014")}</b></dd>
        <dt>Software Distribution</dt><dd>${esc(sw?.name || "Standard")} (${esc(deployState.selectedSoftwareVersion || "Default")})</dd>
        <dt>Setup Mode</dt><dd><span class="pill ${deployState.setupMode === "QUICK" ? "good" : "acc"}">${esc(deployState.setupMode)}</span></dd>
        <dt>Installed Addons</dt><dd>${addons.length ? esc(addons.join(", ")) : '<span class="faint">Clean installation (0 optional addons)</span>'}</dd>
        <dt>Target Node Region</dt><dd>${esc(reg ? `${reg.name} (${reg.code})` : "\u2014")}</dd>
        <dt>Resource Allocation</dt><dd>${plan ? `${plan.resources.memoryMb / 1024} GB RAM \xB7 ${plan.resources.cpuPct}% CPU \xB7 ${plan.resources.diskMb / 1024} GB disk` : "\u2014"}</dd>
      </dl>
    </div>
    <div class="alert info">
      <svg class="ic s" aria-hidden="true"><use href="#i-shield-check"/></svg>
      <div><b>Verifiable Deployment Guarantee</b><span>Pterodactyl container creation and post-provisioning tasks are tracked individually. No fake operational states are reported.</span></div>
    </div>
  `;
  }
  function updateSummary() {
    const w = getSelectedWorkload();
    const plan = deployState.plans.find((item) => item.planVersionId === deployState.selectedPlanId);
    const sw = w?.softwareOptions.find((s) => s.id === deployState.selectedSoftwareId);
    const sumWorkload = document.getElementById("sumWorkload");
    const sumSoftware = document.getElementById("sumSoftware");
    const sumMode = document.getElementById("sumMode");
    const sumAddons = document.getElementById("sumAddons");
    const sumPlan = document.getElementById("sumPlan");
    const sumReg = document.getElementById("sumReg");
    const sumTotal = document.getElementById("sumTotal");
    if (sumWorkload) sumWorkload.textContent = w?.name || "Not selected";
    if (sumSoftware) sumSoftware.textContent = sw ? `${sw.name} ${deployState.selectedSoftwareVersion || ""}` : "\u2014";
    if (sumMode) sumMode.textContent = deployState.setupMode === "QUICK" ? "Quick Setup" : "Custom Setup";
    const addonsList = Array.from(deployState.selectedAddons);
    if (sumAddons) sumAddons.textContent = addonsList.length ? `${addonsList.length} package(s)` : "Clean (none)";
    if (!plan) {
      if (sumPlan) sumPlan.textContent = "Not selected";
      if (sumReg) sumReg.textContent = "Not selected";
      if (sumTotal) sumTotal.textContent = "\u2014";
      updateDeployActions();
      return;
    }
    const price = plan.prices[0];
    const subtotal = price?.priceMinorUnits || 0;
    const discount = deployState.activeCoupon ? deployState.activeCoupon.discountMinorUnits : 0;
    const estimatedSubtotal = Math.max(0, subtotal - discount);
    if (sumPlan) sumPlan.textContent = plan.planName;
    const selReg = deployState.regions.find((r) => r.id === deployState.selectedRegionId);
    if (sumReg) sumReg.textContent = selReg ? `${selReg.name} (${selReg.code})` : "Not selected";
    const rowDisc = document.getElementById("rowDiscount");
    const discountLabel = document.getElementById("sumDiscountLabel");
    if (rowDisc) {
      if (deployState.activeCoupon && discount > 0) {
        rowDisc.hidden = false;
        if (discountLabel) discountLabel.hidden = false;
        const sumCode = document.getElementById("sumCouponCode");
        const sumDisc = document.getElementById("sumDiscount");
        if (sumCode) sumCode.textContent = `(${deployState.activeCoupon.code})`;
        if (sumDisc) sumDisc.textContent = `-${money(discount, price?.currency || "EUR")}`;
      } else {
        rowDisc.hidden = true;
        if (discountLabel) discountLabel.hidden = true;
      }
    }
    if (sumTotal) sumTotal.textContent = money(estimatedSubtotal, price?.currency || "EUR");
    updateDeployActions();
  }
  function buildDeploymentSpecification() {
    const w = getSelectedWorkload();
    const nameInput = document.getElementById("deployServerName");
    const serverName = nameInput?.value.trim() || "my-service";
    const spec = {
      workloadId: w?.id || "minecraft",
      setupMode: deployState.setupMode,
      softwareId: deployState.selectedSoftwareId || "paper",
      softwareVersion: deployState.selectedSoftwareVersion || "1.20.4",
      presetId: deployState.selectedPresetId || void 0,
      selectedAddons: Array.from(deployState.selectedAddons),
      environmentVariables: {},
      serverProperties: w?.id === "minecraft" ? deployState.configValues : void 0,
      cs16Config: w?.id === "cs16" ? {
        environment: deployState.configValues["environment"] || "rehlds",
        maxPlayers: deployState.configValues["maxPlayers"] || 24,
        startingMap: deployState.configValues["startingMap"] || "de_dust2",
        gameMode: deployState.selectedPresetId || "classic"
      } : void 0,
      botConfig: w?.id === "discord-bot" ? {
        tokenSecret: deployState.configValues["botToken"],
        packageManager: deployState.configValues["packageManager"] || "npm",
        runtimeVersion: deployState.selectedSoftwareVersion || "20",
        deploymentPath: deployState.selectedPresetId || "blank"
      } : void 0,
      appConfig: w?.id === "nodejs-app" ? {
        runtimeVersion: deployState.selectedSoftwareVersion || "20",
        port: 3e3,
        deploymentPath: deployState.selectedPresetId || "blank"
      } : void 0,
      eulaAccepted: deployState.setupMode === "QUICK" ? true : deployState.configValues["eulaAccepted"] === true,
      serverName,
      planVersionId: deployState.selectedPlanId || "",
      regionId: deployState.selectedRegionId || "reg_fra_1"
    };
    return spec;
  }
  async function beginCheckout() {
    const button = document.getElementById("doDeployBtn");
    const capabilities = capabilitiesStore.get();
    if (deployStep !== 4) return toast("Complete all configuration steps before checkout.", "warn");
    if (!capabilities?.payments?.enabled || !capabilities?.provisioning?.enabled) {
      return toast("Ordering is unavailable until payment and infrastructure providers are verified.", "warn");
    }
    const spec = buildDeploymentSpecification();
    if (button) {
      button.disabled = true;
      const span = button.querySelector("span");
      if (span) span.textContent = "Validating configuration\u2026";
    }
    try {
      const validation = await api("/api/v1/deploy/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec)
      });
      if (!validation.valid) {
        throw new Error(validation.errors.join("; "));
      }
      if (button) {
        const span = button.querySelector("span");
        if (span) span.textContent = "Preparing signed quote\u2026";
      }
      const quote = await api("/api/v1/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{
            planVersionId: deployState.selectedPlanId,
            quantity: 1,
            regionId: deployState.selectedRegionId,
            customOptions: { deploymentSpec: spec, serverName: spec.serverName }
          }],
          couponCode: deployState.activeCoupon?.code || void 0
        })
      });
      if (button) {
        const span = button.querySelector("span");
        if (span) span.textContent = "Redirecting to checkout\u2026";
      }
      const checkout = await api("/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          quoteId: quote.id,
          regionId: deployState.selectedRegionId,
          customOptions: { deploymentSpec: spec, serverName: spec.serverName }
        })
      });
      window.location.href = checkout.checkoutUrl;
    } catch (error) {
      toast(error.message || "Checkout initiation failed.", "bad");
    } finally {
      if (button) {
        updateDeployActions();
      }
    }
  }

  // src/frontend/client/pages/domains/index.ts
  var activeZoneId = null;
  async function renderDomains() {
    await Promise.all([loadZones(), loadTldPricing()]);
    bindDomainEvents();
  }
  async function loadTldPricing() {
    const host = document.getElementById("tldPricingChips");
    if (!host) return;
    try {
      const { tlds } = await api("/api/v1/domains/tlds");
      host.innerHTML = Object.values(tlds).map(
        (t) => `
        <span class="badge ${t.popular ? "accent" : ""} s" data-tld="${esc(t.tld)}">
          <b>${esc(t.tld)}</b> ${money(t.annualPriceMinorUnits, t.currency)}/yr
        </span>
      `
      ).join(" ");
    } catch {
    }
  }
  async function loadZones() {
    const host = document.getElementById("domainZonesContainer");
    if (!host) return;
    host.innerHTML = renderSkeleton("table", "Loading domain zones");
    try {
      const { zones } = await api("/api/v1/domains/zones");
      if (!zones.length) {
        host.innerHTML = renderEmptyState({
          icon: "document",
          title: "No domain zones active",
          message: "Add a domain you already own above, prove ownership with a TXT record, then point its name servers to Fortless."
        });
        return;
      }
      host.innerHTML = `
      <div class="col" style="gap:8px">
        ${zones.map((z) => {
        const ns = JSON.parse(z.nameservers || "[]");
        const nsText = ns.length ? ns.join(" \xB7 ") : "ns1.fortless.net \xB7 ns2.fortless.net";
        const exp = z.expires_at ? ` \xB7 Expires ${formatDate(z.expires_at)}` : "";
        const proven = Boolean(z.ownership_verified_at);
        const challenge = !proven && z.ownership_token ? { name: `_fortless-challenge.${z.domain_name}`, value: `fortless-verify=${z.ownership_token}` } : null;
        const pillTone = !proven ? "warn" : z.status === "ACTIVE" ? "good" : "neu";
        const pillText = !proven ? "Ownership not verified" : z.status === "ACTIVE" ? "Delegated" : "Awaiting delegation";
        return `
            <div class="col" style="gap:8px" data-zone-search="${esc(`${z.domain_name} ${z.status} ${ns.join(" ")}`.toLowerCase())}">
            <div class="li h" style="padding:12px 14px;gap:12px;align-items:center">
              <span class="tile ${proven ? "good" : "warn"} sm"><svg class="ic s" width="16" height="16"><use href="#i-globe-02"/></svg></span>
              <span class="tx" style="min-width:140px">
                <b>${esc(z.domain_name)}</b>
                <small class="muted mono" style="font-size:12px">${esc(nsText)}${esc(exp)}</small>
              </span>
              <span class="pill ${pillTone}">${esc(pillText)}</span>
              ${!proven ? `<button type="button" class="btn xs tint verify-ownership-btn" data-zone-id="${esc(z.id)}" style="flex-shrink:0">Verify ownership</button>` : z.status !== "ACTIVE" ? `<button type="button" class="btn xs tint verify-delegation-btn" data-zone-id="${esc(z.id)}" style="flex-shrink:0">Check delegation</button>` : ""}
              <button type="button" class="btn xs tint manage-dns-btn" data-zone-id="${esc(z.id)}" data-domain="${esc(z.domain_name)}" style="flex-shrink:0" ${proven ? "" : 'disabled title="Verify ownership first"'}>
                <svg class="ic xs" width="14" height="14"><use href="#i-arrow-right-01"/></svg>Manage DNS
              </button>
            </div>
            ${challenge ? `<div class="alert info"><div><b>Prove you control ${esc(z.domain_name)}</b><span>Add this TXT record at your current DNS provider, then choose Verify ownership. Records cannot be edited and the zone is not delegated until this passes. DNS changes can take a few minutes.</span><span class="mono">${esc(challenge.name)} &nbsp; TXT &nbsp; ${esc(challenge.value)}</span></div></div>` : ""}
            </div>
          `;
      }).join("")}
      </div>
    `;
      filterZones();
      const verify = (selector, path, okMessage, pendingMessage) => {
        host.querySelectorAll(selector).forEach((btn) => {
          btn.addEventListener("click", async () => {
            const zid = btn.dataset.zoneId;
            if (!zid) return;
            btn.disabled = true;
            try {
              const res = await api(`/api/v1/domains/zones/${encodeURIComponent(zid)}/${path}`, { method: "POST" });
              toast(res.verified ? okMessage : pendingMessage, res.verified ? "good" : "warn");
              if (res.verified) await loadZones();
            } catch (err) {
              toast(err.message, "bad");
            } finally {
              btn.disabled = false;
            }
          });
        });
      };
      verify(".verify-ownership-btn", "verify-ownership", "Ownership verified. You can now manage DNS records.", "The verification TXT record was not found yet. Check the record and try again in a few minutes.");
      verify(".verify-delegation-btn", "verify-delegation", "Delegation confirmed.", "The domain does not point only to the Fortless name servers yet.");
      host.querySelectorAll(".manage-dns-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const zid = btn.dataset.zoneId;
          const dom = btn.dataset.domain;
          if (zid && dom) openDnsEditor(zid, dom);
        });
      });
    } catch (err) {
      host.innerHTML = `<div class="alert bad"><div><b>Failed to load zones</b><span>${esc(err.message)}</span></div></div>`;
    }
  }
  function filterZones() {
    const query = document.getElementById("zoneSearch")?.value.trim().toLowerCase() || "";
    const rows = [...document.querySelectorAll("#domainZonesContainer [data-zone-search]")];
    let visible = 0;
    rows.forEach((row) => {
      const match = !query || (row.dataset.zoneSearch || "").includes(query);
      row.hidden = !match;
      if (match) visible++;
    });
    const count = document.getElementById("zoneResultCount");
    if (count) count.textContent = rows.length ? `${visible} of ${rows.length} zones` : "";
  }
  async function searchDomains(query) {
    const host = document.getElementById("domainSearchResults");
    if (!host) return;
    const clean = query.trim();
    if (!clean) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = renderSkeleton("list", "Searching domain availability and catalog pricing");
    try {
      const res = await api(`/api/v1/domains/search?query=${encodeURIComponent(clean)}`);
      if (!res.results || !res.results.length) {
        host.innerHTML = '<div class="state-message">No matching TLDs found.</div>';
        return;
      }
      host.innerHTML = `<div class="col" style="gap:6px;margin-top:8px">${res.results.map((item) => {
        const isAvail = item.available && item.status === "NOT_CLAIMED";
        const tone = isAvail ? "info" : "bad";
        return `<div class="li"><span class="tile ${tone} sm"><svg class="ic" width="16" height="16"><use href="#i-globe-02"/></svg></span><span class="tx"><b>${esc(item.domain)}</b><small>Not in Fortless DNS yet \xB7 availability at a registrar is not checked, nothing is purchased</small></span><span class="row" style="gap:8px;flex-shrink:0"><span class="pill ${tone}">${esc(item.status === "NOT_CLAIMED" ? "Not in Fortless DNS" : item.status)}</span>${isAvail ? `<button type="button" class="btn s tint register-domain-btn" data-domain="${esc(item.domain)}">Create DNS zone</button>` : ""}</span></div>`;
      }).join("")}</div>`;
      host.querySelectorAll(".register-domain-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const domain = btn.dataset.domain;
          if (!domain) return;
          btn.disabled = true;
          btn.textContent = "Registering\u2026";
          try {
            if (btn.dataset.claimDomain) {
              const res2 = await api("/api/v1/domains/claims/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domainName: domain })
              });
              if (!res2.verified) {
                toast("The claim TXT record was not found yet. Check it and try again in a few minutes.", "warn");
                btn.disabled = false;
                btn.textContent = "Verify claim";
                return;
              }
              toast(`"${domain}" is now in your workspace.`, "good");
              await loadZones();
              await searchDomains(domain);
              return;
            }
            await api("/api/v1/domains/zones", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domainName: domain, autoRenew: true, whoisPrivacy: true, periodYears: 1 })
            });
            toast(`Authoritative DNS zone for "${domain}" was created. No registrar purchase was made.`, "good");
            await loadZones();
            await searchDomains(domain);
          } catch (err) {
            const code = err.code;
            if (code === "DOMAIN_CLAIMED_UNVERIFIED") {
              try {
                const claim = await api("/api/v1/domains/claims", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ domainName: domain })
                });
                toast(`Add TXT ${claim.recordName} = ${claim.recordValue}, then select Verify claim.`, "warn");
                btn.disabled = false;
                btn.textContent = "Verify claim";
                btn.dataset.claimDomain = domain;
                return;
              } catch (claimErr) {
                toast(claimErr.message, "bad");
              }
            } else {
              toast(err.message, "bad");
            }
            btn.disabled = false;
            btn.textContent = btn.dataset.claimDomain ? "Verify claim" : "Create DNS zone";
          }
        });
      });
    } catch (err) {
      host.innerHTML = `<div class="alert bad"><div><b>Search failed</b><span>${esc(err.message)}</span></div></div>`;
    }
  }
  async function openDnsEditor(zoneId, domainName) {
    activeZoneId = zoneId;
    const editorCard = document.getElementById("dnsEditorCard");
    const title = document.getElementById("dnsEditorDomainTitle");
    if (editorCard) editorCard.style.display = "block";
    if (title) title.textContent = domainName;
    await loadDnsRecords(zoneId);
    editorCard?.scrollIntoView({ behavior: "smooth" });
  }
  async function loadDnsRecords(zoneId) {
    const host = document.getElementById("dnsRecordsContainer");
    if (!host) return;
    host.innerHTML = renderSkeleton("table", "Loading DNS records");
    try {
      const { records } = await api(`/api/v1/domains/zones/${encodeURIComponent(zoneId)}/records`);
      if (!records.length) {
        host.innerHTML = renderEmptyState({
          icon: "document",
          title: "No DNS records configured",
          message: "Add an A, AAAA, CNAME, MX, or TXT record using the form below."
        });
        return;
      }
      host.innerHTML = `
      <table class="tbl rsp" data-c="Data table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
            <th>Target</th>
            <th>TTL</th>
            <th>Priority</th>
            <th class="r">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${records.map(
        (r) => `
            <tr class="h mobile-record">
              <td data-l="Type"><span class="pill acc">${esc(r.record_type)}</span></td>
              <td data-l="Name" class="mono"><b>${esc(r.name)}</b></td>
              <td data-l="Target" class="mono muted" style="word-break:break-all">${esc(r.content)}</td>
              <td data-l="TTL" class="num">${r.ttl}s</td>
              <td data-l="Priority" class="num">${r.priority !== null ? r.priority : "\u2014"}</td>
              <td data-l="Actions" class="r">
                <button type="button" class="ib s delete-dns-btn" data-record-id="${esc(r.id)}" style="color:var(--bad)" aria-label="Delete record">
                  <svg class="ic s" width="16" height="16"><use href="#i-delete-02"/></svg>
                </button>
              </td>
            </tr>
          `
      ).join("")}
        </tbody>
      </table>
    `;
      host.querySelectorAll(".delete-dns-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const rid = btn.dataset.recordId;
          if (!rid || !activeZoneId) return;
          if (!confirm("Are you sure you want to delete this DNS record?")) return;
          btn.disabled = true;
          try {
            await api(`/api/v1/domains/zones/${encodeURIComponent(activeZoneId)}/records/${encodeURIComponent(rid)}`, {
              method: "DELETE"
            });
            toast("DNS record deleted successfully.", "good");
            await loadDnsRecords(activeZoneId);
          } catch (err) {
            toast(err.message, "bad");
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      host.innerHTML = `<div class="alert bad"><div><b>Failed to load DNS records</b><span>${esc(err.message)}</span></div></div>`;
    }
  }
  function bindDomainEvents() {
    const section = document.getElementById("section-domains");
    if (!section || section.dataset.bound === "true") return;
    section.dataset.bound = "true";
    const searchInput = document.getElementById("domainSearchInput");
    const searchBtn = document.getElementById("domainSearchBtn");
    searchBtn?.addEventListener("click", () => {
      if (searchInput) searchDomains(searchInput.value);
    });
    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchDomains(searchInput.value);
      }
    });
    document.getElementById("refreshZonesBtn")?.addEventListener("click", loadZones);
    document.getElementById("zoneSearch")?.addEventListener("input", filterZones);
    const addRecordForm = document.getElementById("addDnsRecordForm");
    addRecordForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeZoneId) {
        toast("Select a domain zone first.", "bad");
        return;
      }
      const typeSelect = document.getElementById("dnsRecordType");
      const nameInput = document.getElementById("dnsRecordName");
      const contentInput = document.getElementById("dnsRecordContent");
      const ttlInput = document.getElementById("dnsRecordTtl");
      const prioInput = document.getElementById("dnsRecordPriority");
      const submitBtn = document.getElementById("addDnsRecordBtn");
      if (!typeSelect || !nameInput || !contentInput) return;
      const payload = {
        recordType: typeSelect.value,
        name: nameInput.value.trim(),
        content: contentInput.value.trim(),
        ttl: ttlInput?.value ? parseInt(ttlInput.value, 10) : 3600,
        priority: prioInput?.value ? parseInt(prioInput.value, 10) : void 0
      };
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving\u2026";
      }
      try {
        await api(`/api/v1/domains/zones/${encodeURIComponent(activeZoneId)}/records`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        toast("DNS record created.", "good");
        nameInput.value = "";
        contentInput.value = "";
        if (prioInput) prioInput.value = "";
        await loadDnsRecords(activeZoneId);
      } catch (err) {
        toast(err.message, "bad");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Add Record";
        }
      }
    });
    document.getElementById("closeDnsEditorBtn")?.addEventListener("click", () => {
      const editor = document.getElementById("dnsEditorCard");
      if (editor) editor.style.display = "none";
      activeZoneId = null;
    });
  }

  // src/frontend/client/pages/billing/index.ts
  var invoiceCache = [];
  var subscriptionCache = [];
  var invoicePage = 1;
  var invoicePageSize = 10;
  var subPage = 1;
  var subPageSize = 5;
  var billingListenersBound = false;
  function invoiceRow(invoice) {
    const badgeClass = invoice.status === "PAID" ? "good" : invoice.status === "DRAFT" ? "" : "info";
    return `<tr class="h" data-s="${esc(invoice.status)}">
    <td data-l="Invoice"><b>${esc(invoice.invoice_number || "Draft")}</b></td>
    <td data-l="Date" class="faint">${esc(formatDate(invoice.created_at))}</td>
    <td data-l="Tax">${money(invoice.tax_minor_units, invoice.currency)}</td>
    <td data-l="Total" class="r num"><b>${money(invoice.total_minor_units, invoice.currency)}</b></td>
    <td data-l="Status"><span class="pill ${badgeClass}">${esc(invoice.status)}</span></td>
    <td class="r"><a href="/api/v1/invoices/${encodeURIComponent(invoice.id)}/download" class="btn xs" download><svg class="ic xs" aria-hidden="true"><use href="/assets/petal-icons.svg#i-download-01"/></svg>Receipt</a></td>
  </tr>`;
  }
  function filterBilling() {
    const host = document.getElementById("invoicesTableBody");
    if (!host) return;
    const query = document.getElementById("invoiceSearch")?.value.trim().toLowerCase() || "";
    const status = document.querySelector('input[name="invoiceStatus"]:checked')?.value || "ALL";
    const records = invoiceCache.filter((invoice) => {
      const matchesStatus = status === "ALL" || (status === "OPEN" ? ["DRAFT", "OPEN", "PENDING"].includes(invoice.status) : invoice.status === status);
      const haystack = `${invoice.invoice_number || "draft"} ${invoice.status} ${invoice.currency}`.toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
    const count = document.getElementById("invoiceResultCount");
    if (count) count.textContent = `${records.length} of ${invoiceCache.length} records`;
    const infoEl = document.getElementById("invoicePageInfo");
    const pagerEl = document.getElementById("invoicePager");
    if (!records.length) {
      host.innerHTML = `<tr><td colspan="6">${renderEmptyState({ icon: "document", title: invoiceCache.length ? "No matching invoices" : "No invoices", message: invoiceCache.length ? "Try another number or status." : "Issued billing records will appear here." })}</td></tr>`;
      if (infoEl) infoEl.textContent = "0 invoices";
      if (pagerEl) pagerEl.innerHTML = "";
      return;
    }
    const pagination = paginateItems(records, invoicePage, invoicePageSize);
    invoicePage = pagination.page;
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    host.innerHTML = pagination.items.map(invoiceRow).join("");
  }
  var billingRole = "";
  function paintBillingProfile(profile, fallbackName, email) {
    const set = (id, text) => {
      const el2 = document.getElementById(id);
      if (el2) el2.textContent = text;
    };
    set("billProfileName", profile?.companyName || fallbackName || "\u2014");
    set("billProfileVat", profile?.taxId || "Not set");
    set("billProfileAddress", profile ? [profile.addressLine1, profile.addressLine2, `${profile.postalCode} ${profile.city}`, profile.country].filter(Boolean).join(", ") : "Not set");
    set("billProfileEmail", email || "\u2014");
  }
  async function loadBillingProfile() {
    try {
      const [me, bp] = await Promise.all([
        api("/api/v1/auth/me"),
        api("/api/v1/account/billing-profile")
      ]);
      billingRole = me.membership?.role || "";
      paintBillingProfile(bp.profile, me.user?.name || me.account?.name || "", me.user?.email || "");
      const btn = document.getElementById("editBillingBtn");
      if (btn) {
        btn.disabled = !["OWNER", "BILLING_MANAGER"].includes(billingRole);
        if (!btn.dataset["bound"]) {
          btn.dataset["bound"] = "1";
          btn.addEventListener("click", () => void editBillingProfile(me.user?.name || "", me.user?.email || ""));
        }
      }
    } catch {
    }
  }
  async function editBillingProfile(fallbackName, email) {
    try {
      const current = (await api("/api/v1/account/billing-profile")).profile;
      const v = await formDialog({
        title: "Billing details",
        message: "Shown on every invoice. The tax ID is stored as you enter it and is not verified.",
        confirmLabel: "Save",
        fields: [
          { key: "companyName", label: "Company name (optional)", value: current?.companyName ?? "" },
          { key: "taxId", label: "Tax / VAT ID (optional)", value: current?.taxId ?? "" },
          { key: "addressLine1", label: "Address", value: current?.addressLine1 ?? "" },
          { key: "addressLine2", label: "Address line 2 (optional)", value: current?.addressLine2 ?? "" },
          { key: "city", label: "City", value: current?.city ?? "" },
          { key: "postalCode", label: "Postal code", value: current?.postalCode ?? "" },
          { key: "country", label: "Country (two-letter code)", value: current?.country ?? "", placeholder: "RO" }
        ]
      });
      if (!v) return;
      const res = await api("/api/v1/account/billing-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v)
      });
      paintBillingProfile(res.profile, fallbackName, email);
      toast("Billing details saved", "good");
    } catch (e) {
      toast(e?.message || "Could not save billing details.", "bad");
    }
  }
  var pendingCancelSubId = null;
  function openCancelSubModal(subId, subName, renewalDate, status = "ACTIVE") {
    pendingCancelSubId = subId;
    const modal = document.getElementById("cancelSubModal");
    const title = document.getElementById("manageSubTitle");
    const desc = document.getElementById("cancelSubDesc");
    const warn = document.getElementById("manageSubWarn");
    const warnTitle = document.getElementById("manageSubWarnTitle");
    const warnText = document.getElementById("manageSubWarnText");
    const cancelBtn = document.getElementById("confirmCancelSubBtn");
    const reactivateBtn = document.getElementById("reactivateSubModalBtn");
    if (status === "CANCEL_SCHEDULED") {
      if (title) title.textContent = "Manage Subscription";
      if (desc) {
        desc.textContent = subName ? `${subName} is scheduled to cancel on ${renewalDate}. You can reactivate auto-renewal at any time before the period ends to keep your server running without interruption.` : `This subscription is scheduled to cancel on ${renewalDate}. You can reactivate auto-renewal now.`;
      }
      if (warn) warn.hidden = false;
      if (warnTitle) warnTitle.textContent = "Auto-renewal is paused";
      if (warnText) warnText.textContent = "Reactivating will resume recurring renewals and preserve your server without data loss.";
      if (cancelBtn) cancelBtn.hidden = true;
      if (reactivateBtn) {
        reactivateBtn.hidden = false;
        reactivateBtn.textContent = "Reactivate subscription";
      }
    } else if (status === "CANCELED" || status === "TERMINATED") {
      if (title) title.textContent = "Re-subscribe via Stripe";
      if (desc) {
        desc.textContent = subName ? `${subName} is currently canceled. Reactivate it to re-subscribe via Stripe and restore hosting service.` : "This subscription is canceled. Reactivate it to re-subscribe via Stripe.";
      }
      if (warn) warn.hidden = false;
      if (warnTitle) warnTitle.textContent = "Stripe re-subscription";
      if (warnText) warnText.textContent = "You will be redirected to Stripe Checkout to re-subscribe and reactivate your hosting plan.";
      if (cancelBtn) cancelBtn.hidden = true;
      if (reactivateBtn) {
        reactivateBtn.hidden = false;
        reactivateBtn.textContent = "Re-subscribe via Stripe";
      }
    } else {
      if (title) title.textContent = "Cancel at period end?";
      if (desc) {
        desc.textContent = subName ? `${subName} keeps running until the current period ends${renewalDate ? " on " + renewalDate : ""}, then it is deleted.` : "The service keeps running until the current period ends, then it is deleted.";
      }
      if (warn) warn.hidden = false;
      if (warnTitle) warnTitle.textContent = "Data is deleted after cancellation";
      if (warnText) warnText.textContent = "Take a backup first if you need it.";
      if (cancelBtn) {
        cancelBtn.hidden = false;
        cancelBtn.textContent = "Schedule cancellation";
      }
      if (reactivateBtn) reactivateBtn.hidden = true;
    }
    if (modal) modal.hidden = false;
  }
  function closeCancelSubModal() {
    pendingCancelSubId = null;
    const modal = document.getElementById("cancelSubModal");
    if (modal) modal.hidden = true;
  }
  async function executeScheduledCancel() {
    if (!pendingCancelSubId) return;
    const subId = pendingCancelSubId;
    const btn = document.getElementById("confirmCancelSubBtn");
    if (btn) btn.disabled = true;
    try {
      await api(`/api/v1/subscriptions/${encodeURIComponent(subId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediate: false })
      });
      toast("Cancellation scheduled at period end.", "good");
      closeCancelSubModal();
      await renderBilling();
    } catch (err) {
      toast(err.message, "bad");
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  async function executeReactivateSub(id) {
    const subId = id || pendingCancelSubId;
    if (!subId) return;
    const reactivateModalBtn = document.getElementById("reactivateSubModalBtn");
    if (reactivateModalBtn) reactivateModalBtn.disabled = true;
    try {
      const res = await api(
        `/api/v1/subscriptions/${encodeURIComponent(subId)}/reactivate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        }
      );
      if (res.checkoutUrl) {
        toast("Redirecting to Stripe checkout to re-subscribe...", "info");
        closeCancelSubModal();
        window.location.href = res.checkoutUrl;
        return;
      }
      toast(res.message || "Subscription reactivated successfully.", "good");
      closeCancelSubModal();
      await renderBilling();
    } catch (err) {
      toast(err.message || "Could not reactivate subscription.", "bad");
    } finally {
      if (reactivateModalBtn) reactivateModalBtn.disabled = false;
    }
  }
  async function renderBilling() {
    const host = document.getElementById("invoicesTableBody");
    if (!host) return;
    host.innerHTML = `<tr><td colspan="6">${renderSkeleton("table", "Loading billing records")}</td></tr>`;
    loadBillingProfile();
    try {
      const [{ invoices }, subResult] = await Promise.all([
        api("/api/v1/invoices"),
        api("/api/v1/subscriptions").catch(() => ({ subscriptions: [] }))
      ]);
      invoiceCache = invoices;
      const subscriptions = subResult.subscriptions || [];
      const paidInvoices = invoices.filter((inv) => inv.status === "PAID");
      const openInvoices = invoices.filter((inv) => ["DRAFT", "OPEN", "PENDING"].includes(inv.status));
      const paidTotal = paidInvoices.reduce((sum, inv) => sum + Number(inv.total_minor_units || 0), 0);
      const openTotal = openInvoices.reduce((sum, inv) => sum + Number(inv.total_minor_units || 0), 0);
      const currency = invoices[0]?.currency || "EUR";
      const activeSubs = subscriptions.filter((s) => s.status === "ACTIVE");
      activeSubs.sort((a, b) => new Date(a.nextRenewalDate).getTime() - new Date(b.nextRenewalDate).getTime());
      const nextSub = activeSubs[0];
      const nextRenewalLabel = nextSub ? formatDate(nextSub.nextRenewalDate) : "\u2014";
      const nextRenewalDesc = nextSub ? esc(nextSub.serviceName) : "No recurring renewals";
      const outstandingLabel = money(openTotal, currency);
      const outstandingDesc = openInvoices.length ? `${openInvoices.length} open ${openInvoices.length === 1 ? "invoice" : "invoices"}` : "No open invoices";
      const paidLabel = money(paidTotal, currency);
      const paidDesc = `${paidInvoices.length} ${paidInvoices.length === 1 ? "invoice" : "invoices"}`;
      const summary = document.getElementById("invoiceSummary");
      if (summary) {
        summary.innerHTML = `
        <div class="card mt" data-c="Metric tile"><div><span class="l">Next renewal</span><b class="v">${nextRenewalLabel}</b><small>${nextRenewalDesc}</small></div><span class="tile info"><svg class="ic" aria-hidden="true"><use href="#i-calendar-01"/></svg></span></div>
        <div class="card mt" data-c="Metric tile"><div><span class="l">Outstanding</span><b class="v">${outstandingLabel}</b><small>${outstandingDesc}</small></div><span class="tile warn"><svg class="ic" aria-hidden="true"><use href="#i-alert-circle"/></svg></span></div>
        <div class="card mt" data-c="Metric tile"><div><span class="l">Paid in 2026</span><b class="v">${paidLabel}</b><small>${paidDesc}</small></div><span class="tile good"><svg class="ic" aria-hidden="true"><use href="#i-coins-01"/></svg></span></div>
      `;
      }
      filterBilling();
      paintSubscriptions();
      bindBillingListeners();
    } catch (error) {
      host.innerHTML = `<tr><td colspan="6"><div class="alert bad"><div><b>Failed to load billing records</b><span>${esc(error.message)}</span></div></div></td></tr>`;
    }
  }
  function paintSubscriptions() {
    const subHost = document.getElementById("subscriptionsContainer");
    const paginationRow = document.getElementById("subPaginationRow");
    const infoEl = document.getElementById("subPageInfo");
    const pagerEl = document.getElementById("subPager");
    if (!subHost) return;
    if (!subscriptionCache.length) {
      if (paginationRow) paginationRow.style.display = "none";
      subHost.innerHTML = renderEmptyState({
        icon: "wallet-01",
        title: "No subscriptions",
        message: "Subscriptions appear after your first order."
      });
      return;
    }
    const pagination = paginateItems(subscriptionCache, subPage, subPageSize);
    subPage = pagination.page;
    if (paginationRow) {
      paginationRow.style.display = subscriptionCache.length > subPageSize ? "flex" : "none";
    }
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    subHost.innerHTML = pagination.items.map((sub) => {
      const isCancelScheduled = sub.status === "CANCEL_SCHEDULED";
      const isCanceled = sub.status === "CANCELED" || sub.status === "TERMINATED";
      const tone = sub.status === "ACTIVE" ? "good" : isCancelScheduled ? "warn" : "bad";
      const statusLabel = isCancelScheduled ? "CANCELLATION SCHEDULED" : sub.status;
      return `<div class="li">
        <span class="tile ${tone} sm"><svg class="ic" aria-hidden="true"><use href="/assets/petal-icons.svg#i-wallet-01"/></svg></span>
        <span class="tx">
          <b>${esc(sub.serviceName)}</b>
          <small>${isCancelScheduled ? "Cancels " + formatDate(sub.nextRenewalDate) : isCanceled ? "Canceled \xB7 " + esc(sub.billingInterval.toLowerCase()) : "Renews " + formatDate(sub.nextRenewalDate) + " \xB7 " + esc(sub.billingInterval.toLowerCase())}</small>
        </span>
        <span class="pill ${tone}">${esc(statusLabel)}</span>
        <div class="row" style="gap:6px">
          ${isCancelScheduled || isCanceled ? `<button type="button" class="btn xs good" data-reactivate-sub="${esc(sub.id)}" data-sub-name="${esc(sub.serviceName)}">Reactivate</button>` : ""}
          <button type="button" class="btn xs" data-cancel-sub="${esc(sub.id)}" data-sub-name="${esc(sub.serviceName)}" data-renewal-date="${formatDate(sub.nextRenewalDate)}" data-sub-status="${esc(sub.status)}">Manage</button>
        </div>
      </div>`;
    }).join("");
  }
  function bindBillingListeners() {
    if (billingListenersBound) return;
    billingListenersBound = true;
    const section = document.getElementById("section-billing");
    if (!section) return;
    section.addEventListener("click", (e) => {
      const target = e.target;
      const invPagerBtn = target.closest("#invoicePager button[data-pg]");
      if (invPagerBtn && !invPagerBtn.disabled) {
        const p = Number(invPagerBtn.dataset.pg);
        if (p && p !== invoicePage) {
          invoicePage = p;
          filterBilling();
        }
        return;
      }
      const subPagerBtn = target.closest("#subPager button[data-pg]");
      if (subPagerBtn && !subPagerBtn.disabled) {
        const p = Number(subPagerBtn.dataset.pg);
        if (p && p !== subPage) {
          subPage = p;
          paintSubscriptions();
        }
        return;
      }
    });
    const search = document.getElementById("invoiceSearch");
    if (search) {
      search.addEventListener("input", () => {
        invoicePage = 1;
        filterBilling();
      });
    }
    section.addEventListener("change", (e) => {
      const target = e.target;
      if (target.name === "invoiceStatus") {
        invoicePage = 1;
        filterBilling();
      }
    });
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

  // src/frontend/client/pages/support/index.ts
  var ticketCache = [];
  var ticketPage = 1;
  var ticketPageSize = 10;
  var supportListenersBound = false;
  function priorityTone(value) {
    return value === "URGENT" ? "bad" : value === "HIGH" ? "warn" : value === "LOW" ? "" : "info";
  }
  function statusTone(value) {
    return ["OPEN", "WAITING_STAFF"].includes(value) ? "info" : value === "RESOLVED" ? "good" : "";
  }
  function ticketRow(ticket) {
    const search = `${ticket.subject} ${ticket.id} ${ticket.status} ${ticket.priority}`.toLowerCase();
    const tone = priorityTone(ticket.priority) || "info";
    const msgs = Number(ticket.message_count || 0);
    return `<a class="li support-ticket-row" href="/app/support/${esc(ticket.id)}" data-app-route="ticket-detail" data-ticket-search="${esc(search)}" data-ticket-status="${esc(ticket.status)}" style="padding:14px 16px">
    <span class="tile ${tone} sm"><svg class="ic" width="16" height="16"><use href="/assets/petal-icons.svg#i-message-01"/></svg></span>
    <span class="tx"><b>${esc(ticket.subject)}</b><small>${esc(ticket.id)} \xB7 updated ${esc(formatDate(ticket.updated_at || ticket.created_at))} \xB7 ${msgs} message${msgs === 1 ? "" : "s"}</small></span>
    <span class="pill ${tone}">${esc(ticket.priority)}</span>
    <span class="pill ${statusTone(ticket.status)}">${esc(ticket.status.replace("_", " "))}</span>
    <svg class="ic s hide-n" width="16" height="16"><use href="/assets/petal-icons.svg#i-arrow-right-01"/></svg>
  </a>`;
  }
  async function renderTickets() {
    const host = document.getElementById("ticketsList");
    if (!host) return;
    host.className = "support-loading";
    host.innerHTML = renderSkeleton("list", "Loading support conversations");
    try {
      const { tickets } = await api("/api/v1/tickets");
      ticketCache = tickets || [];
      ticketPage = 1;
      filterTickets();
      bindSupportListeners();
    } catch (error) {
      host.className = "col";
      host.innerHTML = `<div class="alert bad"><div><b>Failed to load tickets</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
  function filterTickets() {
    const host = document.getElementById("ticketsList");
    if (!host) return;
    const query = document.getElementById("ticketSearch")?.value.trim().toLowerCase() || "";
    const status = (document.querySelector('input[name="ticketStatus"]:checked')?.value || "ALL").toUpperCase();
    const filtered = ticketCache.filter((ticket) => {
      const search = `${ticket.subject} ${ticket.id} ${ticket.status} ${ticket.priority}`.toLowerCase();
      const matchesQuery = !query || search.includes(query);
      const matchesStatus = status === "ALL" || (status === "OPEN" ? ["OPEN", "WAITING_STAFF", "WAITING_CUSTOMER"].includes(ticket.status) : ticket.status === status);
      return matchesQuery && matchesStatus;
    });
    const count = document.getElementById("ticketResultCount");
    if (count) count.textContent = ticketCache.length ? `${filtered.length} of ${ticketCache.length} conversations` : "";
    const infoEl = document.getElementById("ticketPageInfo");
    const pagerEl = document.getElementById("ticketPager");
    if (!filtered.length) {
      host.className = "support-empty";
      host.innerHTML = renderEmptyState({
        icon: "message-01",
        title: "No support conversations",
        message: ticketCache.length ? "No tickets matched your search or status filter." : "Open a ticket when you need help with an account or service.",
        actionHtml: `<a class="btn s tint" href="/app/support/new" data-app-route="ticket-new"><svg class="ic s" width="14" height="14"><use href="/assets/petal-icons.svg#i-add-01"/></svg>Open ticket</a>`
      });
      if (infoEl) infoEl.textContent = "0 tickets";
      if (pagerEl) pagerEl.innerHTML = "";
      return;
    }
    const pagination = paginateItems(filtered, ticketPage, ticketPageSize);
    ticketPage = pagination.page;
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    host.className = "col";
    host.innerHTML = pagination.items.map(ticketRow).join("");
  }
  function bindSupportListeners() {
    if (supportListenersBound) return;
    supportListenersBound = true;
    const section = document.getElementById("section-tickets");
    if (!section) return;
    section.addEventListener("click", (e) => {
      const target = e.target;
      const pagerBtn = target.closest("#ticketPager button[data-pg]");
      if (pagerBtn && !pagerBtn.disabled) {
        const p = Number(pagerBtn.dataset.pg);
        if (p && p !== ticketPage) {
          ticketPage = p;
          filterTickets();
        }
      }
    });
    const search = document.getElementById("ticketSearch");
    if (search) {
      search.addEventListener("input", () => {
        ticketPage = 1;
        filterTickets();
      });
    }
    section.addEventListener("change", (e) => {
      const target = e.target;
      if (target.name === "ticketStatus") {
        ticketPage = 1;
        filterTickets();
      }
    });
  }
  function fileDrop(inputId, labelId) {
    return `<div class="fld">
    <span class="lbl">Attachment <small class="muted" style="font-weight:500">optional \xB7 max 5 MB</small></span>
    <label class="drop" for="${inputId}">
      <svg class="ic" width="28" height="28" style="color:var(--ink3)"><use href="#i-paperclip"/></svg>
      <b>Drop a file here or browse</b>
      <small>PNG, JPEG, GIF, WebP, PDF, text, JSON or ZIP</small>
      <input id="${inputId}" type="file" accept="image/jpeg,image/png,image/gif,image/webp,text/plain,text/markdown,application/pdf,application/json,application/zip" hidden>
      <span id="${labelId}" class="pill" style="display:none;margin-top:8px;font-weight:600"></span>
    </label>
  </div>`;
  }
  function renderNewTicket() {
    const host = document.getElementById("newTicketPage");
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
            ${["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => `
              <label>
                <input type="radio" name="ticketPriority" value="${value}"${value === "NORMAL" ? " checked" : ""} hidden>
                <button type="button" data-v="${value}" aria-selected="${value === "NORMAL"}">${value[0]}${value.slice(1).toLowerCase()}</button>
              </label>
            `).join("")}
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
          ${petalRichTextEditor("newTicketEditor", "Detailed message", "Describe what happened and what you expected\u2026")}
        </div>
        ${fileDrop("newTicketFileInput", "newTicketFileLabel")}
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
  function attachmentMarkup(ticketId, attachments) {
    if (!attachments.length) return "";
    return `<div class="att-list">${attachments.map((att) => `<a href="/api/v1/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(att.id)}" download class="att-chip"><svg class="ic xs" width="12" height="12"><use href="#i-paperclip"/></svg><span class="name">${esc(att.filename)}</span><span class="sz">${formatBytes(att.byte_size)}</span></a>`).join("")}</div>`;
  }
  function openTicketModal() {
    const modal = document.getElementById("ticketModal");
    if (!modal) return;
    const editorHost = document.getElementById("modalTicketMessageHost");
    if (editorHost && !document.getElementById("modalTicketMessage")) {
      editorHost.innerHTML = petalRichTextEditor("modalTicketMessage", "Detailed message", "Describe what happened and what you expected\u2026");
    }
    modal.hidden = false;
    const select = document.getElementById("modalTicketService");
    if (select && select.dataset["loaded"] !== "true" && select.dataset["loading"] !== "true") {
      select.dataset["loading"] = "true";
      api("/api/v1/services").then(({ services }) => {
        select.replaceChildren(new Option("None", ""));
        (services || []).filter((s) => s.contract_status !== "TERMINATED").forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.id;
          const name = s.plan_name || s.planName || s.identifier || s.id;
          const identifier = s.identifier && s.identifier !== name ? ` \xB7 ${s.identifier}` : "";
          opt.textContent = `${name}${identifier}`;
          select.appendChild(opt);
        });
        select.dataset["loaded"] = "true";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }).catch(() => {
      }).finally(() => {
        delete select.dataset["loading"];
      });
    }
  }
  function closeTicketModal() {
    const modal = document.getElementById("ticketModal");
    if (modal) modal.hidden = true;
    const err = document.getElementById("modalTicketError");
    if (err) err.hidden = true;
  }
  async function submitModalTicket(event, navigate) {
    event.preventDefault();
    const form = event.target;
    const subject = document.getElementById("modalTicketSubject")?.value.trim() || "";
    const message = editorMarkdown("modalTicketMessage");
    const priority = (form.querySelector('input[name="modalTicketPriority"]:checked')?.value || "NORMAL").toUpperCase();
    const serviceId = document.getElementById("modalTicketService")?.value || void 0;
    const errorEl = document.getElementById("modalTicketError");
    const submitBtn = document.getElementById("submitModalTicketBtn");
    if (errorEl) errorEl.hidden = true;
    if (subject.length < 3 || message.length < 5) {
      if (errorEl) {
        errorEl.textContent = "Add a clear subject and at least five characters of detail.";
        errorEl.hidden = false;
      }
      return;
    }
    if (submitBtn) submitBtn.disabled = true;
    try {
      const created = await api("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, priority, message, serviceId })
      });
      closeTicketModal();
      form.reset();
      resetEditor("modalTicketMessage");
      toast(`Ticket opened \xB7 ${created.ticketId}`, "good");
      await renderTickets();
      navigate(`/app/support/${created.ticketId}`);
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }
  async function resolveTicketAction(ticketId) {
    const btn = document.getElementById("markTicketResolvedBtn");
    if (btn) btn.disabled = true;
    try {
      await api(`/api/v1/tickets/${encodeURIComponent(ticketId)}/resolve`, { method: "POST" });
      toast("Ticket marked resolved.", "good");
      await renderTicketDetail(ticketId);
    } catch (err) {
      toast(err.message, "bad");
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  async function renderTicketDetail(id) {
    const host = document.getElementById("ticketDetailPage");
    if (!host) return;
    host.innerHTML = renderSkeleton("article", "Loading support conversation");
    try {
      const data = await api(`/api/v1/tickets/${encodeURIComponent(id)}`);
      const closed = data.ticket.status === "CLOSED";
      const isResolved = data.ticket.status === "RESOLVED";
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
            <span class="pill ${statusTone(data.ticket.status)}">${esc(data.ticket.status.replace("_", " "))}</span>
          </div>
          <h1 style="font:800 24px/1.2 var(--font);letter-spacing:-.03em;margin:0 0 4px">${esc(data.ticket.subject)}</h1>
          <p class="sub" style="margin:0">Opened ${esc(formatDate(data.ticket.created_at))} \xB7 updated ${esc(formatDate(data.ticket.updated_at || data.ticket.created_at))}</p>
        </div>
        ${closed || isResolved ? "" : `<button class="btn" id="markTicketResolvedBtn" data-ticket-id="${esc(data.ticket.id)}"><svg class="ic s" aria-hidden="true"><use href="#i-tick-02"/></svg>Mark resolved</button>`}
      </div>
      <div class="g c21">
        <div class="col" style="gap:12px">
          <div class="card" style="padding:24px" data-c="Thread">
            <div class="ch"><div class="tx"><h3 style="margin:0 0 4px">Conversation</h3><p>Showing the first message and the latest replies.</p></div></div>
            ${olderCount ? `<div class="row" style="justify-content:center;margin-bottom:12px"><button class="btn s" type="button" id="loadOlderTicketMessages" data-remaining="${olderCount}">Load ${Math.min(5, olderCount)} older message${Math.min(5, olderCount) === 1 ? "" : "s"}</button></div>` : ""}
            <div class="col" id="ticketConversation" style="gap:12px;max-height:min(680px,62vh);overflow-y:auto;padding-right:6px;scrollbar-gutter:stable">
              ${data.messages.map((message, index) => `
                <div class="row nw" data-ticket-message data-message-index="${index}" ${index > 0 && index < recentStart ? "hidden" : ""} style="align-items:flex-start;gap:12px">
                  <span class="av ${message.is_staff ? "v" : ""} s">${esc((message.author_name || (message.is_staff ? "Support" : "You")).slice(0, 2).toUpperCase())}</span>
                  <div class="li" style="display:block;border-radius:6px 20px 20px 20px;background:${message.is_staff ? "var(--s2)" : "var(--accent-bg)"};flex:1;padding:12px 16px">
                    <div class="row" style="gap:8px;margin-bottom:6px">
                      <b>${esc(message.is_staff ? message.author_name || "Support \xB7 Staff" : message.author_name || "You")}</b>
                      ${message.is_staff ? '<span class="pill violet" style="font-size:11px">Staff</span>' : ""}
                      <small class="faint" style="font-weight:600">${esc(formatDate(message.created_at))}</small>
                    </div>
                    <div style="font-weight:500;line-height:1.55;font-size:13.5px">${renderMarkdown(message.body)}${attachmentMarkup(id, data.attachments.filter((att) => att.message_id === message.id))}</div>
                  </div>
                </div>
              `).join("")}
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
              ${petalRichTextEditor("ticketReplyEditor", "Ticket reply", "Write a reply\u2026")}
            </div>
            ${fileDrop("ticketReplyFileInput", "ticketReplyFileLabel")}
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
            <dt>Status</dt><dd><span class="pill ${statusTone(data.ticket.status)}">${esc(data.ticket.status.replace("_", " "))}</span></dd>
            <dt>Priority</dt><dd><span class="pill ${priorityTone(data.ticket.priority)}">${esc(data.ticket.priority)}</span></dd>
            <dt>Created</dt><dd>${esc(formatDate(data.ticket.created_at))}</dd>
            <dt>Updated</dt><dd>${esc(formatDate(data.ticket.updated_at))}</dd>
            <dt>Messages</dt><dd>${data.messages.length}</dd>
          </dl>
          ${attachmentMarkup(id, data.attachments.filter((att) => !att.message_id))}
        </aside>
      </div>`;
      const conversation = document.getElementById("ticketConversation");
      const loadOlder = document.getElementById("loadOlderTicketMessages");
      loadOlder?.addEventListener("click", () => {
        if (!conversation) return;
        const hidden = Array.from(conversation.querySelectorAll("[data-ticket-message][hidden]"));
        const before = conversation.scrollHeight;
        hidden.slice(-5).forEach((message) => {
          message.hidden = false;
        });
        const remaining = conversation.querySelectorAll("[data-ticket-message][hidden]").length;
        conversation.scrollTop += conversation.scrollHeight - before;
        if (!remaining) loadOlder.remove();
        else {
          loadOlder.dataset.remaining = String(remaining);
          loadOlder.textContent = `Load ${Math.min(5, remaining)} older message${Math.min(5, remaining) === 1 ? "" : "s"}`;
        }
      });
      window.requestAnimationFrame(() => {
        if (conversation) conversation.scrollTop = conversation.scrollHeight;
      });
    } catch (error) {
      host.innerHTML = `<div class="alert bad"><div><b>Failed to load ticket</b><span>${esc(error.message)}</span></div></div><a class="btn sec s" style="margin-top:12px" href="/app/support" data-app-route="tickets">Back to support</a>`;
    }
  }
  async function fileAsBase64(file) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(reader.error || new Error("Could not read the selected file."));
      reader.readAsDataURL(file);
    });
  }
  async function uploadAttachment(ticketId, file, messageId) {
    const dataBase64 = await fileAsBase64(file);
    await api(`/api/v1/tickets/${encodeURIComponent(ticketId)}/attachments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", dataBase64, messageId }) });
  }
  async function createTicket(event, navigate) {
    event.preventDefault();
    const form = event.target;
    const subject = form.elements.namedItem("subject").value.trim();
    const priority = String(new FormData(form).get("ticketPriority") || "NORMAL");
    const message = editorMarkdown("newTicketEditor");
    const file = document.getElementById("newTicketFileInput")?.files?.[0];
    const error = document.getElementById("ticketFormError");
    const submit = document.getElementById("submitTicketBtn");
    error.hidden = true;
    if (subject.length < 3 || message.length < 5) {
      error.textContent = "Add a clear subject and at least five characters of detail.";
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    try {
      const created = await api("/api/v1/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, priority, message }) });
      if (file) {
        try {
          await uploadAttachment(created.ticketId, file, created.messageId);
        } catch (uploadError) {
          toast(`Ticket opened, but attachment failed: ${uploadError.message}`, "warn");
          navigate(`/app/support/${created.ticketId}`);
          return;
        }
      }
      form.reset();
      resetEditor("newTicketEditor");
      toast("Ticket opened.", "good");
      navigate(`/app/support/${created.ticketId}`);
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  }
  async function sendReply(event) {
    event.preventDefault();
    const form = event.target;
    const ticketId = form.dataset.ticketId || "";
    const message = editorMarkdown("ticketReplyEditor");
    const fileInput = document.getElementById("ticketReplyFileInput");
    const file = fileInput?.files?.[0];
    const error = document.getElementById("ticketReplyError");
    const submit = document.getElementById("sendReplyBtn");
    error.hidden = true;
    if (!message && !file) {
      error.textContent = "Write a reply or choose an attachment.";
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    let messageId;
    try {
      if (message) {
        const response = await api(`/api/v1/tickets/${encodeURIComponent(ticketId)}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: message }) });
        messageId = response.messageId;
        resetEditor("ticketReplyEditor");
      }
      if (file) {
        try {
          await uploadAttachment(ticketId, file, messageId);
        } catch (uploadError) {
          error.textContent = `${message ? "Reply was saved, but " : ""}attachment failed: ${uploadError.message}`;
          error.hidden = false;
          toast("Attachment upload failed.", "warn");
          return;
        }
      }
      resetEditor("ticketReplyEditor");
      if (fileInput) fileInput.value = "";
      toast("Reply added.", "good");
      await renderTicketDetail(ticketId);
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  }
  function updateFileLabel(input) {
    const labelId = input.id === "newTicketFileInput" ? "newTicketFileLabel" : "ticketReplyFileLabel";
    const label = document.getElementById(labelId);
    const file = input.files?.[0];
    if (label) {
      if (file) {
        label.textContent = `${file.name} \xB7 ${formatBytes(file.size)}`;
        label.style.display = "inline-flex";
      } else {
        label.textContent = "";
        label.style.display = "none";
      }
    }
  }

  // src/frontend/client/pages/activity/index.ts
  function metadata(item) {
    try {
      return typeof item.metadata === "string" ? JSON.parse(item.metadata) : item.metadata || {};
    } catch {
      return {};
    }
  }
  function resourceContext(item) {
    if (item.resource_type === "service" && item.service_name) {
      return { label: `${item.service_name}${item.service_plan && item.service_plan !== item.service_name ? ` \xB7 ${item.service_plan}` : ""}`, href: `/app/services/${encodeURIComponent(item.resource_id)}` };
    }
    if ((item.resource_type === "ticket" || item.resource_type === "ticket_attachment") && item.ticket_id) {
      return { label: item.ticket_subject ? `Ticket: ${item.ticket_subject}` : item.ticket_id, href: `/app/support/${encodeURIComponent(item.ticket_id)}` };
    }
    if (item.resource_type === "order" && item.resource_id) return { label: `Order ${item.resource_id}` };
    return null;
  }
  function friendlyAction(item) {
    const action = String(item.action || "");
    const meta = metadata(item);
    const ip = item.ip_address ? ` \xB7 from ${item.ip_address}` : "";
    const service = item.resource_type === "service" ? " this service" : "";
    const exact = {
      "user.login": ["Signed in to Fortless", `A new account session was started${ip}.`],
      "user.logout": ["Signed out of Fortless", `The current account session was ended${ip}.`],
      "oidc.authorize": ["Signed in to the server panel with SSO", "Fortless securely approved access to the hosting panel."],
      "auth.passkey_authenticated": ["Signed in with a passkey", `A passkey was used to access the account${ip}.`],
      "auth.passkey_registered": ["Added a passkey", "A new passkey was added to account security."],
      "user.mfa_challenge_completed": ["Completed sign-in verification", `The extra security check was completed${ip}.`],
      "user.step_up_completed": ["Confirmed a sensitive action", "Password and authenticator verification succeeded."],
      "user.mfa_enabled": ["Turned on two-step verification", "The account now requires an authenticator at sign-in."],
      "user.mfa_disabled": ["Turned off two-step verification", "Authenticator protection was removed from the account."],
      "user.password_changed": ["Changed the account password", `Other signed-in devices were disconnected${ip}.`],
      "session.revoked": ["Signed out a device", "One saved account session was removed."],
      "session.others_revoked": ["Signed out other devices", `${Number(meta.revokedCount || 0)} other session${Number(meta.revokedCount || 0) === 1 ? "" : "s"} removed.`],
      "service.game.eula_accepted": ["Accepted the Minecraft EULA", "Minecraft was approved to start and the server was restarted."],
      "service.settings.reinstall": ["Started a server reinstall", "Fortless sent the reinstall request to the hosting platform."],
      "service.settings.reinstall_completed": ["Server reinstall finished", "The fresh installation is ready to use."],
      "service.created": ["Created a service", "A new service was added to this account."],
      "service.provisioned": ["Service became ready", "The hosting platform finished preparing the service."],
      "service.provider_missing": ["Server connection needs attention", "Fortless could no longer find this server on the hosting platform."],
      "ticket.created": ["Opened a support ticket", "A new conversation with Fortless Support was started."],
      "ticket.customer_replied": ["Replied to a support ticket", "Your reply was added to the conversation."],
      "ticket.staff_reply_added": ["Support replied to a ticket", "A Fortless team member added a reply."],
      "ticket.resolved": ["Marked a support ticket resolved", "The support conversation was marked as solved."],
      "billing.profile_updated": ["Updated billing details", "The information used on invoices was changed."],
      "order.paid": ["Payment confirmed", "The order was paid successfully."]
    };
    if (action === "user.notification_preferences_updated") {
      const state = (value) => value === true ? "on" : "off";
      return { title: "Updated email notifications", detail: `Billing ${state(meta.billingEmail)} \xB7 service ${state(meta.serviceEmail)} \xB7 support ${state(meta.supportEmail)}.` };
    }
    if (exact[action]) return { title: exact[action][0], detail: exact[action][1] };
    if (action === "service.power") {
      const verb = String(meta.action || "power command").toLowerCase();
      return { title: `${verb[0]?.toUpperCase() || ""}${verb.slice(1)} requested`, detail: `Fortless sent the ${verb} command to${service || " the server"}.` };
    }
    if (action.startsWith("service.file.")) return { title: "Changed server files", detail: `A file operation was completed${meta.path ? ` for ${meta.path}` : ""}.` };
    if (action.startsWith("service.backup.")) return { title: "Changed server backups", detail: "A backup action was completed." };
    if (action.startsWith("service.database.")) return { title: "Changed a server database", detail: "A database setting or credential was updated." };
    if (action.startsWith("service.network.")) return { title: "Changed a server address", detail: "A network address setting was updated." };
    if (action.startsWith("service.schedule.")) return { title: "Changed an automatic task", detail: "A server schedule or task was updated." };
    if (action.startsWith("service.startup.")) return { title: "Changed startup settings", detail: "A server startup option was updated." };
    if (action.startsWith("service.member.")) return { title: "Changed server access", detail: "Sharing permissions for this server were updated." };
    if (action.startsWith("team.")) return { title: "Changed workspace members", detail: "Team access to this workspace was updated." };
    if (action.startsWith("ticket.")) return { title: "Updated a support ticket", detail: "The support conversation changed." };
    if (/invoice|billing|payment|subscription|order|quote/.test(action)) return { title: "Updated billing", detail: "A billing or subscription record changed." };
    if (action === "service.console_token") return { title: "Opened the server console", detail: "A temporary secure console connection was created." };
    if (action === "panel_client_key.minted") return { title: "Connected to the hosting panel", detail: "Fortless created secure panel access for this account." };
    const words = action.replaceAll(/[._-]+/g, " ").trim();
    return { title: words ? words[0].toUpperCase() + words.slice(1) : "Account updated", detail: "An action was completed on this account." };
  }
  function actionIcon(action) {
    const a = String(action || "").toLowerCase();
    if (/password|recovery|key/.test(a)) return ["key-01", ""];
    if (/mfa|totp|otp|two.step|finger/.test(a)) return ["finger-print-scan", "good"];
    if (/login|logout|session|auth/.test(a)) return ["lock", "good"];
    if (/ticket|support|message/.test(a)) return ["message-01", "info"];
    if (/provision|deploy|service|server/.test(a)) return ["rocket-01", "violet"];
    if (/invoice|billing|payment|subscription|order/.test(a)) return ["invoice-01", "warn"];
    return ["shield-01", ""];
  }
  function dayLabel(ts) {
    const d = new Date(ts);
    const now = /* @__PURE__ */ new Date();
    const todayStr = now.toDateString();
    const dStr = d.toDateString();
    if (dStr === todayStr) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (dStr === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  function renderEventRow(item) {
    const [icon, tone] = actionIcon(item.action);
    const friendly = friendlyAction(item);
    const time = item.created_at ? new Date(item.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
    const actor2 = item.actor_name || (item.actor_type === "SYSTEM" ? "Fortless" : "You");
    const context = resourceContext(item);
    const contextHtml = context ? ` \xB7 ${context.href ? `<a class="lk" href="${esc(context.href)}" data-app-route>${esc(context.label)}</a>` : `<span>${esc(context.label)}</span>`}` : "";
    const meta = metadata(item);
    const codePayload = {
      action: item.action,
      actor: actor2,
      actor_id: item.actor_user_id || item.actor_type,
      ip_address: item.ip_address || "\u2014",
      correlation_id: item.correlation_id || "\u2014",
      resource_type: item.resource_type || null,
      resource_id: item.resource_id || null,
      timestamp: item.created_at,
      ...meta
    };
    return `<div class="z-aur" data-event-id="${esc(item.id || "")}">
    <button type="button" class="z-aut" aria-expanded="false">
      <span class="tile ${tone} sm"><svg class="ic s" aria-hidden="true"><use href="/assets/petal-icons.svg#i-${icon}"/></svg></span>
      <span class="tx">
        <b>${esc(friendly.title)}</b>
        <small>${esc(friendly.detail)}${contextHtml} \xB7 ${esc(actor2)}</small>
      </span>
      <span class="t">${esc(time)}</span>
      <svg class="ic s chv" aria-hidden="true"><use href="/assets/petal-icons.svg#i-arrow-right-01"/></svg>
    </button>
    <div class="z-aud">
      <code class="code">${esc(JSON.stringify(codePayload, null, 2))}</code>
    </div>
  </div>`;
  }
  var auditLogs = [];
  var auditPage = 1;
  var auditPageSize = 10;
  var listenersBound = false;
  async function renderActivity() {
    const host = document.getElementById("auditList");
    if (!host) return;
    host.innerHTML = renderSkeleton("list", "Loading audit events");
    try {
      const { logs } = await api("/api/v1/audit");
      auditLogs = logs || [];
      auditPage = 1;
      filterActivity();
      bindActivityListeners();
    } catch (error) {
      host.innerHTML = `<div class="alert bad"><div><b>Failed to load activity</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
  function filterActivity() {
    const host = document.getElementById("auditList");
    if (!host) return;
    const searchInput = document.getElementById("auditSearch");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const type = document.querySelector('input[name="auditType"]:checked')?.value || "ALL";
    const range = document.querySelector('input[name="auditRange"]:checked')?.value || "ALL";
    const now = Date.now();
    const maxAgeMs = range === "1" ? 24 * 3600 * 1e3 : range === "7" ? 7 * 24 * 3600 * 1e3 : range === "30" ? 30 * 24 * 3600 * 1e3 : Infinity;
    const logs = auditLogs.filter((item) => {
      if (maxAgeMs !== Infinity && item.created_at) {
        const age = now - new Date(item.created_at).getTime();
        if (age > maxAgeMs) return false;
      }
      const action = String(item.action || "").toUpperCase();
      const matchesType = type === "ALL" || (type === "AUTH" ? /LOGIN|LOGOUT|SESSION|PASSWORD|MFA|EMAIL|OIDC|PASSKEY|STEP_UP/.test(action) : type === "SUPPORT" ? /TICKET|SUPPORT/.test(action) : /BILL|INVOICE|PAYMENT|SUBSCRIPTION|ORDER|QUOTE/.test(action));
      if (!matchesType) return false;
      const friendly = friendlyAction(item);
      const context = resourceContext(item);
      return !query || [item.actor_name, item.actor_type, item.action, item.resource_type, item.resource_id, item.correlation_id, item.service_name, item.service_plan, item.ticket_subject, context?.label, friendly.title, friendly.detail].some(
        (value) => String(value || "").toLowerCase().includes(query)
      );
    });
    const count = document.getElementById("auditResultCount");
    if (count) count.textContent = `${logs.length} of ${auditLogs.length} events`;
    const infoEl = document.getElementById("auditPageInfo");
    const pagerEl = document.getElementById("auditPager");
    if (!logs.length) {
      host.innerHTML = renderEmptyState({
        icon: "history",
        title: "No recent activity",
        message: auditLogs.length ? "No events matched your search or filters." : "Events appear as you use the account."
      });
      if (infoEl) infoEl.textContent = "0 events";
      if (pagerEl) pagerEl.innerHTML = "";
      return;
    }
    const pagination = paginateItems(logs, auditPage, auditPageSize);
    auditPage = pagination.page;
    if (infoEl) infoEl.textContent = pagination.info;
    if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);
    const groups = /* @__PURE__ */ new Map();
    for (const item of pagination.items) {
      const label = item.created_at ? dayLabel(item.created_at) : "Unknown";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    }
    host.innerHTML = Array.from(groups.entries()).map(([day, items]) => `<div class="dh" style="font-size:12px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:0.04em;padding:10px 4px 6px">${esc(day)}</div>${items.map(renderEventRow).join("")}`).join("");
  }
  function bindActivityListeners() {
    if (listenersBound) return;
    listenersBound = true;
    const section = document.getElementById("section-audit");
    if (!section) return;
    section.addEventListener("click", (e) => {
      const target = e.target;
      const toggleBtn = target.closest(".z-aut");
      if (toggleBtn) {
        const row = toggleBtn.closest(".z-aur");
        if (row) {
          row.classList.toggle("open");
          toggleBtn.setAttribute("aria-expanded", String(row.classList.contains("open")));
        }
        return;
      }
      const pageBtn = target.closest("#auditPager button[data-pg]");
      if (pageBtn && !pageBtn.disabled) {
        const newPage = Number(pageBtn.dataset.pg);
        if (newPage && newPage !== auditPage) {
          auditPage = newPage;
          filterActivity();
          const card = section.querySelector(".card");
          if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        return;
      }
      if (target.closest("#refreshAuditBtn")) {
        void renderActivity();
      }
    });
    const search = document.getElementById("auditSearch");
    if (search) {
      search.addEventListener("input", () => {
        auditPage = 1;
        filterActivity();
      });
    }
    section.addEventListener("change", (e) => {
      const target = e.target;
      if (target.name === "auditType" || target.name === "auditRange") {
        auditPage = 1;
        filterActivity();
      }
    });
  }

  // src/frontend/client/pages/settings/index.ts
  var mfaEnrollmentState = null;
  async function renderSettings(tab) {
    const tabsEl = document.getElementById("settingsTabs");
    if (tabsEl) {
      initTabs(tabsEl);
      bindTabUrls({
        tabs: tabsEl,
        base: "/app/settings",
        initial: tab,
        fallbackKey: "s",
        slugs: { p: "profile", s: "security", t: "team", n: "notifications", d: "sessions" },
        keyOf: (b) => b.getAttribute("aria-controls")?.split("-")[1],
        select: (key) => tabsEl.querySelector(`[aria-controls="settings-${key}"]`)?.click()
      });
    }
    bindEditProfile();
    await Promise.all([loadMfa(), loadPasskeys(), loadSessions(), loadTeamMembers(), loadEmailStatus(), loadNotificationPreferences()]);
  }
  async function loadNotificationPreferences() {
    const host = document.getElementById("notificationPreferences");
    if (!host) return;
    try {
      const { preferences } = await api("/api/v1/notification-preferences");
      const item = (key, title, description, icon, tone) => `
      <div class="li" style="padding:14px 16px">
        <span class="tile ${tone} sm">${hero(icon, "s")}</span>
        <span class="tx"><b>${title}</b><small>${description}</small></span>
        <button class="sw" type="button" role="switch" data-email-pref="${key}" aria-label="${title}" aria-checked="${preferences[key]}"></button>
      </div>`;
      host.innerHTML = item("billingEmail", "Billing updates", "Invoices, receipts, renewals and scheduled cancellations", "invoice-01", "warn") + item("serviceEmail", "Service updates", "Provisioning completed and service-ready messages", "server", "good") + item("supportEmail", "Support replies", "New staff replies in your support conversations", "message-01", "info");
      if (!host.dataset["bound"]) {
        host.dataset["bound"] = "1";
        host.addEventListener("click", async (event) => {
          const button = event.target.closest("[data-email-pref]");
          if (!button) return;
          const next = button.getAttribute("aria-checked") !== "true";
          const body = {
            billingEmail: host.querySelector('[data-email-pref="billingEmail"]')?.getAttribute("aria-checked") === "true",
            serviceEmail: host.querySelector('[data-email-pref="serviceEmail"]')?.getAttribute("aria-checked") === "true",
            supportEmail: host.querySelector('[data-email-pref="supportEmail"]')?.getAttribute("aria-checked") === "true"
          };
          body[button.dataset["emailPref"]] = next;
          button.disabled = true;
          try {
            const result = await api("/api/v1/notification-preferences", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            });
            Object.entries(result.preferences).forEach(([key, enabled]) => host.querySelector(`[data-email-pref="${key}"]`)?.setAttribute("aria-checked", String(enabled)));
            toast("Notification preferences saved.", "good");
          } catch (error) {
            toast(error?.message || "Could not save notification preferences.", "bad");
          } finally {
            button.disabled = false;
          }
        });
      }
    } catch (error) {
      host.innerHTML = `<div class="alert bad"><div><b>Failed to load notification preferences</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
  function bufferToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = "";
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function base64urlToBuffer(base64url) {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - base64.length % 4);
    const binary = atob(base64 + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  async function loadPasskeys() {
    const host = document.getElementById("passkeyList");
    if (!host) return;
    try {
      const { passkeys } = await api("/api/v1/auth/passkeys");
      if (!passkeys || !passkeys.length) {
        host.innerHTML = `
        <div class="li" style="padding:14px 16px">
          <span class="tx"><b class="muted">No passkeys registered yet</b><small>Add Touch ID, Face ID, Windows Hello or a security key.</small></span>
        </div>
      `;
        return;
      }
      host.innerHTML = passkeys.map(
        (pk) => `
        <div class="li" style="padding:11px 14px">
          <span class="tile sm">${hero("fingerprint", "s")}</span>
          <span class="tx">
            <b>${esc(pk.deviceLabel || "Security Key")}</b>
            <small>Added ${formatDate(pk.createdAt)}${pk.lastUsedAt ? ` \xB7 Last used ${formatDate(pk.lastUsedAt)}` : ""}</small>
          </span>
          <button class="btn xs bad" type="button" data-remove-passkey="${esc(pk.id)}">Remove</button>
        </div>
      `
      ).join("");
    } catch (error) {
      host.innerHTML = `<div class="alert bad"><div><b>Failed to load passkeys</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
  async function registerPasskey() {
    if (!window.PublicKeyCredential) {
      toast("Passkeys (WebAuthn) are not supported by this browser.", "bad");
      return;
    }
    const btn = document.getElementById("addPasskeyBtn");
    if (btn) btn.disabled = true;
    try {
      const options = await api("/api/v1/auth/passkeys/register-options", { method: "POST" });
      const ua = navigator.userAgent;
      const defaultLabel = /Macintosh/.test(ua) ? "MacBook Touch ID" : /iPhone|iPad/.test(ua) ? "Apple Device" : /Windows/.test(ua) ? "Windows Hello" : /Android/.test(ua) ? "Android Biometrics" : "Security Key";
      const challengeBuf = base64urlToBuffer(options.challenge);
      const userIdBuf = new TextEncoder().encode(options.user.id);
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challengeBuf.buffer,
          rp: options.rp,
          user: {
            id: userIdBuf.buffer,
            name: options.user.name,
            displayName: options.user.displayName
          },
          pubKeyCredParams: options.pubKeyCredParams,
          timeout: options.timeout,
          authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "preferred"
          },
          attestation: "none"
        }
      });
      if (!credential) throw new Error("Passkey creation returned empty.");
      const clientDataJSON = bufferToBase64url(credential.response.clientDataJSON);
      const attestationObject = bufferToBase64url(credential.response.attestationObject);
      const rawId = bufferToBase64url(credential.rawId);
      await api("/api/v1/auth/passkeys/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceLabel: defaultLabel,
          challenge: options.challenge,
          clientDataJSON,
          credentialId: rawId,
          publicKey: attestationObject
        })
      });
      toast("Passkey registered successfully.", "good");
      await loadPasskeys();
    } catch (err) {
      if (err.name === "NotAllowedError") {
        toast("Passkey registration cancelled.", "warn");
      } else {
        toast(err.message || "Passkey registration failed.", "bad");
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  async function handleRemovePasskey(id) {
    if (!confirm("Are you sure you want to remove this passkey?")) return;
    try {
      await api(`/api/v1/auth/passkeys/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast("Passkey removed.", "good");
      await loadPasskeys();
    } catch (err) {
      toast(err.message || "Failed to remove passkey.", "bad");
    }
  }
  function describeDevice(userAgent) {
    const ua = String(userAgent || "Unknown client");
    const browser = ua.includes("Edg/") ? "Microsoft Edge" : ua.includes("Firefox/") ? "Firefox" : ua.includes("Chrome/") ? "Chrome" : ua.includes("Safari/") ? "Safari" : "Browser";
    const androidModel = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|\))/)?.[1]?.trim();
    const system = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : ua.includes("Android") ? androidModel ? `Android \xB7 ${androidModel}` : "Android" : ua.includes("Windows") ? "Windows" : ua.includes("Mac OS") ? "macOS" : ua.includes("Linux") ? "Linux" : "Unknown OS";
    return `${browser} \xB7 ${system}`;
  }
  function describeAddress(address) {
    return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(String(address)) ? "Local proxy \xB7 legacy session" : String(address || "IP unavailable");
  }
  async function loadSessions() {
    const host = document.getElementById("sessionList");
    if (!host) return;
    host.innerHTML = renderSkeleton("list", "Loading active devices");
    try {
      const { sessions } = await api("/api/v1/auth/sessions");
      const otherCount = sessions.filter((session) => !session.isCurrent).length;
      const revokeOthers = document.getElementById("revokeOtherSessionsBtn");
      if (revokeOthers) {
        revokeOthers.disabled = otherCount === 0;
        revokeOthers.textContent = otherCount === 0 ? "No other devices" : "Sign out all other devices";
      }
      host.innerHTML = sessions.map(
        (session) => `<div class="li" style="padding:14px 16px">
          <span class="tile ${session.isCurrent ? "good" : ""} sm"><svg class="ic" aria-hidden="true"><use href="#i-laptop"/></svg></span>
          <span class="tx">
            <b>${esc(describeDevice(session.userAgent))}${session.isCurrent ? ' <span class="pill good">This device</span>' : ""}</b>
            <small>${esc(describeAddress(session.ipAddress))} \xB7 last active ${esc(formatDate(session.lastActiveAt))}</small>
          </span>
          ${session.isCurrent ? "" : `<button class="btn xs bad" type="button" data-revoke-session="${esc(session.id)}">Sign out</button>`}
        </div>`
      ).join("");
    } catch (error) {
      host.innerHTML = `<div class="alert bad"><div><b>Failed to load sessions</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
  var currentMfaStatus = null;
  var lastRecoveryCodes = [];
  async function loadMfa() {
    const switchEl = document.getElementById("mfaToggleSwitch");
    const countEl = document.getElementById("mfaRecoveryCount");
    const regenBtn = document.getElementById("regenerateMfaCodesBtn");
    const alertEl = document.getElementById("mfaDisablingAlert");
    try {
      const status = await api("/api/v1/auth/mfa");
      currentMfaStatus = status;
      if (switchEl) switchEl.setAttribute("aria-checked", status.enabled ? "true" : "false");
      if (regenBtn) regenBtn.disabled = !status.enabled;
      if (alertEl) alertEl.hidden = !status.enabled;
      if (countEl) {
        const codeWord = status.recoveryCodesRemaining === 1 ? "code" : "codes";
        countEl.textContent = status.enabled ? `${status.recoveryCodesRemaining} recovery ${codeWord} remaining` : "Disabled";
      }
    } catch (error) {
      if (countEl) countEl.textContent = "Failed to load MFA status";
    }
  }
  async function handleRegenerateRecoveryCodes() {
    const btn = document.getElementById("regenerateMfaCodesBtn");
    if (!confirm("Regenerating recovery codes will invalidate all your existing recovery codes. Continue?")) return;
    if (btn) btn.disabled = true;
    try {
      const { recoveryCodes } = await api("/api/v1/auth/mfa/recovery-codes/regenerate", {
        method: "POST"
      });
      lastRecoveryCodes = recoveryCodes;
      const grid = document.getElementById("recoveryCodesGrid");
      if (grid) {
        grid.innerHTML = recoveryCodes.map((c) => `<code style="text-align:center;padding:10px;font-size:13px">${esc(c)}</code>`).join("");
      }
      const recModal = document.getElementById("mfaRecoveryCodesModal");
      if (recModal) recModal.hidden = false;
      toast("Recovery codes regenerated successfully.", "good");
      await loadMfa();
    } catch (err) {
      toast(err.message || "Failed to regenerate recovery codes.", "bad");
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  function openMfaSetupModal() {
    const modal = document.getElementById("mfaSetupModal");
    if (!modal) return;
    modal.hidden = false;
    const passwordStep = document.getElementById("mfaSetupPasswordStep");
    const enrollStep = document.getElementById("mfaSetupEnrollStep");
    const passwordInput = document.getElementById("mfaConfirmPasswordInput");
    const pwError = document.getElementById("mfaPasswordError");
    const setupError = document.getElementById("mfaSetupError");
    if (pwError) pwError.hidden = true;
    if (setupError) setupError.hidden = true;
    if (passwordInput) passwordInput.value = "";
    if (passwordStep) passwordStep.hidden = false;
    if (enrollStep) enrollStep.hidden = true;
    passwordInput?.focus();
  }
  function closeMfaSetupModal() {
    const modal = document.getElementById("mfaSetupModal");
    if (modal) modal.hidden = true;
  }
  async function handleMfaPasswordSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const password = document.getElementById("mfaConfirmPasswordInput")?.value || "";
    const errorEl = document.getElementById("mfaPasswordError");
    const submitBtn = document.getElementById("submitMfaPasswordBtn");
    if (!password) {
      if (errorEl) {
        errorEl.textContent = "Enter your current password.";
        errorEl.hidden = false;
      }
      return;
    }
    if (submitBtn) submitBtn.disabled = true;
    try {
      const result = await api("/api/v1/auth/mfa/totp/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      form.reset();
      mfaEnrollmentState = result;
      const passwordStep = document.getElementById("mfaSetupPasswordStep");
      const enrollStep = document.getElementById("mfaSetupEnrollStep");
      if (passwordStep) passwordStep.hidden = true;
      if (enrollStep) enrollStep.hidden = false;
      const qrContainer = document.getElementById("mfaQr");
      if (qrContainer && window.PetalQR) {
        try {
          const qr = window.PetalQR.make(result.uri);
          let qHtml = "";
          for (let r = 0; r < qr.size; r++) {
            const row = qr.m[r];
            for (let c = 0; c < qr.size; c++) {
              qHtml += `<i class="${row && row[c] ? "" : "o"}"></i>`;
            }
          }
          qrContainer.style.gridTemplateColumns = `repeat(${qr.size}, 1fr)`;
          qrContainer.innerHTML = qHtml;
        } catch {
          qrContainer.innerHTML = window.PetalQR.svg(result.uri);
        }
      }
      const secretEl = document.getElementById("mfaSecret");
      if (secretEl) {
        secretEl.textContent = result.secret.replace(/(.{4})/g, "$1 ").trim();
      }
      const copyBtn = document.getElementById("copyMfaSecretBtn");
      if (copyBtn) {
        copyBtn.setAttribute("data-copy-secret", result.secret);
      }
      const otpInputs = document.querySelectorAll("#mfaOtpContainer input");
      otpInputs.forEach((inp) => inp.value = "");
      otpInputs[0]?.focus();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || "Password confirmation failed.";
        errorEl.hidden = false;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }
  async function verifyMfaSetup() {
    const inputs = document.querySelectorAll("#mfaOtpContainer input");
    const code = Array.from(inputs).map((i) => i.value.trim()).join("");
    const errorEl = document.getElementById("mfaSetupError");
    const verifyBtn = document.getElementById("verifyMfaBtn");
    if (code.length !== 6) {
      if (errorEl) {
        errorEl.textContent = "Enter all 6 digits from your authenticator app.";
        errorEl.hidden = false;
      }
      document.getElementById("mfaOtpContainer")?.classList.add("bad");
      return;
    }
    if (verifyBtn) verifyBtn.disabled = true;
    try {
      const result = await api("/api/v1/auth/mfa/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      closeMfaSetupModal();
      lastRecoveryCodes = result.recoveryCodes || [];
      const recGrid = document.getElementById("recoveryCodesGrid");
      if (recGrid) {
        recGrid.innerHTML = lastRecoveryCodes.map((c) => `<code style="text-align:center;padding:10px;font-size:13px">${esc(c)}</code>`).join("");
      }
      const recModal = document.getElementById("mfaRecoveryCodesModal");
      if (recModal) recModal.hidden = false;
      toast("Two-step verification is now enabled.", "good");
      await loadMfa();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || "Invalid verification code.";
        errorEl.hidden = false;
      }
      document.getElementById("mfaOtpContainer")?.classList.add("bad");
    } finally {
      if (verifyBtn) verifyBtn.disabled = false;
    }
  }
  function openMfaDisableModal() {
    const modal = document.getElementById("mfaDisableModal");
    if (!modal) return;
    modal.hidden = false;
    const pw = document.getElementById("disableMfaPassword");
    const cd = document.getElementById("disableMfaCode");
    const err = document.getElementById("disableMfaError");
    if (pw) pw.value = "";
    if (cd) cd.value = "";
    if (err) err.hidden = true;
    pw?.focus();
  }
  function closeMfaDisableModal() {
    const modal = document.getElementById("mfaDisableModal");
    if (modal) modal.hidden = true;
    const switchEl = document.getElementById("mfaToggleSwitch");
    if (switchEl && currentMfaStatus) switchEl.setAttribute("aria-checked", currentMfaStatus.enabled ? "true" : "false");
  }
  async function handleDisableMfaSubmit(event) {
    event.preventDefault();
    const password = document.getElementById("disableMfaPassword")?.value || "";
    const code = document.getElementById("disableMfaCode")?.value.trim() || "";
    const errorEl = document.getElementById("disableMfaError");
    const btn = document.getElementById("confirmDisableMfaBtn");
    if (!password || !code) {
      if (errorEl) {
        errorEl.textContent = "Password and code are required.";
        errorEl.hidden = false;
      }
      return;
    }
    if (btn) btn.disabled = true;
    try {
      await api("/api/v1/auth/mfa/totp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, code })
      });
      closeMfaDisableModal();
      toast("Two-step verification was disabled.", "good");
      await loadMfa();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || "Failed to disable two-step verification.";
        errorEl.hidden = false;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  function copyLastRecoveryCodes() {
    if (!lastRecoveryCodes.length) {
      toast("No recovery codes to copy.", "warn");
      return;
    }
    const text = lastRecoveryCodes.join("\n");
    navigator.clipboard?.writeText(text).then(() => toast("Recovery codes copied to clipboard.", "good")).catch(() => toast("Failed to copy codes.", "warn"));
  }
  async function revokeDevice(sessionId, button) {
    button.disabled = true;
    try {
      await api(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      toast("Device signed out.", "good");
      await loadSessions();
    } catch (error) {
      button.disabled = false;
      toast(error.message, "bad");
    }
  }
  async function revokeOtherSessions() {
    const button = document.getElementById("revokeOtherSessionsBtn");
    if (button) button.disabled = true;
    try {
      const result = await api("/api/v1/auth/sessions/revoke-others", { method: "POST" });
      toast(`${result.revokedCount} other ${result.revokedCount === 1 ? "device was" : "devices were"} signed out.`, "good");
      await loadSessions();
    } catch (error) {
      if (button) button.disabled = false;
      toast(error.message, "bad");
    }
  }
  async function loadTeamMembers() {
    const host = document.getElementById("teamMemberList");
    if (!host) return;
    host.innerHTML = renderSkeleton("table", "Loading team members");
    try {
      const data = await api("/api/v1/account/members");
      if (!data.members || !data.members.length) {
        host.innerHTML = `<div class="alert"><div><span>No team members found.</span></div></div>`;
        return;
      }
      host.innerHTML = `
      <div style="overflow-x:auto;margin-top:8px">
        <table class="tbl rsp">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Joined</th>
              <th class="r">Action</th>
            </tr>
          </thead>
          <tbody>
            ${data.members.map(
        (m) => `
              <tr class="mobile-record">
                <td data-label="Member"><b>${esc(m.name)}</b><br><small class="muted">${esc(m.email)}</small></td>
                <td data-label="Role"><span class="pill ${m.role === "OWNER" ? "acc" : "info"}">${esc(m.role)}</span></td>
                <td data-label="Joined" class="muted">${formatDate(m.createdAt)}</td>
                <td data-label="Action" class="r">
                  ${m.isOwner ? '<span class="pill good">Owner</span>' : `<button class="btn xs sec" style="color:var(--bad)" type="button" data-revoke-member="${esc(m.id)}">Remove</button>`}
                </td>
              </tr>
            `
      ).join("")}
          </tbody>
        </table>
      </div>
    `;
    } catch (error) {
      host.innerHTML = `<div class="alert bad"><div><b>Failed to load team</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
  async function loadEmailStatus() {
    const host = document.getElementById("emailDeliveryStatus");
    if (!host) return;
    try {
      const status = await api(
        "/api/v1/email/status"
      );
      const modePills = {
        disabled: '<span class="pill warn">DISABLED</span>',
        sandbox: '<span class="pill info">SANDBOX</span>',
        live: '<span class="pill good">LIVE</span>'
      };
      host.innerHTML = `
      <div class="li"><span class="tile sm">${hero("paper", "s")}</span><span class="tx"><b>Transport mode</b><small>Current transactional email provider state</small></span>${modePills[status.mode] || `<span class="pill">${esc(status.mode)}</span>`}</div>
      <div class="li"><span class="tile sm">${hero("document", "s")}</span><span class="tx"><b>Outbox queue</b><small>${status.pendingCount} pending \xB7 ${status.sentCount} sent \xB7 ${status.failedCount} failed</small></span></div>
    `;
    } catch (error) {
      host.innerHTML = `<div class="alert bad"><div><b>Failed to load email status</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
  function bindEditProfile() {
    const btn = document.getElementById("editProfileBtn");
    if (!btn || btn.dataset["bound"]) return;
    btn.dataset["bound"] = "1";
    btn.addEventListener("click", async () => {
      try {
        const me = await api("/api/v1/auth/me");
        const owner = me.membership.role === "OWNER";
        const v = await formDialog({
          title: "Edit profile",
          confirmLabel: "Save",
          message: owner ? void 0 : "Only the workspace owner can rename the workspace.",
          fields: [
            { key: "name", label: "Your name", value: me.user.name },
            ...owner ? [{ key: "workspaceName", label: "Workspace name", value: me.account.name }] : []
          ]
        });
        if (!v) return;
        const body = { name: String(v["name"]) };
        if (owner) body["workspaceName"] = String(v["workspaceName"]);
        const res = await api("/api/v1/account/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const set = (id, text) => {
          const el2 = document.getElementById(id);
          if (el2) el2.textContent = text;
        };
        set("profName", res.user.name);
        set("profWorkspace", res.account.name);
        set("userName", res.user.name);
        const initials = res.user.name.slice(0, 2).toUpperCase();
        set("userAvatar", initials);
        set("topUserAvatar", initials);
        toast("Profile updated", "good");
      } catch (e) {
        toast(e?.message || "Could not update the profile.", "bad");
      }
    });
  }

  // src/frontend/client/index.ts
  var appShell = new AppShell();
  async function copyText(value, label = "value") {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const fallback = document.createElement("textarea");
        fallback.value = value;
        fallback.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        document.body.appendChild(fallback);
        fallback.select();
        if (!document.execCommand("copy")) throw new Error("Copy unavailable");
        fallback.remove();
      }
      toast(`${label.charAt(0).toUpperCase()}${label.slice(1)} copied.`, "good");
    } catch {
      toast("Could not copy automatically.", "warn");
    }
  }
  function updateNavigationChrome(routeName) {
    const titles = {
      dashboard: ["Dashboard", "Workspace, infrastructure, billing and support at a glance."],
      services: ["Servers & Instances", "Actual service records and provider-observed runtime state for this account."],
      "service-detail": ["Service Detail", "Detailed configuration, provider allocation, and operational logs."],
      deploy: ["Configure a service", "Catalog preview; ordering remains disabled until payment and infrastructure providers are verified."],
      domains: ["Domains & DNS", "Authoritative domain zones, registrar search, and RFC compliant DNS records."],
      billing: ["Billing", "Draft and issued documents recorded for this account."],
      tickets: ["Support", "Open and review account-scoped support conversations."],
      "ticket-new": ["Open support ticket", "Start an account-scoped support conversation."],
      "ticket-detail": ["Support conversation", "Review the full thread and send a secure reply."],
      audit: ["Activity", "Account-scoped audit events recorded by the current implementation."],
      settings: ["Account & security", "Identity, tenant and implementation status."]
    };
    const titleEntry = titles[routeName] ?? titles.dashboard;
    const viewTitle = document.getElementById("viewTitle");
    const viewSubtitle = document.getElementById("viewSubtitle");
    if (viewTitle) viewTitle.textContent = titleEntry[0];
    if (viewSubtitle) viewSubtitle.textContent = titleEntry[1];
    document.querySelectorAll(".sd .nv").forEach((link) => {
      const route = link.dataset.appRoute;
      const isMatch = route === routeName || routeName === "service-detail" && route === "services" || routeName.startsWith("ticket") && route === "tickets";
      link.classList.toggle("on", isMatch);
      if (isMatch) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.querySelectorAll(".tabbar a, .tabbar button").forEach((item) => {
      const route = item.dataset.appRoute;
      const isMatch = route === routeName || routeName === "service-detail" && route === "services" || routeName.startsWith("ticket") && route === "tickets";
      item.classList.toggle("on", isMatch);
    });
    const sectionKeys = ["dashboard", "services", "service-detail", "deploy", "domains", "billing", "tickets", "ticket-new", "ticket-detail", "audit", "settings"];
    sectionKeys.forEach((key) => {
      const section = document.getElementById(`section-${key}`);
      if (section) section.style.display = key === routeName ? "block" : "none";
    });
    const mn = document.getElementById("mn");
    if (mn) mn.scrollTop = 0;
    window.scrollTo(0, 0);
  }
  var router = new Router(CLIENT_ROUTES);
  apiClient.setNavigationSignal(() => router.getSignal());
  router.register("dashboard", async () => {
    updateNavigationChrome("dashboard");
    await renderHome();
  });
  router.register("services", async () => {
    updateNavigationChrome("services");
    await renderServices();
  });
  router.register("service-detail", async (ctx) => {
    updateNavigationChrome("service-detail");
    const id = ctx.params.id;
    if (id) await renderServiceDetail(id, ctx.params.tab);
  });
  router.register("deploy", async () => {
    updateNavigationChrome("deploy");
    await renderDeploy();
  });
  router.register("domains", async () => {
    updateNavigationChrome("domains");
    await renderDomains();
  });
  router.register("billing", async () => {
    updateNavigationChrome("billing");
    await renderBilling();
  });
  router.register("tickets", async () => {
    updateNavigationChrome("tickets");
    await renderTickets();
  });
  router.register("ticket-new", async () => {
    updateNavigationChrome("ticket-new");
    renderNewTicket();
  });
  router.register("ticket-detail", async (ctx) => {
    updateNavigationChrome("ticket-detail");
    if (ctx.params.id) await renderTicketDetail(ctx.params.id);
  });
  router.register("audit", async () => {
    updateNavigationChrome("audit");
    await renderActivity();
  });
  router.register("settings", async (ctx) => {
    updateNavigationChrome("settings");
    await renderSettings(ctx.params.tab);
  });
  function bindDelegatedEvents() {
    document.getElementById("refreshInvoicesBtn")?.addEventListener("click", renderBilling);
    document.getElementById("refreshAuditBtn")?.addEventListener("click", renderActivity);
    document.getElementById("doDeployBtn")?.addEventListener("click", beginCheckout);
    document.getElementById("revokeOtherSessionsBtn")?.addEventListener("click", revokeOtherSessions);
    document.getElementById("themeToggleBtn")?.addEventListener("click", () => appShell.toggleTheme());
    const doLogout = async () => {
      try {
        await api("/api/v1/auth/logout", { method: "POST" });
      } finally {
        window.location.href = "/login";
      }
    };
    document.getElementById("logoutBtn")?.addEventListener("click", doLogout);
    document.getElementById("mobileLogoutBtn")?.addEventListener("click", doLogout);
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target.closest("#mobileLogoutBtn")) {
        doLogout();
        return;
      }
      if (target.closest("#mobileThemeBtn")) {
        appShell.toggleTheme();
        return;
      }
      if (target.closest("#mobileMoreBtn")) {
        const sheet = document.getElementById("mobileNavSheet");
        const trigger = document.getElementById("mobileMoreBtn");
        if (sheet) {
          const isOpen = !sheet.hidden;
          sheet.hidden = isOpen;
          trigger?.setAttribute("aria-expanded", isOpen ? "false" : "true");
        }
        return;
      }
      if (target.closest("[data-close-mobile-nav]") || target.id === "mobileNavSheet" || target.closest(".tabbar a") && document.getElementById("mobileNavSheet")?.hidden === false) {
        const sheet = document.getElementById("mobileNavSheet");
        if (sheet) sheet.hidden = true;
        document.getElementById("mobileMoreBtn")?.setAttribute("aria-expanded", "false");
        if (!target.closest(".tabbar a")) {
          return;
        }
      }
      if (target.matches("#cmd .ov, #cmd [data-close], [data-close]")) {
        appShell.cmd.close();
        const notifM = document.getElementById("notifModal");
        if (notifM) notifM.hidden = true;
        const navS = document.getElementById("mobileNavSheet");
        if (navS) navS.hidden = true;
        return;
      }
      if (target.closest('[data-modal="cmd"], #quickSearchBtn, .sch, .srch, #globalSearchTrigger, #mobileSearchTrigger, [data-cmd]')) {
        appShell.cmd.open();
        return;
      }
      const segBtn = target.closest(".seg button");
      if (segBtn) {
        const segGroup = segBtn.closest(".seg");
        if (segGroup) {
          segGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === segBtn)));
          const val = segBtn.dataset.v;
          const radio = segBtn.parentElement?.querySelector('input[type="radio"]') || segGroup.querySelector(`input[value="${val}"]`);
          if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event("change", { bubbles: true }));
          }
          if (segGroup.getAttribute("aria-label")?.includes("service state")) filterServices();
          if (segGroup.getAttribute("aria-label")?.includes("invoice status")) filterBilling();
          if (segGroup.getAttribute("aria-label")?.includes("ticket status")) filterTickets();
          if (segGroup.getAttribute("aria-label")?.includes("activity")) filterActivity();
        }
        return;
      }
      const detailTab = target.closest("#serviceDetailTabs button");
      if (detailTab) {
        document.querySelectorAll("#serviceDetailTabs button").forEach((b) => {
          const isSel = b === detailTab;
          b.setAttribute("aria-selected", String(isSel));
          b.tabIndex = isSel ? 0 : -1;
        });
        const controls = detailTab.getAttribute("aria-controls");
        ["dtlPaneOverview", "dtlPaneAllocation", "dtlPaneActivity"].forEach((pId) => {
          const panel2 = document.getElementById(pId);
          if (panel2) {
            const isMatch = pId === controls;
            panel2.hidden = !isMatch;
            panel2.classList.toggle("on", isMatch);
          }
        });
        return;
      }
      const settingsTab = target.closest("#settingsTabs button");
      if (settingsTab) {
        document.querySelectorAll("#settingsTabs button").forEach((b) => {
          const isSel = b === settingsTab;
          b.setAttribute("aria-selected", String(isSel));
          b.tabIndex = isSel ? 0 : -1;
        });
        const controls = settingsTab.getAttribute("aria-controls");
        ["settings-p", "settings-s", "settings-t", "settings-n", "settings-d"].forEach((pId) => {
          const panel2 = document.getElementById(pId);
          if (panel2) {
            const isMatch = pId === controls;
            panel2.hidden = !isMatch;
            panel2.classList.toggle("on", isMatch);
          }
        });
        return;
      }
      const routeLink = target.closest("[data-app-route]");
      if (routeLink && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const href = routeLink.getAttribute("href") || "/app";
        const sheet = document.getElementById("mobileNavSheet");
        if (sheet) sheet.hidden = true;
        document.getElementById("mobileMoreBtn")?.setAttribute("aria-expanded", "false");
        router.navigate(href);
        return;
      }
      const notifBell = target.closest('[data-modal="notif"], #notifBellBtn');
      if (notifBell) {
        const modal = document.getElementById("notifModal");
        if (modal) {
          modal.hidden = false;
          appShell.loadNotifications();
        }
        return;
      }
      if (target.matches("#notifModal .ov, [data-close-notif]")) {
        const modal = document.getElementById("notifModal");
        if (modal) modal.hidden = true;
        return;
      }
      const moreBtn = target.closest('[data-modal="more"], #mobileMoreBtn');
      if (moreBtn) {
        const sheet = document.getElementById("mobileNavSheet");
        if (sheet) {
          sheet.hidden = !sheet.hidden;
          moreBtn.setAttribute("aria-expanded", String(!sheet.hidden));
        }
        return;
      }
      if (target.matches("#mobileNavSheet .ov, [data-close-mobile-nav]")) {
        const sheet = document.getElementById("mobileNavSheet");
        if (sheet) sheet.hidden = true;
        document.getElementById("mobileMoreBtn")?.setAttribute("aria-expanded", "false");
        return;
      }
      const markAllNotifs = target.closest("#markAllNotifsReadBtn");
      if (markAllNotifs) {
        api("/api/v1/notifications/read-all", { method: "POST" }).then(() => appShell.loadNotifications());
        return;
      }
      const cancelSub = target.closest("[data-cancel-sub]");
      if (cancelSub) {
        openCancelSubModal(
          cancelSub.dataset.cancelSub,
          cancelSub.dataset.subName,
          cancelSub.dataset.renewalDate,
          cancelSub.dataset.subStatus || "ACTIVE"
        );
        return;
      }
      const reactivateSub = target.closest("[data-reactivate-sub]");
      if (reactivateSub) {
        executeReactivateSub(reactivateSub.dataset.reactivateSub);
        return;
      }
      if (target.closest("#reactivateSubModalBtn")) {
        executeReactivateSub();
        return;
      }
      if (target.closest("#confirmCancelSubBtn")) {
        executeScheduledCancel();
        return;
      }
      if (target.closest("[data-close-cancel-sub], #cancelSubModal .ov")) {
        closeCancelSubModal();
        return;
      }
      const power = target.closest("[data-power]");
      if (power) {
        powerService(power.dataset.service, power.dataset.power, power);
        return;
      }
      const plan = target.closest("[data-plan-id]");
      if (plan) {
        deployState.selectedPlanId = plan.dataset.planId;
        document.querySelectorAll("[data-plan-id]").forEach((item) => item.setAttribute("aria-pressed", String(item === plan)));
        updateSummary();
        return;
      }
      const region = target.closest("[data-region-id]");
      if (region && !region.disabled) {
        deployState.selectedRegionId = region.dataset.regionId;
        document.querySelectorAll("[data-region-id]").forEach((item) => item.setAttribute("aria-pressed", String(item === region)));
        updateSummary();
        return;
      }
      const applyCoupon = target.closest("#applyCouponBtn");
      if (applyCoupon) {
        const input = document.getElementById("couponInput");
        const code = input ? input.value.trim() : "";
        if (!code) {
          deployState.activeCoupon = null;
          updateSummary();
          return;
        }
        applyCoupon.disabled = true;
        applyCoupon.textContent = "\u2026";
        const selectedPlan = deployState.plans.find((item) => item.planVersionId === deployState.selectedPlanId);
        const subtotal = selectedPlan ? selectedPlan.prices[0]?.priceMinorUnits || 0 : 0;
        api("/api/v1/catalog/validate-coupon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, subtotalMinorUnits: subtotal })
        }).then((res) => {
          deployState.activeCoupon = { code: res.coupon.code, discountMinorUnits: res.discountMinorUnits };
          toast(`Coupon ${res.coupon.code} applied!`, "good");
          updateSummary();
        }).catch((err) => toast(err.message, "bad")).finally(() => {
          applyCoupon.disabled = false;
          applyCoupon.textContent = "Apply";
        });
        return;
      }
      const auditRow = target.closest(".z-aut");
      if (auditRow) {
        const row = auditRow.closest(".z-aur");
        if (row) {
          const open2 = row.classList.toggle("open");
          auditRow.setAttribute("aria-expanded", String(open2));
        }
        return;
      }
      const session = target.closest("[data-revoke-session]");
      if (session) {
        revokeDevice(session.dataset.revokeSession, session);
        return;
      }
      if (target.closest("#openTicketModalBtn, #emptyOpenTicketBtn")) {
        openTicketModal();
        return;
      }
      if (target.closest("[data-close-ticket], #ticketModal .ov")) {
        closeTicketModal();
        return;
      }
      const resolveBtn = target.closest("#markTicketResolvedBtn");
      if (resolveBtn && resolveBtn.dataset.ticketId) {
        resolveTicketAction(resolveBtn.dataset.ticketId);
        return;
      }
      if (target.closest("#setupNewMfaBtn")) {
        openMfaSetupModal();
        return;
      }
      if (target.closest("#regenerateMfaCodesBtn")) {
        handleRegenerateRecoveryCodes();
        return;
      }
      if (target.closest("[data-close-mfa], #mfaSetupModal .ov")) {
        closeMfaSetupModal();
        return;
      }
      if (target.closest("#verifyMfaBtn")) {
        verifyMfaSetup();
        return;
      }
      if (target.closest("[data-close-rec], #mfaRecoveryCodesModal .ov")) {
        const recModal = document.getElementById("mfaRecoveryCodesModal");
        if (recModal) recModal.hidden = true;
        return;
      }
      if (target.closest("#copyRecoveryCodesBtn")) {
        copyLastRecoveryCodes();
        return;
      }
      if (target.closest("[data-close-disable-mfa], #mfaDisableModal .ov")) {
        closeMfaDisableModal();
        return;
      }
      const mfaSwitch = target.closest("#mfaToggleSwitch");
      if (mfaSwitch) {
        const isEnabled = mfaSwitch.getAttribute("aria-checked") === "true";
        if (isEnabled) {
          openMfaDisableModal();
        } else {
          openMfaSetupModal();
        }
        return;
      }
      const copySecret = target.closest("[data-copy-secret]");
      if (copySecret) {
        copyText(copySecret.dataset.copySecret, "setup key");
        return;
      }
      const copyRecovery = target.closest("[data-copy-recovery]");
      if (copyRecovery) {
        copyText(copyRecovery.dataset.copyRecovery, "recovery codes");
        return;
      }
      const copy2 = target.closest("[data-copy]");
      if (copy2) {
        copyText(copy2.dataset.copy || "", copy2.dataset.copyLabel || "value");
        return;
      }
      if (target.closest("#openInviteModalBtn")) {
        const m = document.getElementById("inviteMemberModal");
        if (m) m.hidden = false;
      }
      if (target.closest("[data-close-invite]")) {
        const m = document.getElementById("inviteMemberModal");
        if (m) m.hidden = true;
      }
      const revokeMember = target.closest("[data-revoke-member]");
      if (revokeMember) {
        const membershipId = revokeMember.dataset.revokeMember;
        if (confirm("Are you sure you want to remove this team member?")) {
          revokeMember.disabled = true;
          api(`/api/v1/account/members/${encodeURIComponent(membershipId)}`, { method: "DELETE" }).then(() => {
            toast("Team member removed.", "good");
            loadTeamMembers();
          }).catch((err) => {
            revokeMember.disabled = false;
            toast(err.message, "bad");
          });
        }
        return;
      }
      const addPasskeyBtn = target.closest("#addPasskeyBtn");
      if (addPasskeyBtn) {
        registerPasskey();
        return;
      }
      const removePasskey = target.closest("[data-remove-passkey]");
      if (removePasskey) {
        handleRemovePasskey(removePasskey.dataset.removePasskey);
        return;
      }
    });
    document.addEventListener("submit", (event) => {
      const target = event.target;
      if (target.id === "createTicketPageForm") {
        createTicket(event, (path) => router.navigate(path));
        return;
      }
      if (target.id === "newTicketModalForm") {
        submitModalTicket(event, (path) => router.navigate(path));
        return;
      }
      if (target.id === "ticketReplyForm") {
        sendReply(event);
        return;
      }
      if (target.id === "mfaPasswordConfirmForm") {
        handleMfaPasswordSubmit(event);
        return;
      }
      if (target.id === "disableMfaForm") {
        handleDisableMfaSubmit(event);
        return;
      }
      if (target.id === "inviteMemberForm") {
        event.preventDefault();
        const form = target;
        const email = document.getElementById("inviteEmail").value;
        const role = document.getElementById("inviteRole").value;
        const btn = document.getElementById("sendInviteBtn");
        btn.disabled = true;
        api("/api/v1/account/members/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role })
        }).then(() => {
          toast("Invitation sent.", "good");
          const m = document.getElementById("inviteMemberModal");
          if (m) m.hidden = true;
          form.reset();
          loadTeamMembers();
        }).catch((err) => toast(err.message, "bad")).finally(() => {
          btn.disabled = false;
        });
      }
      if (target.id === "changePasswordForm") {
        event.preventDefault();
        const form = target;
        const curPass = form.elements.namedItem("currentPassword").value;
        const newPass = form.elements.namedItem("newPassword").value;
        const btn = form.querySelector("[type=submit]");
        if (btn) btn.disabled = true;
        api("/api/v1/auth/password/change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword: curPass, newPassword: newPass })
        }).then((res) => {
          toast(res.message || "Password updated. Other sessions revoked.", "good");
          form.reset();
          loadSessions();
        }).catch((err) => toast(err.message, "bad")).finally(() => {
          if (btn) btn.disabled = false;
        });
      }
    });
    document.addEventListener("input", (event) => {
      const target = event.target;
      if (target.id === "auditSearch") {
        filterActivity();
        return;
      }
      if (target.id === "ticketSearch") {
        filterTickets();
        return;
      }
      if (target.id === "invoiceSearch") {
        filterBilling();
        return;
      }
      if (target.id === "serviceSearch") {
        filterServices();
        return;
      }
      if (target.id === "newTicketFileInput" || target.id === "ticketReplyFileInput") {
        updateFileLabel(target);
        return;
      }
      const o = target.closest("[data-otp]");
      if (o && target.tagName === "INPUT") {
        target.value = target.value.replace(/\D/g, "").slice(-1);
        if (target.value) {
          const next = target.nextElementSibling;
          if (next) next.focus();
        }
        o.classList.remove("bad");
      }
    });
    document.addEventListener("paste", (event) => {
      const target = event.target;
      const o = target.closest("[data-otp]");
      if (!o) return;
      const d = (event.clipboardData || window.clipboardData)?.getData("text").replace(/\D/g, "").slice(0, 6) || "";
      if (!d) return;
      event.preventDefault();
      const inputs = Array.from(o.querySelectorAll("input"));
      inputs.forEach((inp, idx) => {
        inp.value = d[idx] || "";
      });
      const last = inputs[Math.min(d.length, 5)];
      last?.focus();
      o.classList.remove("bad");
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const sheet = document.getElementById("mobileNavSheet");
        if (sheet && !sheet.hidden) {
          sheet.hidden = true;
          document.getElementById("mobileMoreBtn")?.setAttribute("aria-expanded", "false");
          document.getElementById("mobileMoreBtn")?.focus();
        }
        closeTicketModal();
        closeCancelSubModal();
        closeMfaSetupModal();
        closeMfaDisableModal();
        const recModal = document.getElementById("mfaRecoveryCodesModal");
        if (recModal) recModal.hidden = true;
      }
      if (event.key === "Backspace") {
        const target = event.target;
        const o = target.closest("[data-otp]");
        const inp = target;
        if (o && inp && !inp.value && inp.previousElementSibling) {
          inp.previousElementSibling.focus();
        }
      }
    });
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (target.id === "newTicketFileInput" || target.id === "ticketReplyFileInput") updateFileLabel(target);
      if (target.name === "ticketStatus") filterTickets();
      if (target.name === "invoiceStatus") filterBilling();
      if (target.name === "auditType" || target.name === "auditRange") filterActivity();
      if (target.name === "serviceState" || target.id === "serviceTypeFilter") filterServices();
    });
  }
  async function init() {
    initRadioGroups();
    appShell.init();
    installRichTextEditors(document);
    installCustomSelects(document);
    bindDelegatedEvents();
    const legacyRoute = window.location.hash.slice(1);
    if (legacyRoute) {
      const routePaths = {
        servers: "/app/services",
        deploy: "/app/deploy",
        billing: "/app/billing",
        tickets: "/app/support",
        audit: "/app/activity",
        settings: "/app/settings"
      };
      if (routePaths[legacyRoute]) {
        history.replaceState({ route: legacyRoute }, "", routePaths[legacyRoute]);
      }
    }
    try {
      await appShell.loadSession();
      await appShell.loadCapabilities();
      appShell.loadNotifications();
      router.init();
    } catch (error) {
      if (error.message !== "Session expired") {
        toast(error.message, "bad");
      }
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
