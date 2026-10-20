import type { MobileTab, NavGroup } from '@/design-system';

/** Customer navigation. Ids are URL paths. There is deliberately no admin or staff section. */
export const NAV: NavGroup[] = [
  { id: 'overview', items: [{ id: '/app', label: 'Dashboard', icon: 'dashboard-square-01', keywords: ['home', 'overview'] }] },
  {
    id: 'infra', label: 'Infrastructure',
    items: [
      { id: '/app/services', label: 'Servers & instances', icon: 'server', keywords: ['minecraft', 'cs', 'bot', 'nodejs'], children: [{ id: '/app/services', label: 'All services' }, { id: '/app/deploy', label: 'Deploy new', keywords: ['order', 'create'] }] },
      { id: '/app/domains', label: 'Domains & DNS', icon: 'globe-02', keywords: ['dns', 'nameserver'], children: [{ id: '/app/domains', label: 'My domains' }, { id: '/app/domains/search', label: 'Register a domain', keywords: ['search', 'transfer'] }] },
      { id: '/app/usage', label: 'Usage', icon: 'analytics-01', keywords: ['cpu', 'ram', 'bandwidth', 'metrics'] },
    ],
  },
  {
    id: 'commerce', label: 'Billing & support',
    items: [
      { id: '/app/billing', label: 'Billing', icon: 'invoice-01', keywords: ['invoice', 'payment'], children: [{ id: '/app/billing', label: 'Overview' }, { id: '/app/billing/invoices', label: 'Invoices' }, { id: '/app/billing/subscriptions', label: 'Subscriptions' }, { id: '/app/billing/orders', label: 'Orders' }, { id: '/app/billing/cart', label: 'Cart' }, { id: '/app/billing/plans', label: 'Plans & pricing' }, { id: '/app/billing/payment-methods', label: 'Payment methods' }, { id: '/app/billing/profile', label: 'Billing profile', keywords: ['vat', 'tax'] }] },
      { id: '/app/support', label: 'Support', icon: 'message-01', keywords: ['ticket', 'help'], children: [{ id: '/app/support', label: 'Tickets' }, { id: '/app/support/new', label: 'New ticket' }] },
    ],
  },
  {
    id: 'account', label: 'Account',
    items: [
      { id: '/app/account', label: 'Account', icon: 'shield-user', keywords: ['profile', 'security', 'mfa'], children: [{ id: '/app/account', label: 'Profile' }, { id: '/app/account/security', label: 'Security' }, { id: '/app/account/api-keys', label: 'API keys' }, { id: '/app/account/team', label: 'Team' }, { id: '/app/account/notifications', label: 'Notifications' }, { id: '/app/account/activity', label: 'Audit trail', keywords: ['log', 'history'] }] },
      { id: '/app/announcements', label: 'Announcements', icon: 'notification-01', keywords: ['maintenance', 'incident'] },
      { id: '/app/knowledge', label: 'Knowledge base', icon: 'book-01', keywords: ['docs', 'help', 'guide'] },
    ],
  },
];

export const MOBILE_TABS: MobileTab[] = [
  { id: '/app', label: 'Home', icon: 'home-01' },
  { id: '/app/services', label: 'Servers', icon: 'server' },
  { id: '/app/deploy', label: 'Deploy', icon: 'add-01', primary: true },
  { id: '/app/support', label: 'Support', icon: 'message-01' },
  { id: 'more', label: 'More', icon: 'menu-02' },
];

/** Longest nav id that is a prefix of the current path, so /app/services/svc_1/files highlights Servers & instances. */
export function currentNavId(path: string): string {
  const ids: string[] = [];
  for (const g of NAV) for (const i of g.items) { ids.push(i.id); for (const c of i.children ?? []) ids.push(c.id); }
  return ids.filter((id) => path === id || path.startsWith(id + '/')).sort((a, b) => b.length - a.length)[0] ?? '/app';
}
