import { useEffect, useState } from 'react';
import { Badge, Button, DateField, Select, TextField, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, contentStatus, severity } from '../../components/status';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useAdminRouter } from '../../router';
import { useSession } from '../../session';
import { ADMIN_NOW, dateTime } from '../../lib/format';
import { publicLeak } from '../monitoring/IncidentEditor';
import type { Announcement } from '../../types';

export default function Announcements() {
  const { data, add, patch, remove, audit, newId } = useAdmin();
  const { search } = useAdminRouter();
  const { can } = useSession();
  const act = useActionDialog();
  const m = can('content:manage');
  const [started, setStarted] = useState(false);
  const edit = (x?: Announcement) => act.run({
    title: x ? 'Edit announcement' : 'New announcement', description: 'Shown to customers in their panel (and on the public site for “all customers”). The real endpoint requires content:manage.', confirmLabel: x ? 'Save announcement' : 'Create announcement', permission: 'content:manage', stepUp: false, reasonRequired: false,
    initial: { title: x?.title ?? '', body: x?.body ?? '', sev: x?.severity ?? 'info', aud: x?.audience ?? 'All customers', start: (x?.startsAt ?? new Date(ADMIN_NOW).toISOString()).slice(0, 10), end: x?.endsAt?.slice(0, 10) ?? '', publish: x ? (x.status === 'draft' ? 'draft' : 'publish') : 'publish' },
    validate: (v) => ({ ...(v['title']!.trim().length < 5 ? { title: 'Title must be at least 5 characters.' } : {}), ...(v['body']!.trim().length < 10 ? { body: 'Write at least 10 characters.' } : publicLeak(v['body']!) ? { body: `Contains an ${publicLeak(v['body']!)}: announcements are public.` } : {}), ...(v['end'] && v['end']! <= v['start']! ? { end: 'End must be after the start date.' } : {}) }),
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Title" value={values['title']} onChange={(e) => set('title', e.target.value)} error={errors['title']} maxLength={100} /><Textarea label="Message" value={values['body']} onChange={(e) => set('body', e.target.value)} rows={4} maxLength={400} counter error={errors['body']} /><div className="grid gap-3 sm:grid-cols-2"><Select label="Type" value={values['sev']} onValueChange={(v) => set('sev', v ?? 'info')} options={[{ value: 'info', label: 'Information' }, { value: 'warning', label: 'Warning' }, { value: 'maintenance', label: 'Maintenance' }]} /><Select label="Audience" value={values['aud']} onValueChange={(v) => set('aud', v ?? '')} options={['All customers', 'Customers with services in FRA', 'Customers with services in HEL', 'Business accounts'].map((a) => ({ value: a, label: a }))} /><DateField label="Starts" value={values['start']} onChange={(e) => set('start', e.target.value)} /><DateField label="Ends (optional)" value={values['end']} onChange={(e) => set('end', e.target.value)} error={errors['end']} /></div><Select label="State" value={values['publish']} onValueChange={(v) => set('publish', v ?? 'draft')} options={[{ value: 'draft', label: 'Save as draft' }, { value: 'publish', label: 'Publish (or schedule if it starts later)' }]} /></div>,
    onConfirm: ({ values }) => { const start = new Date(values['start']! + 'T00:00:00Z').toISOString(); const status: Announcement['status'] = values['publish'] === 'draft' ? 'draft' : Date.parse(start) > ADMIN_NOW ? 'scheduled' : 'published'; const rec: Announcement = { id: x?.id ?? newId('ann'), title: values['title']!.trim(), body: values['body']!.trim(), severity: values['sev'] as Announcement['severity'], status, startsAt: start, endsAt: values['end'] ? new Date(values['end'] + 'T00:00:00Z').toISOString() : null, audience: values['aud']! }; if (x) patch('announcements', x.id, rec); else add('announcements', rec); audit(x ? 'content.announcement_updated' : 'content.announcement_created', { type: 'announcement', id: rec.id, label: rec.title }, { after: { status } }); return `Announcement ${status}`; },
  });
  // Opens the create dialog once when arriving from a quick action (?new=1).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (search.get('new') === '1' && !started && m) { setStarted(true); edit(); } }, [search, m]);
  const del = (x: Announcement) => act.run({ title: `Delete “${x.title}”`, confirmLabel: 'Delete', tone: 'danger', permission: 'content:manage', stepUp: true, reasonRequired: true, onConfirm: ({ reason }) => { remove('announcements', x.id); audit('content.announcement_deleted', { type: 'announcement', id: x.id, label: x.title }, { reason }); return 'Announcement deleted'; } });
  const seg = (v: string, label: string, test: (a: Announcement) => boolean) => ({ value: v, label, test });
  return (
    <AdminPage title="Announcements" description="Short notices shown in customer panels. For outages use an incident; for planned work use scheduled maintenance. Announcements are for everything else." actions={<Button variant="primary" leadingIcon="add-01" disabled={!m} onClick={() => edit()}>New announcement</Button>}>
      <ResourceTable<Announcement>
        tableId="announcements" caption="Announcements" rows={data.announcements} getRowId={(a) => a.id} rowLabel={(a) => a.title} searchText={(a) => `${a.title} ${a.body}`}
        segments={[seg('all', 'All', () => true), seg('published', 'Live', (a) => a.status === 'published'), seg('scheduled', 'Scheduled', (a) => a.status === 'scheduled'), seg('draft', 'Drafts', (a) => a.status === 'draft'), seg('expired', 'Expired', (a) => a.status === 'expired')]}
        columns={[
          col<Announcement>('t', 'Announcement', (a) => <span className="grid md:min-w-[14rem] max-w-[28rem]"><b>{a.title}</b><span className="line-clamp-2 text-[12.5px] text-ink3">{a.body}</span></span>, { primary: true, sort: (a) => a.title }),
          col<Announcement>('s', 'Status', (a) => <Status map={contentStatus} value={a.status} />, { sort: (a) => a.status }),
          col<Announcement>('v', 'Type', (a) => <Status map={severity} value={a.severity} />),
          col<Announcement>('au', 'Audience', (a) => a.audience, { hideOnMobile: true }),
          col<Announcement>('st', 'Starts', (a) => nw(dateTime(a.startsAt)), { sort: (a) => a.startsAt }),
          col<Announcement>('e', 'Ends', (a) => (a.endsAt ? nw(dateTime(a.endsAt)) : <Badge>no end</Badge>), { hideOnMobile: true }),
        ]}
        rowActions={(a) => [{ id: 'e', label: 'Edit…', icon: 'edit-02', disabled: !m, onSelect: () => edit(a) }, ...(a.status === 'published' ? [{ id: 'end', label: 'End now', icon: 'stop' as const, disabled: !m, onSelect: () => { patch('announcements', a.id, { status: 'expired' as const }); audit('content.announcement_ended', { type: 'announcement', id: a.id, label: a.title }); } }] : []), { id: 'd', label: 'Delete…', icon: 'delete-02', tone: 'danger', disabled: !m, onSelect: () => del(a) }]}
        empty={{ title: 'No announcements' }}
      />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
