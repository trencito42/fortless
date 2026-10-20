import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { ThemeProvider } from '@/design-system';

// Three environments of one kit: the customer app (/app, /auth, /system), the public site (/, /status and /games/*) and the dev-only component workbench.
// In development the workbench keeps `/#/...` (hash routes) and `/workbench`; a bare `/` is the public site.
const CustomerApp = lazy(() => import('./app/CustomerApp'));
const SiteApp = lazy(() => import('./site/SiteApp'));
const AuthApp = lazy(() => import('./auth/AuthApp'));
const { pathname, hash } = location;
// /onboarding is the address people remember; the page itself lives in the customer app.
if (pathname === '/onboarding' || pathname === '/onboarding/') location.replace('/app/onboarding');
const isApp = /^\/(app|auth|system)(\/|$)/.test(pathname);
const isWorkbench = import.meta.env.DEV && (pathname === '/workbench' || (pathname === '/' && hash.length > 1));
const isAuth = !isApp && /^\/(login|register|forgot-password|reset-password|verify-email|complete-registration|mfa\/challenge)\/?$/.test(pathname);
const isSite = !isApp && !isAuth && !isWorkbench && /^\/(status|games\/[a-z0-9-]+)?\/?$/.test(pathname);
const Workbench = import.meta.env.DEV ? lazy(() => import('./workbench/Workbench').then((module) => ({ default: module.Workbench }))) : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      {isApp ? <Suspense fallback={null}><CustomerApp /></Suspense>
        : isAuth ? <Suspense fallback={null}><AuthApp /></Suspense>
        : isSite ? <Suspense fallback={null}><SiteApp /></Suspense>
        : Workbench && isWorkbench ? <Suspense fallback={null}><Workbench /></Suspense>
        : <main><h1>Not found</h1></main>}
    </ThemeProvider>
  </StrictMode>,
);
