import { Badge, Button, DateField, Notice, Select, TextField, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, contentStatus } from '../../components/status';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { ADMIN_NOW, date, num } from '../../lib/format';
import type { Campaign } from '../../types';

export default function Campaigns() {
  const { data, add, patch, audit, newId } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const m = can('content:manage');
  const edit = (c?: Campaign) => act.run({
    title: c ? 'Edit campaign' : 'New campaign', description: 'Plans a campaign. Sending bulk email is not supported by the backend, so scheduled campaigns do not send anything.', confirmLabel: c ? 'Save campaign' : 'Create campaign', permission: 'content:manage', reasonRequired: false,
    initial: { name: c?.name ?? '', channel: c?.channel ?? 'email', aud: c?.audience ?? 'All customers', start: (c?.startsAt ?? new Date(ADMIN_NOW + 7 * 86_400_000).toISOString()).slice(0, 10), end: c?.endsAt?.slice(0, 10) ?? '', coupon: c?.couponCode ?? 'none', notes: c?.notes ?? '' },
    validate: (v) => ({ ...(v['name']!.trim().length < 4 ? { name: 'Name must be at least 4 characters.' } : {}), ...(v['end'] && v['end']! <= v['start']! ? { end: 'End must be after the start.' } : {}) }),
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Name" value={values['name']} onChange={(e) => set('name', e.target.value)} error={errors['name']} /><div className="grid gap-3 sm:grid-cols-2"><Select label="Channel" value={values['channel']} onValueChange={(v) => set('channel', v ?? 'email')} options={[{ value: 'email', label: 'Email' }, { value: 'banner', label: 'Site banner' }, { value: 'social', label: 'Social' }]} /><Select label="Coupon" value={values['coupon']} onValueChange={(v) => set('coupon', v ?? 'none')} options={[{ value: 'none', label: 'No coupon' }, ...data.coupons.map((x) => ({ value: x.code, label: `${x.code}${x.isActive ? '' : ' (inactive)'}` }))]} /><DateField label="Starts" value={values['start']} onChange={(e) => set('start', e.target.value)} /><DateField label="Ends" value={values['end']} onChange={(e) => set('end', e.target.value)} error={errors['end']} /></div><TextField label="Audience" value={values['aud']} onChange={(e) => set('aud', e.target.value)} description="Free text in this preview: no segment engine exists yet." /><Textarea label="Notes" value={values['notes']} onChange={(e) => set('notes', e.target.value)} rows={3} /></div>,
    onConfirm: ({ values }) => { const rec: Campaign = { id: c?.id ?? newId('cmp'), name: values['name']!.trim(), channel: values['channel'] as Campaign['channel'], status: c?.status ?? 'draft', audience: values['aud']!, startsAt: new Date(values['start']! + 'T00:00:00Z').toISOString(), endsAt: values['end'] ? new Date(values['end'] + 'T00:00:00Z').toISOString() : null, couponCode: values['coupon'] === 'none' ? null : values['coupon']!, sent: c?.sent ?? null, opened: c?.opened ?? null, notes: values['notes']! }; if (c) patch('campaigns', c.id, rec); else add('campaigns', rec); audit(c ? 'marketing.campaign_updated' : 'marketing.campaign_created', { type: 'campaign', id: rec.id, label: rec.name }); return c ? 'Campaign saved' : 'Campaign created as draft'; },
  });
  const move = (c: Campaign, status: Campaign['status']) => { patch('campaigns', c.id, { status }); audit('marketing.campaign_status', { type: 'campaign', id: c.id, label: c.name }, { after: { status } }); };
  const seg = (v: string, label: string, test: (c: Campaign) => boolean) => ({ value: v, label, test });
  return (
    <AdminPage title="Campaigns" description="Planned promotions across channels." actions={<Button variant="primary" leadingIcon="add-01" disabled={!m} onClick={() => edit()}>New campaign</Button>}>
      <Notice tone="warn" title="Sending is not supported">The backend sends transactional email only. “Sent” and “opened” below are synthetic demo numbers for layout review.</Notice>
      <ResourceTable<Campaign>
        tableId="campaigns" caption="Campaigns" rows={data.campaigns} getRowId={(c) => c.id} rowLabel={(c) => c.name} searchText={(c) => `${c.name} ${c.audience} ${c.couponCode ?? ''}`}
        segments={[seg('all', 'All', () => true), seg('running', 'Running', (c) => c.status === 'running'), seg('scheduled', 'Scheduled', (c) => c.status === 'scheduled'), seg('draft', 'Drafts', (c) => c.status === 'draft'), seg('paused', 'Paused', (c) => c.status === 'paused'), seg('completed', 'Completed', (c) => c.status === 'completed')]}
        filters={[{ id: 'ch', label: 'Channel', options: ['email', 'banner', 'social'].map((x) => ({ value: x, label: x })), test: (c, v) => c.channel === v }]}
        columns={[
          col<Campaign>('n', 'Campaign', (c) => <span className="grid md:min-w-[12rem]"><b>{c.name}</b><span className="text-[12.5px] text-ink3">{c.audience}</span></span>, { primary: true, sort: (c) => c.name }),
          col<Campaign>('s', 'Status', (c) => <Status map={contentStatus} value={c.status} />, { sort: (c) => c.status }),
          col<Campaign>('c', 'Channel', (c) => <Badge>{c.channel}</Badge>),
          col<Campaign>('cp', 'Coupon', (c) => (c.couponCode ? <span className="font-mono text-[12.5px] font-bold">{c.couponCode}</span> : '—')),
          col<Campaign>('d', 'Starts', (c) => nw(date(c.startsAt)), { sort: (c) => c.startsAt }),
          col<Campaign>('sent', 'Sent (synthetic)', (c) => (c.sent == null ? '—' : `${num(c.sent)} · ${Math.round(((c.opened ?? 0) / c.sent) * 100)}% opened`), { hideOnMobile: true }),
        ]}
        rowActions={(c) => [{ id: 'e', label: 'Edit…', icon: 'edit-02', disabled: !m, onSelect: () => edit(c) }, ...(c.status === 'draft' ? [{ id: 'sch', label: 'Mark scheduled', icon: 'calendar-01' as const, disabled: !m, onSelect: () => move(c, 'scheduled') }] : []), ...(c.status === 'running' ? [{ id: 'p', label: 'Pause', icon: 'pause' as const, disabled: !m, onSelect: () => move(c, 'paused') }] : []), ...(c.status === 'paused' ? [{ id: 'r', label: 'Resume', icon: 'play' as const, disabled: !m, onSelect: () => move(c, 'running') }] : []), ...(c.status !== 'completed' ? [{ id: 'x', label: 'End campaign', icon: 'stop' as const, tone: 'danger' as const, disabled: !m, onSelect: () => move(c, 'completed') }] : [])]}
        empty={{ title: 'No campaigns' }}
      />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
