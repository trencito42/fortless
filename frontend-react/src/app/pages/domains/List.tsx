import { Button, ButtonGroup, DataTable, StatusBadge, Switch, type ColumnDef } from '@/design-system';
import { domainStatus } from '@/features';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { useNavigate } from '../../router';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { date, daysUntil, money } from '../../format';
import type { DomainRecord, DomainState } from '../../domain/types';

const UI: Record<DomainState, keyof typeof domainStatus> = { active: 'active', expiring: 'expiring', expired: 'expired', 'pending-transfer': 'transfer', 'pending-registration': 'pending' };

export default function Domains() {
  const nav = useNavigate(); const api = useApi();
  const res = useApiQuery((a) => a.listDomains());
  const columns: ColumnDef<DomainRecord, unknown>[] = [
    { accessorKey: 'name', header: 'Domain', meta: { primary: true }, cell: (c) => <button type="button" className="font-bold hover:text-accent-ink" onClick={() => nav(`/app/domains/${c.row.original.name}`)}>{c.row.original.name}</button> },
    { accessorKey: 'state', header: 'Status', cell: (c) => { const s = domainStatus[UI[c.row.original.state]]; return <StatusBadge tone={s.tone} live={'live' in s ? s.live : false}>{s.label}</StatusBadge>; } },
    { id: 'expires', header: 'Expires', accessorFn: (d) => d.expiresOn, cell: (c) => <span>{date(c.row.original.expiresOn)}<span className="block text-[13px] text-ink3">in {daysUntil(c.row.original.expiresOn)} days</span></span> },
    { id: 'renew', header: 'Auto-renew', enableSorting: false, cell: (c) => <Switch label={`Auto-renew ${c.row.original.name}`} hideLabel checked={c.row.original.autoRenew} onCheckedChange={(on) => void api.setDomainAutoRenew(c.row.original.name, on)} /> },
    { id: 'price', header: 'Renewal', accessorFn: (d) => d.renewPrice.amount, meta: { numeric: true, hideOnMobile: true }, cell: (c) => money(c.row.original.renewPrice) },
    { id: 'act', header: '', enableSorting: false, cell: (c) => <Button size="sm" variant="secondary" onClick={() => nav(`/app/domains/${c.row.original.name}`)}>Manage</Button> },
  ];
  return (
    <div className="grid gap-5">
      <PageHeader title="Domains & DNS" description="Your domains, renewals and DNS records." actions={<ButtonGroup aria-label="Domain actions"><Button variant="primary" leadingIcon="add-01" onClick={() => nav('/app/domains/search')}>Register a domain</Button></ButtonGroup>} />
      <CapabilityNote area="domains" />
      <DataTable data={res.status === 'ready' ? res.data : []} columns={columns} getRowId={(d) => d.id} caption="Domains" loading={res.status === 'loading'} error={res.status === 'error' ? res.error : undefined} onRetry={res.reload} searchable searchPlaceholder="Search domains"
        empty={{ title: 'No domains yet', description: 'Register a domain or point one you already own at your servers.', action: <Button variant="primary" onClick={() => nav('/app/domains/search')}>Find a domain</Button> }} />
    </div>
  );
}
