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
  var CLIENT_ROUTES = {
    servers: {
      id: "servers",
      path: "/app",
      title: "Services \xB7 FORTLESS",
      subtitle: "Provider-observed runtime records for this account."
    },
    deploy: {
      id: "deploy",
      path: "/app/deploy",
      title: "Deploy Service \xB7 FORTLESS",
      subtitle: "Select configuration, location, and billing cycle."
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
      pattern: /^\/app\/services\/([^/]+)$/
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
        ["#nav-servers .ic, #tab-servers .ic", "servers"],
        ["#nav-deploy .ic, #tab-deploy .ic", "plus"],
        ["#nav-billing .ic, #tab-billing .ic", "credit"],
        ["#nav-tickets .ic, #tab-tickets .ic", "support"],
        ["#nav-audit .ic", "shield"],
        ["#nav-settings .ic, #tab-settings .ic", "settings"],
        ["#refreshServersBtn svg, #refreshInvoicesBtn svg, #refreshAuditBtn svg", "refresh"],
        [".app-top-actions .btn svg", "plus"],
        ["#doDeployBtn svg", "cube"]
      ];
      targets.forEach(([selector, icon]) => {
        document.querySelectorAll(selector).forEach((node) => {
          node.outerHTML = hero(icon, node.classList.contains("s") ? "s" : "");
        });
      });
      document.querySelectorAll('#ticketModal button[onclick*="close"], #newTicketModal [data-close-new-ticket][aria-label]').forEach((button) => {
        button.innerHTML = hero("x", "s");
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
      const sH2 = document.querySelector("#section-servers .card.flat h2");
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
              ${n.linkUrl ? `<a href="${esc(n.linkUrl)}" data-app-route="${n.linkUrl.includes("services") ? "service-detail" : "servers"}" style="font-size:11px;color:var(--accent);font-weight:600">View details \u2192</a>` : ""}
            </div>
          `
            ).join("");
          }
        }
      } catch {
      }
    }
  };

  // src/frontend/client/pages/dashboard/index.ts
  async function renderDashboard() {
    const host = document.getElementById("serversContainer");
    if (!host) return;
    host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading services\u2026</span></div>`;
    try {
      const { services } = await api("/api/v1/services");
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
      document.querySelectorAll("#section-servers .stat .spark").forEach((s) => s.remove());
      const sRunning = spark([Math.max(0, running - 1), running, running, running], "var(--good)");
      const sTotal = spark([Math.max(0, services.length - 1), services.length, services.length], "var(--accent)");
      const sRam = spark([Math.max(0, memory * 0.8), memory * 0.9, memory], "var(--violet)");
      const sCpu = spark([Math.max(0, cpu * 0.7), cpu * 0.85, cpu], "var(--warn)");
      statRunning?.insertAdjacentHTML("afterend", sRunning);
      statTotal?.insertAdjacentHTML("afterend", sTotal);
      statRam?.insertAdjacentHTML("afterend", sRam);
      statCpu?.insertAdjacentHTML("afterend", sCpu);
      if (!services.length) {
        host.innerHTML = renderEmptyState({
          icon: "servers",
          title: "No services yet",
          message: "Ordering stays unavailable until payment and infrastructure providers are configured and verified.",
          actionHtml: `<a class="btn s tint" href="/app/deploy" data-app-route="deploy">${hero("plus", "s")}View catalog</a>`
        });
        return;
      }
      host.innerHTML = `
      <div class="col" style="gap:8px">
        ${services.map((service) => {
        const runtime = service.runtime_state || "UNKNOWN";
        const runningNow = runtime === "RUNNING";
        const badge = runningNow ? "good" : runtime === "INSTALLING" ? "warn" : runtime === "ERROR" ? "bad" : "info";
        const endpoint = service.identifier ? `Provider ID \xB7 ${service.identifier}` : "Provisioning record";
        return `
              <article class="li card s2 service-row">
                <span class="ico-b ${badge}">${hero("servers")}</span>
                <div class="tx">
                  <div class="title-row">
                    <b>${esc(service.plan_name || "Hosting service")}</b>
                    <span class="badge ${badge} s">${esc(runtime)}</span>
                    <span class="badge s">${esc(service.contract_status)}</span>
                  </div>
                  <div class="meta">
                    ${esc(service.node_name || service.node_id)} \xB7 ${Number(service.memory_limit_mb || 0) / 1024} GB RAM \xB7 ${esc(service.cpu_limit_pct || 0)}% CPU \xB7 ${Number(service.disk_limit_mb || 0) / 1024} GB disk
                  </div>
                </div>
                <code class="endpoint">${esc(endpoint)}</code>
                <div class="actions">
                  <button class="btn s sec" data-power="RESTART" data-service="${esc(service.id)}" ${runningNow ? "" : "disabled"}>
                    ${hero("refresh", "xs")}Restart
                  </button>
                  <button class="btn s badt" data-power="STOP" data-service="${esc(service.id)}" ${runningNow ? "" : "disabled"}>
                    ${hero("stop", "xs")}Stop
                  </button>
                  <button class="btn s goodt" data-power="START" data-service="${esc(service.id)}" ${runningNow ? "disabled" : ""}>
                    ${hero("play", "xs")}Start
                  </button>
                  <a href="/app/services/${esc(service.id)}" class="btn s tint" data-app-route="service-detail" data-service-id="${esc(service.id)}">
                    ${hero("chevron", "xs")}Manage
                  </a>
                </div>
              </article>
            `;
      }).join("")}
      </div>
    `;
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
      await renderDashboard();
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
      const restartBtn = document.getElementById("detailRestartBtn");
      const stopBtn = document.getElementById("detailStopBtn");
      const startBtn = document.getElementById("detailStartBtn");
      if (restartBtn) {
        restartBtn.disabled = !runningNow;
        restartBtn.onclick = () => powerService(service.id, "RESTART", restartBtn);
      }
      if (stopBtn) {
        stopBtn.disabled = !runningNow;
        stopBtn.onclick = () => powerService(service.id, "STOP", stopBtn);
      }
      if (startBtn) {
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
      const gaugeRamBar = document.getElementById("gaugeRamBar");
      const gaugeCpuVal = document.getElementById("gaugeCpuValue");
      const gaugeCpuBar = document.getElementById("gaugeCpuBar");
      const gaugeDiskVal = document.getElementById("gaugeDiskValue");
      const gaugeDiskBar = document.getElementById("gaugeDiskBar");
      if (gaugeRamVal) gaugeRamVal.textContent = `${(ramMb / 1024).toFixed(1)} GB`;
      if (gaugeRamBar) gaugeRamBar.style.width = "100%";
      if (gaugeCpuVal) gaugeCpuVal.textContent = `${cpuPct}%`;
      if (gaugeCpuBar) gaugeCpuBar.style.width = `${Math.min(100, cpuPct / 2)}%`;
      if (gaugeDiskVal) gaugeDiskVal.textContent = `${(diskMb / 1024).toFixed(0)} GB`;
      if (gaugeDiskBar) gaugeDiskBar.style.width = "100%";
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
      const consoleOutput = document.getElementById("consoleLogOutput");
      const consoleForm = document.getElementById("consoleCommandForm");
      const consoleInput = document.getElementById("consoleCommandInput");
      const consoleSendBtn = consoleForm?.querySelector('button[type="submit"]');
      if (consoleOutput) {
        consoleOutput.textContent = `[SYSTEM] Interactive server console is currently unavailable.
[SECURITY] Direct provider-backed console execution requires verified WebSocket node telemetry.
[AUDIT] Authenticated operational commands are logged directly in the audit trail.`;
      }
      if (consoleInput) {
        consoleInput.placeholder = "Console unavailable \u2014 provider WebSocket unconfigured";
        consoleInput.disabled = true;
      }
      if (consoleSendBtn) {
        consoleSendBtn.disabled = true;
      }
    } catch (error) {
      toast(error.message, "bad");
    }
  }

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

  // src/frontend/client/pages/deploy/index.ts
  var deployState = {
    plans: [],
    regions: [],
    selectedPlanId: null,
    selectedRegionId: "reg_fra_1",
    activeCoupon: null
  };
  async function renderDeploy() {
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
    const taxableSubtotal = Math.max(0, subtotal - discount);
    const tax = Math.round(taxableSubtotal * 0.19);
    const total = taxableSubtotal + tax;
    const sumPlan = document.getElementById("sumPlan");
    const sumReg = document.getElementById("sumReg");
    const sumVat = document.getElementById("sumVat");
    const sumTotal = document.getElementById("sumTotal");
    if (sumPlan) sumPlan.textContent = plan.planName;
    const selReg = deployState.regions.find((r) => r.id === deployState.selectedRegionId);
    if (sumReg) sumReg.textContent = selReg ? `${selReg.name} (${selReg.code})` : "Frankfurt (catalog)";
    const rowDisc = document.getElementById("rowDiscount");
    if (rowDisc) {
      if (deployState.activeCoupon && discount > 0) {
        rowDisc.style.display = "flex";
        const sumCode = document.getElementById("sumCouponCode");
        const sumDisc = document.getElementById("sumDiscount");
        if (sumCode) sumCode.textContent = deployState.activeCoupon.code;
        if (sumDisc) sumDisc.textContent = `-${money(discount, price?.currency || "EUR")}`;
      } else {
        rowDisc.style.display = "none";
      }
    }
    if (sumVat) sumVat.textContent = money(tax, price?.currency || "EUR");
    if (sumTotal) sumTotal.textContent = money(total, price?.currency || "EUR");
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

  // src/frontend/client/pages/billing/index.ts
  async function renderBilling() {
    const host = document.getElementById("invoicesTableBody");
    if (!host) return;
    host.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Loading billing records\u2026</td></tr>';
    try {
      const { invoices } = await api("/api/v1/invoices");
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
      if (!invoices.length) {
        host.innerHTML = `<tr><td colspan="6">${renderEmptyState({
          icon: "document",
          title: "No invoices",
          message: "Issued billing records will appear here."
        })}</td></tr>`;
      } else {
        host.innerHTML = invoices.map((invoice) => {
          const badgeClass = invoice.status === "PAID" ? "good" : invoice.status === "DRAFT" ? "" : "info";
          return `
            <tr class="mobile-record">
              <td data-label="Invoice"><b>${esc(invoice.invoice_number || "Draft")}</b></td>
              <td data-label="Issued" class="muted">${esc(formatDate(invoice.created_at))}</td>
              <td data-label="Tax">${money(invoice.tax_minor_units, invoice.currency)}</td>
              <td data-label="Total" class="r num"><b>${money(invoice.total_minor_units, invoice.currency)}</b></td>
              <td data-label="Status"><span class="badge ${badgeClass} s">${esc(invoice.status)}</span></td>
              <td data-label="Record" class="r">
                <a href="/api/v1/invoices/${encodeURIComponent(invoice.id)}/download" class="btn s sec" download style="font-size:11px;padding:4px 8px;height:28px">
                  ${hero("document", "xs")}Receipt
                </a>
              </td>
            </tr>
          `;
        }).join("");
      }
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
  var activeTicketId = null;
  function setActiveTicketId(id) {
    activeTicketId = id;
  }
  async function renderTickets() {
    const host = document.getElementById("ticketsList");
    if (!host) return;
    host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading support conversations\u2026</span></div>`;
    try {
      const { tickets } = await api("/api/v1/tickets");
      host.className = "col";
      host.style.gap = "8px";
      if (!tickets.length) {
        host.innerHTML = renderEmptyState({
          icon: "support",
          title: "No support conversations",
          message: "When you open a ticket, its account-scoped thread will appear here.",
          actionHtml: `<button class="btn s tint" type="button" data-open-ticket>${hero("plus", "s")}Open ticket</button>`
        });
        return;
      }
      host.innerHTML = tickets.map((ticket) => {
        const priorityClass = ticket.priority === "URGENT" ? "bad" : ticket.priority === "HIGH" ? "warn" : "";
        const stateClass = ["OPEN", "WAITING_STAFF"].includes(ticket.status) ? "info" : ticket.status === "RESOLVED" ? "good" : "";
        return `
          <button type="button" class="li card s2" data-ticket-id="${esc(ticket.id)}">
            <span class="ico-b ${priorityClass || "accent"}">${hero("support")}</span>
            <span class="tx">
              <b>${esc(ticket.subject)}</b>
              <span>${esc(formatDate(ticket.updated_at || ticket.created_at))}</span>
            </span>
            <span class="badge ${priorityClass} s">${esc(ticket.priority)}</span>
            <span class="badge ${stateClass} s">${esc(ticket.status)}</span>
          </button>
        `;
      }).join("");
    } catch (error) {
      host.innerHTML = `<div class="state-message bad">${hero("warning")}<span>${esc(error.message)}</span></div>`;
    }
  }
  async function openTicketModal(id) {
    activeTicketId = id;
    const modal = document.getElementById("ticketModal");
    const host = document.getElementById("modalTicketMessages");
    const attHost = document.getElementById("modalTicketAttachments");
    if (modal) modal.hidden = false;
    if (host) host.innerHTML = `<div class="state-message">${hero("refresh")}<span>Loading conversation\u2026</span></div>`;
    if (attHost) attHost.innerHTML = "";
    const replyFile = document.getElementById("ticketReplyFileInput");
    if (replyFile) replyFile.value = "";
    const replyLabel = document.getElementById("ticketReplyFileLabel");
    if (replyLabel) replyLabel.textContent = "";
    try {
      const data = await api(
        `/api/v1/tickets/${encodeURIComponent(id)}`
      );
      const subEl = document.getElementById("modalTicketSubject");
      const metaEl = document.getElementById("modalTicketMeta");
      if (subEl) subEl.textContent = data.ticket.subject;
      if (metaEl) metaEl.textContent = `${data.ticket.priority} \xB7 ${data.ticket.status}`;
      if (host) {
        host.className = "message-list";
        host.innerHTML = data.messages.map(
          (item) => `
          <div class="message ${item.is_staff ? "staff" : ""}">
            <small>${esc(item.is_staff ? item.author_name || "Support" : "You")} \xB7 ${esc(formatDate(item.created_at))}</small>
            <div class="bubble">${renderMarkdown(item.body)}</div>
          </div>
        `
        ).join("") || '<div class="muted">No messages.</div>';
      }
      if (attHost && data.attachments && data.attachments.length) {
        attHost.innerHTML = `<small class="muted" style="display:block;margin-bottom:6px">Attachments (${data.attachments.length}):</small>` + data.attachments.map(
          (att) => `
            <a href="/api/v1/tickets/${encodeURIComponent(id)}/attachments/${encodeURIComponent(att.id)}" download class="att-chip">
              ${hero("document", "xs")}
              <span class="name">${esc(att.filename)}</span>
              <span class="sz">${formatBytes(att.byte_size)}</span>
            </a>
          `
        ).join("");
      }
    } catch (error) {
      if (host) host.innerHTML = `<div class="state-message bad">${hero("warning")}<span>${esc(error.message)}</span></div>`;
    }
  }
  async function sendReply() {
    if (!activeTicketId) return;
    const field = document.getElementById("modalTicketReply");
    const body = field?.value.trim() || "";
    const fileInput = document.getElementById("ticketReplyFileInput");
    const btn = document.getElementById("sendReplyBtn");
    if (!body && (!fileInput || !fileInput.files || !fileInput.files.length)) return;
    if (btn) btn.disabled = true;
    try {
      if (body) {
        await api(`/api/v1/tickets/${encodeURIComponent(activeTicketId)}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body })
        });
      }
      if (fileInput && fileInput.files?.[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        await new Promise((resolve, reject) => {
          reader.onload = async () => {
            try {
              const base64 = String(reader.result || "").split(",")[1];
              await api(`/api/v1/tickets/${encodeURIComponent(activeTicketId)}/attachments`, {
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
        const replyFileLabel = document.getElementById("ticketReplyFileLabel");
        if (replyFileLabel) replyFileLabel.textContent = "";
      }
      if (field) field.value = "";
      toast("Reply added.", "good");
      await openTicketModal(activeTicketId);
    } catch (error) {
      toast(error.message, "bad");
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  async function createTicket(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorHost = document.getElementById("ticketFormError");
    const submit = document.getElementById("submitTicketBtn");
    const subject = document.getElementById("ticketSubject").value.trim();
    const messageBody = document.getElementById("ticketMessage").value.trim();
    const priority = new FormData(form).get("ticketPriority") || "NORMAL";
    const fileInput = document.getElementById("newTicketFileInput");
    errorHost.hidden = true;
    if (subject.length < 3 || messageBody.length < 5) {
      errorHost.textContent = "Add a clear subject and at least five characters of detail.";
      errorHost.hidden = false;
      return;
    }
    const payload = { subject, priority, message: messageBody };
    submit.disabled = true;
    submit.classList.add("load");
    try {
      const created = await api("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (fileInput && fileInput.files?.[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        await new Promise((resolve, reject) => {
          reader.onload = async () => {
            try {
              const base64 = String(reader.result || "").split(",")[1];
              await api(`/api/v1/tickets/${encodeURIComponent(created.ticketId)}/attachments`, {
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
        const newFileLabel = document.getElementById("newTicketFileLabel");
        if (newFileLabel) newFileLabel.textContent = "";
      }
      const newTicketModal = document.getElementById("newTicketModal");
      if (newTicketModal) newTicketModal.hidden = true;
      form.reset();
      toast("Ticket opened.", "good");
      await renderTickets();
      await openTicketModal(created.ticketId);
    } catch (error) {
      errorHost.textContent = error.message;
      errorHost.hidden = false;
    } finally {
      submit.disabled = false;
      submit.classList.remove("load");
    }
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
    const logs = auditLogs.filter(
      (item) => [item.actor_name, item.actor_type, item.action, item.resource_type, item.resource_id, item.correlation_id].some(
        (value) => String(value || "").toLowerCase().includes(query)
      )
    );
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
      <div class="table-card" style="margin-top:8px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="text-align:left;border-bottom:1px solid var(--s3);color:var(--ink2)">
              <th style="padding:8px">Member</th>
              <th style="padding:8px">Role</th>
              <th style="padding:8px">Joined</th>
              <th style="padding:8px;text-align:right">Action</th>
            </tr>
          </thead>
          <tbody>
            ${data.members.map(
        (m) => `
              <tr style="border-bottom:1px solid var(--s2)">
                <td style="padding:10px 8px"><b>${esc(m.name)}</b><br><small class="muted">${esc(m.email)}</small></td>
                <td style="padding:10px 8px"><span class="badge ${m.role === "OWNER" ? "accent" : "info"} s">${esc(
          m.role
        )}</span></td>
                <td style="padding:10px 8px" class="muted">${formatDate(m.createdAt)}</td>
                <td style="padding:10px 8px;text-align:right">
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
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--s2);border-radius:12px;">
        <span>Transport Mode</span>
        ${modeBadges[status.mode] || status.mode}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--s2);border-radius:12px;">
        <span>Outbox Queue</span>
        <span><b>${status.pendingCount}</b> pending \xB7 <b>${status.sentCount}</b> sent \xB7 <b>${status.failedCount}</b> failed</span>
      </div>
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
      servers: ["Services", "Actual service records and provider-observed runtime state for this account."],
      "service-detail": ["Service Detail", "Detailed configuration, provider allocation, and operational logs."],
      deploy: ["Configure a service", "Catalog preview; ordering remains disabled until payment and infrastructure providers are verified."],
      billing: ["Billing", "Draft and issued documents recorded for this account."],
      tickets: ["Support", "Open and review account-scoped support conversations."],
      audit: ["Activity", "Account-scoped audit events recorded by the current implementation."],
      settings: ["Account & security", "Identity, tenant and implementation status."]
    };
    const titleEntry = titles[routeName] ?? titles.servers;
    const viewTitle = document.getElementById("viewTitle");
    const viewSubtitle = document.getElementById("viewSubtitle");
    if (viewTitle) viewTitle.textContent = titleEntry[0];
    if (viewSubtitle) viewSubtitle.textContent = titleEntry[1];
    const catalogAction = document.querySelector(".app-top-actions .btn");
    if (catalogAction) {
      catalogAction.hidden = routeName === "deploy" || routeName === "service-detail";
    }
    const sectionKeys = ["servers", "service-detail", "deploy", "billing", "tickets", "audit", "settings"];
    sectionKeys.forEach((key) => {
      const section = document.getElementById(`section-${key}`);
      if (section) section.style.display = key === routeName ? "block" : "none";
    });
  }
  var router = new Router(CLIENT_ROUTES);
  router.register("servers", async () => {
    updateNavigationChrome("servers");
    await renderDashboard();
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
  router.register("billing", async () => {
    updateNavigationChrome("billing");
    await renderBilling();
  });
  router.register("tickets", async () => {
    updateNavigationChrome("tickets");
    await renderTickets();
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
    document.getElementById("refreshServersBtn")?.addEventListener("click", renderDashboard);
    document.getElementById("refreshInvoicesBtn")?.addEventListener("click", renderBilling);
    document.getElementById("refreshAuditBtn")?.addEventListener("click", renderActivity);
    document.getElementById("doDeployBtn")?.addEventListener("click", beginCheckout);
    document.getElementById("newTicketBtn")?.addEventListener("click", () => {
      const m = document.getElementById("newTicketModal");
      if (m) m.hidden = false;
    });
    document.getElementById("sendReplyBtn")?.addEventListener("click", sendReply);
    document.getElementById("createTicketForm")?.addEventListener("submit", createTicket);
    document.getElementById("revokeOtherSessionsBtn")?.addEventListener("click", revokeOtherSessions);
    document.getElementById("newTicketFileInput")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      const lbl = document.getElementById("newTicketFileLabel");
      if (lbl) lbl.textContent = f ? `${f.name} (${formatBytes(f.size)})` : "";
    });
    document.getElementById("ticketReplyFileInput")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      const lbl = document.getElementById("ticketReplyFileLabel");
      if (lbl) lbl.textContent = f ? `${f.name} (${formatBytes(f.size)})` : "";
    });
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
      if (target.closest("#globalSearchTrigger, [data-cmd]")) {
        appShell.cmd.open();
        return;
      }
      const routeLink = target.closest("[data-app-route]");
      if (routeLink && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const href = routeLink.getAttribute("href") || "/app";
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
      const ticket = target.closest("[data-ticket-id]");
      if (ticket) {
        openTicketModal(ticket.dataset.ticketId);
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
      if (target.closest("[data-close-new-ticket]")) {
        const m = document.getElementById("newTicketModal");
        const err = document.getElementById("ticketFormError");
        if (m) m.hidden = true;
        if (err) err.hidden = true;
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
        const ticketModal = document.getElementById("ticketModal");
        const newTicketModal = document.getElementById("newTicketModal");
        if (ticketModal) ticketModal.hidden = true;
        if (newTicketModal) newTicketModal.hidden = true;
        setActiveTicketId(null);
      }
    });
    window.closeTicketModal = () => {
      const m = document.getElementById("ticketModal");
      if (m) m.hidden = true;
      setActiveTicketId(null);
    };
    window.closeNewTicketModal = () => {
      const m = document.getElementById("newTicketModal");
      if (m) m.hidden = true;
    };
  }
  async function init() {
    appShell.init();
    bindDelegatedEvents();
    const legacyRoute = window.location.hash.slice(1);
    if (legacyRoute) {
      const routePaths = {
        servers: "/app",
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
