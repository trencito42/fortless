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
      document.querySelectorAll("[data-app-route], [data-route]").forEach((el) => {
        const rId = el.dataset.appRoute || el.dataset.route;
        if (rId === activeId) {
          el.setAttribute("aria-current", "page");
          el.classList.add("act");
        } else {
          el.removeAttribute("aria-current");
          el.classList.remove("act");
        }
      });
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

  // src/frontend/admin/shell/admin-shell.ts
  var AdminShell = class {
    permissions = /* @__PURE__ */ new Set();
    cmd;
    pendingStepUpAction = null;
    constructor() {
      this.cmd = new CommandPaletteController("cmd", "cmd-in", "cmd-res");
    }
    init() {
      this.installIcons();
      this.cmd.bindKeyboard();
      this.bindStepUp();
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
        const staffRole = document.querySelector("#staffRole");
        if (userName) userName.textContent = identity.user.name;
        if (userAvatar) userAvatar.textContent = identity.user.name.slice(0, 2).toUpperCase();
        if (staffRole) staffRole.textContent = `${access.staff.role.replaceAll("_", " ")} \xB7 MFA`;
        this.permissions = new Set(access.staff.permissions);
        const required = {
          accounts: "accounts:read",
          services: "services:read",
          tickets: "tickets:read",
          audit: "audit:read",
          staff: "staff:read"
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
          if (modal) modal.hidden = true;
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
    const c = /ACTIVE|RUNNING|RESOLVED|CLOSED|COMPLETED/.test(x) ? "good" : /URGENT|ERROR|DEAD|OVERDUE|SUSPENDED|LOCKED/.test(x) ? "bad" : /PENDING|WAITING|HIGH|MOCK|NOT_CONFIGURED/.test(x) ? "warn" : "info";
    return `<span class="badge ${c} s">${esc(x.replaceAll("_", " "))}</span>`;
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
    <article class="row" ${dataAttr} style="cursor:pointer;transition:background .15s">
      <span class="row-icon">${hero(symbol)}</span>
      <div class="row-copy">
        <b>${esc(title)}</b>
        <small>${esc(sub)}</small>
      </div>
      ${status ? badge(status) : ""}
      ${meta ? `<div class="row-meta">${esc(meta)}</div>` : ""}
    </article>
  `;
  }

  // src/frontend/admin/pages/overview/index.ts
  async function renderOverview() {
    const d = await api("/api/v1/admin/overview");
    const metrics = [
      ["Users", d.users],
      ["Accounts", d.accounts],
      ["Active services", d.activeServices],
      ["Open tickets", d.openTickets],
      ["Orders", d.orders],
      ["Overdue invoices", d.overdueInvoices],
      ["Pending events", d.pendingOutboxEvents],
      ["Dead letters", d.deadLetterEvents]
    ];
    const metricsBox = document.querySelector("#overviewMetrics");
    if (metricsBox) {
      metricsBox.innerHTML = metrics.map((x) => `<article class="metric"><span>${esc(x[0])}</span><strong>${Number(x[1] || 0)}</strong></article>`).join("");
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

  // src/frontend/admin/pages/accounts/index.ts
  var activeAccountId = null;
  function getActiveAccountId() {
    return activeAccountId;
  }
  async function renderAccounts(q = "") {
    const host = document.querySelector("#accountsList");
    if (!host) return;
    try {
      const d = await api(`/api/v1/admin/accounts?q=${encodeURIComponent(q)}`);
      if (!d.accounts.length) {
        host.innerHTML = `<div class="empty"><span class="row-icon"></span><b>No matching accounts.</b></div>`;
        return;
      }
      host.innerHTML = d.accounts.map(
        (x) => row({
          symbol: "users",
          title: x.name,
          sub: `${x.owner_name} \xB7 ${x.owner_email}`,
          status: x.status,
          meta: `${x.member_count} members \xB7 ${x.service_count} services \xB7 ${x.open_ticket_count} tickets`,
          dataAttr: `data-account-id="${esc(x.id)}"`
        })
      ).join("");
    } catch (e) {
      host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
    }
  }
  async function openAccountDetail(accountId) {
    activeAccountId = accountId;
    const modal = document.getElementById("modalAccountDetail");
    const content = document.getElementById("adminAccountContent");
    if (!modal || !content) return;
    content.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink2)">Loading account profile\u2026</div>';
    modal.hidden = false;
    try {
      const d = await api(`/api/v1/admin/accounts/${encodeURIComponent(accountId)}`);
      const titleEl = document.getElementById("adminAccountTitle");
      const metaEl = document.getElementById("adminAccountMeta");
      const statusSelect = document.getElementById("adminAccountStatusSelect");
      if (titleEl) titleEl.textContent = d.account.name;
      if (metaEl)
        metaEl.textContent = `Owner: ${d.account.owner_name} (${d.account.owner_email}) \xB7 Created ${formatDate(
          d.account.created_at
        )}`;
      if (statusSelect) statusSelect.value = d.account.status;
      content.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
        <div class="card s2" style="padding:12px">
          <b>Members (${d.members.length})</b>
          <div style="font-size:12px;color:var(--ink2);margin-top:4px">
            ${d.members.map((m) => `${esc(m.name)} (${m.role})`).join(", ") || "None"}
          </div>
        </div>
        <div class="card s2" style="padding:12px">
          <b>Active Services (${d.services.length})</b>
          <div style="font-size:12px;color:var(--ink2);margin-top:4px">
            ${d.services.map((s) => `${esc(s.plan_name)} [${s.contract_status}]`).join(", ") || "None"}
          </div>
        </div>
        <div class="card s2" style="padding:12px">
          <b>Invoices (${d.invoices.length})</b>
          <div style="font-size:12px;color:var(--ink2);margin-top:4px">
            ${d.invoices.slice(0, 3).map((i) => `${esc(i.invoice_number)} (${i.status})`).join(", ") || "None"}
          </div>
        </div>
      </div>
    `;
    } catch (err) {
      content.innerHTML = `<div style="color:var(--bad);padding:20px">Error loading account: ${esc(err.message)}</div>`;
    }
  }

  // src/frontend/admin/pages/services/index.ts
  async function renderServices(q = "") {
    const host = document.querySelector("#servicesList");
    if (!host) return;
    try {
      const d = await api(`/api/v1/admin/services?q=${encodeURIComponent(q)}`);
      if (!d.services.length) {
        host.innerHTML = `<div class="empty"><b>No matching services.</b></div>`;
        return;
      }
      host.innerHTML = d.services.map(
        (x) => row({
          symbol: "server",
          title: x.plan_name || x.product_name,
          sub: `${x.account_name} \xB7 ${x.region_name} \xB7 ${x.node_name}`,
          status: x.runtime_state || x.contract_status,
          meta: `${x.provider_type} \xB7 ${x.identifier || x.id}`
        })
      ).join("");
    } catch (e) {
      host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
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

  // src/frontend/admin/pages/tickets/index.ts
  var activeTicketId = null;
  function getActiveTicketId() {
    return activeTicketId;
  }
  async function renderTickets(q = "") {
    const host = document.querySelector("#ticketsList");
    if (!host) return;
    try {
      const d = await api(`/api/v1/admin/tickets?q=${encodeURIComponent(q)}`);
      if (!d.tickets.length) {
        host.innerHTML = `<div class="empty"><b>No matching support tickets.</b></div>`;
        return;
      }
      host.innerHTML = d.tickets.map(
        (x) => row({
          symbol: "support",
          title: x.subject,
          sub: `${x.account_name} \xB7 ${x.customer_name} \xB7 ${x.message_count} messages`,
          status: `${x.priority} \xB7 ${x.status}`,
          meta: `Updated ${formatDate(x.updated_at)}`,
          dataAttr: `data-ticket-id="${esc(x.id)}"`
        })
      ).join("");
    } catch (e) {
      host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
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
            <b>${esc(m.author_name)} ${m.is_staff_internal_note ? '<span class="badge warn s">INTERNAL NOTE</span>' : m.is_staff_author ? '<span class="badge accent s">STAFF</span>' : ""}</b>
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
  async function renderAudit(q = "") {
    const host = document.querySelector("#auditList");
    if (!host) return;
    try {
      const d = await api(`/api/v1/admin/audit?q=${encodeURIComponent(q)}`);
      if (!d.logs.length) {
        host.innerHTML = `<div class="empty"><b>No matching audit events.</b></div>`;
        return;
      }
      host.innerHTML = d.logs.map(
        (x) => row({
          symbol: "shield",
          title: x.action,
          sub: `${x.actor_name || x.actor_type} \xB7 ${x.account_name || "Platform"} \xB7 ${x.resource_type} ${x.resource_id}`,
          status: x.actor_type,
          meta: formatDate(x.created_at)
        })
      ).join("");
    } catch (e) {
      host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
    }
  }

  // src/frontend/admin/pages/staff/index.ts
  async function renderStaff(q = "") {
    const host = document.querySelector("#staffList");
    if (!host) return;
    try {
      const d = await api(`/api/v1/admin/staff?q=${encodeURIComponent(q)}`);
      if (!d.staff.length) {
        host.innerHTML = `<div class="empty"><b>No matching staff identities.</b></div>`;
        return;
      }
      host.innerHTML = d.staff.map(
        (x) => row({
          symbol: "users",
          title: x.name,
          sub: `${x.email} \xB7 MFA ${x.mfa_enabled ? "enabled" : "required"}`,
          status: `${x.role} \xB7 ${x.status}`,
          meta: `Updated ${formatDate(x.updated_at)}`,
          dataAttr: `data-staff-user-id="${esc(x.id)}" data-staff-name="${esc(x.name)}" data-staff-role="${esc(
            x.role
          )}" data-staff-status="${esc(x.status)}"`
        })
      ).join("");
    } catch (e) {
      host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
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

  // src/frontend/admin/index.ts
  var adminShell = new AdminShell();
  var router = new Router(ADMIN_ROUTES);
  function updateAdminChrome(routeName) {
    const titles = {
      overview: ["Operations overview", "Real platform records, without simulated operational controls."],
      accounts: ["Customer accounts", "Ownership, membership and workload counts. Click an account to inspect or lock."],
      services: ["Service inventory", "Contract and provider-observed state."],
      tickets: ["Support queue", "Real customer threads. Click a ticket to view and reply."],
      audit: ["Global audit trail", "Security-relevant events across accounts."],
      staff: ["Staff access", "Persisted roles, access status and MFA readiness. Click to edit role."]
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
  function bindAdminEvents() {
    document.addEventListener("click", (e) => {
      const target = e.target;
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
      if (target.closest("[data-cmd]")) {
        adminShell.cmd.open();
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
          if (searchTarget === "tickets") renderTickets(input.value);
          if (searchTarget === "audit") renderAudit(input.value);
          if (searchTarget === "staff") renderStaff(input.value);
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
        alert(`Error submitting reply: ${err.message}`);
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
        alert("Account status updated successfully.");
        const m = document.getElementById("modalAccountDetail");
        if (m) m.hidden = true;
        renderAccounts();
      } catch (err) {
        alert(`Error updating account status: ${err.message}`);
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
        alert("Staff permissions updated.");
        const m = document.getElementById("modalStaffEditor");
        if (m) m.hidden = true;
        renderStaff();
      } catch (err) {
        alert(`Error modifying staff: ${err.message}`);
      } finally {
        btn.disabled = false;
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
