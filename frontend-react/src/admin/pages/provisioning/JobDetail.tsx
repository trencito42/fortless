import { Badge, Button, DescriptionList, EmptyState, LogViewer, Notice, Timeline, type LogLine, type TimelineEvent } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section, Split } from '../../components/Cards';
import { Status, jobStatus } from '../../components/status';
import { CustomerLink, NodeLink, OrderLink, ServiceLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { dateTime, relative, title } from '../../lib/format';
import { useJobOps } from './jobOps';

export default function JobDetail({ id }: { id: string }) {
  const { data } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const ops = useJobOps();
  const j = data.jobs.find((x) => x.id === id);
  if (!j) return <AdminPage title="Job not found"><EmptyState title="No such job" action={<Button onClick={() => nav('/provisioning/jobs')}>Back to queue</Button>} /></AdminPage>;
  const m = can('services:manage');
  const blocked = ops.retryBlocked(j);
  const lines: LogLine[] = j.logs.map((l, i) => ({ id: i, text: l.message, level: l.level, time: l.at.slice(11, 19) }));
  const attempts: TimelineEvent[] = Array.from({ length: j.attempts }, (_, i): TimelineEvent => ({ id: `a${i}`, title: `Attempt ${i + 1}`, description: i === j.attempts - 1 && j.error ? `${j.error.code}: ${j.error.message}` : i === j.attempts - 1 && j.status === 'completed' ? 'Succeeded' : 'Failed; retried by the worker', time: relative(j.startedAt ?? j.createdAt), icon: 'replay', tone: i === j.attempts - 1 && j.status === 'completed' ? 'good' : i === j.attempts - 1 && j.error ? 'bad' : 'neutral' })).reverse();
  return (
    <AdminPage detail title={`${j.id} · ${title(j.type.toLowerCase())}`} crumbLabel={j.id} parents={[{ label: 'Job queue', to: '/provisioning/jobs' }]} status={<><Status map={jobStatus} value={j.status} />{j.unknownOutcome ? <Badge tone="warn">Unknown outcome</Badge> : null}</>} description={`Created ${relative(j.createdAt)} · attempt ${j.attempts} of ${j.maxAttempts}`}
      actions={<>{j.unknownOutcome ? <Button variant="primary" leadingIcon="search-01" disabled={!m} onClick={() => ops.resolveUnknown(j)}>Resolve unknown outcome…</Button> : null}<Button variant={j.unknownOutcome ? 'secondary' : 'primary'} leadingIcon="replay" disabled={!m || !!blocked} title={blocked ?? undefined} onClick={() => ops.retry(j)}>Retry…</Button><Button variant="secondary" disabled={!m || j.status === 'completed' || j.status === 'manual_review'} onClick={() => ops.review(j)}>Manual review…</Button>{j.status === 'pending' ? <Button variant="danger-subtle" disabled={!m} onClick={() => ops.cancel(j)}>Cancel…</Button> : null}</>}>
      {j.unknownOutcome ? <Notice tone="warn" title="The provider may have created the resource">The call timed out or returned a 5xx. That is not proof of failure. Retrying now could create a duplicate server. Resolve the outcome first: the worker queries the provider for correlation tag <code className="font-mono font-bold">fl:{j.serviceId ?? j.orderId ?? j.id}</code>.</Notice> : null}
      {blocked && !j.unknownOutcome ? <Notice tone="info">{blocked}</Notice> : null}
      <Split main={<>
        {j.error ? <Section title="Error"><DescriptionList items={[{ label: 'Code', value: j.error.code, mono: true }, { label: 'Message', value: j.error.message }, { label: 'Next retry', value: j.nextRetryAt ? `${relative(j.nextRetryAt)} (${dateTime(j.nextRetryAt)})` : 'No automatic retry scheduled' }]} /></Section> : null}
        <Section title="Log" description="Worker output for this job. Secrets and tokens are redacted before storage."><LogViewer lines={lines} label="Job log" height={240} emptyMessage="No log lines recorded." /></Section>
        <Section title="Attempts"><Timeline events={attempts} label="Job attempts" /></Section>
      </>} aside={<>
        <Section title="Identifiers"><DescriptionList items={[{ label: 'Job', value: j.id, mono: true, copy: j.id }, { label: 'Correlation id', value: j.correlationId, mono: true, copy: j.correlationId }, { label: 'Idempotency key', value: j.idempotencyKey, mono: true, copy: j.idempotencyKey }, { label: 'Worker', value: j.workerId ?? 'not assigned' }]} /></Section>
        <Section title="Related"><DescriptionList items={[{ label: 'Order', value: j.orderId ? <OrderLink id={j.orderId} /> : '—' }, { label: 'Service', value: j.serviceId ? <ServiceLink id={j.serviceId} /> : '—' }, { label: 'Customer', value: j.customerId ? <CustomerLink id={j.customerId} /> : '—' }, { label: 'Node', value: j.nodeId ? <NodeLink id={j.nodeId} /> : '—' }]} /></Section>
        <Section title="Timing"><DescriptionList items={[{ label: 'Created', value: dateTime(j.createdAt) }, { label: 'Started', value: dateTime(j.startedAt) }, { label: 'Finished', value: dateTime(j.finishedAt) }]} /></Section>
      </>} />
      <PreviewNote />
      {ops.node}
    </AdminPage>
  );
}
