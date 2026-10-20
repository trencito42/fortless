import { useMemo, useState } from 'react';
import { Button, DataTable, SegmentedControl, StatusBadge, type ColumnDef } from '@/design-system';
import { ticketStatus, type TicketState as UiState } from '@/features';
import { useApiQuery } from '../../data/DataProvider';
import { useNavigate } from '../../router';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { relative } from '../../format';
import type { TicketRecord } from '../../domain/types';

export const toUiState = (s: TicketRecord['state']): UiState => (s === 'awaiting-customer' ? 'waiting' : s);
type Filter = 'all' | 'active' | 'closed';

export default function Inbox() {
  const nav = useNavigate();
  const res = useApiQuery((a) => a.listTickets());
  const [filter, setFilter] = useState<Filter>('active');
  const rows = useMemo(() => (res.status === 'ready' ? res.data.filter((t) => filter === 'all' || (filter === 'closed') === (t.state === 'closed')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : []), [res, filter]);
  const columns: ColumnDef<TicketRecord, unknown>[] = [
    { accessorKey: 'subject', header: 'Subject', meta: { primary: true }, cell: (c) => { const t = c.row.original; return <button type="button" className="min-w-0 text-left" onClick={() => nav(`/app/support/${t.id}`)}><span className="block truncate font-bold hover:text-accent-ink">{t.unread ? <span className="mr-2 inline-block size-2 rounded-full bg-accent align-middle" aria-label="Unread" /> : null}{t.subject}</span><span className="block text-[13px] text-ink3">{t.number} · {t.department}{t.serviceName ? ` · ${t.serviceName}` : ''}</span></button>; } },
    { accessorKey: 'state', header: 'Status', cell: (c) => { const s = ticketStatus[toUiState(c.row.original.state)]; return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>; } },
    { accessorKey: 'priority', header: 'Priority', meta: { hideOnMobile: true }, cell: (c) => <span className="capitalize">{c.row.original.priority}</span> },
    { id: 'updated', header: 'Last update', accessorFn: (t) => t.updatedAt, cell: (c) => relative(c.row.original.updatedAt) },
  ];
  return (
    <div className="grid gap-5">
      <PageHeader title="Support" description="Your tickets with the Fortless team. We reply within a few hours on weekdays." actions={<Button variant="primary" leadingIcon="add-01" onClick={() => nav('/app/support/new')}>New ticket</Button>} />
      <CapabilityNote area="support" />
      <DataTable data={rows} columns={columns} getRowId={(t) => t.id} caption="Tickets" loading={res.status === 'loading'} error={res.status === 'error' ? res.error : undefined} onRetry={res.reload} searchable searchPlaceholder="Search tickets" onRowClick={(t) => nav(`/app/support/${t.id}`)} rowLabel={(t) => t.subject}
        toolbar={<SegmentedControl<Filter> aria-label="Ticket filter" value={filter} onValueChange={setFilter} options={[{ value: 'active', label: 'Active' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />}
        empty={{ title: filter === 'closed' ? 'No closed tickets' : 'No open tickets', description: 'Need help? Open a ticket and attach logs or screenshots.', action: <Button variant="primary" onClick={() => nav('/app/support/new')}>New ticket</Button> }} />
    </div>
  );
}
