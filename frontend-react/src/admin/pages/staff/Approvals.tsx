import { Badge, Button, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid } from '../../components/Cards';
import { col, nw } from '../../components/cols';
import { Status, approvalStatus } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { iso, relative, title } from '../../lib/format';
import type { ApprovalRequest, StaffPermission } from '../../types';

const NEEDS: Record<ApprovalRequest['kind'], StaffPermission> = { large_refund: 'accounts:manage', destructive_operation: 'services:manage', permission_change: 'staff:manage', sensitive_account_change: 'accounts:manage' };

export default function Approvals() {
  const { data, patch, audit } = useAdmin();
  const { can, staffName } = useSession();
  const act = useActionDialog();
  const decide = (a: ApprovalRequest, d: 'approved' | 'rejected') => act.run({ title: d === 'approved' ? 'Approve request' : 'Reject request', description: a.summary, confirmLabel: d === 'approved' ? 'Approve' : 'Reject', permission: NEEDS[a.kind], stepUp: true, tone: d === 'rejected' ? 'danger' : 'default', reasonRequired: true, reasonLabel: d === 'approved' ? 'Why is this acceptable?' : 'Why not?',
    onConfirm: ({ reason }) => { patch('approvals', a.id, { status: d, decidedBy: staffName, decidedAt: iso(0), reason }); if (a.resource.type === 'refund') { patch('refunds', a.resource.id, { status: d === 'approved' ? 'processed' : 'rejected', approvedBy: staffName }); } audit(`approval.${d}`, { type: 'approval', id: a.id, label: a.summary }, { reason }); return `Request ${d}`; } });
  const seg = (v: string, label: string, test: (a: ApprovalRequest) => boolean) => ({ value: v, label, test });
  return (
    <AdminPage title="Approval requests" description="Sensitive changes that need a second person: large refunds, destructive operations, permission changes and sensitive account edits.">
      <Notice tone="warn" title="Planned control, enforced only in this preview">The backend has no approval queue yet. Large refunds and permission changes here show how it should work; production endpoints currently rely on role permission plus step-up only.</Notice>
      <KpiGrid cols={3} items={[{ label: 'Pending', value: data.approvals.filter((a) => a.status === 'pending').length, icon: 'hourglass' }, { label: 'Approved (all time)', value: data.approvals.filter((a) => a.status === 'approved').length, icon: 'tick-02' }, { label: 'Rejected', value: data.approvals.filter((a) => a.status === 'rejected').length, icon: 'cancel-01' }]} />
      <ResourceTable<ApprovalRequest>
        tableId="approvals" caption="Approval requests" rows={data.approvals} getRowId={(a) => a.id} rowLabel={(a) => a.id} searchText={(a) => `${a.summary} ${a.requestedBy} ${a.id}`}
        segments={[seg('pending', 'Pending', (a) => a.status === 'pending'), seg('approved', 'Approved', (a) => a.status === 'approved'), seg('rejected', 'Rejected', (a) => a.status === 'rejected'), seg('all', 'All', () => true)]}
        filters={[{ id: 'kind', label: 'Kind', options: Object.keys(NEEDS).map((k) => ({ value: k, label: title(k) })), test: (a, v) => a.kind === v }]}
        columns={[
          col<ApprovalRequest>('s', 'Request', (a) => <span className="grid md:min-w-[16rem] max-w-[30rem]"><b>{a.summary}</b><span className="text-[12.5px] text-ink3"><EntityLink to={a.resource.to}>{a.resource.label}</EntityLink> · {a.id}</span></span>, { primary: true, sort: (a) => a.summary }),
          col<ApprovalRequest>('k', 'Kind', (a) => <Badge>{title(a.kind)}</Badge>, { sort: (a) => a.kind }),
          col<ApprovalRequest>('st', 'Status', (a) => <Status map={approvalStatus} value={a.status} />, { sort: (a) => a.status }),
          col<ApprovalRequest>('a', 'Amount', (a) => (a.amount ? <MoneyText value={a.amount} /> : '—'), { numeric: true, hideOnMobile: true }),
          col<ApprovalRequest>('rb', 'Requested by', (a) => a.requestedBy, { sort: (a) => a.requestedBy }),
          col<ApprovalRequest>('t', 'When', (a) => nw(relative(a.requestedAt)), { sort: (a) => a.requestedAt }),
          col<ApprovalRequest>('d', 'Decision', (a) => (a.decidedBy ? <span className="grid"><span>{a.decidedBy}</span><span className="max-w-[16rem] truncate text-[12.5px] text-ink3" title={a.reason ?? ''}>{a.reason}</span></span> : (a.status === 'pending' ? <span className="flex gap-1"><Button size="sm" variant="primary" disabled={!can(NEEDS[a.kind]) || a.requestedBy === staffName} title={a.requestedBy === staffName ? 'You cannot approve your own request' : !can(NEEDS[a.kind]) ? `Requires ${NEEDS[a.kind]}` : undefined} onClick={() => decide(a, 'approved')}>Approve…</Button><Button size="sm" variant="danger-subtle" disabled={!can(NEEDS[a.kind]) || a.requestedBy === staffName} onClick={() => decide(a, 'rejected')}>Reject…</Button></span> : '—'))),
        ]}
        empty={{ title: 'Nothing waiting', description: 'No requests in this view.' }}
      />
      <PreviewNote>Approvers need the permission the request touches and cannot approve their own request. Both rules are shown on the buttons.</PreviewNote>
      {act.node}
    </AdminPage>
  );
}
