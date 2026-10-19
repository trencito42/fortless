import { RouteDefinition } from './routes.js';

export interface RouteMatch {
  route: RouteDefinition;
  params: Record<string, string>;
  pathname: string;
}

export type RouteHandler = (match: RouteMatch) => void | Promise<void>;

export class Router {
  private routes: RouteDefinition[] = [];
  private handlers: Map<string, RouteHandler> = new Map();
  private cleanups: Array<() => void> = [];
  private currentMatch: RouteMatch | null = null;
  private basePath: string;
  private navigationSeq = 0;
  private activeAbortController: AbortController | null = null;

  constructor(routes: RouteDefinition[] | Record<string, RouteDefinition> = [], basePath = '/app') {
    this.routes = Array.isArray(routes) ? [...routes] : Object.values(routes);
    this.basePath = basePath;
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => this.resolve());
    }
  }

  public register(routeOrId: RouteDefinition | string, handler: RouteHandler): this {
    if (typeof routeOrId === 'string') {
      const def = this.routes.find((r) => r.id === routeOrId);
      if (def) {
        this.handlers.set(def.id, handler);
      } else {
        const customDef: RouteDefinition = {
          id: routeOrId,
          path: `${this.basePath}/${routeOrId}`,
          title: routeOrId,
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

  public onCleanup(cleanupFn: () => void): void {
    this.cleanups.push(cleanupFn);
  }

  public getCurrentMatch(): RouteMatch | null {
    return this.currentMatch;
  }

  public getNavigationSeq(): number {
    return this.navigationSeq;
  }

  public isCurrentNavigation(seq: number): boolean {
    return this.navigationSeq === seq;
  }

  public getSignal(): AbortSignal | undefined {
    return this.activeAbortController?.signal;
  }

  public navigate(pathOrId: string, params?: Record<string, string>): void {
    let targetPath = pathOrId;
    if (this.routes.some((r) => r.id === pathOrId)) {
      const def = this.routes.find((r) => r.id === pathOrId)!;
      targetPath = def.path;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          targetPath = targetPath.replace(`:${k}`, encodeURIComponent(v));
        }
      }
    }

    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
    this.resolve();
  }

  public init(): void {
    this.resolve();
  }

  public resolve(): void {
    this.navigationSeq++;
    const currentSeq = this.navigationSeq;
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {
        // ignore
      }
    }
    this.activeAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

    // A tab change inside the same view only announces the new tab; the page is not rebuilt.
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
          window.dispatchEvent(new CustomEvent('fortless:tab', { detail: { route: route.id, tab: nextTab ?? null } }));
          return;
        }
      }
    }
    // Run cleanup for prior view
    while (this.cleanups.length) {
      const cleanup = this.cleanups.pop();
      try {
        cleanup?.();
      } catch {
        // ignore
      }
    }

    const currentPath = window.location.pathname;

    for (const route of this.routes) {
      const params = this.matchRoute(route, currentPath);
      if (params !== null) {
        this.currentMatch = {
          route,
          params,
          pathname: currentPath,
        };

        // Update active classes on nav anchors
        this.updateActiveLinks(route.id);

        const handler = this.handlers.get(route.id);
        if (handler) {
          try {
            const res = handler(this.currentMatch);
            if (res && typeof (res as any).then === 'function') {
              (res as Promise<void>).catch((err) => {
                if (this.isCurrentNavigation(currentSeq)) {
                  console.error('Route handler error:', err);
                }
              });
            }
          } catch (err) {
            if (this.isCurrentNavigation(currentSeq)) {
              console.error('Route handler error:', err);
            }
          }
        }
        return;
      }
    }

    // Fallback to default route if nothing matched
    const defaultRoute = this.routes[0];
    if (defaultRoute && currentPath === this.basePath) {
      this.navigate(defaultRoute.path);
    }
  }

  private matchRoute(route: RouteDefinition, pathname: string): Record<string, string> | null {
    if (route.path === pathname) return {};
    if (route.pattern) {
      const match = pathname.match(route.pattern);
      if (match) {
        return match.groups || {};
      }
    }
    return null;
  }

  private updateActiveLinks(activeId: string): void {
    const navId = activeId === 'service-detail' || activeId === 'admin-service-detail'
      ? 'services'
      : activeId === 'account-detail'
        ? 'accounts'
        : activeId === 'ticket-detail' || activeId === 'ticket-new'
          ? 'tickets'
          : activeId;
    document.querySelectorAll<HTMLElement>('[data-app-route], [data-route]').forEach((el) => {
      const rId = el.dataset.appRoute || el.dataset.route;
      if (rId === navId) {
        el.setAttribute('aria-current', 'page');
        el.classList.add('act');
      } else {
        el.removeAttribute('aria-current');
        el.classList.remove('act');
      }
    });
    const more = document.getElementById('mobileMoreBtn');
    if (more) {
      const isOverflowRoute = ['domains', 'billing', 'audit', 'settings'].includes(navId);
      more.toggleAttribute('aria-current', isOverflowRoute);
      more.classList.toggle('act', isOverflowRoute);
    }
  }
}
