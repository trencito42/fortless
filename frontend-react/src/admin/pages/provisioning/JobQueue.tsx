import { Badge, Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid } from '../../components/Cards';
import { col, nw } from '../../components/cols';
import { Status, jobStatus } from '../../components/status';
import { JobLink, NodeLink, OrderLink, ServiceLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { relative, title } from '../../lib/format';
import type { Job } from '../../types';
import { useJobOps } from './jobOps';

export default function JobQueue() {
  const { data } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const ops = useJobOps();
  const m = can('services:manage');
  const seg = (v: string, label: string, test: (j: Job) => boolean) => ({ value: v, label, test });
  const types = [...new Set(data.jobs.map((j) => j.type))].sort();
  const bad = data.jobs.filter((j) => j.status === 'failed' || j.status === 'dead_letter' || j.status === 'manual_review');
  return (
    <AdminPage title="Job queue" description="Everything background workers do: provisioning, renewals, syncs, email. Jobs are idempotent and keyed by a correlation tag; a provider timeout is an unknown outcome, not a failure.">
      <KpiGrid cols={5} items={[{ label: 'Pending', value: data.jobs.filter((j) => j.status === 'pending').length }, { label: 'Running', value: data.jobs.filter((j) => j.status === 'running').length }, { label: 'Failed', value: data.jobs.filter((j) => j.status === 'failed').length, hint: 'Will retry' }, { label: 'Dead letter', value: data.jobs.filter((j) => j.status === 'dead_letter').length, hint: 'Retries exhausted' }, { label: 'Manual review', value: data.jobs.filter((j) => j.status === 'manual_review').length, hint: `${data.jobs.filter((j) => j.unknownOutcome).length} with unknown outcome` }]} />
      <ResourceTable<Job>
        tableId="jobs" caption="Jobs" rows={data.jobs} getRowId={(j) => j.id} rowLabel={(j) => j.id} searchText={(j) => `${j.id} ${j.type} ${j.correlationId} ${j.orderId ?? ''} ${j.serviceId ?? ''} ${j.error?.code ?? ''}`} searchPlaceholder="Search job id, type, correlation id, order, error"
        segments={[seg('all', 'All', () => true), seg('attention', `Needs attention (${bad.length})`, (j) => bad.includes(j)), seg('pending', 'Pending', (j) => j.status === 'pending'), seg('running', 'Running', (j) => j.status === 'running'), seg('completed', 'Completed', (j) => j.status === 'completed'), seg('failed', 'Failed', (j) => j.status === 'failed'), seg('dead_letter', 'Dead letter', (j) => j.status === 'dead_letter'), seg('manual_review', 'Manual review', (j) => j.status === 'manual_review')]}
        defaultSegment="attention"
        filters={[{ id: 'type', label: 'Type', options: types.map((t) => ({ value: t, label: title(t.toLowerCase()) })), test: (j, v) => j.type === v }, { id: 'unk', label: 'Outcome', options: [{ value: 'unknown', label: 'Unknown outcome' }], test: (j) => j.unknownOutcome }, { id: 'node', label: 'Node', options: data.nodes.map((n) => ({ value: n.id, label: n.name })), test: (j, v) => j.nodeId === v }]}
        dateField={{ label: 'Created', get: (j) => j.createdAt }}
        onRowClick={(j) => nav(`/provisioning/jobs/${j.id}`)}
        columns={[
          col<Job>('id', 'Job', (j) => <JobLink id={j.id} />, { primary: true, sort: (j) => j.id }),
          col<Job>('t', 'Type', (j) => <span className="whitespace-nowrap font-semibold">{title(j.type.toLowerCase())}</span>, { sort: (j) => j.type }),
          col<Job>('s', 'Status', (j) => <span className="flex flex-wrap gap-1"><Status map={jobStatus} value={j.status} />{j.unknownOutcome ? <Badge tone="warn">Unknown outcome</Badge> : null}</span>, { sort: (j) => j.status }),
          col<Job>('tg', 'Target', (j) => <span className="grid gap-0.5">{j.orderId ? <OrderLink id={j.orderId} /> : null}{j.serviceId ? <ServiceLink id={j.serviceId} showName={false} /> : null}{j.nodeId && !j.orderId && !j.serviceId ? <NodeLink id={j.nodeId} /> : null}{!j.orderId && !j.serviceId && !j.nodeId ? <span className="text-ink3">—</span> : null}</span>, { hideOnMobile: true }),
          col<Job>('a', 'Attempts', (j) => `${j.attempts}/${j.maxAttempts}`, { sort: (j) => j.attempts, numeric: true }),
          col<Job>('e', 'Error', (j) => (j.error ? <span className="font-mono text-[12.5px] text-bad">{j.error.code}</span> : '—'), { sort: (j) => j.error?.code ?? '' }),
          col<Job>('w', 'Worker', (j) => j.workerId ?? '—', { hideOnMobile: true }),
          col<Job>('c', 'Created', (j) => nw(relative(j.createdAt)), { sort: (j) => j.createdAt }),
        ]}
        rowActions={(j) => [
          { id: 'open', label: 'Open job', icon: 'arrow-up-right-01', onSelect: () => nav(`/provisioning/jobs/${j.id}`) },
          { id: 'sep', kind: 'separator' },
          { id: 'retry', label: 'Retry…', icon: 'replay', disabled: !m || !!ops.retryBlocked(j), disabledReason: !m ? 'Requires services:manage' : ops.retryBlocked(j) ?? undefined, onSelect: () => ops.retry(j) },
          { id: 'rev', label: 'Send to manual review…', icon: 'alert-01', disabled: !m || j.status === 'completed' || j.status === 'manual_review', onSelect: () => ops.review(j) },
          { id: 'can', label: 'Cancel…', icon: 'cancel-01', tone: 'danger', disabled: !m || j.status !== 'pending', disabledReason: 'Only pending jobs can be canceled', onSelect: () => ops.cancel(j) },
        ]}
        bulkActions={(sel) => <Button size="sm" variant="secondary" disabled={!m || sel.some((j) => !!ops.retryBlocked(j))} onClick={() => ops.retry(sel[0]!)}>Retry first of {sel.length}…</Button>}
        empty={{ title: 'Queue is empty' }}
      />
      <PreviewNote />
      {ops.node}
    </AdminPage>
  );
}
