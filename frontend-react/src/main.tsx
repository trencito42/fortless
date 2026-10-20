import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { ThemeProvider } from '@/design-system';

// The customer app and the component workbench are two environments of one kit. /app, /auth and /system are the customer app; everything else is the workbench.
const CustomerApp = lazy(() => import('./app/CustomerApp'));
const isApp = /^\/(app|auth|system)(\/|$)/.test(location.pathname);
const Workbench = import.meta.env.DEV ? lazy(() => import('./workbench/Workbench').then((module) => ({ default: module.Workbench }))) : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      {isApp ? <Suspense fallback={null}><CustomerApp /></Suspense> : Workbench ? <Suspense fallback={null}><Workbench /></Suspense> : <main><h1>Not found</h1></main>}
    </ThemeProvider>
  </StrictMode>,
);
