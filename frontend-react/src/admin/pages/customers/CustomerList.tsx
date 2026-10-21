import { useMemo } from 'react';
import { Badge, Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col } from '../../components/cols';
import { Status, accountStatus, riskLevel } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { MoneyByCurrency } from '../../components/Money';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useCustomerStats, type CustomerStats } from '../../hooks/useStats';
import { useToast } from '../../toast';
import { useSession } from '../../session';
import { date, relative } from '../../lib/format';
import { downloadCsv } from '../../lib/csv';
import type { Customer } from '../../types';

type Row = Customer & { st: CustomerStats };

export default function CustomerList() {
  const { data, patch, audit } = useAdmin();
  const stats = useCustomerStats();
  const nav = useNav();
  const toast = useToast();
  const { can } = useSession();
  const rows = useMemo<Row[]>(() => data.customers.map((c) => ({ ...c, st: stats.get(c.id)! })), [data.customers, stats]);
  const countries = [...new Set(data.customers.map((c) => c.country))].sort();
  const outstandingNum = (r: Row) => r.st.outstanding.reduce((a, m) => a + m.amount, 0) / 100;
  return (
    <AdminPage title="Customers" description="Accounts (organizations or individuals) and the people in them. An account owns services, orders and invoices; people sign in to an account.">
      <ResourceTable<Row>
        tableId="customers" caption="Customer accounts" rows={rows} getRowId={(r) => r.id} rowLabel={(r) => r.name}
        searchText={(r) => `${r.name} ${r.email} ${r.id} ${r.country} ${r.tags.join(' ')} ${r.members.map((m) => m.email).join(' ')}`} searchPlaceholder="Search name, email, account id, tag"
        segments={[
          { value: 'all', label: 'All', test: () => true }, { value: 'ACTIVE', label: 'Active', test: (r) => r.status === 'ACTIVE' }, { value: 'PENDING_VERIFICATION', label: 'Pending', test: (r) => r.status === 'PENDING_VERIFICATION' },
          { value: 'RESTRICTED', label: 'Restricted', test: (r) => r.status === 'RESTRICTED' }, { value: 'SUSPENDED', label: 'Suspended', test: (r) => r.status === 'SUSPENDED' }, { value: 'CLOSED', label: 'Closed', test: (r) => r.status === 'CLOSED' },
        ]}
        filters={[
          { id: 'type', label: 'Type', options: [{ value: 'individual', label: 'Individual' }, { value: 'business', label: 'Business' }], test: (r, v) => r.type === v },
          { id: 'risk', label: 'Risk', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }], test: (r, v) => r.risk === v },
          { id: 'country', label: 'Country', options: countries.map((c) => ({ value: c, label: c })), test: (r, v) => r.country === v },
          { id: 'svc', label: 'Services', options: [{ value: 'some', label: 'Has active services' }, { value: 'none', label: 'No active services' }], test: (r, v) => (v === 'some' ? r.st.activeServices > 0 : r.st.activeServices === 0) },
          { id: 'bal', label: 'Balance', options: [{ value: 'owes', label: 'Owes money' }, { value: 'overdue', label: 'Has overdue invoices' }, { value: 'credit', label: 'Has credit' }], test: (r, v) => (v === 'owes' ? r.st.outstanding.length > 0 : v === 'overdue' ? r.st.overdueCount > 0 : r.creditBalance.amount > 0) },
        ]}
        dateField={{ label: 'Joined', get: (r) => r.createdAt }}
        advanced={{ fields: [{ id: 'name', label: 'Name', type: 'text' }, { id: 'services', label: 'Active services', type: 'number' }, { id: 'outstanding', label: 'Outstanding (major units, any currency)', type: 'number' }, { id: 'tag', label: 'Tag', type: 'text' }], getValue: (r, f) => (f === 'name' ? r.name : f === 'services' ? r.st.activeServices : f === 'outstanding' ? outstandingNum(r) : r.tags.join(' ')) }}
        onRowClick={(r) => nav(`/customers/${r.id}`)}
        columns={[
          col<Row>('name', 'Customer', (r) => <span className="grid min-w-0"><EntityLink to={`/customers/${r.id}`} className="truncate">{r.name}</EntityLink><span className="truncate text-[12.5px] font-medium text-ink3">{r.email}</span></span>, { sort: (r) => r.name.toLowerCase(), primary: true }),
          col<Row>('status', 'Status', (r) => <Status map={accountStatus} value={r.status} />, { sort: (r) => r.status }),
          col<Row>('type', 'Type', (r) => <Badge tone={r.type === 'business' ? 'violet' : 'neutral'}>{r.type === 'business' ? 'Business' : 'Individual'}</Badge>, { sort: (r) => r.type }),
          col<Row>('country', 'Country', (r) => r.country, { sort: (r) => r.country }),
          col<Row>('services', 'Active services', (r) => r.st.activeServices, { sort: (r) => r.st.activeServices, numeric: true }),
          col<Row>('balance', 'Outstanding', (r) => <MoneyByCurrency values={r.st.outstanding} empty="—" />, { sort: outstandingNum, numeric: true }),
          col<Row>('risk', 'Risk', (r) => <Status map={riskLevel} value={r.risk} />, { sort: (r) => ({ low: 0, medium: 1, high: 2 })[r.risk] }),
          col<Row>('created', 'Joined', (r) => date(r.createdAt), { sort: (r) => r.createdAt, hideOnMobile: true }),
          col<Row>('login', 'Last sign-in', (r) => relative(r.lastLoginAt), { sort: (r) => r.lastLoginAt ?? '', hideOnMobile: true }),
        ]}
        rowActions={(r) => [
          { id: 'open', label: 'Open Customer 360', icon: 'arrow-up-right-01', onSelect: () => nav(`/customers/${r.id}`) },
          { id: 'svc', label: 'View services', icon: 'server', onSelect: () => nav(`/customers/${r.id}/services`) },
          { id: 'bill', label: 'View billing', icon: 'invoice-01', onSelect: () => nav(`/customers/${r.id}/billing`) },
          { id: 'note', label: 'Add internal note', icon: 'note-01', disabled: !can('accounts:manage'), disabledReason: 'Requires accounts:manage', onSelect: () => nav(`/customers/${r.id}/notes`) },
        ]}
        bulkActions={(sel) => <>
          <Button size="sm" variant="secondary" disabled={!can('accounts:manage')} onClick={() => { sel.forEach((c) => { patch('customers', c.id, (cur) => ({ tags: cur.tags.includes('review') ? cur.tags : [...cur.tags, 'review'] })); audit('account.tagged', { type: 'account', id: c.id, label: c.name }, { accountId: c.id, after: { tag: 'review' } }); }); toast({ tone: 'good', title: `${sel.length} accounts tagged “review” (preview)` }); }}>Tag for review</Button>
          <Button size="sm" variant="secondary" onClick={() => downloadCsv('customers-demo.csv', ['id', 'name', 'email', 'status', 'country', 'active_services'], sel.map((c) => [c.id, c.name, c.email, c.status, c.country, c.st.activeServices]))}>Export CSV</Button>
        </>}
        empty={{ title: 'No customers', description: 'Customers appear here after registration.' }}
      />
    </AdminPage>
  );
}
