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
          handler(this.currentMatch);
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
    const navId = activeId === 'service-detail' ? 'services' : activeId === 'ticket-detail' || activeId === 'ticket-new' ? 'tickets' : activeId;
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
