"use strict";
(() => {
  // src/frontend/core/router/router.ts
  var Router = class {
    routes = [];
    handlers = /* @__PURE__ */ new Map();
    cleanups = [];
    currentMatch = null;
    basePath;
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
            handler(this.currentMatch);
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
      subtitle: "Domain registration, TLD pricing catalog, and authoritative DNS zones."
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
      subtitle: "Account access, active device sessions, and authentication security."
    },
    "service-detail": {
      id: "service-detail",
      path: "/app/services/:id",
      title: "Service Detail \xB7 FORTLESS",
      subtitle: "Node and connection telemetry.",
      pattern: /^\/app\/services\/(?<id>[^/]+)$/
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
      const headers = { "Content-Type": "application/json", ...options?.headers || {} };
      return this.request(url, {
        ...options,
        method: "POST",
        headers,
        body: body !== void 0 ? JSON.stringify(body) : void 0
      });
    }
    patch(url, body, options) {
      const headers = { "Content-Type": "application/json", ...options?.headers || {} };
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
  var heroPaths = {
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
    home: '<path d="M2.25 12 11.2 3.05a1.13 1.13 0 0 1 1.6 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-5.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/>',
    users: '<path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.34 9.34 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.03-.265-1.998-.73-2.84M15 19.128v.106A12.3 12.3 0 0 1 8.624 21C6.33 21 4.18 20.37 2.34 19.273l-.001-.14a6.375 6.375 0 0 1 11.93-3.238M12 6.75a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/>',
    server: '<path d="M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.15-9.432a2.25 2.25 0 0 0-2.194-1.75H6.714A2.25 2.25 0 0 0 4.52 6.56l-2.15 9.432a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25m19.5 0v-.844c0-1.124-.91-2.034-2.034-2.034H4.284c-1.124 0-2.034.91-2.034 2.034v.844M6.75 17.25h.008v.008H6.75v-.008Zm3 0h.008v.008H9.75v-.008Z"/>',
    search: '<path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.197 5.197a7.5 7.5 0 0 0 10.606 10.606Z"/>',
    arrow: '<path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>'
  };
  function hero(name, size = "") {
    const path = heroPaths[name] || heroPaths.cube;
    const classes = ["ic", size, "hero-icon"].filter(Boolean).join(" ");
    return `<svg class="${classes}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
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
      this.search("");
    }
    close() {
      const modal = document.getElementById(this.modalId);
      if (modal) modal.hidden = true;
    }
    isOpen() {
      const modal = document.getElementById(this.modalId);
      return Boolean(modal && !modal.hidden);
    }
    async search(query) {
      const resBox = document.getElementById(this.resultsId);
      if (!resBox) return;
      try {
        const q = (query || "").trim();
        const res = await api(`/api/v1/search?q=${encodeURIComponent(q)}`);
        this.cmdList = [];
        const data = res.results || res;
        if (data.pages) {
          data.pages.forEach(
            (p) => this.cmdList.push({
              category: "Navigation",
              title: p.title,
              icon: "servers",
              action: () => {
                window.location.href = p.path;
              }
            })
          );
        }
        if (data.adminPages) {
          data.adminPages.forEach(
            (p) => this.cmdList.push({
              category: "Admin Control",
              title: p.title,
              icon: "shield",
              action: () => {
                window.location.href = p.path;
              }
            })
          );
        }
        if (data.services) {
          data.services.forEach(
            (s) => this.cmdList.push({
              category: "Services",
              title: s.title,
              subtitle: s.subtitle,
              icon: "servers",
              action: () => {
                window.location.href = `/app/services/${encodeURIComponent(s.id)}`;
              }
            })
          );
        }
        if (data.tickets) {
          data.tickets.forEach(
            (t) => this.cmdList.push({
              category: "Tickets",
              title: t.title,
              subtitle: t.subtitle,
              icon: "support",
              action: () => {
                const url = window.location.pathname.startsWith("/admin") ? `/admin/tickets` : `/app/support`;
                window.location.href = url;
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
              icon: "credit",
              action: () => {
                window.location.href = "/app/billing";
              }
            })
          );
        }
        if (!this.cmdList.length) {
          resBox.innerHTML = `
          <div style="padding:24px;text-align:center;color:var(--ink3);font-size:13px">
            No matching resources found for "${esc(q)}"
          </div>
        `;
          return;
        }
        this.activeIndex = 0;
        let html = "";
        let lastCat = "";
        this.cmdList.slice(0, 15).forEach((item, i) => {
          if (item.category !== lastCat) {
            html += `<div class="hd">${esc(item.category)}</div>`;
            lastCat = item.category;
          }
          html += `
          <button type="button" class="it ${i === 0 ? "act" : ""}" data-cmd-idx="${i}">
            ${hero(item.icon || "cube", "s")}
            <span style="display:flex;flex-direction:column;gap:1px;min-width:0;flex:1">
              <span style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.title)}</span>
              ${item.subtitle ? `<span style="font-size:11px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.subtitle)}</span>` : ""}
            </span>
          </button>
        `;
        });
        resBox.innerHTML = html;
      } catch {
        resBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--bad)">Search request failed.</div>';
      }
    }
    moveSelection(dir) {
      const items = document.querySelectorAll(`#${this.resultsId} .it`);
      if (!items.length) return;
      this.activeIndex = (this.activeIndex + dir + items.length) % items.length;
      items.forEach((btn, i) => {
        btn.classList.toggle("act", i === this.activeIndex);
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
        if (target.id === this.modalId) {
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
  var tool = (command, icon, label) => `<button type="button" class="btn sq s ghost" data-rcmd="${esc(command)}" aria-label="${esc(label)}" title="${esc(label)}"><svg class="ic s" aria-hidden="true"><use href="#i-${esc(icon)}"/></svg></button>`;
  function petalRichTextEditor(id, label, placeholder) {
    return `<div class="rte" data-rte="${esc(id)}">
    <div class="rtb" data-rtb role="toolbar" aria-label="${esc(label)} formatting">
      ${tool("bold", "text-bold", "Bold")}
      ${tool("italic", "text-italic", "Italic")}
      <i aria-hidden="true"></i>
      ${tool("insertUnorderedList", "left-to-right-list-bullet", "Bulleted list")}
      ${tool("formatBlock:blockquote", "quote", "Quote")}
      ${tool("formatBlock:pre", "source-code", "Code block")}
      <i aria-hidden="true"></i>
      ${tool("createLink", "link-02", "Add link")}
    </div>
    <div id="${esc(id)}" class="rta" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(label)}" data-placeholder="${esc(placeholder)}" spellcheck="true"><p><br></p></div>
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
    const editor = document.getElementById(id);
    if (!editor) return "";
    return Array.from(editor.childNodes).map(blockMarkdown).filter(Boolean).join("\n\n").trim();
  }
  function resetEditor(id) {
    const editor = document.getElementById(id);
    if (editor) editor.innerHTML = "<p><br></p>";
  }
  function installRichTextEditors(root = document) {
    const onMouseDown = (event) => {
      const button = event.target.closest("[data-rcmd]");
      if (button && root.contains(button)) event.preventDefault();
    };
    const onClick = (event) => {
      const button = event.target.closest("[data-rcmd]");
      if (!button || !root.contains(button)) return;
      const editor = button.closest("[data-rte]")?.querySelector(".rta");
      if (!editor) return;
      editor.focus();
      const command = button.dataset.rcmd || "";
      if (command === "createLink") {
        const requested = window.prompt("Paste an https:// link");
        const href = requested ? safeHref(requested.trim()) : null;
        if (href) document.execCommand("createLink", false, href);
        return;
      }
      if (command.includes(":")) {
        const [name, value] = command.split(":", 2);
        if (name) document.execCommand(name, false, value || "");
      } else {
        document.execCommand(command, false);
      }
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
      drop.innerHTML = `<div class="menu" role="listbox">${Array.from(select.options).map((option, index) => `<button type="button" role="option" data-petal-option="${index}" aria-selected="${option.selected}">${esc(option.text)}<svg class="ic s ck" aria-hidden="true"><use href="#i-tick-02"/></svg></button>`).join("")}</div>`;
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
      this.initTheme();
      this.installHeroicons();
      this.installResponsiveComposition();
      this.rewriteTruthfulCopy();
      this.cmd.bindKeyboard();
    }
    initTheme() {
      const theme = localStorage.getItem("fortless_theme");
      if (theme) document.documentElement.dataset.theme = theme;
    }
    toggleTheme() {
      const current = document.documentElement.dataset.theme;
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("fortless_theme", next);
    }
    installHeroicons() {
      const targets = [
        ["#nav-dashboard .ic, #tab-dashboard .ic", "home"],
        ["#nav-servers .ic, #tab-servers .ic", "servers"],
        ["#nav-deploy .ic, #tab-deploy .ic", "plus"],
        ["#nav-billing .ic, #tab-billing .ic", "credit"],
        ["#nav-tickets .ic, #tab-tickets .ic", "support"],
        ["#nav-audit .ic", "shield"],
        ["#nav-settings .ic, #tab-settings .ic", "settings"],
        ["#refreshServersBtn svg, #refreshInvoicesBtn svg, #refreshAuditBtn svg", "refresh"],
        [".app-top-actions > a.btn svg", "plus"],
        ["#doDeployBtn svg", "cube"]
      ];
      targets.forEach(([selector, icon]) => {
        document.querySelectorAll(selector).forEach((node) => {
          node.outerHTML = hero(icon, node.classList.contains("s") ? "s" : "");
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
      const profileCard = document.querySelector("#section-settings .card:first-child");
      if (profileCard) {
        const h2 = profileCard.querySelector("h2");
        if (h2) h2.textContent = "Account profile";
        if (!profileCard.querySelector(".settings-actions")) {
          profileCard.insertAdjacentHTML(
            "beforeend",
            `<div class="settings-actions"><a class="btn sec s" href="/app/activity" data-app-route="audit">${hero(
              "shield",
              "s"
            )}View account activity</a></div>`
          );
        }
      }
      const securityCard = document.querySelector("#section-settings .card:nth-child(2)");
      if (securityCard && !securityCard.classList.contains("configured")) {
        securityCard.classList.add("configured");
        securityCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero("shield")}</span>
          <div class="tx">
            <h2>Account protection</h2>
            <p>Security controls currently protecting this account.</p>
          </div>
        </div>
        <div class="col" style="gap:6px">
          <div class="li card s2">
            <span class="ico-b good">${hero("check")}</span>
            <span class="tx"><b>Verified identity</b><span>Email ownership is confirmed before dashboard access.</span></span>
          </div>
          <div class="li card s2">
            <span class="ico-b good">${hero("check")}</span>
            <span class="tx"><b>Protected sessions</b><span>Opaque session tokens are hashed at rest and browser mutations require CSRF validation.</span></span>
          </div>
        </div>
      `;
      }
      const settingsGrid = document.querySelector("#section-settings .grid");
      if (settingsGrid && !settingsGrid.querySelector(".mfa-card")) {
        const mfaCard = document.createElement("div");
        mfaCard.className = "card mfa-card";
        mfaCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero("shield")}</span>
          <div class="tx"><h2>Two-step verification</h2><p>Protect sign-in with a standards-based authenticator app.</p></div>
        </div>
        <div id="mfaControl" class="mfa-control">
          <div class="state-message">${hero("refresh")}<span>Loading two-step verification\u2026</span></div>
        </div>
      `;
        settingsGrid.appendChild(mfaCard);
        const sessionsCard = document.createElement("div");
        sessionsCard.className = "card sessions-card";
        sessionsCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero("device")}</span>
          <div class="tx"><h2>Active devices</h2><p>Review every valid session and sign out devices you no longer use.</p></div>
          <div class="actions"><button id="revokeOtherSessionsBtn" class="btn sec s" type="button">Loading devices\u2026</button></div>
        </div>
        <div id="sessionList" class="z-ss">
          <div class="state-message">${hero("refresh")}<span>Loading active devices\u2026</span></div>
        </div>
      `;
        settingsGrid.appendChild(sessionsCard);
        const teamCard = document.createElement("div");
        teamCard.className = "card team-card";
        teamCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero("cube")}</span>
          <div class="tx"><h2>Workspace team</h2><p>Collaborators and administrators for this workspace.</p></div>
          <div class="actions"><button id="openInviteModalBtn" class="btn sec s" type="button">${hero(
          "plus",
          "s"
        )}Invite member</button></div>
        </div>
        <div id="teamMemberList">
          <div class="state-message">${hero("refresh")}<span>Loading team members\u2026</span></div>
        </div>
      `;
        settingsGrid.appendChild(teamCard);
        const passwordCard = document.createElement("div");
        passwordCard.className = "card password-card";
        passwordCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero("shield")}</span>
          <div class="tx"><h2>Change password</h2><p>Update your credentials. Revokes other active device sessions.</p></div>
        </div>
        <form id="changePasswordForm" class="col" style="gap:12px;margin-top:12px">
          <div class="field"><label for="curPass">Current password</label><div class="inp"><input id="curPass" name="currentPassword" type="password" required autocomplete="current-password"></div></div>
          <div class="field"><label for="newPass">New password</label><div class="inp"><input id="newPass" name="newPassword" type="password" required minlength="12" autocomplete="new-password"></div></div>
          <div class="row" style="justify-content:flex-end"><button class="btn s" type="submit">Update password</button></div>
        </form>
      `;
        settingsGrid.appendChild(passwordCard);
        const emailCard = document.createElement("div");
        emailCard.className = "card email-card";
        emailCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero("paper")}</span>
          <div class="tx"><h2>Email delivery</h2><p>Durable transactional email outbox status.</p></div>
        </div>
        <div id="emailDeliveryStatus" class="col" style="gap:8px;margin-top:8px">
          <div class="state-message">${hero("refresh")}<span>Checking delivery status\u2026</span></div>
        </div>
      `;
        settingsGrid.appendChild(emailCard);
      }
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
      if (userName) userName.textContent = label;
      if (userRole) userRole.textContent = data.membership.role;
      if (userAvatar) userAvatar.textContent = label.slice(0, 2).toUpperCase();
      if (profName) profName.textContent = data.user.name || "\u2014";
      if (profWorkspace) profWorkspace.textContent = data.account.name;
      if (profEmail) profEmail.textContent = data.user.email;
      if (profRole) profRole.innerHTML = `<span class="badge accent">${esc(data.membership.role)}</span>`;
    }
    async loadCapabilities() {
      const data = await api("/api/v1/platform/capabilities");
      capabilitiesStore.set(data);
      const ready = data.payments.enabled && data.provisioning.enabled;
      const status = document.querySelector(".app-status span:last-child");
      if (status) status.textContent = ready ? "Commerce available" : "Preview mode";
      const button = document.getElementById("doDeployBtn");
      if (button) {
        button.disabled = !ready;
        const span = button.querySelector("span");
        if (span) span.textContent = ready ? "Continue to secure checkout" : "Ordering unavailable";
      }
      const notice = document.querySelector("#doDeployBtn + p");
      if (notice) {
        notice.textContent = ready ? "You will continue to the configured hosted payment provider." : "Payment and infrastructure integrations are disabled until sandbox verification is complete.";
      }
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
            list.innerHTML = '<div class="state-message">No notifications.</div>';
          } else {
            list.innerHTML = data.notifications.map(
              (n) => `
            <div class="card s2" style="padding:10px;border-radius:12px;opacity:${n.readAt ? "0.7" : "1"}">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <b style="font-size:13px">${esc(n.title)}</b>
                <small class="faint" style="font-size:11px">${formatDate(n.createdAt)}</small>
              </div>
              <p style="font-size:12px;color:var(--ink2);margin:0 0 6px">${esc(n.message)}</p>
              ${n.linkUrl ? `<a href="${esc(n.linkUrl)}" data-app-route="${n.linkUrl.includes("services") ? "service-detail" : "dashboard"}" style="font-size:11px;color:var(--accent);font-weight:600">View details \u2192</a>` : ""}
            </div>
          `
            ).join("");
          }
        }
      } catch {
      }
    }
  };

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
  function compactId(value) {
    const text = String(value || "\u2014");
    return text.length > 22 ? `${text.slice(0, 10)}\u2026${text.slice(-6)}` : text;
  }

  // src/frontend/client/pages/home/index.ts
  async function renderHome() {
    const host = document.getElementById("dashboardOverview");
    if (!host) return;
    host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading workspace overview\u2026</span></div>`;
    const [serviceResult, ticketResult, invoiceResult, auditResult] = await Promise.allSettled([
      api("/api/v1/services"),
      api("/api/v1/tickets"),
      api("/api/v1/invoices"),
      api("/api/v1/audit")
    ]);
    const services = serviceResult.status === "fulfilled" ? serviceResult.value.services : [];
    const tickets = ticketResult.status === "fulfilled" ? ticketResult.value.tickets : [];
    const invoices = invoiceResult.status === "fulfilled" ? invoiceResult.value.invoices : [];
    const logs = auditResult.status === "fulfilled" ? auditResult.value.logs : [];
    const openTickets = tickets.filter((item) => !["RESOLVED", "CLOSED"].includes(item.status));
    const outstanding = invoices.filter((item) => ["DRAFT", "OPEN", "PENDING", "OVERDUE"].includes(item.status));
    const currency = invoices[0]?.currency || "EUR";
    const outstandingTotal = outstanding.reduce((sum, item) => sum + Number(item.total_minor_units || 0), 0);
    const failures = [serviceResult, ticketResult, invoiceResult, auditResult].filter((item) => item.status === "rejected").length;
    host.innerHTML = `${failures ? `<div class="state-message warn">${hero("warning")}<span>${failures} dashboard source${failures === 1 ? "" : "s"} could not be loaded. Available records are shown below.</span></div>` : ""}
    <div class="dashboard-welcome"><div><span class="badge accent s">Workspace overview</span><h2>Your workspace, at a glance.</h2><p>Services, billing, support and security activity from your account.</p></div><div class="row wrap"><a class="btn sec s" href="/app/support/new" data-app-route="ticket-new">${hero("support", "s")}Open ticket</a><a class="btn s" href="/app/deploy" data-app-route="deploy">${hero("plus", "s")}Deploy service</a></div></div>
    <div class="grid g4 keep2 dashboard-metrics">
      ${metric("Active services", services.filter((item) => item.contract_status === "ACTIVE").length, "servers", "good")}
      ${metric("Total services", services.length, "cube", "accent")}
      ${metric("Open tickets", openTickets.length, "support", openTickets.length ? "warn" : "good")}
      ${metric("Outstanding", money(outstandingTotal, currency), "credit", outstandingTotal ? "warn" : "good")}
    </div>
    ${!services.length ? `<div class="card dashboard-onboarding">${renderEmptyState({ icon: "servers", title: "Start with your first service", message: "Browse the real catalog. Checkout remains unavailable until payment and provider verification pass.", actionHtml: `<a class="btn s tint" href="/app/deploy" data-app-route="deploy">${hero("plus", "s")}View catalog</a>` })}</div>` : ""}
    <div class="dashboard-columns">
      ${panel("My services", "Provider-observed contract and runtime state.", "/app/services", "View all services", services.slice(0, 4).map((item) => `<a class="li card s2" href="/app/services/${esc(item.id)}" data-app-route="service-detail"><span class="ico-b ${item.runtime_state === "RUNNING" ? "good" : "info"}">${hero("servers")}</span><span class="tx"><b>${esc(item.plan_name || "Hosting service")}</b><span>${esc(item.node_name || item.node_id || "No node assigned")}</span></span><span class="badge s">${esc(item.contract_status)}</span>${hero("chevron", "s")}</a>`).join("") || emptyLine("No services yet"))}
      ${panel("Support", "Recent account conversations.", "/app/support", "View support", tickets.slice(0, 4).map((item) => `<a class="li card s2" href="/app/support/${esc(item.id)}" data-app-route="ticket-detail"><span class="ico-b accent">${hero("support")}</span><span class="tx"><b>${esc(item.subject)}</b><span>${esc(formatDate(item.updated_at || item.created_at))}</span></span><span class="badge s">${esc(item.status)}</span></a>`).join("") || emptyLine("No support conversations"))}
      ${panel("Billing", "Latest issued account records.", "/app/billing", "View billing", invoices.slice(0, 4).map((item) => `<div class="li card s2"><span class="ico-b">${hero("document")}</span><span class="tx"><b>${esc(item.invoice_number || "Draft invoice")}</b><span>${esc(formatDate(item.created_at))}</span></span><b>${money(item.total_minor_units, item.currency)}</b><span class="badge s">${esc(item.status)}</span></div>`).join("") || emptyLine("No billing records"))}
      ${panel("Recent activity", "Security-relevant account events.", "/app/activity", "View activity", logs.slice(0, 4).map((item) => `<div class="li card s2"><span class="ico-b">${hero("shield")}</span><span class="tx"><b>${esc(String(item.action || "").replaceAll(".", " \xB7 "))}</b><span>${esc(formatDate(item.created_at))}</span></span></div>`).join("") || emptyLine("No recent activity"))}
    </div>`;
  }
  function metric(label, value, icon, tone) {
    return `<div class="card metric-card"><div><span class="metric-label">${esc(label)}</span><strong class="metric-value">${esc(String(value))}</strong></div><span class="ico-b ${tone}">${hero(icon)}</span></div>`;
  }
  function emptyLine(text) {
    return `<div class="state-message"><span>${esc(text)}</span></div>`;
  }
  function panel(title, description, href, action, body) {
    return `<section class="card dashboard-panel"><div class="section-card-head"><div class="tx"><h3>${esc(title)}</h3><p>${esc(description)}</p></div><a class="btn sec xs" href="${href}" data-app-route>${esc(action)}</a></div><div class="col" style="gap:7px">${body}</div></section>`;
  }

  // src/frontend/client/pages/dashboard/index.ts
  var serviceInventory = [];
  function renderServiceInventory() {
    const host = document.getElementById("serversContainer");
    if (!host) return;
    const query = document.getElementById("serviceSearch")?.value.trim().toLowerCase() || "";
    const type = document.getElementById("serviceTypeFilter")?.value || "ALL";
    const state = document.querySelector('input[name="serviceState"]:checked')?.value || "ALL";
    const filtered = serviceInventory.filter((service) => {
      const runtime = service.runtime_state || "UNKNOWN";
      const matchesQuery = !query || [service.plan_name, service.identifier, service.id, service.node_name].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesType = type === "ALL" || service.plan_name === type;
      const matchesState = state === "ALL" || (state === "RUNNING" ? runtime === "RUNNING" : runtime !== "RUNNING");
      return matchesQuery && matchesType && matchesState;
    });
    const count = document.getElementById("serviceResultCount");
    if (count) count.textContent = `${filtered.length} of ${serviceInventory.length} services`;
    if (!filtered.length) {
      host.innerHTML = renderEmptyState({ icon: "search", title: serviceInventory.length ? "No matching services" : "No services yet", message: serviceInventory.length ? "Try a different name, product or runtime filter." : "Ordering stays unavailable until payment and infrastructure providers are configured and verified.", actionHtml: serviceInventory.length ? "" : `<a class="btn s tint" href="/app/deploy" data-app-route="deploy">${hero("plus", "s")}View catalog</a>` });
      return;
    }
    const providerReady = Boolean(capabilitiesStore.get()?.provisioning.enabled);
    host.innerHTML = `<div class="col" style="gap:8px">${filtered.map((service) => {
      const runtime = service.runtime_state || "UNKNOWN";
      const runningNow = runtime === "RUNNING";
      const badge = runningNow ? "good" : runtime === "INSTALLING" ? "warn" : runtime === "ERROR" ? "bad" : "info";
      const endpoint = service.identifier ? `Provider ID \xB7 ${service.identifier}` : "Provisioning record";
      return `<article class="li card s2 service-row">
      <span class="ico-b ${badge}">${hero("servers")}</span><div class="tx"><div class="title-row"><b>${esc(service.plan_name || "Hosting service")}</b><span class="badge ${badge} s">${esc(runtime)}</span><span class="badge s">${esc(service.contract_status)}</span></div><div class="meta">${esc(service.node_name || service.node_id)} \xB7 ${Number(service.memory_limit_mb || 0) / 1024} GB RAM \xB7 ${esc(service.cpu_limit_pct || 0)}% CPU \xB7 ${Number(service.disk_limit_mb || 0) / 1024} GB disk</div></div>
      <code class="endpoint">${esc(endpoint)}</code><div class="actions">${providerReady ? `<button class="btn s sec" data-power="RESTART" data-service="${esc(service.id)}" ${runningNow ? "" : "disabled"}>${hero("refresh", "xs")}Restart</button><button class="btn s badt" data-power="STOP" data-service="${esc(service.id)}" ${runningNow ? "" : "disabled"}>${hero("stop", "xs")}Stop</button><button class="btn s goodt" data-power="START" data-service="${esc(service.id)}" ${runningNow ? "disabled" : ""}>${hero("play", "xs")}Start</button>` : `<span class="badge warn s">Provider controls unavailable</span>`}<a href="/app/services/${esc(service.id)}" class="btn s tint" data-app-route="service-detail">${hero("chevron", "xs")}Manage</a></div>
    </article>`;
    }).join("")}</div>`;
  }
  function filterServices() {
    renderServiceInventory();
  }
  async function renderServices() {
    const host = document.getElementById("serversContainer");
    if (!host) return;
    host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading services\u2026</span></div>`;
    try {
      const { services } = await api("/api/v1/services");
      serviceInventory = services;
      const running = services.filter((s) => s.runtime_state === "RUNNING").length;
      const memory = services.reduce((sum, s) => sum + Number(s.memory_limit_mb || 0), 0);
      const cpu = services.reduce((sum, s) => sum + Number(s.cpu_limit_pct || 0), 0);
      const statRunning = document.getElementById("statRunning");
      const statTotal = document.getElementById("statTotal");
      const statRam = document.getElementById("statRam");
      const statCpu = document.getElementById("statCpu");
      if (statRunning) statRunning.textContent = String(running);
      if (statTotal) statTotal.textContent = String(services.length);
      if (statRam) statRam.textContent = `${(memory / 1024).toFixed(memory ? 1 : 0)} GB`;
      if (statCpu) statCpu.textContent = `${cpu}%`;
      const typeFilter = document.getElementById("serviceTypeFilter");
      if (typeFilter) typeFilter.innerHTML = `<option value="ALL">All products</option>${Array.from(new Set(services.map((item) => String(item.plan_name || "Hosting service")))).sort().map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("")}`;
      renderServiceInventory();
    } catch (error) {
      host.innerHTML = `<div class="state-message bad">${hero("warning")}<span>${esc(error.message)}</span></div>`;
    }
  }
  async function powerService(id, action, button) {
    button.disabled = true;
    try {
      const data = await api(`/api/v1/services/${encodeURIComponent(id)}/power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      toast(`Runtime state: ${data.runtimeState}`, "good");
      await renderServices();
    } catch (error) {
      toast(error.message, "bad");
      button.disabled = false;
    }
  }

  // src/frontend/client/pages/services/index.ts
  async function renderServiceDetail(serviceId) {
    if (!serviceId) return;
    try {
      const { service } = await api(`/api/v1/services/${encodeURIComponent(serviceId)}`);
      const breadcrumb = document.getElementById("detailBreadcrumbName");
      const heading = document.getElementById("detailHeadingName");
      const subtitle = document.getElementById("detailSubtitle");
      if (breadcrumb) breadcrumb.textContent = service.planName || service.id;
      if (heading) heading.textContent = service.planName || "Service Detail";
      if (subtitle)
        subtitle.textContent = `${service.nodeName} (${service.regionName}) \xB7 ${service.identifier ? "Provider ID " + service.identifier : "Provisioning"}`;
      const runtimeBadge = document.getElementById("detailRuntimeBadge");
      const contractBadge = document.getElementById("detailContractBadge");
      const runtime = service.observedState?.runtimeState || "UNKNOWN";
      if (runtimeBadge) {
        runtimeBadge.textContent = runtime;
        runtimeBadge.className = `badge s ${runtime === "RUNNING" ? "good" : runtime === "INSTALLING" ? "warn" : runtime === "ERROR" ? "bad" : "info"}`;
      }
      if (contractBadge) {
        contractBadge.textContent = service.contractStatus;
        contractBadge.className = `badge s ${service.contractStatus === "ACTIVE" ? "good" : "warn"}`;
      }
      const runningNow = runtime === "RUNNING";
      const providerReady = Boolean(capabilitiesStore.get()?.provisioning.enabled);
      const powerActions = document.getElementById("detailPowerActions");
      if (powerActions && !providerReady) {
        powerActions.innerHTML = '<span class="badge warn">Provider controls unavailable</span>';
      }
      const restartBtn = document.getElementById("detailRestartBtn");
      const stopBtn = document.getElementById("detailStopBtn");
      const startBtn = document.getElementById("detailStartBtn");
      if (restartBtn && providerReady) {
        restartBtn.disabled = !runningNow;
        restartBtn.onclick = () => powerService(service.id, "RESTART", restartBtn);
      }
      if (stopBtn && providerReady) {
        stopBtn.disabled = !runningNow;
        stopBtn.onclick = () => powerService(service.id, "STOP", stopBtn);
      }
      if (startBtn && providerReady) {
        startBtn.disabled = runningNow;
        startBtn.onclick = () => powerService(service.id, "START", startBtn);
      }
      const specsList = document.getElementById("detailSpecsList");
      if (specsList) {
        specsList.innerHTML = `
        <div class="row"><span class="muted" style="width:140px">Service ID:</span><code class="mono">${esc(service.id)}</code></div>
        <div class="row"><span class="muted" style="width:140px">Allocated RAM:</span><b>${Number(service.desiredConfig?.memoryLimitMb || 0) / 1024} GB</b></div>
        <div class="row"><span class="muted" style="width:140px">CPU Limit:</span><b>${esc(service.desiredConfig?.cpuLimitPct || 0)}%</b></div>
        <div class="row"><span class="muted" style="width:140px">Allocated Disk:</span><b>${Number(service.desiredConfig?.diskLimitMb || 0) / 1024} GB SSD</b></div>
        <div class="row"><span class="muted" style="width:140px">Provider Type:</span><span class="badge s">${esc(service.providerType)}</span></div>
      `;
      }
      const connList = document.getElementById("detailConnectionList");
      if (connList) {
        connList.innerHTML = `
        <div class="row"><span class="muted" style="width:140px">Node Hostname:</span><code class="mono">${esc(service.nodeFqdn)}</code></div>
        <div class="row"><span class="muted" style="width:140px">Datacenter:</span><b>${esc(service.regionName)} (${esc(service.regionCode)})</b></div>
        <div class="row"><span class="muted" style="width:140px">Remote ID:</span><code class="mono">${esc(service.externalId || "Pending")}</code></div>
        <div class="row"><span class="muted" style="width:140px">Short Identifier:</span><code class="mono">${esc(service.identifier || "Pending")}</code></div>
        <div class="row"><span class="muted" style="width:140px">Created At:</span><span>${formatDate(service.createdAt)}</span></div>
      `;
      }
      const ramMb = Number(service.desiredConfig?.memoryLimitMb || 0);
      const cpuPct = Number(service.desiredConfig?.cpuLimitPct || 0);
      const diskMb = Number(service.desiredConfig?.diskLimitMb || 0);
      const gaugeRamVal = document.getElementById("gaugeRamValue");
      const gaugeCpuVal = document.getElementById("gaugeCpuValue");
      const gaugeDiskVal = document.getElementById("gaugeDiskValue");
      if (gaugeRamVal) gaugeRamVal.textContent = `${(ramMb / 1024).toFixed(1)} GB`;
      if (gaugeCpuVal) gaugeCpuVal.textContent = `${cpuPct}%`;
      if (gaugeDiskVal) gaugeDiskVal.textContent = `${(diskMb / 1024).toFixed(0)} GB`;
      const timeline = document.getElementById("detailAuditTimeline");
      if (timeline) {
        if (!service.auditTrail || !service.auditTrail.length) {
          timeline.innerHTML = '<div class="state-message">No recorded activity yet for this service.</div>';
        } else {
          timeline.innerHTML = service.auditTrail.map(
            (ev) => `
          <div class="row" style="padding:10px 0;border-bottom:1px solid var(--s2)">
            <span class="badge s ${ev.action.includes("power") ? "info" : "accent"}">${esc(ev.action)}</span>
            <span class="faint" style="font-size:12px">${formatDate(ev.createdAt)}</span>
            <span class="muted" style="font-size:12px">${esc(ev.metadata || "")}</span>
          </div>
        `
          ).join("");
        }
      }
    } catch (error) {
      toast(error.message, "bad");
    }
  }

  // src/frontend/client/pages/deploy/index.ts
  var deployState = {
    plans: [],
    regions: [],
    selectedPlanId: null,
    selectedRegionId: "reg_fra_1",
    activeCoupon: null
  };
  var deployStep = 0;
  function showDeployStep(nextStep) {
    deployStep = Math.max(0, Math.min(2, nextStep));
    document.querySelectorAll("[data-deploy-pane]").forEach((pane) => {
      pane.classList.toggle("on", Number(pane.dataset.deployPane) === deployStep);
    });
    document.querySelectorAll("[data-deploy-step-indicator]").forEach((indicator) => {
      const index = Number(indicator.dataset.deployStepIndicator);
      indicator.className = `step${index < deployStep ? " done" : index === deployStep ? " cur" : ""}`;
      const marker = indicator.querySelector("i");
      if (marker) marker.textContent = index < deployStep ? "\u2713" : String(index + 1);
    });
    const back = document.getElementById("deployBackBtn");
    const next = document.getElementById("deployNextBtn");
    if (back) back.disabled = deployStep === 0;
    if (next) next.textContent = deployStep === 2 ? "Review order" : "Continue";
  }
  function bindDeployWizard() {
    const wizard = document.getElementById("deployWizard");
    if (!wizard || wizard.dataset.bound === "true") {
      showDeployStep(deployStep);
      return;
    }
    wizard.dataset.bound = "true";
    document.getElementById("deployBackBtn")?.addEventListener("click", () => showDeployStep(deployStep - 1));
    document.getElementById("deployNextBtn")?.addEventListener("click", () => {
      if (deployStep === 0 && !deployState.selectedPlanId) return toast("Select a plan first.", "warn");
      if (deployStep === 1 && !deployState.selectedRegionId) return toast("Select an available region.", "warn");
      if (deployStep < 2) return showDeployStep(deployStep + 1);
      const name = document.getElementById("deployServerName")?.value.trim();
      if (!name || name.length < 3) return toast("Enter a service label with at least 3 characters.", "warn");
      document.querySelector(".summary-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    showDeployStep(deployStep);
  }
  async function renderDeploy() {
    bindDeployWizard();
    if (deployState.plans.length && deployState.regions.length) {
      return renderCatalog();
    }
    const host = document.getElementById("planSelector");
    if (host) {
      host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading catalog\u2026</span></div>`;
    }
    try {
      const [plansRes, regionsRes] = await Promise.all([
        api("/api/v1/catalog/plans"),
        api("/api/v1/catalog/regions")
      ]);
      deployState.plans = plansRes.plans || [];
      deployState.regions = regionsRes.regions || [];
      if (!deployState.selectedPlanId && deployState.plans[0]) {
        deployState.selectedPlanId = deployState.plans[0].planVersionId;
      }
      if (!deployState.selectedRegionId && deployState.regions[0]) {
        deployState.selectedRegionId = deployState.regions[0].id;
      }
      renderCatalog();
    } catch (error) {
      if (host) {
        host.innerHTML = `<div class="state-message bad">${hero("warning")}<span>${esc(error.message)}</span></div>`;
      }
    }
  }
  function renderCatalog() {
    const host = document.getElementById("planSelector");
    if (host) {
      host.className = "z-pls";
      host.innerHTML = deployState.plans.map((plan) => {
        const price = plan.prices[0];
        const selected = plan.planVersionId === deployState.selectedPlanId;
        return `
            <button type="button" class="z-plc" data-plan-id="${esc(plan.planVersionId)}" aria-pressed="${selected}">
              <span class="badge ${plan.categorySlug === "game-servers" ? "accent" : "violet"} s">${esc(plan.categoryName)}</span>
              <b>${esc(plan.planName)}</b>
              <span class="p">${price ? money(price.priceMinorUnits, price.currency) : "Unavailable"} <small>/${esc((price?.interval || "").toLowerCase())}</small></span>
              <small class="f">${esc(plan.productName)} \xB7 ${plan.resources.memoryMb / 1024} GB RAM \xB7 ${plan.resources.cpuPct}% CPU \xB7 ${plan.resources.diskMb / 1024} GB disk</small>
            </button>
          `;
      }).join("") || `<div class="state-message warn">${hero("warning")}<span>No published plans are available.</span></div>`;
    }
    const regHost = document.getElementById("regionSelector");
    if (regHost && deployState.regions.length) {
      regHost.innerHTML = deployState.regions.map((reg) => {
        const flag = reg.country === "DE" ? "\u{1F1E9}\u{1F1EA}" : reg.country === "GB" ? "\u{1F1EC}\u{1F1E7}" : "\u{1F310}";
        const selected = reg.id === deployState.selectedRegionId;
        const statusText = reg.isSoldOut ? "Sold out in this region" : `${Math.floor(reg.memoryAvailableMb / 1024)} GB RAM available`;
        const badge = reg.isSoldOut ? '<span class="badge red s" style="margin-left:auto">Sold Out</span>' : '<span class="badge green s" style="margin-left:auto">Available</span>';
        return `
          <button type="button" class="z-plc reg-card region-choice" data-region-id="${esc(reg.id)}" aria-pressed="${selected}" ${reg.isSoldOut ? 'disabled style="opacity:0.6"' : ""}>
            <div style="display:flex;align-items:center;width:100%">
              <b>${flag} ${esc(reg.name)} (${esc(reg.code)})</b>${badge}
            </div>
            <small class="f">${esc(statusText)}</small>
          </button>
        `;
      }).join("");
    }
    updateSummary();
  }
  function updateSummary() {
    const plan = deployState.plans.find((item) => item.planVersionId === deployState.selectedPlanId);
    if (!plan) return;
    const price = plan.prices[0];
    const subtotal = price?.priceMinorUnits || 0;
    const discount = deployState.activeCoupon ? deployState.activeCoupon.discountMinorUnits : 0;
    const estimatedSubtotal = Math.max(0, subtotal - discount);
    const sumPlan = document.getElementById("sumPlan");
    const sumReg = document.getElementById("sumReg");
    const sumVat = document.getElementById("sumVat");
    const sumTotal = document.getElementById("sumTotal");
    if (sumPlan) sumPlan.textContent = plan.planName;
    const selReg = deployState.regions.find((r) => r.id === deployState.selectedRegionId);
    if (sumReg) sumReg.textContent = selReg ? `${selReg.name} (${selReg.code})` : "Frankfurt (catalog)";
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
    if (sumVat) sumVat.textContent = "Calculated by secure quote";
    if (sumTotal) sumTotal.textContent = money(estimatedSubtotal, price?.currency || "EUR");
  }
  async function beginCheckout() {
    const button = document.getElementById("doDeployBtn");
    const capabilities = capabilitiesStore.get();
    if (!capabilities?.payments?.enabled || !capabilities?.provisioning?.enabled) {
      return toast("Ordering is unavailable until payment and infrastructure providers are verified.", "warn");
    }
    if (!deployState.selectedPlanId) return toast("Select a plan first.", "warn");
    const nameInput = document.getElementById("deployServerName");
    const name = nameInput?.value.trim() || "fortless-instance";
    if (button) {
      button.disabled = true;
      const span = button.querySelector("span");
      if (span) span.textContent = "Preparing checkout\u2026";
    }
    try {
      const quote = await api("/api/v1/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ planVersionId: deployState.selectedPlanId, quantity: 1, regionId: deployState.selectedRegionId }],
          billingCountry: "DE",
          isB2B: false,
          couponCode: deployState.activeCoupon?.code || void 0
        })
      });
      const checkout = await api("/api/v1/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          quoteId: quote.id,
          regionId: deployState.selectedRegionId,
          customOptions: { serverName: name }
        })
      });
      window.location.href = checkout.checkoutUrl;
    } catch (error) {
      toast(error.message, "bad");
    } finally {
      if (button) {
        button.disabled = false;
        const span = button.querySelector("span");
        if (span) span.textContent = "Continue to secure checkout";
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
    host.innerHTML = '<div class="state-message">Loading domain zones\u2026</div>';
    try {
      const { zones } = await api("/api/v1/domains/zones");
      if (!zones.length) {
        host.innerHTML = renderEmptyState({
          icon: "document",
          title: "No domain zones active",
          message: "Search and register a domain above or delegate DNS to Fortless authoritative nameservers."
        });
        return;
      }
      host.innerHTML = `
      <div class="z-scroll"><table class="tbl">
        <thead>
          <tr>
            <th>Domain Name</th>
            <th>Status</th>
            <th>Nameservers</th>
            <th>Auto-Renew</th>
            <th>Expires</th>
            <th class="r">DNS Records</th>
          </tr>
        </thead>
        <tbody>
          ${zones.map((z) => {
        const ns = JSON.parse(z.nameservers || "[]");
        return `
              <tr class="mobile-record" data-zone-search="${esc(`${z.domain_name} ${z.status} ${ns.join(" ")}`.toLowerCase())}">
                <td data-label="Domain">
                  <div class="row" style="gap:8px">
                    <svg class="ic s" style="color:var(--accent)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    <b>${esc(z.domain_name)}</b>
                  </div>
                </td>
                <td data-label="Status"><span class="badge good s">${esc(z.status)}</span></td>
                <td data-label="Nameservers" class="muted mono" style="font-size:12px">${esc(ns.join(", "))}</td>
                <td data-label="Auto-Renew">${z.auto_renew ? '<span class="badge s accent">Active</span>' : '<span class="badge s">Disabled</span>'}</td>
                <td data-label="Expires" class="muted">${esc(formatDate(z.expires_at))}</td>
                <td data-label="DNS Records" class="r">
                  <button type="button" class="btn sec s manage-dns-btn" data-zone-id="${esc(z.id)}" data-domain="${esc(z.domain_name)}">
                    Manage DNS
                  </button>
                </td>
              </tr>
            `;
      }).join("")}
        </tbody>
      </table></div>
    `;
      filterZones();
      host.querySelectorAll(".manage-dns-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const zid = btn.dataset.zoneId;
          const dom = btn.dataset.domain;
          if (zid && dom) openDnsEditor(zid, dom);
        });
      });
    } catch (err) {
      host.innerHTML = `<div class="state-message" style="color:var(--bad)">Failed to load domains: ${esc(err.message)}</div>`;
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
    host.innerHTML = '<div class="state-message">Searching availability and catalog pricing\u2026</div>';
    try {
      const res = await api(`/api/v1/domains/search?query=${encodeURIComponent(clean)}`);
      if (!res.results || !res.results.length) {
        host.innerHTML = '<div class="state-message">No matching TLDs found.</div>';
        return;
      }
      host.innerHTML = `
      <div class="z-ss domain-results">
        ${res.results.map((item) => {
        const isAvail = item.available && item.status === "AVAILABLE";
        const badgeClass = isAvail ? "good" : "bad";
        return `
            <div class="z-ssr">
              <span class="ico-b ${isAvail ? "good" : ""}"><svg class="ic"><use href="#i-globe"/></svg></span>
              <div class="tx"><b>${esc(item.domain)} <span class="badge ${badgeClass} s">${esc(item.status)}</span></b><small>Catalog result \xB7 registrar checkout is not connected</small></div>
              <div class="actions row">
                ${item.annualPriceMinorUnits !== null ? `<span class="num" style="font-weight:700">${money(item.annualPriceMinorUnits, item.currency || "EUR")} <small class="muted">/yr</small></span>` : ""}
                ${isAvail ? `<button type="button" class="btn sec s register-domain-btn" data-domain="${esc(item.domain)}">Create DNS zone</button>` : `<span class="badge s">Unavailable</span>`}
              </div>
            </div>
          `;
      }).join("")}
      </div>
    `;
      host.querySelectorAll(".register-domain-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const domain = btn.dataset.domain;
          if (!domain) return;
          btn.disabled = true;
          btn.textContent = "Registering\u2026";
          try {
            await api("/api/v1/domains/zones", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domainName: domain, autoRenew: true, whoisPrivacy: true, periodYears: 1 })
            });
            toast(`Authoritative DNS zone for "${domain}" was created. No registrar purchase was made.`, "good");
            await loadZones();
            await searchDomains(domain);
          } catch (err) {
            toast(err.message, "bad");
            btn.disabled = false;
            btn.textContent = "Create DNS zone";
          }
        });
      });
    } catch (err) {
      host.innerHTML = `<div class="state-message" style="color:var(--bad)">Search failed: ${esc(err.message)}</div>`;
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
    host.innerHTML = '<div class="state-message">Loading DNS records\u2026</div>';
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
      <table class="tbl">
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
            <th>Content / Target</th>
            <th>TTL</th>
            <th>Priority</th>
            <th class="r">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${records.map(
        (r) => `
            <tr class="mobile-record">
              <td data-label="Type"><span class="badge accent s">${esc(r.record_type)}</span></td>
              <td data-label="Name" class="mono"><b>${esc(r.name)}</b></td>
              <td data-label="Content" class="mono muted" style="word-break:break-all">${esc(r.content)}</td>
              <td data-label="TTL" class="num">${r.ttl}s</td>
              <td data-label="Priority" class="num">${r.priority !== null ? r.priority : "\u2014"}</td>
              <td data-label="Actions" class="r">
                <button type="button" class="btn sec xs delete-dns-btn" data-record-id="${esc(r.id)}" style="color:var(--bad)">
                  Delete
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
      host.innerHTML = `<div class="state-message" style="color:var(--bad)">Failed to load DNS records: ${esc(err.message)}</div>`;
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
  function invoiceRow(invoice) {
    const badgeClass = invoice.status === "PAID" ? "good" : invoice.status === "DRAFT" ? "" : "info";
    return `<tr class="mobile-record">
    <td data-label="Invoice"><b>${esc(invoice.invoice_number || "Draft")}</b></td>
    <td data-label="Issued" class="muted">${esc(formatDate(invoice.created_at))}</td>
    <td data-label="Tax">${money(invoice.tax_minor_units, invoice.currency)}</td>
    <td data-label="Total" class="r num"><b>${money(invoice.total_minor_units, invoice.currency)}</b></td>
    <td data-label="Status"><span class="badge ${badgeClass} s">${esc(invoice.status)}</span></td>
    <td data-label="Record" class="r"><a href="/api/v1/invoices/${encodeURIComponent(invoice.id)}/download" class="btn s sec" download>${hero("document", "xs")}Receipt</a></td>
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
    host.innerHTML = records.length ? records.map(invoiceRow).join("") : `<tr><td colspan="6">${renderEmptyState({ icon: "document", title: invoiceCache.length ? "No matching invoices" : "No invoices", message: invoiceCache.length ? "Try another number or status." : "Issued billing records will appear here." })}</td></tr>`;
  }
  async function renderBilling() {
    const host = document.getElementById("invoicesTableBody");
    if (!host) return;
    host.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Loading billing records\u2026</td></tr>';
    try {
      const { invoices } = await api("/api/v1/invoices");
      invoiceCache = invoices;
      const paid = invoices.filter((inv) => inv.status === "PAID").reduce((sum, inv) => sum + Number(inv.total_minor_units || 0), 0);
      const pending = invoices.filter((inv) => ["DRAFT", "OPEN", "PENDING"].includes(inv.status)).reduce((sum, inv) => sum + Number(inv.total_minor_units || 0), 0);
      const currency = invoices[0]?.currency || "EUR";
      const summary = document.getElementById("invoiceSummary");
      if (summary) {
        summary.innerHTML = `
        <div><small>Paid</small><b>${money(paid, currency)}</b></div>
        <div><small>Pending</small><b>${money(pending, currency)}</b></div>
        <div><small>Invoices</small><b>${invoices.length}</b></div>
      `;
      }
      filterBilling();
      const subHost = document.getElementById("subscriptionsContainer");
      if (subHost) {
        try {
          const { subscriptions } = await api("/api/v1/subscriptions");
          if (!subscriptions.length) {
            subHost.innerHTML = '<div class="state-message">No active subscriptions.</div>';
          } else {
            subHost.innerHTML = `
            <div class="col" style="gap:8px">
              ${subscriptions.map((sub) => {
              const isCancelScheduled = sub.status === "CANCEL_SCHEDULED";
              const isCanceled = sub.status === "CANCELED" || sub.status === "TERMINATED";
              return `
                    <article class="li card s2" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px">
                      <div>
                        <b>${esc(sub.serviceName)}</b>
                        <span class="badge s ${sub.status === "ACTIVE" ? "good" : "warn"}">${esc(sub.status)}</span>
                        <div class="muted" style="font-size:12px;margin-top:4px">
                          ${money(sub.renewalPriceMinorUnits, sub.currency)} / ${esc(sub.billingInterval.toLowerCase())} \xB7 Renews ${formatDate(sub.nextRenewalDate)}
                        </div>
                      </div>
                      <div class="actions">
                        ${isCanceled ? '<span class="badge s">Cancelled</span>' : isCancelScheduled ? '<span class="badge warn s">Cancellation Scheduled</span>' : `<button type="button" class="btn badt s" data-cancel-sub="${esc(sub.id)}">Cancel subscription</button>`}
                      </div>
                    </article>
                  `;
            }).join("")}
            </div>
          `;
          }
        } catch (err) {
          subHost.innerHTML = `<div class="state-message bad">${esc(err.message)}</div>`;
        }
      }
    } catch (error) {
      host.innerHTML = `<tr><td colspan="6"><div class="state-message bad">${hero("warning")}<span>${esc(error.message)}</span></div></td></tr>`;
    }
  }
  async function cancelSubscription(subId, button) {
    if (!confirm("Cancel this subscription at the end of the current billing period?")) return;
    button.disabled = true;
    try {
      await api(`/api/v1/subscriptions/${encodeURIComponent(subId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediate: false })
      });
      toast("Subscription cancelled at period end.", "good");
      await renderBilling();
    } catch (err) {
      toast(err.message, "bad");
      button.disabled = false;
    }
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
  function priorityTone(value) {
    return value === "URGENT" ? "bad" : value === "HIGH" ? "warn" : value === "LOW" ? "" : "info";
  }
  function statusTone(value) {
    return ["OPEN", "WAITING_STAFF"].includes(value) ? "info" : value === "RESOLVED" ? "good" : "";
  }
  function ticketRow(ticket) {
    const search = `${ticket.subject} ${ticket.id} ${ticket.status} ${ticket.priority}`.toLowerCase();
    return `<a class="z-cv support-ticket-row" href="/app/support/${esc(ticket.id)}" data-app-route="ticket-detail" data-ticket-search="${esc(search)}" data-ticket-status="${esc(ticket.status)}">
    <span class="ico-b ${priorityTone(ticket.priority) || "accent"}">${hero("support")}</span>
    <span class="tx"><b>${esc(ticket.subject)}<small>${esc(formatDate(ticket.updated_at || ticket.created_at))}</small></b><span>${esc(ticket.id)} \xB7 ${Number(ticket.message_count || 0)} message${Number(ticket.message_count || 0) === 1 ? "" : "s"}</span></span>
    <span class="badge ${priorityTone(ticket.priority)} s">${esc(ticket.priority)}</span>
    <span class="badge ${statusTone(ticket.status)} s">${esc(ticket.status.replace("_", " "))}</span>
    ${hero("chevron", "s")}
  </a>`;
  }
  async function renderTickets() {
    const host = document.getElementById("ticketsList");
    if (!host) return;
    host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading support conversations\u2026</span></div>`;
    try {
      const { tickets } = await api("/api/v1/tickets");
      ticketCache = tickets;
      if (!tickets.length) {
        host.innerHTML = renderEmptyState({ icon: "support", title: "No support conversations", message: "Open a ticket when you need help with an account or service.", actionHtml: `<a class="btn s tint" href="/app/support/new" data-app-route="ticket-new">${hero("plus", "s")}Open ticket</a>` });
        return;
      }
      host.className = "z-cl support-ticket-list";
      host.innerHTML = tickets.map(ticketRow).join("");
      filterTickets();
    } catch (error) {
      host.innerHTML = `<div class="state-message bad">${hero("warning")}<span>${esc(error.message)}</span></div>`;
    }
  }
  function filterTickets() {
    const query = document.getElementById("ticketSearch")?.value.trim().toLowerCase() || "";
    const status = (document.querySelector('input[name="ticketStatus"]:checked')?.value || "ALL").toUpperCase();
    let visible = 0;
    document.querySelectorAll(".support-ticket-row").forEach((row) => {
      const rowStatus = row.dataset.ticketStatus || "";
      const matches = (!query || (row.dataset.ticketSearch || "").includes(query)) && (status === "ALL" || (status === "OPEN" ? ["OPEN", "WAITING_STAFF", "WAITING_CUSTOMER"].includes(rowStatus) : rowStatus === status));
      row.hidden = !matches;
      if (matches) visible++;
    });
    const count = document.getElementById("ticketResultCount");
    if (count) count.textContent = ticketCache.length ? `${visible} of ${ticketCache.length} conversations` : "";
  }
  function fileDrop(inputId, labelId) {
    return `<div class="field"><span class="lbl">Attachment <small class="muted">optional \xB7 max 5 MB</small></span><label class="drop support-drop" tabindex="0" role="button" for="${inputId}">${hero("document", "l")}<b>Drop a file here or browse</b><small>PNG, JPEG, GIF, WebP, PDF, text, JSON or ZIP</small><input id="${inputId}" type="file" accept="image/jpeg,image/png,image/gif,image/webp,text/plain,text/markdown,application/pdf,application/json,application/zip" hidden><span id="${labelId}" class="support-file-label"></span></label></div>`;
  }
  function renderNewTicket() {
    const host = document.getElementById("newTicketPage");
    if (!host) return;
    host.innerHTML = `<div class="support-form-layout">
    <form id="createTicketPageForm" class="card support-form" novalidate>
      <div class="section-card-head"><span class="ico-b accent">${hero("support")}</span><div class="tx"><h2>Tell us what happened</h2><p>Include the affected service, timing and current impact. Markdown is stored safely.</p></div></div>
      <div class="field"><label for="ticketSubject">Subject</label><div class="inp"><input id="ticketSubject" name="subject" required minlength="3" maxlength="160" autocomplete="off" placeholder="e.g. Instance cannot start"></div></div>
      <fieldset class="field"><legend class="lbl">Priority</legend><div class="seg block support-priority" role="radiogroup">${["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => `<label><input type="radio" name="ticketPriority" value="${value}"${value === "NORMAL" ? " checked" : ""}><span>${value[0]}${value.slice(1).toLowerCase()}</span></label>`).join("")}</div></fieldset>
      <div class="field"><span class="lbl">Detailed message</span>${petalRichTextEditor("newTicketEditor", "Detailed message", "Describe what happened, when it started, and what is affected\u2026")}</div>
      ${fileDrop("newTicketFileInput", "newTicketFileLabel")}
      <div id="ticketFormError" class="err" role="alert" hidden></div>
      <div class="support-form-actions"><a class="btn sec" href="/app/support" data-app-route="tickets">Cancel</a><button type="submit" class="btn" id="submitTicketBtn">${hero("paper", "s")}Open ticket</button></div>
    </form>
    <aside class="card support-help"><span class="ico-b info">${hero("document")}</span><h3>Useful details</h3><ul><li>Service name or identifier</li><li>When the issue started</li><li>Exact error message</li><li>Steps already attempted</li></ul><p class="truth-note">Do not include passwords, recovery codes or private keys.</p></aside>
  </div>`;
  }
  function attachmentMarkup(ticketId, attachments) {
    if (!attachments.length) return "";
    return `<div class="att-list">${attachments.map((att) => `<a href="/api/v1/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(att.id)}" download class="att-chip">${hero("document", "xs")}<span class="name">${esc(att.filename)}</span><span class="sz">${formatBytes(att.byte_size)}</span></a>`).join("")}</div>`;
  }
  async function renderTicketDetail(id) {
    const host = document.getElementById("ticketDetailPage");
    if (!host) return;
    host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading conversation\u2026</span></div>`;
    try {
      const data = await api(`/api/v1/tickets/${encodeURIComponent(id)}`);
      const closed = data.ticket.status === "CLOSED";
      host.innerHTML = `<nav class="support-breadcrumb" aria-label="Breadcrumb"><a href="/app/support" data-app-route="tickets">Support</a>${hero("chevron", "xs")}<span>${esc(data.ticket.id)}</span></nav>
      <div class="support-thread-layout">
        <article class="card support-thread">
          <header class="support-thread-head"><div class="tx"><div class="row wrap"><span class="badge ${priorityTone(data.ticket.priority)}">${esc(data.ticket.priority)}</span><span class="badge ${statusTone(data.ticket.status)}">${esc(data.ticket.status.replace("_", " "))}</span></div><h2>${esc(data.ticket.subject)}</h2><p>${esc(data.ticket.id)} \xB7 Updated ${esc(formatDate(data.ticket.updated_at || data.ticket.created_at))}</p></div></header>
          <div class="support-messages">${data.messages.map((message) => `<article class="support-message ${message.is_staff ? "staff" : "customer"}"><div class="support-message-author"><span class="av s">${esc((message.author_name || (message.is_staff ? "Support" : "You")).slice(0, 2).toUpperCase())}</span><div><b>${esc(message.is_staff ? message.author_name || "Fortless support" : message.author_name || "You")}</b><small>${message.is_staff ? "Fortless support" : "Customer"} \xB7 ${esc(formatDate(message.created_at))}</small></div></div><div class="support-message-body">${renderMarkdown(message.body)}${attachmentMarkup(id, data.attachments.filter((att) => att.message_id === message.id))}</div></article>`).join("")}</div>
          ${closed ? `<div class="state-message warn">${hero("warning")}<span>This ticket is closed. New replies are disabled.</span></div>` : `<form id="ticketReplyForm" data-ticket-id="${esc(id)}" class="support-composer"><div class="section-card-head"><div class="tx"><h3>Reply</h3><p>Your message is stored as Markdown.</p></div></div>${petalRichTextEditor("ticketReplyEditor", "Ticket reply", "Write a reply\u2026")}${fileDrop("ticketReplyFileInput", "ticketReplyFileLabel")}<div id="ticketReplyError" class="err" role="alert" hidden></div><div class="support-form-actions"><button id="sendReplyBtn" class="btn" type="submit">${hero("paper", "s")}Send reply</button></div></form>`}
        </article>
        <aside class="card support-context"><h3>Ticket details</h3><dl class="kv"><dt>Reference</dt><dd><code>${esc(data.ticket.id)}</code></dd><dt>Status</dt><dd><span class="badge ${statusTone(data.ticket.status)} s">${esc(data.ticket.status)}</span></dd><dt>Priority</dt><dd><span class="badge ${priorityTone(data.ticket.priority)} s">${esc(data.ticket.priority)}</span></dd><dt>Created</dt><dd>${esc(formatDate(data.ticket.created_at))}</dd><dt>Updated</dt><dd>${esc(formatDate(data.ticket.updated_at))}</dd></dl>${attachmentMarkup(id, data.attachments.filter((att) => !att.message_id))}</aside>
      </div>`;
    } catch (error) {
      host.innerHTML = `<div class="state-message bad">${hero("warning")}<span>${esc(error.message)}</span></div><a class="btn sec s" href="/app/support" data-app-route="tickets">Back to support</a>`;
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
    if (label) label.textContent = file ? `${file.name} \xB7 ${formatBytes(file.size)}` : "";
  }

  // src/frontend/client/pages/activity/index.ts
  var auditLogs = [];
  async function renderActivity() {
    const host = document.getElementById("auditList");
    if (!host) return;
    host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading audit events\u2026</span></div>`;
    try {
      const { logs } = await api("/api/v1/audit");
      auditLogs = logs;
      filterActivity();
    } catch (error) {
      host.innerHTML = `<div class="state-message bad">${hero("warning")}<span>${esc(error.message)}</span></div>`;
    }
  }
  function filterActivity() {
    const host = document.getElementById("auditList");
    if (!host) return;
    const searchInput = document.getElementById("auditSearch");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const type = document.querySelector('input[name="auditType"]:checked')?.value || "ALL";
    const logs = auditLogs.filter((item) => {
      const action = String(item.action || "").toUpperCase();
      const matchesType = type === "ALL" || (type === "AUTH" ? /LOGIN|LOGOUT|SESSION|PASSWORD|MFA|EMAIL/.test(action) : type === "SUPPORT" ? /TICKET|SUPPORT/.test(action) : /BILL|INVOICE|PAYMENT|SUBSCRIPTION|ORDER|QUOTE/.test(action));
      return matchesType && [item.actor_name, item.actor_type, item.action, item.resource_type, item.resource_id, item.correlation_id].some(
        (value) => String(value || "").toLowerCase().includes(query)
      );
    });
    const count = document.getElementById("auditResultCount");
    if (count) count.textContent = `${logs.length} of ${auditLogs.length} events`;
    if (!logs.length) {
      host.innerHTML = renderEmptyState({
        icon: "shield",
        title: query ? "No matching activity" : "No account activity yet",
        message: query ? "Try a different actor, action or resource." : "Security-relevant account events will appear here."
      });
      return;
    }
    host.innerHTML = logs.map(
      (item) => `
    <div class="z-aur">
      <button type="button" class="z-aut" aria-expanded="false">
        <span class="ico-b">${hero("shield")}</span>
        <span class="tx">
          <b>${esc(item.actor_name || item.actor_type)} \xB7 ${esc(item.action.replaceAll(".", " \xB7 "))}</b>
          <small>${esc(item.resource_type)} \xB7 ${esc(compactId(item.resource_id))}</small>
        </span>
        <span class="t">${esc(formatDate(item.created_at))}</span>
        <span class="chv">${hero("chevron", "s")}</span>
      </button>
      <div class="z-aud">
        <div class="code">
          Reference: ${esc(item.correlation_id || "\u2014")}<br>
          Origin: ${esc(item.ip_address || "Unavailable")}
        </div>
      </div>
    </div>
  `
    ).join("");
  }

  // src/frontend/client/pages/settings/index.ts
  var mfaEnrollmentState = null;
  async function renderSettings() {
    await Promise.all([loadMfa(), loadSessions(), loadTeamMembers(), loadEmailStatus()]);
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
    host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading active devices\u2026</span></div>`;
    try {
      const { sessions } = await api("/api/v1/auth/sessions");
      const otherCount = sessions.filter((session) => !session.isCurrent).length;
      const revokeOthers = document.getElementById("revokeOtherSessionsBtn");
      if (revokeOthers) {
        revokeOthers.disabled = otherCount === 0;
        revokeOthers.textContent = otherCount ? `Sign out ${otherCount} other ${otherCount === 1 ? "device" : "devices"}` : "No other devices";
      }
      host.innerHTML = sessions.map(
        (session) => `
      <div class="z-ssr">
        <span class="ico-b ${session.isCurrent ? "good" : ""}">${hero("device")}</span>
        <div class="tx">
          <b>${esc(describeDevice(session.userAgent))}${session.isCurrent ? '<span class="badge good s">This device</span>' : ""}</b>
          <small>
            ${esc(describeAddress(session.ipAddress))} \xB7 Last active ${esc(formatDate(session.lastActiveAt))}<br>
            Signed in ${esc(formatDate(session.createdAt))} \xB7 Expires ${esc(formatDate(session.expiresAt))}
          </small>
        </div>
        ${session.isCurrent ? "" : `<button class="btn xs badt" data-revoke-session="${esc(session.id)}">Sign out</button>`}
      </div>
    `
      ).join("");
    } catch (error) {
      host.innerHTML = `<div class="state-message bad">${hero("warning")}<span>${esc(error.message)}</span></div>`;
    }
  }
  async function loadMfa() {
    const host = document.getElementById("mfaControl");
    if (!host) return;
    host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading two-step verification\u2026</span></div>`;
    try {
      const status = await api("/api/v1/auth/mfa");
      host.innerHTML = status.enabled ? `
      <div class="mfa-state">
        <span class="badge good">Enabled</span>
        <div><b>Authenticator app</b><small>${status.recoveryCodesRemaining} recovery ${status.recoveryCodesRemaining === 1 ? "code" : "codes"} remaining</small></div>
      </div>
      <button class="btn sec s" type="button" data-mfa-disable>Disable</button>
    ` : `
      <div class="mfa-state">
        <span class="badge">Off</span>
        <div><b>Add an authenticator app</b><small>You\u2019ll use a six-digit code when signing in.</small></div>
      </div>
      <button class="btn s" type="button" data-mfa-enable>Set up</button>
    `;
    } catch (error) {
      host.innerHTML = `<div class="state-message bad">${hero("warning")}<span>${esc(error.message)}</span></div>`;
    }
  }
  function showMfaPasswordStep() {
    const host = document.getElementById("mfaControl");
    if (!host) return;
    host.innerHTML = `
    <form class="mfa-form" data-mfa-enroll-form>
      <div class="field">
        <label for="mfaPassword">Confirm your current password</label>
        <div class="inp"><input id="mfaPassword" name="password" type="password" autocomplete="current-password" required></div>
      </div>
      <div class="mfa-actions">
        <button class="btn sec s" type="button" data-mfa-cancel>Cancel</button>
        <button class="btn s" type="submit">Continue</button>
      </div>
    </form>
  `;
    host.querySelector("input")?.focus();
  }
  async function beginMfaEnrollment(form) {
    const button = form.querySelector("[type=submit]");
    if (button) button.disabled = true;
    try {
      const result = await api("/api/v1/auth/mfa/totp/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.elements.namedItem("password").value })
      });
      const host = document.getElementById("mfaControl");
      if (!host) return;
      mfaEnrollmentState = result;
      const qrSvg = window.PetalQR ? window.PetalQR.svg(result.uri) : '<div class="mono" style="padding:10px">QR Engine</div>';
      host.innerHTML = `
      <div class="z-2f">
        <div class="steps">
          <div class="step cur"><i>1</i>Scan</div>
          <div class="step"><i>2</i>Verify</div>
          <div class="step"><i>3</i>Backup</div>
        </div>
        <div class="z-pane on">
          <div class="z-qr">
            <div class="z-qrb">${qrSvg}</div>
            <div class="tx">
              <b>Scan with your authenticator app</b>
              <small class="muted">Works with Google Authenticator, 1Password, Authy and other TOTP apps.</small>
              <div class="z-sec">
                <span>${esc(result.secret.replace(/(.{4})/g, "$1 ").trim())}</span>
                <button class="btn xs sq sec" type="button" data-copy-secret="${esc(result.secret)}" aria-label="Copy setup key">
                  ${hero("copy", "xs")}
                </button>
              </div>
              <a class="btn sec s mfa-app-link" href="${esc(result.uri)}">Open authenticator app</a>
            </div>
          </div>
          <div class="row" style="justify-content:space-between">
            <button class="btn sec" type="button" data-mfa-cancel>Cancel</button>
            <button class="btn" type="button" data-mfa-next>Continue</button>
          </div>
        </div>
      </div>
    `;
    } catch (error) {
      toast(error.message, "bad");
      if (button) button.disabled = false;
    }
  }
  function showMfaCodeStep() {
    const host = document.getElementById("mfaControl");
    if (!host) return;
    host.innerHTML = `
    <div class="z-2f">
      <div class="steps">
        <div class="step"><i>1</i>Scan</div>
        <div class="step cur"><i>2</i>Verify</div>
        <div class="step"><i>3</i>Backup</div>
      </div>
      <form class="z-pane on" data-mfa-confirm-form>
        <b>Enter the six-digit code from your app</b>
        <div class="otp">
          ${[1, 2, 3, 4, 5, 6].map(
      (digit) => `<input data-mfa-digit inputmode="numeric" maxlength="1" aria-label="Digit ${digit}" autocomplete="one-time-code" required>`
    ).join("")}
        </div>
        <div class="mfa-actions">
          <button class="btn sec" type="button" data-mfa-back>Back</button>
          <button class="btn" type="submit">Verify</button>
        </div>
      </form>
    </div>
  `;
    host.querySelector("[data-mfa-digit]")?.focus();
  }
  async function confirmMfaEnrollment(form) {
    const button = form.querySelector("[type=submit]");
    if (button) button.disabled = true;
    try {
      const code = [...form.querySelectorAll("[data-mfa-digit]")].map((input) => input.value).join("");
      const result = await api("/api/v1/auth/mfa/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const host = document.getElementById("mfaControl");
      if (!host) return;
      host.innerHTML = `
      <div class="z-2f">
        <div class="steps">
          <div class="step"><i>1</i>Scan</div>
          <div class="step"><i>2</i>Verify</div>
          <div class="step cur"><i>3</i>Backup</div>
        </div>
        <div class="z-pane on">
          <div class="alert good">
            <span>${hero("check")}</span>
            <div><b>Two-step verification is on</b><p>Save these recovery codes somewhere safe. Each works once.</p></div>
          </div>
          <div class="z-bc">
            ${result.recoveryCodes.map((c) => `<code>${esc(c)}</code>`).join("")}
          </div>
          <div class="row">
            <button class="btn s sec" type="button" data-copy-recovery="${esc(result.recoveryCodes.join("\n"))}">
              Copy codes
            </button>
            <span class="sp"></span>
            <button class="btn s" type="button" data-mfa-done>Done</button>
          </div>
        </div>
      </div>
    `;
      toast("Two-step verification is now enabled.", "good");
    } catch (error) {
      toast(error.message, "bad");
      if (button) button.disabled = false;
    }
  }
  function showMfaDisableStep() {
    const host = document.getElementById("mfaControl");
    if (!host) return;
    host.innerHTML = `
    <form class="mfa-form" data-mfa-disable-form>
      <div class="state-message warn">
        ${hero("warning")}<span>Disabling this removes the second sign-in step and every unused recovery code.</span>
      </div>
      <div class="field">
        <label for="mfaDisablePassword">Current password</label>
        <div class="inp"><input id="mfaDisablePassword" name="password" type="password" autocomplete="current-password" required></div>
      </div>
      <div class="field">
        <label for="mfaDisableCode">Authenticator code</label>
        <div class="inp"><input id="mfaDisableCode" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></div>
      </div>
      <div class="mfa-actions">
        <button class="btn sec s" type="button" data-mfa-cancel>Cancel</button>
        <button class="btn badt s" type="submit">Disable</button>
      </div>
    </form>
  `;
    host.querySelector("input")?.focus();
  }
  async function disableMfa(form) {
    const button = form.querySelector("[type=submit]");
    if (button) button.disabled = true;
    try {
      const password = form.elements.namedItem("password").value;
      const code = form.elements.namedItem("code").value;
      await api("/api/v1/auth/mfa/totp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, code })
      });
      toast("Two-step verification was disabled.", "good");
      await loadMfa();
    } catch (error) {
      toast(error.message, "bad");
      if (button) button.disabled = false;
    }
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
    host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading team members\u2026</span></div>`;
    try {
      const data = await api("/api/v1/account/members");
      if (!data.members || !data.members.length) {
        host.innerHTML = `<div class="state-message"><span>No team members found.</span></div>`;
        return;
      }
      host.innerHTML = `
      <div class="z-scroll" style="margin-top:8px">
        <table class="tbl">
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
                <td data-label="Role"><span class="badge ${m.role === "OWNER" ? "accent" : "info"} s">${esc(
          m.role
        )}</span></td>
                <td data-label="Joined" class="muted">${formatDate(m.createdAt)}</td>
                <td data-label="Action" class="r">
                  ${m.isOwner ? '<span class="badge good s">Workspace Owner</span>' : `<button class="btn badt xs" type="button" data-revoke-member="${esc(m.id)}">Remove</button>`}
                </td>
              </tr>
            `
      ).join("")}
          </tbody>
        </table>
      </div>
    `;
    } catch (error) {
      host.innerHTML = `<div class="state-message bad"><span>${esc(error.message)}</span></div>`;
    }
  }
  async function loadEmailStatus() {
    const host = document.getElementById("emailDeliveryStatus");
    if (!host) return;
    try {
      const status = await api(
        "/api/v1/email/status"
      );
      const modeBadges = {
        disabled: '<span class="badge warn s">DISABLED (Zero fake delivery)</span>',
        sandbox: '<span class="badge info s">SANDBOX (Local receipts active)</span>',
        live: '<span class="badge good s">LIVE TRANSPORT</span>'
      };
      host.innerHTML = `
      <div class="li card s2"><span class="ico-b">${hero("paper")}</span><span class="tx"><b>Transport mode</b><span>Current transactional email provider state</span></span>${modeBadges[status.mode] || status.mode}</div>
      <div class="li card s2"><span class="ico-b">${hero("document")}</span><span class="tx"><b>Outbox queue</b><span>${status.pendingCount} pending \xB7 ${status.sentCount} sent \xB7 ${status.failedCount} failed</span></span></div>
    `;
    } catch (error) {
      host.innerHTML = `<div class="state-message bad"><span>${esc(error.message)}</span></div>`;
    }
  }
  function restoreMfaScanStep() {
    if (!mfaEnrollmentState) return;
    const result = mfaEnrollmentState;
    const host = document.getElementById("mfaControl");
    if (!host) return;
    const qrSvg = window.PetalQR ? window.PetalQR.svg(result.uri) : '<div class="mono" style="padding:10px">QR Engine</div>';
    host.innerHTML = `
    <div class="z-2f">
      <div class="steps">
        <div class="step cur"><i>1</i>Scan</div>
        <div class="step"><i>2</i>Verify</div>
        <div class="step"><i>3</i>Backup</div>
      </div>
      <div class="z-pane on">
        <div class="z-qr">
          <div class="z-qrb">${qrSvg}</div>
          <div class="tx">
            <b>Scan with your authenticator app</b>
            <small class="muted">Works with Google Authenticator, 1Password, Authy and other TOTP apps.</small>
            <div class="z-sec">
              <span>${esc(result.secret.replace(/(.{4})/g, "$1 ").trim())}</span>
              <button class="btn xs sq sec" type="button" data-copy-secret="${esc(result.secret)}" aria-label="Copy setup key">
                ${hero("copy", "xs")}
              </button>
            </div>
          </div>
        </div>
        <div class="row" style="justify-content:space-between">
          <button class="btn sec" type="button" data-mfa-cancel>Cancel</button>
          <button class="btn" type="button" data-mfa-next>Continue</button>
        </div>
      </div>
    </div>
  `;
  }

  // src/frontend/client/index.ts
  var appShell = new AppShell();
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
    const catalogAction = document.querySelector(".app-top-actions .btn");
    if (catalogAction) {
      catalogAction.hidden = routeName === "deploy" || routeName === "service-detail";
    }
    const sectionKeys = ["dashboard", "services", "service-detail", "deploy", "domains", "billing", "tickets", "ticket-new", "ticket-detail", "audit", "settings"];
    sectionKeys.forEach((key) => {
      const section = document.getElementById(`section-${key}`);
      if (section) section.style.display = key === routeName ? "block" : "none";
    });
  }
  var router = new Router(CLIENT_ROUTES);
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
    if (id) await renderServiceDetail(id);
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
  router.register("settings", async () => {
    updateNavigationChrome("settings");
    await renderSettings();
  });
  function bindDelegatedEvents() {
    document.getElementById("refreshServersBtn")?.addEventListener("click", renderServices);
    document.getElementById("refreshInvoicesBtn")?.addEventListener("click", renderBilling);
    document.getElementById("refreshAuditBtn")?.addEventListener("click", renderActivity);
    document.getElementById("doDeployBtn")?.addEventListener("click", beginCheckout);
    document.getElementById("revokeOtherSessionsBtn")?.addEventListener("click", revokeOtherSessions);
    document.getElementById("themeToggleBtn")?.addEventListener("click", () => appShell.toggleTheme());
    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      try {
        await api("/api/v1/auth/logout", { method: "POST" });
      } finally {
        window.location.href = "/login";
      }
    });
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target.closest("#mobileMoreBtn")) {
        const sheet = document.getElementById("mobileNavSheet");
        const trigger = document.getElementById("mobileMoreBtn");
        if (sheet) sheet.hidden = false;
        trigger?.setAttribute("aria-expanded", "true");
        return;
      }
      if (target.closest("[data-close-mobile-nav]") || target.id === "mobileNavSheet") {
        const sheet = document.getElementById("mobileNavSheet");
        if (sheet) sheet.hidden = true;
        document.getElementById("mobileMoreBtn")?.setAttribute("aria-expanded", "false");
        return;
      }
      if (target.closest("#mobileThemeBtn")) {
        appShell.toggleTheme();
        return;
      }
      if (target.closest("#globalSearchTrigger, [data-cmd]")) {
        appShell.cmd.open();
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
      const detailTab = target.closest("[data-detail-tab]");
      if (detailTab) {
        const tabKey = detailTab.dataset.detailTab || "";
        document.querySelectorAll("[data-detail-tab]").forEach((btn) => {
          const isCurrent = btn === detailTab;
          btn.style.borderBottom = isCurrent ? "2px solid var(--accent)" : "2px solid transparent";
          btn.style.color = isCurrent ? "var(--ink)" : "var(--ink2)";
        });
        document.querySelectorAll(".detail-pane").forEach((p) => p.style.display = "none");
        const activePane = document.getElementById(`detailTab${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
        if (activePane) activePane.style.display = "block";
        return;
      }
      const notifBell = target.closest("#notifBellBtn");
      if (notifBell) {
        const popover = document.getElementById("notifPopover");
        if (popover) {
          const isClosed = popover.style.display === "none" || !popover.style.display;
          popover.style.display = isClosed ? "block" : "none";
          if (isClosed) appShell.loadNotifications();
        }
        return;
      }
      const markAllNotifs = target.closest("#markAllNotifsReadBtn");
      if (markAllNotifs) {
        api("/api/v1/notifications/read-all", { method: "POST" }).then(() => appShell.loadNotifications());
        return;
      }
      const cancelSub = target.closest("[data-cancel-sub]");
      if (cancelSub) {
        cancelSubscription(cancelSub.dataset.cancelSub, cancelSub);
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
          const open = row.classList.toggle("open");
          auditRow.setAttribute("aria-expanded", String(open));
        }
        return;
      }
      const session = target.closest("[data-revoke-session]");
      if (session) {
        revokeDevice(session.dataset.revokeSession, session);
        return;
      }
      if (target.closest("[data-mfa-enable]")) showMfaPasswordStep();
      if (target.closest("[data-mfa-disable]")) showMfaDisableStep();
      if (target.closest("[data-mfa-next]")) showMfaCodeStep();
      if (target.closest("[data-mfa-back]")) restoreMfaScanStep();
      if (target.closest("[data-mfa-cancel], [data-mfa-done]")) loadMfa();
      const copySecret = target.closest("[data-copy-secret]");
      if (copySecret) {
        navigator.clipboard.writeText(copySecret.dataset.copySecret).then(() => toast("Setup key copied.", "good"));
      }
      const copyRecovery = target.closest("[data-copy-recovery]");
      if (copyRecovery) {
        navigator.clipboard.writeText(copyRecovery.dataset.copyRecovery).then(() => toast("Recovery codes copied.", "good"));
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
      }
    });
    document.addEventListener("submit", (event) => {
      const target = event.target;
      if (target.id === "createTicketPageForm") {
        createTicket(event, (path) => router.navigate(path));
        return;
      }
      if (target.id === "ticketReplyForm") {
        sendReply(event);
        return;
      }
      if (target.matches("[data-mfa-enroll-form]")) {
        event.preventDefault();
        beginMfaEnrollment(target);
      }
      if (target.matches("[data-mfa-confirm-form]")) {
        event.preventDefault();
        confirmMfaEnrollment(target);
      }
      if (target.matches("[data-mfa-disable-form]")) {
        event.preventDefault();
        disableMfa(target);
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
      if (target.matches("[data-mfa-digit]")) {
        target.value = target.value.replace(/\D/g, "").slice(-1);
        if (target.value) {
          const next = target.nextElementSibling;
          if (next) next.focus();
        }
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const sheet = document.getElementById("mobileNavSheet");
        if (sheet && !sheet.hidden) {
          sheet.hidden = true;
          document.getElementById("mobileMoreBtn")?.setAttribute("aria-expanded", "false");
          document.getElementById("mobileMoreBtn")?.focus();
        }
      }
    });
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (target.id === "newTicketFileInput" || target.id === "ticketReplyFileInput") updateFileLabel(target);
      if (target.name === "ticketStatus") filterTickets();
      if (target.name === "invoiceStatus") filterBilling();
      if (target.name === "auditType") filterActivity();
      if (target.name === "serviceState" || target.id === "serviceTypeFilter") filterServices();
    });
  }
  async function init() {
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
