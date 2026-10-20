import { useState } from 'react';
import { Button, Card, Dropzone, Notice, Select, SegmentedControl, TextField, Textarea } from '@/design-system';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { useNavigate, useRouter } from '../../router';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import type { TicketPriority } from '../../domain/types';

const DEPTS = ['Technical support', 'Billing', 'Sales', 'Abuse report'];

export default function NewTicket() {
  const api = useApi(); const nav = useNavigate(); const { search } = useRouter();
  const services = useApiQuery((a) => a.listServices());
  const [subject, setSubject] = useState(''); const [dept, setDept] = useState<string | null>(DEPTS[0]!); const [priority, setPriority] = useState<TicketPriority>('normal');
  const [service, setService] = useState<string | null>(search.get('service')); const [body, setBody] = useState(''); const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [fail, setFail] = useState<string>();
  const submit = async () => {
    const er: Record<string, string> = {};
    if (subject.trim().length < 5) er.subject = 'Describe the problem in a few words.';
    if (body.trim().length < 20) er.body = 'Add at least a couple of sentences so we can help the first time.';
    setErrors(er); if (Object.keys(er).length) return;
    setBusy(true); setFail(undefined);
    try { const t = await api.createTicket({ subject: subject.trim(), department: dept ?? DEPTS[0]!, priority, serviceId: service ?? undefined, body: body.trim(), files }); nav(`/app/support/${t.id}`); } catch (e) { setFail(e instanceof Error ? e.message : 'Could not send the ticket.'); } finally { setBusy(false); }
  };
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader title="New ticket" description="Tell us what is wrong and which service it affects. Logs and screenshots help." crumbs={[{ label: 'Support', to: '/app/support' }, { label: 'New ticket' }]} />
      <CapabilityNote area="support" />
      <Card pad="lg">
        <form noValidate className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} error={errors.subject} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Department" value={dept} onValueChange={setDept} options={DEPTS.map((d) => ({ value: d, label: d }))} />
            <Select label="Related service (optional)" value={service} onValueChange={setService} placeholder="None" options={[{ value: '', label: 'None' }, ...(services.status === 'ready' ? services.data.map((s) => ({ value: s.id, label: s.name })) : [])]} />
          </div>
          <div className="grid gap-1.5"><p className="text-[13px] font-bold text-ink2">Priority</p><SegmentedControl<TicketPriority> aria-label="Priority" value={priority} onValueChange={setPriority} options={[{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]} />{priority === 'urgent' ? <p className="text-[13px] text-ink3">Use urgent only when a production server is down.</p> : null}</div>
          <Textarea label="Message" rows={7} value={body} onChange={(e) => setBody(e.target.value)} error={errors.body} maxLength={5000} counter />
          <Dropzone label="Attachments" onFiles={(f) => setFiles((x) => [...x, ...f].slice(0, 5))} />
          {files.length ? <ul className="grid gap-1 text-[13.5px]">{files.map((f, i) => <li key={`${f.name}${i}`} className="flex items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><span className="truncate">{f.name}</span><Button size="sm" variant="ghost" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>Remove</Button></li>)}</ul> : null}
          {fail ? <Notice tone="bad">{fail}</Notice> : null}
          <div className="flex gap-2"><Button type="submit" variant="primary" loading={busy}>Send ticket</Button><Button variant="ghost" onClick={() => nav('/app/support')}>Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
