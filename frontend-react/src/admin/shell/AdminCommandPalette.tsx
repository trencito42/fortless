import { useMemo } from 'react';
import { CommandPalette, type PaletteCommand } from '@/design-system';
import { ADMIN_NAV } from '../nav';
import { useAdmin } from '../store';
import { useNav } from '../router';
import { useSession } from '../session';

export const QUICK_ACTIONS = [
  { id: 'qa-incident', label: 'Declare an incident', to: '/monitoring/incidents/new', icon: 'alert-01', permission: 'services:manage', live: true },
  { id: 'qa-maint', label: 'Schedule maintenance', to: '/monitoring/maintenance/new', icon: 'calendar-01', permission: 'services:manage' },
  { id: 'qa-coupon', label: 'Create a coupon', to: '/products/coupons?new=1', icon: 'tag-01', permission: 'catalog:manage' },
  { id: 'qa-product', label: 'Create a product', to: '/products/new', icon: 'package', permission: 'catalog:manage' },
  { id: 'qa-plan', label: 'Open the plan builder', to: '/products/plans/new', icon: 'sliders-horizontal', permission: 'catalog:manage' },
  { id: 'qa-announce', label: 'Write an announcement', to: '/content/announcements?new=1', icon: 'notification-01', permission: 'content:manage', live: true },
  { id: 'qa-article', label: 'Write a knowledge-base article', to: '/content/knowledge/new', icon: 'book-01', permission: 'content:manage', live: true },
  { id: 'qa-staff', label: 'Grant staff access', to: '/staff?invite=1', icon: 'user-add-01', permission: 'staff:manage', live: true },
] as const;

/** Ctrl/Cmd+K over pages, quick actions and every customer, service, order, invoice, ticket, node, job and incident in the demo data. */
export function AdminCommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = useAdmin();
  const nav = useNav();
  const { can, live } = useSession();
  const commands = useMemo<PaletteCommand[]>(() => {
    const out: PaletteCommand[] = [];
    for (const g of ADMIN_NAV) for (const i of g.items) {
      if (i.permission && !can(i.permission as never)) continue;
      if (!i.children?.length) out.push({ id: `nav:${i.id}`, label: i.label, section: 'Go to', icon: i.icon, keywords: [g.label ?? '', ...(i.keywords ?? [])], run: () => nav(i.id) });
      else for (const c of i.children) out.push({ id: `nav:${c.id}`, label: c.id === i.children[0]!.id ? i.label + (i.children[0]!.label === 'Overview' ? '' : `: ${c.label}`) : `${i.label}: ${c.label}`, section: 'Go to', icon: i.icon, keywords: [g.label ?? '', c.label, ...(i.keywords ?? [])], run: () => nav(c.id) });
    }
    for (const a of QUICK_ACTIONS) if (can(a.permission) && (!live || 'live' in a && a.live)) out.push({ id: a.id, label: a.label, section: 'Quick actions', icon: a.icon, run: () => nav(a.to) });
    const cust = new Map(data.customers.map((c) => [c.id, c.name]));
    if (can('accounts:read')) {
      for (const c of data.customers) out.push({ id: `c:${c.id}`, label: c.name, section: 'Customers', icon: 'user', hint: c.id, keywords: [c.email, c.id, c.country], run: () => nav(`/customers/${c.id}`) });
    }
    if (can('services:read')) for (const s of data.services) out.push({ id: `s:${s.id}`, label: s.name, section: 'Services', icon: 'server', hint: `${s.id} · ${cust.get(s.customerId) ?? ''}`, keywords: [s.id, s.ip, s.provider.identifier, cust.get(s.customerId) ?? ''], run: () => nav(`/services/${s.id}`) });
    if (can('accounts:read')) {
      for (const o of data.orders) out.push({ id: `o:${o.id}`, label: o.id, section: 'Orders', icon: 'shopping-cart-01', hint: `${o.status} · ${cust.get(o.customerId) ?? ''}`, keywords: [o.status, cust.get(o.customerId) ?? '', o.quoteId], run: () => nav(`/orders/${o.id}`) });
      for (const i of data.invoices) out.push({ id: `i:${i.id}`, label: i.number, section: 'Invoices', icon: 'invoice-01', hint: `${i.status} · ${cust.get(i.customerId) ?? ''}`, keywords: [i.id, cust.get(i.customerId) ?? ''], run: () => nav(`/billing/invoices/${i.id}`) });
    }
    if (can('tickets:read')) for (const t of data.tickets) out.push({ id: `t:${t.id}`, label: `${t.id} · ${t.subject}`, section: 'Tickets', icon: 'message-01', hint: cust.get(t.customerId) ?? '', keywords: [cust.get(t.customerId) ?? ''], run: () => nav(`/support/tickets/${t.id}`) });
    if (can('services:read')) for (const n of data.nodes) out.push({ id: `n:${n.id}`, label: n.name, section: 'Nodes', icon: 'cpu', hint: n.id, keywords: [n.id, n.region], run: () => nav(`/infrastructure/nodes/${n.id}`) });
    if (can('audit:read')) for (const j of data.jobs.slice(0, 200)) out.push({ id: `j:${j.id}`, label: `${j.id} · ${j.type}`, section: 'Jobs', icon: 'layers-01', hint: j.status, keywords: [j.status, j.correlationId], run: () => nav(`/provisioning/jobs/${j.id}`) });
    if (can('services:read')) for (const i of data.incidents) out.push({ id: `inc:${i.id}`, label: i.title, section: 'Incidents', icon: 'alert-01', hint: i.status, keywords: [i.id], run: () => nav(`/monitoring/incidents/${i.id}`) });
    return out;
  }, [data, nav, can, live]);
  return <CommandPalette commands={commands} open={open} onOpenChange={onOpenChange} placeholder="Search customers, services, orders, invoices, tickets, nodes, jobs, pages" maxResults={40} idleFilter={(c) => c.section === 'Quick actions' || c.section === 'Go to'} footer="Type to search records. Enter opens, Esc closes." />;
}
