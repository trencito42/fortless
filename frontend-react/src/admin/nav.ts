import type { NavGroup, MobileTab } from '@/design-system';
import type { StaffPermission } from './types';

/** Admin navigation. Ids are paths below /admin-preview. `permission` uses the real backend permission names. */
export const ADMIN_NAV: NavGroup[] = [
  { id: 'overview', label: 'Overview', items: [
    { id: '/', label: 'Dashboard', icon: 'dashboard-square-01', keywords: ['home', 'overview', 'kpi'] },
    { id: '/actions', label: 'Action Center', icon: 'flash', keywords: ['queue', 'inbox', 'alerts', 'todo'] },
  ] },
  { id: 'business', label: 'Business', items: [
    { id: '/customers', label: 'Customers', icon: 'user-group', permission: 'accounts:read', keywords: ['accounts', 'clients', 'organizations'] },
    { id: '/services', label: 'Services', icon: 'server', permission: 'services:read', keywords: ['servers', 'instances', 'inventory'] },
    { id: '/orders', label: 'Orders', icon: 'shopping-cart-01', permission: 'accounts:read', keywords: ['checkout', 'fulfillment'] },
    { id: 'billing', label: 'Billing & Payments', icon: 'invoice-01', permission: 'accounts:read', keywords: ['invoices', 'stripe', 'refunds'], children: [
      { id: '/billing', label: 'Overview' }, { id: '/billing/invoices', label: 'Invoices' }, { id: '/billing/transactions', label: 'Transactions' }, { id: '/billing/subscriptions', label: 'Subscriptions & renewals' },
      { id: '/billing/refunds', label: 'Refunds & credit notes' }, { id: '/billing/reports', label: 'Reports' },
    ] },
    { id: 'products', label: 'Products & Pricing', icon: 'package', permission: 'catalog:read', keywords: ['catalog', 'plans', 'coupons'], children: [
      { id: '/products', label: 'Catalog' }, { id: '/products/plans', label: 'Plans & builder' }, { id: '/products/pricing', label: 'Pricing rules' }, { id: '/products/coupons', label: 'Coupons & promotions' }, { id: '/products/inventory', label: 'Provider inventory' },
    ] },
  ] },
  { id: 'operations', label: 'Operations', items: [
    { id: 'infrastructure', label: 'Infrastructure', icon: 'cpu', permission: 'services:read', keywords: ['nodes', 'capacity', 'wings'], children: [
      { id: '/infrastructure', label: 'Overview' }, { id: '/infrastructure/nodes', label: 'Nodes' }, { id: '/infrastructure/capacity', label: 'Capacity & profitability' }, { id: '/infrastructure/allocations', label: 'IPs & allocations' },
      { id: '/infrastructure/maintenance', label: 'Node maintenance' }, { id: '/infrastructure/providers', label: 'Provider connections' },
    ] },
    { id: 'provisioning', label: 'Provisioning & Jobs', icon: 'layers-01', permission: 'audit:read', keywords: ['queue', 'workers', 'webhooks'], children: [
      { id: '/provisioning/jobs', label: 'Job queue' }, { id: '/provisioning/timeline', label: 'Order → service timeline' }, { id: '/provisioning/workers', label: 'Workers' }, { id: '/provisioning/webhooks', label: 'Webhook events' },
    ] },
    { id: 'monitoring', label: 'Monitoring & Status', icon: 'activity-01', permission: 'services:read', keywords: ['incidents', 'uptime', 'status page'], children: [
      { id: '/monitoring', label: 'Overview' }, { id: '/monitoring/components', label: 'Component health' }, { id: '/monitoring/incidents', label: 'Incidents' }, { id: '/monitoring/maintenance', label: 'Scheduled maintenance' }, { id: '/monitoring/public', label: 'Public status page' },
    ] },
  ] },
  { id: 'experience', label: 'Customer experience', items: [
    { id: 'support', label: 'Support Center', icon: 'message-01', permission: 'tickets:read', keywords: ['tickets', 'inbox', 'helpdesk'], children: [
      { id: '/support', label: 'Inbox' }, { id: '/support/departments', label: 'Departments' }, { id: '/support/macros', label: 'Macros' }, { id: '/support/performance', label: 'Performance' },
    ] },
    { id: 'content', label: 'Content & Website', icon: 'book-01', permission: 'content:read', keywords: ['knowledge base', 'cms', 'legal'], children: [
      { id: '/content', label: 'Overview' }, { id: '/content/knowledge', label: 'Knowledge base' }, { id: '/content/announcements', label: 'Announcements' }, { id: '/content/pages', label: 'Marketing pages' }, { id: '/content/legal', label: 'Legal pages' },
    ] },
    { id: 'marketing', label: 'Marketing', icon: 'bulb', permission: 'content:read', keywords: ['campaigns', 'promotions', 'referral'], children: [
      { id: '/marketing', label: 'Overview' }, { id: '/marketing/campaigns', label: 'Campaigns' }, { id: '/marketing/promotions', label: 'Promotions & coupons' }, { id: '/marketing/referrals', label: 'Referrals & affiliates' }, { id: '/marketing/analytics', label: 'Conversion analytics' },
    ] },
  ] },
  { id: 'system', label: 'System', items: [
    { id: 'staff', label: 'Staff & Permissions', icon: 'shield-user', permission: 'staff:read', keywords: ['roles', 'mfa', 'approvals'], children: [
      { id: '/staff', label: 'Directory' }, { id: '/staff/roles', label: 'Roles & permissions' }, { id: '/staff/approvals', label: 'Approval requests' }, { id: '/staff/sessions', label: 'Sessions & security' },
    ] },
    { id: 'audit', label: 'Audit & Security', icon: 'lock', permission: 'audit:read', keywords: ['log', 'security', 'policy'], children: [
      { id: '/audit', label: 'Audit log' }, { id: '/audit/security', label: 'Security events' }, { id: '/audit/access', label: 'Admin access history' }, { id: '/audit/policy', label: 'Security policy' },
    ] },
    { id: 'settings', label: 'Platform Settings', icon: 'settings-01', permission: 'admin:access', keywords: ['configuration', 'stripe', 'smtp'], children: [
      { id: '/settings', label: 'General' }, { id: '/settings/auth', label: 'Authentication & security' }, { id: '/settings/payments', label: 'Payments' }, { id: '/settings/email', label: 'Email' }, { id: '/settings/integrations', label: 'Integrations' },
      { id: '/settings/flags', label: 'Feature flags' }, { id: '/settings/notifications', label: 'Notifications' }, { id: '/settings/localization', label: 'Localization' }, { id: '/settings/system', label: 'Maintenance & system health' },
    ] },
  ] },
];

export const ADMIN_TABS: MobileTab[] = [
  { id: '/', label: 'Home', icon: 'home-01' },
  { id: '/actions', label: 'Actions', icon: 'flash' },
  { id: '/customers', label: 'Customers', icon: 'user-group' },
  { id: '/support', label: 'Support', icon: 'message-01' },
  { id: 'more', label: 'More', icon: 'menu-02' },
];

const allIds = () => { const ids: string[] = []; for (const g of ADMIN_NAV) for (const i of g.items) { ids.push(i.id); for (const c of i.children ?? []) ids.push(c.id); } return ids; };
/** Longest nav id that prefixes the path, so /customers/acc_0001/billing highlights Customers. */
export function currentNavId(path: string): string {
  return allIds().filter((id) => id.startsWith('/') && (id === '/' ? path === '/' : path === id || path.startsWith(`${id}/`))).sort((a, b) => b.length - a.length)[0] ?? '/';
}
/** Group, section and page labels for the nav id, used as the default breadcrumb. */
export function navTrail(id: string): Array<{ label: string; to?: string }> {
  for (const g of ADMIN_NAV) for (const i of g.items) {
    const child = i.children?.find((c) => c.id === id);
    if (child) return [{ label: i.label, to: i.children![0]!.id }, { label: child.label, to: child.id }];
    if (i.id === id) return [{ label: i.label, to: i.id }];
  }
  return [];
}
export const permissionOf = (id: string): StaffPermission | undefined => { for (const g of ADMIN_NAV) for (const i of g.items) if (i.id === id || i.children?.some((c) => c.id === id)) return i.permission as StaffPermission | undefined; return undefined; };
