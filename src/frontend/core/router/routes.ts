export interface RouteDefinition {
  id: string;
  path: string;
  title: string;
  subtitle?: string;
  pattern?: RegExp;
  /** The last path segment selects a tab inside the same view, so changing it must not re-render the page. */
  tabbed?: boolean;
}

export const CLIENT_ROUTES: Record<string, RouteDefinition> = {
  dashboard: {
    id: 'dashboard',
    path: '/app',
    title: 'Dashboard · FORTLESS',
    subtitle: 'Workspace overview and current account activity.',
  },
  services: {
    id: 'services',
    path: '/app/services',
    title: 'Servers & Instances · FORTLESS',
    subtitle: 'Provider-observed runtime records for this account.',
  },
  deploy: {
    id: 'deploy',
    path: '/app/deploy',
    title: 'Deploy Service · FORTLESS',
    subtitle: 'Select configuration, location, and billing cycle.',
  },
  domains: {
    id: 'domains',
    path: '/app/domains',
    title: 'Domains & DNS · FORTLESS',
    subtitle: 'Domain registration, TLD pricing catalog, and authoritative DNS zones.',
  },
  billing: {
    id: 'billing',
    path: '/app/billing',
    title: 'Billing & Invoices · FORTLESS',
    subtitle: 'Issued billing records and active subscriptions.',
  },
  tickets: {
    id: 'tickets',
    path: '/app/support',
    title: 'Support Conversations · FORTLESS',
    subtitle: 'Account-scoped support conversations. No response-time or staffing claim is implied.',
  },
  'ticket-new': {
    id: 'ticket-new',
    path: '/app/support/new',
    title: 'Open Support Ticket · FORTLESS',
    subtitle: 'Create an account-scoped support conversation.',
  },
  'ticket-detail': {
    id: 'ticket-detail',
    path: '/app/support/:id',
    title: 'Support Conversation · FORTLESS',
    subtitle: 'Account-scoped support conversation.',
    pattern: /^\/app\/support\/(?<id>[^/]+)$/,
  },
  audit: {
    id: 'audit',
    path: '/app/activity',
    title: 'Security Audit · FORTLESS',
    subtitle: 'Immutable record of authentication and account actions.',
  },
  settings: {
    id: 'settings',
    path: '/app/settings',
    title: 'Settings · FORTLESS',
    subtitle: 'Account access, active device sessions, and authentication security.',
    pattern: /^\/app\/settings\/(?<tab>[a-z-]+)$/,
    tabbed: true,
  },
  'service-detail': {
    id: 'service-detail',
    path: '/app/services/:id',
    title: 'Service Detail · FORTLESS',
    subtitle: 'Node and connection telemetry.',
    pattern: /^\/app\/services\/(?<id>[^/]+?)(?:\/(?<tab>[a-z-]+))?$/,
    tabbed: true,
  },
};

export const ADMIN_ROUTES: Record<string, RouteDefinition> = {
  overview: {
    id: 'overview',
    path: '/admin',
    title: 'Operations Overview · FORTLESS',
    subtitle: 'Real platform records, without simulated operational controls.',
  },
  accounts: {
    id: 'accounts',
    path: '/admin/accounts',
    title: 'Customer Accounts · FORTLESS',
    subtitle: 'Ownership, membership and workload counts. Click an account to inspect or lock.',
  },
  'account-detail': {
    id: 'account-detail',
    path: '/admin/accounts/:id',
    title: 'Customer Account · FORTLESS',
    subtitle: 'Account identity, access, services, billing, support and lifecycle history.',
    pattern: /^\/admin\/accounts\/(?<id>[^/]+)$/,
  },
  services: {
    id: 'services',
    path: '/admin/services',
    title: 'Service Inventory · FORTLESS',
    subtitle: 'Contract and provider-observed state.',
  },
  'admin-service-detail': {
    id: 'admin-service-detail',
    path: '/admin/services/:id',
    title: 'Service Operations · FORTLESS',
    subtitle: 'Provider state, allocation, lifecycle controls and audit history.',
    pattern: /^\/admin\/services\/(?<id>[^/]+)$/,
  },
  orders: {
    id: 'orders', path: '/admin/orders', title: 'Orders · FORTLESS', subtitle: 'Commercial order lifecycle and fulfillment state.',
  },
  'order-detail': {
    id: 'order-detail', path: '/admin/orders/:id', title: 'Order Detail · FORTLESS',
    subtitle: 'Payment, fulfillment, provisioning and related service records.',
    pattern: /^\/admin\/orders\/(?<id>[^/]+)$/,
  },
  billing: {
    id: 'billing', path: '/admin/billing', title: 'Billing Operations · FORTLESS', subtitle: 'Invoices, credit notes and payment state.',
  },
  'invoice-detail': {
    id: 'invoice-detail', path: '/admin/billing/:id', title: 'Invoice Detail · FORTLESS',
    subtitle: 'Authoritative invoice lines, payments, refunds and related services.',
    pattern: /^\/admin\/billing\/(?<id>[^/]+)$/,
  },
  infrastructure: {
    id: 'infrastructure', path: '/admin/infrastructure', title: 'Infrastructure · FORTLESS', subtitle: 'Capacity pools and provider readiness.',
  },
  catalog: {
    id: 'catalog',
    path: '/admin/catalog',
    title: 'Catalog & Providers · FORTLESS',
    subtitle: 'Commercial products mapped explicitly to provider inventory.',
  },
  tickets: {
    id: 'tickets',
    path: '/admin/tickets',
    title: 'Support Queue · FORTLESS',
    subtitle: 'Real customer threads. Click a ticket to view and reply.',
  },
  'admin-ticket-detail': {
    id: 'admin-ticket-detail',
    path: '/admin/tickets/:id',
    title: 'Support Ticket · FORTLESS',
    subtitle: 'Customer and service context, complete thread and staff actions.',
    pattern: /^\/admin\/tickets\/(?<id>[^/]+)$/,
  },
  audit: {
    id: 'audit',
    path: '/admin/audit',
    title: 'Global Audit Trail · FORTLESS',
    subtitle: 'Security-relevant events across accounts.',
  },
  staff: {
    id: 'staff',
    path: '/admin/staff',
    title: 'Staff Access · FORTLESS',
    subtitle: 'Persisted roles, access status and MFA readiness. Click to edit role.',
  },
  status: {
    id: 'status', path: '/admin/status', title: 'System Status · FORTLESS', subtitle: 'Components and customer-visible incidents.',
  },
  settings: {
    id: 'settings', path: '/admin/settings', title: 'Platform Settings · FORTLESS', subtitle: 'System integrations, provider verification, and security governance.',
  },
};
