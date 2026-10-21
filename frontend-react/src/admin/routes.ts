import type { ComponentType } from 'react';
import type { StaffPermission } from './types';

export interface AdminRoute { pattern: string; permission?: StaffPermission; load: () => Promise<{ default: ComponentType<never> }> }

/** First match wins, so literal paths ("/new") are listed before parameter paths ("/:id"). Pages are code-split per group. */
export const routes: AdminRoute[] = [
  { pattern: '/', permission: 'admin:access', load: () => import('./pages/overview/Dashboard') },
  { pattern: '/customers', permission: 'accounts:read', load: () => import('./pages/customers/CustomerList') },
  { pattern: '/customers/:id/:tab?', permission: 'accounts:read', load: () => import('./pages/customers/Customer360') },
  { pattern: '/services', permission: 'services:read', load: () => import('./pages/services/ServiceList') },
  { pattern: '/services/:id/migrate', permission: 'services:read', load: () => import('./pages/services/MigrationWizard') },
  { pattern: '/services/:id/:tab?', permission: 'services:read', load: () => import('./pages/services/ServiceDetail') },
  { pattern: '/orders', permission: 'accounts:read', load: () => import('./pages/orders/OrderList') },
  { pattern: '/orders/:id', permission: 'accounts:read', load: () => import('./pages/orders/OrderDetail') },
  { pattern: '/billing', permission: 'accounts:read', load: () => import('./pages/billing/BillingOverview') },
  { pattern: '/billing/invoices', permission: 'accounts:read', load: () => import('./pages/billing/InvoiceList') },
  { pattern: '/billing/invoices/:id', permission: 'accounts:read', load: () => import('./pages/billing/InvoiceDetail') },
  { pattern: '/billing/transactions', permission: 'accounts:read', load: () => import('./pages/billing/TransactionList') },
  { pattern: '/billing/transactions/:id', permission: 'accounts:read', load: () => import('./pages/billing/TransactionDetail') },
  { pattern: '/billing/subscriptions', permission: 'accounts:read', load: () => import('./pages/billing/SubscriptionList') },
  { pattern: '/billing/refunds', permission: 'accounts:read', load: () => import('./pages/billing/RefundList') },
  { pattern: '/billing/refunds/:id', permission: 'accounts:read', load: () => import('./pages/billing/RefundDetail') },
  { pattern: '/billing/reports', permission: 'accounts:read', load: () => import('./pages/billing/Reports') },
  { pattern: '/products', permission: 'catalog:read', load: () => import('./pages/products/ProductCatalog') },
  { pattern: '/products/plans', permission: 'catalog:read', load: () => import('./pages/products/PlanList') },
  { pattern: '/products/plans/:id', permission: 'catalog:read', load: () => import('./pages/products/PlanBuilder') },
  { pattern: '/products/pricing', permission: 'catalog:read', load: () => import('./pages/products/PricingRules') },
  { pattern: '/products/coupons', permission: 'catalog:read', load: () => import('./pages/products/Coupons') },
  { pattern: '/products/inventory', permission: 'catalog:read', load: () => import('./pages/products/ProviderInventory') },
  { pattern: '/products/:id', permission: 'catalog:read', load: () => import('./pages/products/ProductEditor') },
];
