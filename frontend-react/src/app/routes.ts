import type { ComponentType } from 'react';

export interface AppRoute { pattern: string; load: () => Promise<{ default: ComponentType<any> }> }

/** Route table of the customer app. Order matters: first match wins. There are no admin, staff or internal routes. */
export const routes: AppRoute[] = [
  { pattern: '/app', load: () => import('./pages/Dashboard') },
  { pattern: '/app/deploy', load: () => import('./pages/Deploy') },
  { pattern: '/app/services', load: () => import('./pages/Services') },
  { pattern: '/app/services/:id/:tab?', load: () => import('./pages/ServiceDetailPage') },
  { pattern: '/app/billing', load: () => import('./pages/billing/Overview') },
  { pattern: '/app/billing/invoices', load: () => import('./pages/billing/Invoices') },
  { pattern: '/app/billing/invoices/:id', load: () => import('./pages/billing/InvoiceDetail') },
  { pattern: '/app/billing/subscriptions', load: () => import('./pages/billing/Subscriptions') },
  { pattern: '/app/billing/orders', load: () => import('./pages/billing/Orders') },
  { pattern: '/app/billing/cart', load: () => import('./pages/billing/Cart') },
  { pattern: '/app/billing/plans', load: () => import('./pages/billing/Plans') },
  { pattern: '/app/billing/payment-methods', load: () => import('./pages/billing/PaymentMethods') },
  { pattern: '/app/billing/profile', load: () => import('./pages/billing/Profile') },
  { pattern: '/app/domains', load: () => import('./pages/domains/List') },
  { pattern: '/app/domains/search', load: () => import('./pages/domains/Search') },
  { pattern: '/app/domains/:name', load: () => import('./pages/domains/Detail') },
  { pattern: '/app/support', load: () => import('./pages/support/Inbox') },
  { pattern: '/app/support/new', load: () => import('./pages/support/New') },
  { pattern: '/app/support/:id', load: () => import('./pages/support/Conversation') },
  { pattern: '/app/account', load: () => import('./pages/account/Profile') },
  { pattern: '/app/account/security', load: () => import('./pages/account/Security') },
  { pattern: '/app/account/api-keys', load: () => import('./pages/account/ApiKeys') },
  { pattern: '/app/account/team', load: () => import('./pages/account/Team') },
  { pattern: '/app/account/notifications', load: () => import('./pages/account/Notifications') },
  { pattern: '/app/account/activity', load: () => import('./pages/account/Activity') },
  { pattern: '/app/usage', load: () => import('./pages/Usage') },
  { pattern: '/app/announcements', load: () => import('./pages/Announcements') },
  { pattern: '/app/knowledge/:id?', load: () => import('./pages/Knowledge') },
];
