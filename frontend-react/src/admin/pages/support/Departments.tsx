import { Badge, Button, CheckboxGroup, NumberField, Switch, TextField, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col } from '../../components/cols';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import type { Department } from '../../types';

export default function Departments() {
  const { data, add, patch, audit, newId } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const m = can('tickets:manage');
  const agents = data.staff.filter((s) => s.status === 'ACTIVE' && ['SUPPORT', 'BILLING', 'INFRASTRUCTURE', 'ADMINISTRATOR'].includes(s.role));
  const edit = (d?: Department) => act.run({
    title: d ? `Edit ${d.name}` : 'New department', description: 'Departments route tickets, set the first-response target and decide who can be auto-assigned. The real endpoint requires step-up.', confirmLabel: d ? 'Save department' : 'Create department', permission: 'tickets:manage', stepUp: true, reasonRequired: false,
    initial: { name: d?.name ?? '', email: d?.email ?? '', description: d?.description ?? '', sla: String(d?.slaFirstResponseMin ?? 120), auto: String(d?.autoAssign ?? false), members: (d?.members ?? []).join(',') },
    validate: (v) => ({ ...(v['name']!.trim().length < 3 ? { name: 'Name must be at least 3 characters.' } : data.departments.some((x) => x.name.toLowerCase() === v['name']!.trim().toLowerCase() && x.id !== d?.id) ? { name: 'A department with this name exists.' } : {}), ...(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v['email']!) ? { email: 'Enter a valid email address.' } : {}), ...(!(Number(v['sla']) >= 5 && Number(v['sla']) <= 2880) ? { sla: 'Target must be 5–2880 minutes.' } : {}), ...(v['auto'] === 'true' && !v['members'] ? { members: 'Auto-assign needs at least one member.' } : {}) }),
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Name" value={values['name']} onChange={(e) => set('name', e.target.value)} error={errors['name']} required /><TextField label="Reply-from address" value={values['email']} onChange={(e) => set('email', e.target.value)} error={errors['email']} required /><Textarea label="Description" value={values['description']} onChange={(e) => set('description', e.target.value)} rows={2} /><NumberField label="First-response target (minutes)" value={Number(values['sla'])} onValueChange={(v) => set('sla', String(v ?? ''))} min={5} max={2880} error={errors['sla']} /><CheckboxGroup legend="Members" value={values['members']!.split(',').filter(Boolean)} onValueChange={(v) => set('members', v.join(','))} error={errors['members']} options={agents.map((a) => ({ value: a.id, label: a.name, description: a.role }))} /><Switch label="Auto-assign new tickets round-robin" checked={values['auto'] === 'true'} onCheckedChange={(v) => set('auto', String(v))} /></div>,
    onConfirm: ({ values }) => { const rec: Department = { id: d?.id ?? newId('dep'), name: values['name']!.trim(), email: values['email']!, description: values['description']!, slaFirstResponseMin: Number(values['sla']), autoAssign: values['auto'] === 'true', members: values['members']!.split(',').filter(Boolean), active: d?.active ?? true }; if (d) patch('departments', d.id, rec); else add('departments', rec, 'end'); audit(d ? 'support.department_updated' : 'support.department_created', { type: 'department', id: rec.id, label: rec.name }); return d ? 'Department saved' : 'Department created'; },
  });
  return (
    <AdminPage title="Departments" description="Where tickets go and how fast they should be answered." actions={<Button variant="primary" leadingIcon="add-01" disabled={!m} onClick={() => edit()}>New department</Button>}>
      <ResourceTable<Department>
        tableId="departments" caption="Departments" rows={data.departments} getRowId={(d) => d.id} rowLabel={(d) => d.name} searchText={(d) => `${d.name} ${d.email} ${d.description}`}
        columns={[
          col<Department>('n', 'Department', (d) => <span className="grid md:min-w-[12rem]"><b>{d.name}</b><span className="text-[12.5px] text-ink3">{d.description}</span></span>, { primary: true, sort: (d) => d.name }),
          col<Department>('e', 'Reply-from', (d) => <span className="font-mono text-[12.5px]">{d.email}</span>, { hideOnMobile: true }),
          col<Department>('m', 'Members', (d) => <span className="flex flex-wrap gap-1">{d.members.map((id) => <Badge key={id}>{data.staff.find((s) => s.id === id)?.name.split(' ')[0] ?? id}</Badge>)}</span>),
          col<Department>('s', 'First response', (d) => (d.slaFirstResponseMin >= 120 ? `${d.slaFirstResponseMin / 60} h` : `${d.slaFirstResponseMin} min`), { sort: (d) => d.slaFirstResponseMin, numeric: true }),
          col<Department>('a', 'Auto-assign', (d) => <Badge tone={d.autoAssign ? 'good' : 'neutral'}>{d.autoAssign ? 'On' : 'Off'}</Badge>),
          col<Department>('o', 'Open tickets', (d) => data.tickets.filter((t) => t.departmentId === d.id && t.status !== 'closed' && t.status !== 'resolved').length, { numeric: true, sort: (d) => data.tickets.filter((t) => t.departmentId === d.id && t.status !== 'closed' && t.status !== 'resolved').length }),
          col<Department>('on', 'Active', (d) => <Switch hideLabel label={`Active: ${d.name}`} checked={d.active} disabled={!m} onCheckedChange={(v) => { patch('departments', d.id, { active: v }); audit('support.department_active', { type: 'department', id: d.id, label: d.name }, { after: { active: String(v) } }); }} />),
        ]}
        rowActions={(d) => [{ id: 'e', label: 'Edit…', icon: 'edit-02', disabled: !m, onSelect: () => edit(d) }]}
        empty={{ title: 'No departments' }}
      />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
