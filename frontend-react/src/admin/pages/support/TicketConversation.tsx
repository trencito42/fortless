import { useMemo, useState } from 'react';
import { Badge, Button, Dropzone, EmptyState, Notice, Select, SegmentedControl, SplitButton, Tabs, Textarea, Timeline, type TimelineEvent } from '@/design-system';
import { cn } from '@/lib/utils/cn';
import { AdminPage } from '../../components/Page';
import { Section, Split } from '../../components/Cards';
import { Status, lifecycle, priority as prioMap, riskLevel, runtime, ticketStatus, accountStatus } from '../../components/status';
import { CustomerLink, EntityLink, ServiceLink, TicketLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useToast } from '../../toast';
import { dateTime, relative } from '../../lib/format';
import { SLA_LABEL, useTicketOps } from './ticketOps';

export default function TicketConversation({ id }: { id: string }) {
  const { data } = useAdmin();
  const nav = useNav();
  const toast = useToast();
  const ops = useTicketOps();
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [err, setErr] = useState<string>();
  const [tab, setTab] = useState('conversation');
  const t = data.tickets.find((x) => x.id === id);
  const customer = data.customers.find((c) => c.id === t?.customerId);
  const others = useMemo(() => data.tickets.filter((x) => t && x.customerId === t.customerId && x.id !== t.id).slice(0, 5), [data.tickets, t]);
  const events = useMemo(() => data.audit.filter((e) => t && e.resource.id === t.id).slice(0, 20), [data.audit, t]);
  if (!t) return <AdminPage title="Ticket not found"><EmptyState title="No such ticket" action={<Button onClick={() => nav('/support')}>Back to inbox</Button>} /></AdminPage>;
  const sla = SLA_LABEL(t);
  const svcs = t.serviceIds.map((sid) => data.services.find((s) => s.id === sid)).filter(Boolean);
  const dept = data.departments.find((d) => d.id === t.departmentId);
  const macros = data.macros.filter((m) => !m.departmentId || m.departmentId === t.departmentId);
  const send = (next?: 'waiting_customer' | 'resolved') => {
    if (body.trim().length < 2) { setErr('Write a message first.'); return; }
    setErr(undefined); ops.reply(t, body.trim(), mode === 'note', next, files); setBody(''); setFiles([]);
  };
  const tl: TimelineEvent[] = [
    ...events.map((e): TimelineEvent => ({ id: e.id, title: <>{e.action.replace(/[._]/g, ' ')}{e.preview ? <Badge tone="warn" className="ml-2">preview</Badge> : null}</>, description: `${e.actor.name}${e.after ? ' → ' + Object.values(e.after).join(', ') : ''}`, time: relative(e.at), iso: e.at, icon: 'activity-01' })),
    { id: 'created', title: 'Ticket created', description: `${t.requester} via ${dept?.name ?? 'portal'}`, time: dateTime(t.createdAt), iso: t.createdAt, icon: 'ticket-01', tone: 'neutral' },
  ];
  return (
    <AdminPage detail title={t.subject} crumbLabel={t.id} parents={[{ label: 'Inbox', to: '/support' }]} status={<><Status map={ticketStatus} value={t.status} /><Status map={prioMap} value={t.priority} /><span className="font-mono text-[13px] font-semibold text-ink3">{t.id}</span></>} description={<>Opened {relative(t.createdAt)} by {t.requester} · <CustomerLink id={t.customerId} /></>}
      actions={<><Button variant="secondary" leadingIcon="user" disabled={!ops.m} onClick={() => ops.assign([t], 'stf_01')}>Assign to me</Button>{t.status === 'resolved' || t.status === 'closed' ? <Button variant="secondary" disabled={!ops.m} onClick={() => ops.setStatus([t], 'open')}>Reopen</Button> : <Button variant="secondary" leadingIcon="checkmark-circle-02" disabled={!ops.m} onClick={() => ops.setStatus([t], 'resolved')}>Resolve</Button>}</>}>
      {sla.state === 'breached' ? <Notice tone="bad" title="First response is overdue">{sla.text}. Target for {dept?.name}: {dept?.slaFirstResponseMin} minutes.</Notice> : null}
      <Split main={<>
        <Tabs label="Ticket sections" value={tab} onValueChange={setTab} items={[{ value: 'conversation', label: 'Conversation', badge: t.messages.length }, { value: 'timeline', label: 'Timeline' }]} />
        {tab === 'conversation' ? (
          <>
            <ol className="grid gap-3" aria-label="Messages">
              {t.messages.map((m) => (
                <li key={m.id} className={cn('rounded-lg p-4', m.author === 'customer' ? 'bg-s1' : m.author === 'staff' ? 'bg-accent-bg' : 'bg-warn-bg')}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 font-extrabold">{m.name}<Badge tone={m.author === 'customer' ? 'neutral' : m.author === 'staff' ? 'accent' : 'warn'}>{m.author === 'internal' ? 'Internal note' : m.author === 'staff' ? 'Staff reply' : 'Customer'}</Badge></p><time dateTime={m.at} className="text-[12.5px] font-semibold text-ink3">{dateTime(m.at)}</time></div>
                  <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
                  {m.attachments.length ? <ul className="mt-2 flex flex-wrap gap-2">{m.attachments.map((a) => <li key={a.name} className="rounded-full bg-s3 px-3 py-1 text-[12.5px] font-semibold">{a.name} · {Math.max(1, Math.round(a.size / 1024))} KB</li>)}</ul> : null}
                </li>
              ))}
            </ol>
            <Section title={mode === 'reply' ? 'Reply to customer' : 'Internal note'} actions={<SegmentedControl aria-label="Message type" size="sm" value={mode} onValueChange={setMode} options={[{ value: 'reply', label: 'Reply' }, { value: 'note', label: 'Internal note' }]} />}>
              <div className="grid gap-3">
                {mode === 'note' ? <Notice tone="warn">Internal notes are visible to staff only.</Notice> : null}
                <Textarea label="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={4000} counter error={err} disabled={!ops.m} description={mode === 'reply' ? 'Never ask for or paste passwords, card numbers or tokens.' : undefined} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select label="Insert macro" placeholder="Choose a macro" value={null} onValueChange={(v) => { const mc = macros.find((x) => x.id === v); if (mc) setBody((b) => `${b}${b ? '\n\n' : ''}${mc.body.replace('{{customer.name}}', t.requester).replace('{{agent.name}}', 'Maria Ilie')}`); }} options={macros.map((x) => ({ value: x.id, label: x.title }))} disabled={!ops.m} />
                  <div className="flex items-end"><Button variant="secondary" size="sm" leadingIcon="ai-magic" disabled={!ops.m} onClick={() => { setBody((b) => b || `Hi ${t.requester},\n\nThanks for the details. I am looking at ${svcs[0] ? svcs[0]!.name : 'your account'} now and will update you shortly.\n\n— Maria`); toast({ tone: 'info', title: 'Template inserted', description: 'This is a fixed template, not model output.' }); }}>Insert starter draft</Button></div>
                </div>
                <Dropzone label="Attach files" description="Preview: files are listed, not uploaded." multiple maxSizeBytes={5_000_000} onFiles={(fs) => setFiles((x) => [...x, ...fs.map((f) => ({ name: f.name, size: f.size }))])} disabled={!ops.m} />
                {files.length ? <ul className="flex flex-wrap gap-2" aria-label="Attachments to send">{files.map((f) => <li key={f.name} className="flex items-center gap-1 rounded-full bg-s3 px-3 py-1 text-[12.5px] font-semibold">{f.name}<button type="button" aria-label={`Remove ${f.name}`} className="rounded-full px-1 font-extrabold" onClick={() => setFiles((x) => x.filter((y) => y.name !== f.name))}>×</button></li>)}</ul> : null}
                <div className="flex flex-wrap justify-end gap-2">
                  {mode === 'note' ? <Button variant="primary" onClick={() => send()} disabled={!ops.m}>Add internal note</Button> : <SplitButton menuLabel="More send options" disabled={!ops.m} onClick={() => send()} entries={[{ id: 'wc', label: 'Send and wait for customer', onSelect: () => send('waiting_customer') }, { id: 'rs', label: 'Send and resolve', onSelect: () => send('resolved') }]}>Send reply</SplitButton>}
                </div>
              </div>
            </Section>
          </>
        ) : <Section title="Timeline"><Timeline events={tl} label="Ticket timeline" /></Section>}
      </>} aside={<>
        <Section title="Properties">
          <div className="grid gap-3">
            <Select label="Status" value={t.status} onValueChange={(v) => v && ops.setStatus([t], v as never)} options={Object.keys(ticketStatus).map((s) => ({ value: s, label: ticketStatus[s]!.label }))} disabled={!ops.m} />
            <Select label="Priority" value={t.priority} onValueChange={(v) => v && ops.setPriority(t, v as never)} options={['urgent', 'high', 'normal', 'low'].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))} disabled={!ops.m} />
            <Select label="Assignee" value={t.assigneeId ?? 'none'} onValueChange={(v) => ops.assign([t], v === 'none' ? null : v)} options={[{ value: 'none', label: 'Unassigned' }, ...data.staff.filter((s) => s.status === 'ACTIVE').map((s) => ({ value: s.id, label: s.name }))]} disabled={!ops.m} />
            <Select label="Department" value={t.departmentId} onValueChange={(v) => v && ops.setDepartment(t, v)} options={data.departments.map((d) => ({ value: d.id, label: d.name }))} disabled={!ops.m} />
            <p className="text-[13px] font-semibold text-ink3">First response: <Badge tone={sla.state === 'breached' || sla.state === 'missed' ? 'bad' : 'neutral'}>{sla.text}</Badge></p>
          </div>
        </Section>
        <Section title="Customer">{customer ? <div className="grid gap-2"><CustomerLink id={customer.id} sub /><div className="flex flex-wrap gap-1.5"><Status map={accountStatus} value={customer.status} /><Status map={riskLevel} value={customer.risk} /></div><EntityLink to={`/customers/${customer.id}/billing`}>Billing</EntityLink></div> : null}</Section>
        <Section title="Linked services">{svcs.length ? <ul className="grid gap-2">{svcs.map((s) => <li key={s!.id} className="grid gap-1 rounded-md bg-s2 p-2.5"><ServiceLink id={s!.id} /><span className="flex flex-wrap gap-1"><Status map={lifecycle} value={s!.lifecycle} /><Status map={runtime} value={s!.runtime} /></span></li>)}</ul> : <p className="text-ink3">None linked.</p>}</Section>
        {others.length ? <Section title="Other tickets from this customer"><ul className="grid gap-1.5">{others.map((o) => <li key={o.id} className="flex items-center justify-between gap-2"><TicketLink id={o.id} /><Status map={ticketStatus} value={o.status} /></li>)}</ul></Section> : null}
      </>} />
      <PreviewNote>Replies are stored in this tab; no email is sent. Attachments are listed but not uploaded.</PreviewNote>
    </AdminPage>
  );
}
