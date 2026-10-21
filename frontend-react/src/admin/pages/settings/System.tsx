import { Badge, Button, Notice, Switch, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, KpiGrid, Section } from '../../components/Cards';
import { RelatedTable } from '../../components/RelatedTable';
import { PreviewNote } from '../../components/PreviewNote';
import { col } from '../../components/cols';
import { Status, connectionHealth } from '../../components/status';
import { useActionDialog } from '../../components/ActionDialog';
import { useSettings } from '../../hooks/useSettings';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { dateTime, relative } from '../../lib/format';
import type { ScheduledTask } from '../../types';

export default function System() {
  const { values, save } = useSettings('system');
  const { data, patch, audit } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const m = can('services:manage');
  const on = values['maintenanceMode'] === 'true';
  const toggleMaintenance = () => act.run({ title: on ? 'Leave platform maintenance mode' : 'Enter platform maintenance mode', description: on ? 'Customers can sign in and order again.' : 'Customers see a maintenance page and cannot order or change services. Running servers are not stopped. Staff keep access.', confirmLabel: on ? 'Leave maintenance mode' : 'Enter maintenance mode', permission: 'services:manage', stepUp: true, tone: 'danger', reasonRequired: true, requireText: on ? undefined : 'MAINTENANCE', initial: { msg: values['maintenanceMessage'] ?? '' }, fields: on ? undefined : ({ values: v, set }) => <Textarea label="Message shown to customers" value={v['msg']} onChange={(e) => set('msg', e.target.value)} rows={3} maxLength={300} counter />, onConfirm: ({ values: v, reason }) => { save({ maintenanceMode: String(!on), maintenanceMessage: on ? '' : v['msg'] ?? '' }, on ? 'settings.maintenance_left' : 'settings.maintenance_entered', reason); return on ? 'Maintenance mode off' : 'Maintenance mode on (preview only: no customer page changed)'; } });
  const run = (t: ScheduledTask) => act.run({ title: `Run “${t.name}” now`, description: 'Triggers one extra run. The task is idempotent, so it cannot double-apply.', confirmLabel: 'Run now', permission: 'services:manage', stepUp: true, reasonRequired: false, onConfirm: () => { patch('scheduledTasks', t.id, { lastRunAt: new Date('2026-10-21T09:30:00Z').toISOString(), lastStatus: 'ok' }); audit('system.task_run', { type: 'scheduled_task', id: t.id, label: t.name }); return 'Task run completed (simulated)'; } });
  const failedTasks = data.scheduledTasks.filter((t) => t.lastStatus === 'failed');
  const health: Array<[string, 'connected' | 'degraded' | 'error', string]> = [['Database', 'connected', 'SQLite · WAL mode · 412 MB'], ['Job queue', data.workers.some((w) => w.status === 'stalled') ? 'degraded' : 'connected', `${data.jobs.filter((j) => j.status === 'pending').length} pending · ${data.workers.filter((w) => w.status === 'stalled').length} worker stalled`], ['Provider panel', 'connected', 'Pterodactyl reachable'], ['Email relay', 'degraded', '421 greylisting on some deliveries'], ['Stripe', 'connected', 'Webhooks verifying']];
  return (
    <AdminPage title="Maintenance & system health" description="Platform-wide switches, background schedules and basic service health.">
      <Notice tone={on ? 'warn' : 'info'} title={on ? 'Maintenance mode is ON (preview)' : 'Maintenance mode is off'} action={<Button size="sm" variant={on ? 'primary' : 'danger-subtle'} disabled={!m} onClick={toggleMaintenance}>{on ? 'Leave…' : 'Enter…'}</Button>}>{on ? `Customers see: “${values['maintenanceMessage'] || 'We are doing maintenance.'}”` : 'Entering it blocks ordering and service changes for customers. Use it only for platform-wide work; node work uses node maintenance.'}</Notice>
      <KpiGrid cols={4} items={[{ label: 'Version', value: '2026.10.3', icon: 'git-branch', hint: 'Synthetic build label' }, { label: 'Scheduled tasks', value: `${data.scheduledTasks.length - failedTasks.length} of ${data.scheduledTasks.length} OK`, icon: 'timer-01', hint: failedTasks.map((t) => t.name).join(', ') || 'All last runs succeeded' }, { label: 'Queue depth', value: data.jobs.filter((j) => j.status === 'pending').length, icon: 'layers-01' }, { label: 'Open for ordering', value: values['checkoutOpen'] === 'true' && !on ? 'Yes' : 'No', icon: 'shopping-cart-01' }]} />
      <Columns>
        <Section title="Service health"><ul className="grid gap-2">{health.map(([l, s, d]) => <li key={l} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2.5"><span><b>{l}</b><span className="block text-[12.5px] text-ink3">{d}</span></span><Status map={connectionHealth} value={s} /></li>)}</ul></Section>
        <Section title="Platform switches"><div className="grid gap-3"><Switch label="Registration open" checked={values['registrationOpen'] === 'true'} disabled={!m} onCheckedChange={(x) => act.run({ title: x ? 'Open registration' : 'Close registration', confirmLabel: x ? 'Open' : 'Close', permission: 'services:manage', stepUp: true, reasonRequired: true, onConfirm: ({ reason }) => { save({ registrationOpen: String(x) }, 'settings.registration_changed', reason); } })} /><Switch label="Checkout open" checked={values['checkoutOpen'] === 'true'} disabled={!m} onCheckedChange={(x) => act.run({ title: x ? 'Open checkout' : 'Pause checkout', description: 'Paused checkout lets customers browse but not pay. Pending payments still complete.', confirmLabel: x ? 'Open' : 'Pause', permission: 'services:manage', stepUp: true, tone: x ? 'default' : 'danger', reasonRequired: true, onConfirm: ({ reason }) => { save({ checkoutOpen: String(x) }, 'settings.checkout_changed', reason); } })} /></div></Section>
      </Columns>
      <Section title="Scheduled tasks"><RelatedTable rows={data.scheduledTasks} getRowId={(t) => t.id} caption="Scheduled tasks" pageSize={10} columns={[col<ScheduledTask>('n', 'Task', (t) => <b>{t.name}</b>, { primary: true, sort: (t) => t.name }), col<ScheduledTask>('s', 'Schedule', (t) => t.schedule), col<ScheduledTask>('l', 'Last run', (t) => <span title={dateTime(t.lastRunAt)}>{relative(t.lastRunAt)}</span>, { sort: (t) => t.lastRunAt }), col<ScheduledTask>('st', 'Result', (t) => <Badge tone={t.lastStatus === 'ok' ? 'good' : 'bad'}>{t.lastStatus}</Badge>), col<ScheduledTask>('d', 'Duration', (t) => (t.durationMs >= 1000 ? `${(t.durationMs / 1000).toFixed(1)} s` : `${t.durationMs} ms`), { numeric: true, sort: (t) => t.durationMs, hideOnMobile: true }), col<ScheduledTask>('a', 'Run', (t) => <Button size="sm" variant="secondary" disabled={!m} onClick={() => run(t)}>Run now…</Button>)]} /></Section>
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
