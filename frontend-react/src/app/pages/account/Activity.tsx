import { Button } from '@/design-system';
import { AuditTrail } from '@/features';
import { useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';

export default function Activity() {
  const res = useApiQuery((a) => a.activity());
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Audit trail"
        description="Who did what on this account. Entries cannot be edited or removed."
        crumbs={[{ label: 'Account', to: '/app/account' }, { label: 'Audit trail' }]}
        actions={<Button variant="secondary" leadingIcon="download-01" onClick={() => { window.location.assign('/api/v1/activity/export'); }}>Export CSV</Button>}
      />
      <CapabilityNote area="account" />
      <AuditTrail events={res.status === 'ready' ? res.data.map((a) => ({ id: a.id, at: a.at, actor: a.actor, action: a.action, target: a.target ?? '—', outcome: a.outcome, ip: a.ip })) : []} loading={res.status === 'loading'} error={res.status === 'error' ? res.error : undefined} onRetry={res.reload} />
    </div>
  );
}
