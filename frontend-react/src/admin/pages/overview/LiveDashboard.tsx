import { useEffect, useState } from 'react';
import { Button, EmptyState, Notice, Skeleton } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { KpiGrid, Section } from '../../components/Cards';
import { adminRequest } from '../../data/http';
import { useNav } from '../../router';
import { money } from '../../lib/format';
import type { Currency } from '../../types';

interface Overview { accounts: number; activeServices: number; suspendedServices: number; pendingOrders: number; overdueInvoices: number; openTickets: number; waitingStaffTickets: number; failedProvisioningJobs: number; capacityAlerts: number; collections: Array<{ currency: Currency; amount_minor_units: number }>; capabilities: Record<string, string> }
export default function LiveDashboard() {
  const [state, setState] = useState<{ data?: Overview; error?: string }>({}); const nav = useNav();
  const load = () => { setState({}); adminRequest<Overview>('/overview').then((data) => setState({ data })).catch((error) => setState({ error: error instanceof Error ? error.message : 'Dashboard unavailable.' })); };
  useEffect(load, []);
  if (state.error) return <EmptyState tone="error" icon="alert-circle" title="Dashboard unavailable" description={state.error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />;
  if (!state.data) return <div className="grid gap-4" aria-label="Loading dashboard"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full" /></div>;
  const data = state.data;
  return <AdminPage title="Dashboard" description="Authoritative platform counts and operational queues from Fastify.">
    <KpiGrid cols={4} items={[
      { label: 'Customer accounts', value: data.accounts, icon: 'user-group', to: '/customers' }, { label: 'Active services', value: data.activeServices, icon: 'server', hint: `${data.suspendedServices} suspended`, to: '/services' },
      { label: 'Pending orders', value: data.pendingOrders, icon: 'shopping-cart-01', to: '/orders' }, { label: 'Overdue invoices', value: data.overdueInvoices, icon: 'invoice-01', to: '/billing/invoices' },
      { label: 'Support queue', value: data.openTickets, icon: 'message-01', hint: `${data.waitingStaffTickets} waiting for staff`, to: '/support' }, { label: 'Provisioning failures', value: data.failedProvisioningJobs, icon: 'alert-circle', to: '/provisioning/jobs' },
      { label: 'Capacity alerts', value: data.capacityAlerts, icon: 'cpu', to: '/infrastructure' },
    ]} />
    <div className="mt-6 grid gap-4 lg:grid-cols-2"><Section title="Collected in the last 30 days" description="Currencies remain separate."><ul className="grid gap-2">{data.collections.length ? data.collections.map((entry) => <li key={entry.currency} className="flex justify-between rounded-md bg-s2 p-3"><b>{entry.currency}</b><strong>{money({ currency: entry.currency, amount: entry.amount_minor_units })}</strong></li>) : <li className="text-ink3">No collected payments in this period.</li>}</ul></Section>
    <Section title="Integration availability">{Object.entries(data.capabilities).map(([name, value]) => <Notice key={name} tone={value === 'DISABLED' || value === 'NOT_CONFIGURED' ? 'warn' : 'good'} title={name}>{value.replaceAll('_', ' ').toLowerCase()}</Notice>)}</Section></div>
    <div className="mt-5"><Button variant="secondary" leadingIcon="flash" onClick={() => nav('/actions')}>Open Action Center</Button></div>
  </AdminPage>;
}
