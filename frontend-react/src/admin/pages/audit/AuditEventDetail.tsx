import { Badge, Button, DescriptionList, EmptyState, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { Status, auditResult } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { RelatedTable } from '../../components/RelatedTable';
import { PreviewNote } from '../../components/PreviewNote';
import { col, nw } from '../../components/cols';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { dateTime, relative } from '../../lib/format';
import type { AuditEvent } from '../../types';

const LINK: Record<string, (id: string) => string> = { service: (i) => `/services/${i}`, account: (i) => `/customers/${i}`, user: (i) => `/customers/${i}`, ticket: (i) => `/support/tickets/${i}`, invoice: (i) => `/billing/invoices/${i}`, staff_membership: (i) => `/staff/directory/${i}`, node: (i) => `/infrastructure/nodes/${i}`, job: (i) => `/provisioning/jobs/${i}`, incident: (i) => `/monitoring/incidents/${i}`, order: (i) => `/orders/${i}`, refund: (i) => `/billing/refunds/${i}` };
const SECRET = /pass|token|secret|key|card|pan|cvv/i;

export default function AuditEventDetail({ id }: { id: string }) {
  const { data } = useAdmin();
  const nav = useNav();
  const e = data.audit.find((x) => x.id === id);
  if (!e) return <AdminPage title="Event not found"><EmptyState title="No such audit event" action={<Button onClick={() => nav('/audit')}>Back to audit log</Button>} /></AdminPage>;
  const same = data.audit.filter((x) => x.correlationId === e.correlationId && x.id !== e.id);
  const around = data.audit.filter((x) => x.resource.id === e.resource.id && x.id !== e.id).slice(0, 6);
  const link = LINK[e.resource.type]?.(e.resource.id);
  const keys = [...new Set([...Object.keys(e.before ?? {}), ...Object.keys(e.after ?? {})])];
  return (
    <AdminPage detail title={e.action} crumbLabel={e.id} parents={[{ label: 'Audit log', to: '/audit' }]} status={<><Status map={auditResult} value={e.result} />{e.preview ? <Badge tone="warn">Preview action</Badge> : null}</>} description={`${dateTime(e.at)} (${relative(e.at)}) · ${e.actor.name}`}>
      <Columns>
        <Section title="Event"><DescriptionList items={[{ label: 'Event id', value: e.id, mono: true, copy: e.id }, { label: 'Actor', value: `${e.actor.name} (${e.actor.type.toLowerCase()})` }, { label: 'Action', value: e.action, mono: true }, { label: 'Result', value: <Status map={auditResult} value={e.result} /> }, { label: 'IP', value: e.ip, mono: true }, { label: 'Correlation id', value: e.correlationId, mono: true, copy: e.correlationId }, ...(e.reason ? [{ label: 'Reason', value: e.reason }] : [])]} /></Section>
        <Section title="Resource"><DescriptionList items={[{ label: 'Type', value: e.resource.type, mono: true }, { label: 'Id', value: e.resource.id, mono: true, copy: e.resource.id }, { label: 'Label', value: e.resource.label }, { label: 'Open', value: link ? <EntityLink to={link}>Open {e.resource.type.replace('_', ' ')}</EntityLink> : 'No detail page for this type' }, { label: 'Account', value: e.accountId ? <EntityLink to={`/customers/${e.accountId}`}>{e.accountId}</EntityLink> : '—' }]} /></Section>
      </Columns>
      <Section title="Before and after" description="Only fields that are safe to show. Anything that looks like a credential is masked.">
        {keys.length ? <div className="overflow-x-auto"><table className="w-full min-w-[420px] border-collapse text-left"><caption className="sr-only">Changed fields</caption><thead><tr className="text-ink3"><th scope="col" className="py-2 pr-3 text-[12.5px] font-bold">Field</th><th scope="col" className="px-3 py-2 text-[12.5px] font-bold">Before</th><th scope="col" className="px-3 py-2 text-[12.5px] font-bold">After</th></tr></thead><tbody>{keys.map((k) => <tr key={k} className="odd:bg-s2/60"><th scope="row" className="py-2.5 pr-3 pl-2 font-mono text-[13px]">{k}</th><td className="px-3 py-2.5">{SECRET.test(k) ? '••••' : e.before?.[k] ?? '—'}</td><td className="px-3 py-2.5 font-semibold">{SECRET.test(k) ? '••••' : e.after?.[k] ?? '—'}</td></tr>)}</tbody></table></div> : <p className="text-ink3">This event does not record a before/after pair.</p>}
        <Notice tone="info" className="mt-3">Request and response bodies are not stored in the audit log.</Notice>
      </Section>
      <Section title="Same correlation id" description="Other events from the same request or job."><RelatedTable rows={same} getRowId={(x) => x.id} caption="Related audit events" empty="No other events share this correlation id." pageSize={6} onRowClick={(x) => nav(`/audit/events/${x.id}`)} columns={[col<AuditEvent>('t', 'When', (x) => nw(relative(x.at)), { primary: true }), col<AuditEvent>('a', 'Action', (x) => <span className="font-mono text-[12.5px]">{x.action}</span>), col<AuditEvent>('r', 'Result', (x) => <Status map={auditResult} value={x.result} />)]} /></Section>
      <Section title="Other events on this resource"><RelatedTable rows={around} getRowId={(x) => x.id} caption="Events on the same resource" empty="No other events." pageSize={6} onRowClick={(x) => nav(`/audit/events/${x.id}`)} columns={[col<AuditEvent>('t', 'When', (x) => nw(relative(x.at)), { primary: true }), col<AuditEvent>('a', 'Action', (x) => <span className="font-mono text-[12.5px]">{x.action}</span>), col<AuditEvent>('w', 'Actor', (x) => x.actor.name)]} /></Section>
      <PreviewNote>Audit entries are immutable. There is no edit or delete control on this page, by design.</PreviewNote>
    </AdminPage>
  );
}
