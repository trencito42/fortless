import { useEffect, useState } from 'react';
import { Button, Select, TextField, Textarea } from '@/design-system';
import { adminRequest } from '../data/http';
import { useSession } from '../session';
import { LiveMutation, type MutationSpec } from './LiveMutation';
import { rowsOf, text, type Row } from './helpers';
import { departmentBody, macroBody, routingBody } from './bodies';

export function useSupportMeta() {
  const [meta, setMeta] = useState<{ departments: Row[]; staff: Row[]; macros: Row[] }>({ departments: [], staff: [], macros: [] });
  useEffect(() => {
    const c = new AbortController();
    adminRequest<Row>('/support/meta', { signal: c.signal }).then((p) => setMeta({ departments: rowsOf(p['departments']), staff: rowsOf(p['staff']), macros: rowsOf(p['macros']) })).catch(() => undefined);
    return () => c.abort();
  }, []);
  return meta;
}

export function LiveDepartmentCreate({ reload }: { reload: () => void }) {
  const { can } = useSession();
  if (!can('tickets:manage')) return null;
  const spec: MutationSpec = {
    title: 'New support department', confirmLabel: 'Create department', endpoint: '/support/departments', description: 'Names must be unique. Requires recent step-up.', initial: { name: '', description: '' },
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Name" value={values['name']} onChange={(e) => set('name', e.target.value)} error={errors['name']} maxLength={80} /><Textarea label="Description" value={values['description']} onChange={(e) => set('description', e.target.value)} maxLength={300} counter /></div>,
    validate: (v) => ((v['name']?.trim().length ?? 0) < 2 ? { name: 'Name must be at least 2 characters.' } : {}), body: (_r, v) => departmentBody(v),
  };
  return <LiveMutation spec={spec} onDone={reload} trigger={<Button size="sm" variant="primary">New department</Button>} />;
}

export function LiveMacroCreate({ departments, reload }: { departments: Row[]; reload: () => void }) {
  const { can } = useSession();
  if (!can('tickets:manage')) return null;
  const spec: MutationSpec = {
    title: 'New support macro', confirmLabel: 'Create macro', endpoint: '/support/macros', description: 'Canned reply. Optionally sets the ticket status when used. Never put credentials in a macro. Requires recent step-up.', initial: { name: '', body: '', status: 'none', departmentId: 'none' },
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Name" value={values['name']} onChange={(e) => set('name', e.target.value)} error={errors['name']} maxLength={100} /><Textarea label="Body" value={values['body']} onChange={(e) => set('body', e.target.value)} rows={6} error={errors['body']} maxLength={10000} counter /><div className="grid gap-3 sm:grid-cols-2"><Select label="Set status when used" value={values['status']} onValueChange={(v) => set('status', v ?? 'none')} options={[{ value: 'none', label: 'Keep current status' }, ...['OPEN', 'WAITING_CUSTOMER', 'WAITING_STAFF', 'RESOLVED', 'CLOSED'].map((s) => ({ value: s, label: s.replaceAll('_', ' ') }))]} /><Select label="Department" value={values['departmentId']} onValueChange={(v) => set('departmentId', v ?? 'none')} options={[{ value: 'none', label: 'All departments' }, ...departments.map((d) => ({ value: text(d['id']), label: text(d['name']) }))]} /></div></div>,
    validate: (v) => ({ ...((v['name']?.trim().length ?? 0) < 2 ? { name: 'Name must be at least 2 characters.' } : {}), ...((v['body']?.trim().length ?? 0) < 2 ? { body: 'Write the reply text.' } : /(password|passcode|token|secret)/i.test(v['body'] ?? '') ? { body: 'Macros must not ask for or contain credentials.' } : {}) }),
    body: (_r, v) => macroBody(v),
  };
  return <LiveMutation spec={spec} onDone={reload} trigger={<Button size="sm" variant="primary">New macro</Button>} />;
}

const MAX_BYTES = 5 * 1024 * 1024;
const toBase64 = (file: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] ?? ''); r.onerror = () => reject(new Error('Could not read the file.')); r.readAsDataURL(file); });

/** Routing (assignee, department, priority) and file attachment for one ticket. */
export function LiveTicketRoutingActions({ ticket, reload }: { ticket: Row; reload: () => void }) {
  const { can } = useSession();
  const meta = useSupportMeta();
  const [file, setFile] = useState<File | null>(null);
  if (!can('tickets:manage')) return null;
  const id = text(ticket['id']);
  const routing: MutationSpec = {
    title: 'Route ticket', confirmLabel: 'Save routing', endpoint: `/tickets/${encodeURIComponent(id)}/routing`, method: 'PATCH',
    initial: { staff: text(ticket['assigned_staff_id'], 'none'), department: text(ticket['department_id'], 'none'), priority: text(ticket['priority'], 'NORMAL') },
    fields: ({ values, set }) => <div className="grid gap-3"><Select label="Assignee" value={values['staff']} onValueChange={(v) => set('staff', v ?? 'none')} options={[{ value: 'none', label: 'Unassigned' }, ...meta.staff.map((s) => ({ value: text(s['id']), label: `${text(s['name'])} · ${text(s['role'])} · ${text(s['active_count'], '0')} active` }))]} /><Select label="Department" value={values['department']} onValueChange={(v) => set('department', v ?? 'none')} options={[{ value: 'none', label: 'No department' }, ...meta.departments.map((d) => ({ value: text(d['id']), label: text(d['name']) }))]} /><Select label="Priority" value={values['priority']} onValueChange={(v) => set('priority', v ?? 'NORMAL')} options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => ({ value: p, label: p }))} /></div>,
    body: (_r, v) => routingBody(v),
  };
  const attach: MutationSpec = {
    title: 'Attach a file', confirmLabel: 'Upload', description: 'Images, PDF, text, JSON or zip, up to 5 MB, ten per ticket. The server checks type and size again.',
    fields: ({ errors }) => <div className="grid gap-2"><label className="grid gap-1.5 text-[13px] font-bold text-ink2">File<input type="file" accept="image/*,.pdf,.txt,.json,.zip,.log" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="rounded-md bg-s2 p-3 text-[14px] font-semibold text-ink file:mr-3 file:rounded-full file:border-0 file:bg-s3 file:px-3 file:py-1.5 file:font-bold" /></label>{errors['file'] ? <p role="alert" className="text-[13px] font-semibold text-bad">{errors['file']}</p> : null}</div>,
    validate: () => (!file ? { file: 'Choose a file.' } : file.size === 0 ? { file: 'The file is empty.' } : file.size > MAX_BYTES ? { file: 'The file is larger than 5 MB.' } : {}),
    run: async () => { if (!file) throw new Error('Choose a file.'); await adminRequest(`/tickets/${encodeURIComponent(id)}/attachments`, { method: 'POST', body: JSON.stringify({ filename: file.name.slice(0, 255), contentType: file.type || 'application/octet-stream', dataBase64: await toBase64(file) }) }); setFile(null); },
  };
  return <>
    <LiveMutation spec={routing} onDone={reload} trigger={<Button size="sm" variant="secondary">Route ticket</Button>} />
    <LiveMutation spec={attach} onDone={reload} trigger={<Button size="sm" variant="secondary">Attach file</Button>} />
  </>;
}
