import { Badge, Button, Notice, Select, Switch, TextField, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col } from '../../components/cols';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import type { Macro } from '../../types';

const VARS = ['{{customer.name}}', '{{agent.name}}', '{{ticket.id}}', '{{service.name}}'];
const sample = (b: string) => b.replace('{{customer.name}}', 'Alex Becker').replace('{{agent.name}}', 'Maria Ilie').replace('{{ticket.id}}', 'tkt_0042').replace('{{service.name}}', 'survival-3f2');

export default function Macros() {
  const { data, add, patch, remove, audit, newId } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const m = can('tickets:manage');
  const edit = (x?: Macro) => act.run({
    title: x ? `Edit “${x.title}”` : 'New macro', description: `Canned replies. Variables: ${VARS.join(', ')}. The real endpoint requires step-up.`, confirmLabel: x ? 'Save macro' : 'Create macro', permission: 'tickets:manage', stepUp: true, reasonRequired: false,
    initial: { title: x?.title ?? '', dep: x?.departmentId ?? 'all', body: x?.body ?? '', shared: String(x?.shared ?? true) },
    validate: (v) => ({ ...(v['title']!.trim().length < 3 ? { title: 'Title must be at least 3 characters.' } : {}), ...(v['body']!.trim().length < 10 ? { body: 'Body must be at least 10 characters.' } : /\{\{(?!customer\.name|agent\.name|ticket\.id|service\.name)[^}]*\}\}/.test(v['body']!) ? { body: 'Unknown variable. Allowed: ' + VARS.join(', ') } : /(password|token|secret)/i.test(v['body']!) ? { body: 'Macros must not ask for or contain credentials.' } : {}) }),
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Title" value={values['title']} onChange={(e) => set('title', e.target.value)} error={errors['title']} required /><Select label="Department" value={values['dep']} onValueChange={(v) => set('dep', v ?? 'all')} options={[{ value: 'all', label: 'All departments' }, ...data.departments.map((d) => ({ value: d.id, label: d.name }))]} /><Textarea label="Body" value={values['body']} onChange={(e) => set('body', e.target.value)} rows={6} error={errors['body']} maxLength={2000} counter /><div className="rounded-md bg-s2 p-3 text-[13.5px]"><p className="mb-1 text-[12px] font-bold text-ink3">Preview with sample values</p><p className="whitespace-pre-wrap">{sample(values['body'] ?? '')}</p></div><Switch label="Shared with every agent" checked={values['shared'] === 'true'} onCheckedChange={(v) => set('shared', String(v))} /></div>,
    onConfirm: ({ values }) => { const rec: Macro = { id: x?.id ?? newId('mac'), title: values['title']!.trim(), departmentId: values['dep'] === 'all' ? null : values['dep']!, body: values['body']!, usage30d: x?.usage30d ?? 0, shared: values['shared'] === 'true' }; if (x) patch('macros', x.id, rec); else add('macros', rec, 'end'); audit(x ? 'support.macro_updated' : 'support.macro_created', { type: 'macro', id: rec.id, label: rec.title }); return x ? 'Macro saved' : 'Macro created'; },
  });
  const del = (x: Macro) => act.run({ title: `Delete “${x.title}”`, description: 'Existing tickets are not affected.', confirmLabel: 'Delete macro', tone: 'danger', permission: 'tickets:manage', stepUp: true, reasonRequired: true, onConfirm: ({ reason }) => { remove('macros', x.id); audit('support.macro_deleted', { type: 'macro', id: x.id, label: x.title }, { reason }); return 'Macro deleted'; } });
  return (
    <AdminPage title="Macros" description="Canned replies agents insert into a reply. Macros never contain credentials and never send by themselves." actions={<Button variant="primary" leadingIcon="add-01" disabled={!m} onClick={() => edit()}>New macro</Button>}>
      <Notice tone="info">Variables are replaced when an agent inserts the macro: {VARS.map((v) => <code key={v} className="mr-1 rounded bg-s3 px-1.5 font-mono text-[12.5px]">{v}</code>)}</Notice>
      <ResourceTable<Macro>
        tableId="macros" caption="Macros" rows={data.macros} getRowId={(x) => x.id} rowLabel={(x) => x.title} searchText={(x) => `${x.title} ${x.body}`}
        filters={[{ id: 'dep', label: 'Department', options: data.departments.map((d) => ({ value: d.id, label: d.name })), test: (x, v) => x.departmentId === v }]}
        columns={[
          col<Macro>('t', 'Macro', (x) => <span className="grid md:min-w-[12rem] max-w-[32rem]"><b>{x.title}</b><span className="line-clamp-2 text-[12.5px] text-ink3">{x.body}</span></span>, { primary: true, sort: (x) => x.title }),
          col<Macro>('d', 'Department', (x) => data.departments.find((d) => d.id === x.departmentId)?.name ?? 'All', { sort: (x) => x.departmentId ?? '' }),
          col<Macro>('s', 'Shared', (x) => <Badge tone={x.shared ? 'good' : 'neutral'}>{x.shared ? 'Shared' : 'Personal'}</Badge>),
          col<Macro>('u', 'Uses (30 d)', (x) => x.usage30d, { numeric: true, sort: (x) => x.usage30d }),
        ]}
        rowActions={(x) => [{ id: 'e', label: 'Edit…', icon: 'edit-02', disabled: !m, onSelect: () => edit(x) }, { id: 'd', label: 'Delete…', icon: 'delete-02', tone: 'danger', disabled: !m, onSelect: () => del(x) }]}
        empty={{ title: 'No macros yet', description: 'Create one for the answer you type most.' }}
      />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
